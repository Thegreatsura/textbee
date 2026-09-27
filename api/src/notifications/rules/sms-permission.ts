// Whether an account's sending is blocked by a missing SMS permission on the
// phone. This file is mirrored outside this repository, and a Python twin runs
// the same cases from sms-permission-cases.json. Change the rule, change the
// cases in the same commit.

export const PERMISSION_DENIED = 'PERMISSION_DENIED'

export interface LastOutgoingMessage {
  status?: string
  errorCode?: string
  createdAt?: Date | string
  failedAt?: Date | string
  /** Set when the send targeted a SIM, which also needs the Phone permission. */
  simSubscriptionId?: number
}

export interface DeviceAppState {
  hasSendSmsPermission?: boolean
  hasReadPhoneStatePermission?: boolean
  lastUpdated?: Date | string
}

const time = (value: Date | string | undefined): number | undefined => {
  if (value === undefined || value === null) return undefined
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

export const permissionFailureAt = (
  message: LastOutgoingMessage,
): number | undefined => time(message.failedAt) ?? time(message.createdAt)

/**
 * True when the most recent outgoing message failed for a missing permission
 * and the phone has not reported the permission granted since. Undefined when
 * the account has never sent, so it is never targeted.
 */
export function needsSmsPermission(
  last: LastOutgoingMessage | null | undefined,
  appState: DeviceAppState | null | undefined,
): boolean | undefined {
  if (!last) return undefined
  if (last.status !== 'failed' || last.errorCode !== PERMISSION_DENIED) {
    return false
  }

  const failedAt = permissionFailureAt(last)
  const reportedAt = time(appState?.lastUpdated)
  const needsPhonePermission =
    last.simSubscriptionId !== undefined && last.simSubscriptionId !== null
  const granted =
    appState?.hasSendSmsPermission === true &&
    (!needsPhonePermission || appState?.hasReadPhoneStatePermission === true)

  if (granted && reportedAt !== undefined && failedAt !== undefined) {
    return reportedAt <= failedAt
  }
  return true
}

/** Whole hours since the blocking failure, or undefined when not blocked. */
export function hoursSincePermissionFailure(
  last: LastOutgoingMessage | null | undefined,
  appState: DeviceAppState | null | undefined,
  now: Date,
): number | undefined {
  if (needsSmsPermission(last, appState) !== true) return undefined
  const failedAt = permissionFailureAt(last)
  if (failedAt === undefined) return undefined
  return Math.max(0, Math.floor((now.getTime() - failedAt) / 3_600_000))
}
