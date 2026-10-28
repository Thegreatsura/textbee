import type { ErrorHistoryEntry, SmsMessage } from './types'

// What the details dialog says about a message's failures. The top-level
// error fields describe a failure that is still current; issueHistory keeps
// every failure, including ones the message recovered from.

// The API keeps the first 5 and the newest 10
export const ERROR_HISTORY_LIMIT = 15

export type FailureView =
  | {
      kind: 'failed'
      code?: string
      message?: string
      // every other failure, oldest first
      others: ErrorHistoryEntry[]
    }
  // attempts holds failures and delivery reports; failures counts only the first
  | { kind: 'recovered'; attempts: ErrorHistoryEntry[]; failures: number; capped: boolean }
  // sent or delivered, and the only entries are unconfirmed delivery reports
  | { kind: 'delivery-unconfirmed'; attempts: ErrorHistoryEntry[] }
  // the phone reports seen so far, if any, are listed under the note
  | { kind: 'no-report'; attempts: ErrorHistoryEntry[] }

const time = (value: string) => new Date(value).getTime()

function history(message: SmsMessage): ErrorHistoryEntry[] {
  return (message.issueHistory ?? [])
    .filter((entry) => entry && !Number.isNaN(time(entry.at)))
    .sort((a, b) => time(a.at) - time(b.at))
}

const isFailure = (entry: ErrorHistoryEntry) => !entry.deliveryReport

// The entry that is the failure shown in the red box. The API records a
// failure without a code as UNKNOWN, and an old message may have no failedAt.
function currentIndex(message: SmsMessage, entries: ErrorHistoryEntry[]): number {
  const code = message.errorCode?.trim() || 'UNKNOWN'
  if (message.failedAt) {
    const failedAt = time(message.failedAt)
    return entries.findIndex((entry) => isFailure(entry) && time(entry.at) === failedAt)
  }
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isFailure(entries[i]) && entries[i].code === code) return i
  }
  return -1
}

export function failureView(message: SmsMessage): FailureView | null {
  const status = message.status?.toLowerCase()

  if (status === 'failed') {
    const entries = history(message)
    const current = currentIndex(message, entries)
    return {
      kind: 'failed',
      code: message.errorCode,
      message: message.errorMessage,
      others: entries.filter((_, i) => i !== current),
    }
  }

  if (status === 'sent' || status === 'delivered') {
    const attempts = history(message)
    if (attempts.length === 0) return null
    const failures = attempts.filter(isFailure).length
    if (failures === 0) return { kind: 'delivery-unconfirmed', attempts }
    return {
      kind: 'recovered',
      attempts,
      failures,
      capped: attempts.length >= ERROR_HISTORY_LIMIT,
    }
  }

  if (status === 'unknown') return { kind: 'no-report', attempts: history(message) }

  return null
}

export function sourceLabel(source: ErrorHistoryEntry['source']): string {
  if (source === 'server') return 'Server'
  if (source === 'push') return 'Push service'
  return 'Phone'
}

// Neutral on order: a failure can come after the send, e.g. a delivery
// report that did not confirm delivery
export function recoveredLabel(view: { failures: number; capped: boolean }) {
  if (view.capped) return `${view.failures} or more failures recorded`
  return view.failures === 1 ? '1 failure recorded' : `${view.failures} failures recorded`
}
