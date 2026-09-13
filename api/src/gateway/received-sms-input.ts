export type IgnoredReceivedSmsReason = 'empty_message' | 'missing_sender'

const toValidDate = (value: Date): Date | null =>
  Number.isFinite(value.getTime()) && value.getTime() > 0 ? value : null

// Millis first, then receivedAt, then server time.
export function resolveReceivedAt(
  receivedAtInMillis: unknown,
  receivedAt: unknown,
  now: Date = new Date(),
): Date {
  if (
    (typeof receivedAtInMillis === 'number' ||
      typeof receivedAtInMillis === 'string') &&
    String(receivedAtInMillis).trim() !== ''
  ) {
    const fromMillis = toValidDate(new Date(Number(receivedAtInMillis)))
    if (fromMillis) return fromMillis
  }

  if (typeof receivedAt === 'string' || receivedAt instanceof Date) {
    const fromDate = toValidDate(new Date(receivedAt))
    if (fromDate) return fromDate
  }

  return now
}

export function isMalformedReceivedSms(sender: unknown, message: unknown) {
  return (
    typeof message !== 'string' ||
    (sender !== undefined && sender !== null && typeof sender !== 'string')
  )
}

// Messages with nothing to deliver are acknowledged but not stored.
export function receivedSmsIgnoreReason(
  sender: string | null | undefined,
  message: string,
): IgnoredReceivedSmsReason | null {
  if (message === '') return 'empty_message'
  if (!sender) return 'missing_sender'
  return null
}
