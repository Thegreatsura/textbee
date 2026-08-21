import { AndroidConfig } from 'firebase-admin/messaging'

// 72 hours. Bounds how long FCM holds an SMS push for a device that is offline
// or dozing, instead of the platform default of four weeks.
export const DEFAULT_FCM_SMS_TTL_SECONDS = 72 * 3600
// 30 minutes. The heartbeat probe is sent hourly, so an older probe is useless.
export const DEFAULT_FCM_HEARTBEAT_TTL_SECONDS = 30 * 60

function readTtlSeconds(envKey: string, fallback: number): number {
  const value = Number(process.env[envKey])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function fcmSmsTtlSeconds(): number {
  return readTtlSeconds('FCM_SMS_TTL_SECONDS', DEFAULT_FCM_SMS_TTL_SECONDS)
}

export function fcmHeartbeatTtlSeconds(): number {
  return readTtlSeconds(
    'FCM_HEARTBEAT_TTL_SECONDS',
    DEFAULT_FCM_HEARTBEAT_TTL_SECONDS,
  )
}

// AndroidConfig.ttl is in milliseconds. The push is only handed to FCM at
// scheduledAt, but if it is built early the expiry still lands at or after
// scheduledAt plus the base ttl.
export function smsAndroidConfig(
  scheduledAt?: Date | string,
  now: number = Date.now(),
): AndroidConfig {
  const baseMs = fcmSmsTtlSeconds() * 1000
  let ttl = baseMs
  if (scheduledAt) {
    const scheduledTime = new Date(scheduledAt).getTime()
    if (Number.isFinite(scheduledTime) && scheduledTime > now) {
      ttl = scheduledTime - now + baseMs
    }
  }
  return { priority: 'high', ttl }
}

export function heartbeatAndroidConfig(): AndroidConfig {
  return {
    priority: 'high',
    ttl: fcmHeartbeatTtlSeconds() * 1000,
    collapseKey: 'heartbeat_check',
  }
}
