import type { ErrorHistoryEntry, SmsMessage } from './types'

// What the details dialog says about a message's failures. The top-level
// error fields describe a failure that is still current; errorHistory keeps
// every failure, including ones the message recovered from.

export const ERROR_HISTORY_LIMIT = 10

export type FailureView =
  | {
      kind: 'failed'
      code?: string
      message?: string
      // failures before the current one, oldest first
      earlier: ErrorHistoryEntry[]
    }
  | { kind: 'recovered'; attempts: ErrorHistoryEntry[]; capped: boolean }
  | { kind: 'no-report' }

const time = (value: string) => new Date(value).getTime()

function history(message: SmsMessage): ErrorHistoryEntry[] {
  return (message.errorHistory ?? [])
    .filter((entry) => entry && !Number.isNaN(time(entry.at)))
    .sort((a, b) => time(a.at) - time(b.at))
}

export function failureView(message: SmsMessage): FailureView | null {
  const status = message.status?.toLowerCase()

  if (status === 'failed') {
    const failedAt = message.failedAt ? time(message.failedAt) : null
    return {
      kind: 'failed',
      code: message.errorCode,
      message: message.errorMessage,
      // The current failure is already shown above the list
      earlier: history(message).filter(
        (entry) => !(entry.code === message.errorCode && time(entry.at) === failedAt)
      ),
    }
  }

  if (status === 'sent' || status === 'delivered') {
    const attempts = history(message)
    if (attempts.length === 0) return null
    return {
      kind: 'recovered',
      attempts,
      capped: attempts.length >= ERROR_HISTORY_LIMIT,
    }
  }

  if (status === 'unknown') return { kind: 'no-report' }

  return null
}

export function sourceLabel(source: ErrorHistoryEntry['source']): string {
  if (source === 'server') return 'Server'
  if (source === 'push') return 'Push service'
  return 'Phone'
}

export function recoveredLabel(view: { attempts: unknown[]; capped: boolean }, status?: string) {
  const count = view.capped
    ? `${ERROR_HISTORY_LIMIT}+ times`
    : view.attempts.length === 1
      ? 'once'
      : `${view.attempts.length} times`
  const outcome = status?.toLowerCase() === 'delivered' ? 'delivered' : 'sent'
  return `Failed ${count} before it was ${outcome}`
}
