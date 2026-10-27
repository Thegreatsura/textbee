import { describe, expect, it } from 'vitest'
import { devicePresence, onlineWindowMs } from './device-presence'

const MINUTE_MS = 60 * 1000
const now = new Date('2026-10-27T12:00:00Z').getTime()
const ago = (minutes: number) => new Date(now - minutes * MINUTE_MS).toISOString()

describe('devicePresence', () => {
  it('is online after a recent heartbeat', () => {
    expect(devicePresence({ enabled: true, lastHeartbeat: ago(10) }, now)).toBe('online')
  })

  it('tolerates one missed heartbeat at the default interval', () => {
    expect(devicePresence({ enabled: true, lastHeartbeat: ago(64) }, now)).toBe('online')
    expect(devicePresence({ enabled: true, lastHeartbeat: ago(66) }, now)).toBe('offline')
  })

  it('widens the window for a longer heartbeat interval', () => {
    const device = { enabled: true, heartbeatIntervalMinutes: 120, lastHeartbeat: ago(200) }
    expect(onlineWindowMs(device)).toBe(245 * MINUTE_MS)
    expect(devicePresence(device, now)).toBe('online')
  })

  it('reports a disabled device as disabled whatever its heartbeat', () => {
    expect(devicePresence({ enabled: false, lastHeartbeat: ago(1) }, now)).toBe('disabled')
  })

  it('is unknown when the device never sent a heartbeat', () => {
    expect(devicePresence({ enabled: true, lastHeartbeat: null }, now)).toBe('unknown')
    expect(devicePresence({ enabled: true }, now)).toBe('unknown')
  })

  it('treats an unparseable timestamp as no heartbeat', () => {
    expect(devicePresence({ enabled: true, lastHeartbeat: 'not a date' }, now)).toBe('unknown')
  })
})
