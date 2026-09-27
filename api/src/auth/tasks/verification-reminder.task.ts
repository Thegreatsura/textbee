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
    // The id carries the creation time, so the range uses the primary index.
    const users = await this.userModel
      .find({
        _id: {
          $gte: idAt(now.getTime() - 48 * HOUR_MS),
          $lt: idAt(now.getTime() - 24 * HOUR_MS),
        },
        googleId: null,
        emailVerifiedAt: null,
        emailVerificationWaivedAt: null,
        accountDeletionRequestedAt: null,
        isBanned: { $ne: true },
      })
      .select('_id email')
      .limit(BATCH)
      .lean()
    if (!users.length) return 0

    const done = await this.sentEmailModel.distinct('user', {
      type: 'V2',
      user: { $in: users.map((u) => u._id) },
      status: { $in: ['sent', 'skipped'] },
    })
    const doneIds = new Set(done.map(String))

    let sent = 0
    for (const user of users) {
      if (doneIds.has(String(user._id))) continue
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
    return sent
  }
}
