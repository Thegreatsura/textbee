import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { User, UserDocument } from '../../users/schemas/user.schema'
import {
  SentEmail,
  SentEmailDocument,
} from '../../mail/schemas/sent-email.schema'
import { MailService } from '../../mail/mail.service'
import { AuthService } from '../auth.service'

const HOUR_MS = 60 * 60 * 1000
const BATCH = 500
const MAX_FAILED = 3

// Sends one reminder with a fresh link to password accounts still unverified a day after signup.
@Injectable()
export class VerificationReminderTask {
  private readonly logger = new Logger(VerificationReminderTask.name)

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(SentEmail.name)
    private readonly sentEmailModel: Model<SentEmailDocument>,
    private readonly authService: AuthService,
    private readonly mailService: MailService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    try {
      const sent = await this.sendDue(new Date())
      if (sent) this.logger.log(`Sent ${sent} verification reminders`)
    } catch (e) {
      this.logger.error(`Verification reminder run failed: ${e?.message ?? e}`)
    }
  }

  async sendDue(now: Date): Promise<number> {
    const idAt = (ms: number) =>
      Types.ObjectId.createFromTime(Math.floor(ms / 1000))
    const start = idAt(now.getTime() - 48 * HOUR_MS)
    const end = idAt(now.getTime() - 24 * HOUR_MS)
    let last: Types.ObjectId | null = null
    let sent = 0

    // Pages by _id, which carries the creation time, so every account in the window is reached.
    for (;;) {
      const users = await this.userModel
        .find({
          _id: last ? { $gt: last, $lt: end } : { $gte: start, $lt: end },
          googleId: null,
          emailVerifiedAt: null,
          emailVerificationWaivedAt: null,
          accountDeletionRequestedAt: null,
          isBanned: { $ne: true },
        })
        .sort({ _id: 1 })
        .select('_id email')
        .limit(BATCH)
        .lean()
      if (!users.length) return sent

      const done = await this.doneUserIds(users.map((u) => u._id))
      for (const user of users) {
        if (done.has(String(user._id))) continue
        const verificationUrl = await this.authService.mintEmailVerificationLink(
          user,
          { lifetimeMs: 24 * HOUR_MS, source: 'reminder' },
        )
        const result = await this.mailService.sendTemplated({
          key: 'V2',
          userId: user._id,
          vars: { verificationUrl, linkTtl: '24 hours' },
          redactVars: ['verificationUrl'],
        })
        if (result === 'sent') sent++
      }
      if (users.length < BATCH) return sent
      last = users[users.length - 1]._id
    }
  }

  // Sent or skipped once, or failed MAX_FAILED times.
  private async doneUserIds(ids: Types.ObjectId[]): Promise<Set<string>> {
    const rows = await this.sentEmailModel.aggregate([
      { $match: { type: 'V2', user: { $in: ids } } },
      {
        $group: {
          _id: '$user',
          done: {
            $sum: { $cond: [{ $in: ['$status', ['sent', 'skipped']] }, 1, 0] },
          },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        },
      },
    ])
    return new Set(
      rows
        .filter((r) => r.done > 0 || r.failed >= MAX_FAILED)
        .map((r) => String(r._id)),
    )
  }
}
