import type { Device } from '@/lib/api'

const MINUTE_MS = 60 * 1000
// Matches the admin dashboard's online window.
const MIN_ONLINE_WINDOW_MS = 65 * MINUTE_MS
const DEFAULT_INTERVAL_MINUTES = 30

export type DevicePresence = 'online' | 'offline' | 'disabled' | 'unknown'

type PresenceInput = Pick<
  Device,
  'enabled' | 'lastHeartbeat' | 'heartbeatIntervalMinutes'
>

// Online when a heartbeat arrived within two intervals, so one late heartbeat does not flip it.
export function onlineWindowMs(device: PresenceInput): number {
  const interval =
    device.heartbeatIntervalMinutes && device.heartbeatIntervalMinutes > 0
      ? device.heartbeatIntervalMinutes
      : DEFAULT_INTERVAL_MINUTES
  return Math.max(MIN_ONLINE_WINDOW_MS, (2 * interval + 5) * MINUTE_MS)
}

export function devicePresence(
  device: PresenceInput,
  now: number = Date.now()
): DevicePresence {
  if (device.enabled === false) return 'disabled'
  const last = device.lastHeartbeat ? new Date(device.lastHeartbeat).getTime() : NaN
  // No heartbeat yet: an older build, or a phone that just registered.
  if (Number.isNaN(last)) return 'unknown'
  return now - last <= onlineWindowMs(device) ? 'online' : 'offline'
}
