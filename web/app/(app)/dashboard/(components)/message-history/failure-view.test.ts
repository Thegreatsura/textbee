import { describe, expect, it } from 'vitest'
import { failureView, recoveredLabel, sourceLabel } from './failure-view'

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 10, minute)).toISOString()

describe('failureView', () => {
  it('shows the current failure and hides it from the earlier list', () => {
    const view = failureView({
      _id: 'm',
      status: 'failed',
      errorCode: '1',
      errorMessage: 'generic',
      failedAt: at(5),
      errorHistory: [
        { code: '1', at: at(5), source: 'device' },
        { code: 'FCM_SEND_TIMEOUT', at: at(1), source: 'push' },
      ],
    })

    expect(view).toEqual({
      kind: 'failed',
      code: '1',
      message: 'generic',
      earlier: [{ code: 'FCM_SEND_TIMEOUT', at: at(1), source: 'push' }],
    })
  })

  it('shows an old failure that has no history', () => {
    expect(
      failureView({ _id: 'm', status: 'FAILED', errorCode: '4', errorMessage: 'no service' })
    ).toEqual({ kind: 'failed', code: '4', message: 'no service', earlier: [] })
  })

  it('lists the failures of a message that went out after all', () => {
    const view = failureView({
      _id: 'm',
      status: 'delivered',
      errorHistory: [{ code: '1', at: at(1), source: 'device' }],
    })

    expect(view).toEqual({
      kind: 'recovered',
      attempts: [{ code: '1', at: at(1), source: 'device' }],
      capped: false,
    })
  })

  it('says nothing about leftover error text on a delivered message', () => {
    expect(
      failureView({
        _id: 'm',
        status: 'delivered',
        errorMessage: 'Status update timeout - no response from device after dispatch',
      })
    ).toBeNull()
  })

  it('explains a missing report instead of calling it a failure', () => {
    expect(
      failureView({
        _id: 'm',
        status: 'unknown',
        errorMessage: 'Status update timeout - no response from device after dispatch',
      })
    ).toEqual({ kind: 'no-report' })
  })

  it('shows nothing for a message still on its way', () => {
    expect(failureView({ _id: 'm', status: 'dispatched', errorCode: 'FCM_SEND_SKIPPED' })).toBeNull()
  })
})

describe('recoveredLabel', () => {
  it('counts attempts and marks the cap', () => {
    expect(recoveredLabel({ attempts: [1], capped: false }, 'sent')).toBe(
      'Failed once before it was sent'
    )
    expect(recoveredLabel({ attempts: [1, 2], capped: false }, 'delivered')).toBe(
      'Failed 2 times before it was delivered'
    )
    expect(recoveredLabel({ attempts: new Array(10), capped: true }, 'sent')).toBe(
      'Failed 10+ times before it was sent'
    )
  })
})

describe('sourceLabel', () => {
  it('names where the failure came from', () => {
    expect(sourceLabel('device')).toBe('Phone')
    expect(sourceLabel('push')).toBe('Push service')
    expect(sourceLabel('server')).toBe('Server')
  })
})
