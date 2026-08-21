import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { ConfigService } from '@nestjs/config'
import { Message } from 'firebase-admin/messaging'
import {
  DEFAULT_BULK_DISPATCH_MAX_SPREAD_HOURS,
  DEFAULT_BULK_DISPATCH_WINDOW,
  DispatchPlan,
  planDispatchWaves,
} from './dispatch-pacing'

@Injectable()
export class SmsQueueService {
  private readonly logger = new Logger(SmsQueueService.name)
  private readonly useSmsQueue: boolean
  private readonly maxSmsBatchSize: number
  private readonly immediateQueueDelayMs: number
  private readonly bulkDispatchWindow: number
  private readonly bulkDispatchMaxSpreadMs: number

  constructor(
    @InjectQueue('sms') private readonly smsQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.useSmsQueue = this.configService.get<boolean>('USE_SMS_QUEUE', false)
    this.maxSmsBatchSize = this.configService.get<number>(
      'MAX_SMS_BATCH_SIZE',
      100,
    )
    this.immediateQueueDelayMs = this.configService.get<number>(
      'SMS_QUEUE_IMMEDIATE_DELAY_MS',
      0,
    )
    this.bulkDispatchWindow = Number(
      this.configService.get<number>(
        'BULK_DISPATCH_WINDOW',
        DEFAULT_BULK_DISPATCH_WINDOW,
      ),
    )
    this.bulkDispatchMaxSpreadMs =
      Number(
        this.configService.get<number>(
          'BULK_DISPATCH_MAX_SPREAD_HOURS',
          DEFAULT_BULK_DISPATCH_MAX_SPREAD_HOURS,
        ),
      ) *
      3600 *
      1000
  }

  /**
   * Check if queue is enabled based on environment variable
   */
  isQueueEnabled(): boolean {
    return this.useSmsQueue
  }

  /**
   * Enqueue pushes for one batch. Large batches are released in waves paced
   * to the device's send delay; the returned plan says when each wave is due.
   */
  async addSendSmsJob(
    deviceId: string,
    fcmMessages: Message[],
    smsBatchId: string,
    delayMs?: number,
    sendDelaySeconds?: number,
  ): Promise<DispatchPlan> {
    // If delayMs is provided, use it as the base for all waves (scheduled send)
    // Otherwise rely on queue limiter/concurrency and optionally fixed jitter.
    const useScheduledDelay = delayMs !== undefined && delayMs >= 0
    const baseDelayMs = useScheduledDelay ? delayMs : this.immediateQueueDelayMs

    const plan = planDispatchWaves(fcmMessages.length, {
      waveSize: Math.min(this.maxSmsBatchSize, this.bulkDispatchWindow),
      sendDelaySeconds,
      baseDelayMs,
    })

    if (plan.projectedCompletionMs - baseDelayMs > this.bulkDispatchMaxSpreadMs) {
      this.logger.warn(
        `Batch ${smsBatchId}: ${fcmMessages.length} messages at ${plan.sendDelaySeconds}s/message are projected to take ${Math.round(plan.projectedCompletionMs / 3600000)}h to dispatch`,
      )
    }

    for (const wave of plan.waves) {
      await this.smsQueue.add(
        'send-sms',
        {
          deviceId,
          fcmMessages: fcmMessages.slice(wave.start, wave.end),
          smsBatchId,
        },
        {
          priority: 1, // TODO: Make this dynamic based on users subscription plan
          attempts: 1,
          delay: wave.delayMs,
          backoff: {
            type: 'exponential',
            delay: 5000, // 5 seconds
          },
          removeOnComplete: { age: 24 * 3600 }, // 24 hours
          removeOnFail: { age: 72 * 3600 }, // 72 hours
        },
      )
    }

    return plan
  }
}
