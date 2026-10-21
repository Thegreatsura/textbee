// firebase-admin gives up on its own after about 90 s (5 tries of 15 s plus backoff)
export const FCM_SEND_TIMEOUT_MS = 120_000

// Covers the push limit plus the slowest database writes after it
export const SEND_JOB_TIMEOUT_MS = 300_000

export const FCM_SEND_TIMEOUT_ERROR_CODE = 'FCM_SEND_TIMEOUT'

export class FcmSendTimeoutError extends Error {
  readonly code = FCM_SEND_TIMEOUT_ERROR_CODE

  constructor(readonly timeoutMs: number) {
    super(
      `Push to the device timed out after ${Math.round(timeoutMs / 1000)} seconds. The message may not have reached the phone.`,
    )
    this.name = 'FcmSendTimeoutError'
  }
}

// Rejects when the push has not settled in time; the push itself cannot be cancelled
export function withSendTimeout<T>(
  push: Promise<T>,
  timeoutMs: number = FCM_SEND_TIMEOUT_MS,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FcmSendTimeoutError(timeoutMs)), timeoutMs)
  })
  return Promise.race([push, timeout]).finally(() => clearTimeout(timer))
}
