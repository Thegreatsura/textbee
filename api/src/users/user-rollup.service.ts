import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { AnyBulkWriteOperation, Model, Types } from 'mongoose'
import { ApiKey } from '../auth/schemas/api-key.schema'
import { Device } from '../gateway/schemas/device.schema'
import { SMS } from '../gateway/schemas/sms.schema'
import { Subscription } from '../billing/schemas/subscription.schema'
import { User, UserDocument } from './schemas/user.schema'

// Owns user.rollup. This is the only place the counts behind it are derived, so
// the admin app can read the stored numbers instead of reimplementing the
// aggregation and risking a preview that disagrees with the live feed.
//
// Nothing here runs on the message send path. The rollup holds device and API
// key facts, which change rarely; the message counts it deliberately does not
// hold are counted on demand, because the quota window slides.

/**
 * The earliest date an account actually paid, across its paid subscriptions.
 *
 * Each row's effective date is the provider's start date where it reported one,
 * else when we recorded the row. Taking the minimum of those rather than reading
 * one chosen row matters because the two orderings can disagree.
 */
function earliestPaymentDate(
  subscriptions: Array<{ createdAt?: Date; subscriptionStartDate?: Date }>,
): Date | undefined {
  let earliest: Date | undefined
  for (const subscription of subscriptions || []) {
    const effective =
      subscription?.subscriptionStartDate ?? subscription?.createdAt
    if (!effective) continue
    const at = new Date(effective)
    if (!earliest || at < earliest) earliest = at
  }
  return earliest
}

interface RollupFacts {
  deviceCount: number
  apiKeyCount: number
  totalSentSms: number
  minAppVersionCode?: number
}

