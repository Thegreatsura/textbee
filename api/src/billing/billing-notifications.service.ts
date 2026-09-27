import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { Model, Types } from 'mongoose'
import {
  BillingNotification,
  BillingNotificationDocument,
  BillingNotificationType,
} from './schemas/billing-notification.schema'

type NotifyOnceInput = {
  userId: Types.ObjectId | string
  type: BillingNotificationType
  title: string
  message: string
  meta?: Record<string, any>
  /** Email template to send, or null for an in-app notice only. */
  emailKey?: string | null
  /** Record the UTC day of a daily or 30-day limit hit. */
  recordHit?: boolean
}

// Minimum hours between queued emails per notification type. The processor
// applies the per-template limits from sent emails on top of this.
export const BILLING_NOTIFICATION_DEDUPE_HOURS: Record<
  BillingNotificationType,
  number
> = {
  [BillingNotificationType.EMAIL_VERIFICATION_REQUIRED]: 24,
  [BillingNotificationType.DAILY_LIMIT_REACHED]: 7 * 24,
  [BillingNotificationType.MONTHLY_LIMIT_REACHED]: 30 * 24,
  [BillingNotificationType.BULK_SMS_LIMIT_REACHED]: 7 * 24,
  [BillingNotificationType.DEVICE_LIMIT_REACHED]: 30 * 24,
  [BillingNotificationType.DAILY_LIMIT_APPROACHING]: 7 * 24,
  [BillingNotificationType.MONTHLY_LIMIT_APPROACHING]: 30 * 24,
}

const HIT_WRITE_INTERVAL_MS = 60 * 1000

@Injectable()
export class BillingNotificationsService {
  constructor(
    @InjectModel(BillingNotification.name)
    private readonly notificationModel: Model<BillingNotificationDocument>,
    @InjectQueue('billing-notifications') private readonly billingQueue: Queue,
  ) {}

  async notifyOnce({
    userId,
    type,
    title,
    message,
    meta = {},
    emailKey = null,
    recordHit = false,
  }: NotifyOnceInput) {
    const user = new Types.ObjectId(userId)
    const windowMs = this.getDedupeWindowMs(type)
    const existing = await this.notificationModel.findOne({ user, type })

    if (recordHit) {
      await this.recordHit(user, type, existing, { title, message, meta })
    }

    if (existing) {
      const lastSentAt = existing.lastEmailSentAt
      if (lastSentAt && lastSentAt.getTime() >= Date.now() - windowMs) {
        return existing
      }
    }

    const updated = await this.notificationModel.findOneAndUpdate(
      { user, type },
      { $set: { title, message, meta }, $setOnInsert: { user, type } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    if (!emailKey) return updated

    await this.billingQueue.add(
      'send',
      {
        notificationId: updated._id,
        userId: updated.user,
        type: updated.type,
        title: updated.title,
        message: updated.message,
        meta: updated.meta,
        createdAt: updated.createdAt,
        sendEmail: true,
        emailKey,
      },
      {
        delay: 30000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        // one pending job per sent email; a finished job must not block the next one
        jobId: `${updated._id}:${updated.lastEmailSentAt?.getTime() ?? 0}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    )

    return updated
  }

  // Every hit counts, whether or not an email goes out; repeat hits write at most once a minute.
  private async recordHit(
    user: Types.ObjectId,
    type: BillingNotificationType,
    existing: BillingNotificationDocument | null,
    fields: { title: string; message: string; meta: Record<string, any> },
  ) {
    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    if (
      existing?.hitDays?.includes(day) &&
      existing.lastHitAt &&
      now.getTime() - existing.lastHitAt.getTime() < HIT_WRITE_INTERVAL_MS
    ) {
      return
    }
    await this.notificationModel.updateOne(
      { user, type },
      {
        $addToSet: { hitDays: day },
        $set: { lastHitAt: now },
        $setOnInsert: { user, type, ...fields },
      },
      { upsert: true },
    )
  }

  async listForUser(userId: Types.ObjectId | string, { limit = 50 } = {}) {
    return this.notificationModel
      .find({ user: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
  }

  private getDedupeWindowMs(type: BillingNotificationType) {
    return BILLING_NOTIFICATION_DEDUPE_HOURS[type] * 60 * 60 * 1000
  }
}

export { BillingNotificationType }