@Injectable()
export class UserRollupService {
  private readonly logger = new Logger(UserRollupService.name)

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Device.name) private readonly deviceModel: Model<any>,
    @InjectModel(ApiKey.name) private readonly apiKeyModel: Model<any>,
    @InjectModel(SMS.name) private readonly smsModel: Model<any>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<any>,
  ) {}

  /** Recompute one account from source and store it. */
  async recomputeForUser(userId: Types.ObjectId | string): Promise<void> {
    const id = new Types.ObjectId(String(userId))
    const facts = await this.factsFor(id)
    // timestamps off: the rollup is derived telemetry, and bumping updatedAt
    // would make a maintenance write indistinguishable from a real change to
    // the account.
    await this.userModel.updateOne(
      { _id: id },
      { $set: this.toUpdate(facts) },
      { timestamps: false },
    )
  }

  /**
   * Called when an account's devices or API keys change. A recount rather than a
   * delta: it is a single indexed read on a small collection, and it cannot
   * drift the way a missed increment would.
   *
   * Never throws. This keeps derived reporting data current; it must not be able
   * to fail a device registration or an API key revocation, and the nightly
   * sweep repairs anything a failure here leaves stale.
   */
  async refreshQuietly(userId: Types.ObjectId | string | undefined): Promise<void> {
    if (!userId) return
    try {
      await this.recomputeForUser(userId)
    } catch (error) {
      this.logger.warn(
        `Could not refresh rollup for ${String(userId)}: ${error?.message ?? error}`,
      )
    }
  }

  private async factsFor(userId: Types.ObjectId): Promise<RollupFacts> {
    // Projected: device documents carry around ten telemetry subdocuments now,
    // and none of them are wanted here.
    const devices = await this.deviceModel
      .find({ user: userId })
      .select('sentSMSCount appVersionCode appVersionInfo.versionCode')
      .lean()

    const apiKeyCount = await this.apiKeyModel.countDocuments({
      user: userId,
      revokedAt: null,
    })

    let totalSentSms = 0
    let minAppVersionCode: number | undefined
    for (const device of devices) {
      totalSentSms += device.sentSMSCount || 0
      // Same precedence the dashboard uses: the heartbeat-reported version wins
      // over the one recorded at registration.
      const code =
        typeof device.appVersionInfo?.versionCode === 'number'
          ? device.appVersionInfo.versionCode
          : typeof device.appVersionCode === 'number'
            ? device.appVersionCode
            : undefined
      if (code !== undefined) {
        minAppVersionCode =
          minAppVersionCode === undefined
            ? code
            : Math.min(minAppVersionCode, code)
      }
    }

    return {
      deviceCount: devices.length,
      apiKeyCount,
      totalSentSms,
      minAppVersionCode,
    }
  }

  private toUpdate(facts: RollupFacts): Record<string, unknown> {
    const update: Record<string, unknown> = {
      'rollup.deviceCount': facts.deviceCount,
      'rollup.apiKeyCount': facts.apiKeyCount,
      'rollup.totalSentSms': facts.totalSentSms,
      'rollup.computedAt': new Date(),
    }
    // Absent rather than zero when no device reported a version: zero would read
    // as an ancient build and wrongly target the account for an update prompt.
    if (facts.minAppVersionCode === undefined) {
      update['rollup.minAppVersionCode'] = null
    } else {
      update['rollup.minAppVersionCode'] = facts.minAppVersionCode
    }
    return update
  }

  /**
   * Recompute every account in batches. Used by the nightly job and by the
   * one-off backfill. Returns how many accounts were written.
   */
  async recomputeAll(options?: {
    batchSize?: number
    onlyMissing?: boolean
  }): Promise<number> {
    const batchSize = options?.batchSize ?? 500
    const filter = options?.onlyMissing
      ? { 'rollup.computedAt': { $exists: false } }
      : {}

    let processed = 0
    let lastId: Types.ObjectId | undefined

    for (;;) {
      const page = await this.userModel
        .find(lastId ? { ...filter, _id: { $gt: lastId } } : filter)
        .select('_id')
        .sort({ _id: 1 })
        .limit(batchSize)
        .lean()

      if (!page.length) break

      const operations: AnyBulkWriteOperation[] = []
      for (const row of page) {
        const facts = await this.factsFor(row._id as Types.ObjectId)
        operations.push({
          updateOne: {
            filter: { _id: row._id },
            update: { $set: this.toUpdate(facts) },
            timestamps: false,
          },
        })
      }

      if (operations.length) {
        await this.userModel.bulkWrite(operations)
      }
      processed += page.length
      lastId = page[page.length - 1]._id as Types.ObjectId
    }

    return processed
  }

  /**
   * Fill in milestones for accounts that predate them. They were added in
   * September 2026 and never backfilled, so every milestone attribute currently
   * reads false for older accounts, which would quietly exclude exactly the
   * established accounts a campaign most wants.
   *
   * Written with $min so a real earlier date is never replaced by a later
   * derived one, and so re-running cannot move a date forward.
   *
   * Returns how many accounts actually changed, so a second run reports zero.
   */
  async backfillMilestones(options?: { batchSize?: number }): Promise<number> {
    const batchSize = options?.batchSize ?? 500
    let processed = 0
    let lastId: Types.ObjectId | undefined

    for (;;) {
      const page = await this.userModel
        .find(lastId ? { _id: { $gt: lastId } } : {})
        .select('_id milestones')
        .sort({ _id: 1 })
        .limit(batchSize)
        .lean()

      if (!page.length) break

      const operations: AnyBulkWriteOperation[] = []
      for (const row of page) {
        const derived = await this.derivedMilestones(row._id as Types.ObjectId)
        const update: Record<string, unknown> = {}
        for (const [field, value] of Object.entries(derived)) {
          if (value) update[`milestones.${field}`] = value
        }
        if (!Object.keys(update).length) continue
        operations.push({
          updateOne: {
            filter: { _id: row._id },
            update: { $min: update },
            // Also makes modifiedCount mean something: with timestamps on,
            // updatedAt changes on every pass and every account counts as
            // modified even when no milestone moved.
            timestamps: false,
          },
        })
      }

      if (operations.length) {
        // The modified count, not the attempted count. Every $min is issued
        // whether or not it changes anything, so reporting attempts would tell a
        // re-run it had written dates it merely re-confirmed.
        const result = await this.userModel.bulkWrite(operations)
        processed += result.modifiedCount ?? 0
      }
      lastId = page[page.length - 1]._id as Types.ObjectId
    }

    return processed
  }

  private async derivedMilestones(
    userId: Types.ObjectId,
  ): Promise<Record<string, Date | undefined>> {
    const [device, apiKey, sms, paid] = await Promise.all([
      this.deviceModel
        .findOne({ user: userId })
        .select('createdAt')
        .sort({ createdAt: 1 })
        .lean(),
      this.apiKeyModel
        .findOne({ user: userId })
        .select('createdAt')
        .sort({ createdAt: 1 })
        .lean(),
      // Walks the {user, createdAt} index backwards rather than scanning, which
      // matters because this is the largest collection in the database.
      this.smsModel
        .findOne({ user: userId })
        .select('createdAt')
        .sort({ createdAt: 1 })
        .lean(),
      // Every subscription that cost something, not just the earliest record.
      // The two orders can disagree: a row recorded first can carry a later
      // provider start date, and reconciled rows carry historical ones, so
      // sorting by createdAt and reading the start date off that row can report
      // a first payment later than the real one. There are only ever a handful
      // per account, so the comparison happens below.
      //
      // Without any of this, every account that paid before the milestone
      // existed reads as never having paid, and milestones.hasPaid would be
      // false for exactly the long-standing customers a campaign would want to
      // treat differently.
      this.subscriptionModel
        .find({ user: userId, amount: { $gt: 0 } })
        .select('createdAt subscriptionStartDate')
        .lean(),
    ])

    return {
      firstDeviceAt: (device as any)?.createdAt,
      firstApiKeyAt: (apiKey as any)?.createdAt,
      firstSmsAt: (sms as any)?.createdAt,
      firstPaidAt: earliestPaymentDate(paid as any[]),
    }
  }

  /** How many accounts have never had a rollup computed. */
  async countMissing(): Promise<number> {
    return this.userModel.countDocuments({
      'rollup.computedAt': { $exists: false },
    })
  }
}
