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
      others: [{ code: 'FCM_SEND_TIMEOUT', at: at(1), source: 'push' }],
    })
  })

  it('finds the current failure when the phone sent no code', () => {
    const view = failureView({
      _id: 'm',
      status: 'failed',
      errorMessage: 'Unknown error',
      failedAt: at(5),
      errorHistory: [{ code: 'UNKNOWN', message: 'Unknown error', at: at(5), source: 'device' }],
    })

    expect(view).toEqual(expect.objectContaining({ kind: 'failed', others: [] }))
  })

  it('finds the current failure of an old message without failedAt', () => {
    const view = failureView({
      _id: 'm',
      status: 'failed',
      errorMessage: 'queue down',
      errorHistory: [
        { code: '4', at: at(1), source: 'device' },
        { code: 'UNKNOWN', message: 'queue down', at: at(2), source: 'server', backfilled: true },
      ],
    })

    expect(view).toEqual(
      expect.objectContaining({ others: [{ code: '4', at: at(1), source: 'device' }] })
    )
  })

  it('shows an old failure that has no history', () => {
    expect(
      failureView({ _id: 'm', status: 'FAILED', errorCode: '4', errorMessage: 'no service' })
    ).toEqual({ kind: 'failed', code: '4', message: 'no service', others: [] })
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
    ).toEqual({ kind: 'no-report', attempts: [] })
  })

  it('keeps phone reports seen on an unknown message', () => {
    expect(
      failureView({
        _id: 'm',
        status: 'unknown',
        errorHistory: [{ code: '0', message: 'canceled', at: at(1), source: 'device' }],
      })
    ).toEqual({
      kind: 'no-report',
      attempts: [{ code: '0', message: 'canceled', at: at(1), source: 'device' }],
    })
  })

  it('shows nothing for a message still on its way', () => {
    expect(failureView({ _id: 'm', status: 'dispatched', errorCode: 'FCM_SEND_SKIPPED' })).toBeNull()
  })
})

describe('recoveredLabel', () => {
  it('counts failures without claiming when they happened', () => {
    expect(recoveredLabel({ attempts: [1], capped: false })).toBe('1 failure recorded')
    expect(recoveredLabel({ attempts: [1, 2], capped: false })).toBe('2 failures recorded')
    expect(recoveredLabel({ attempts: new Array(15), capped: true })).toBe(
      '15 or more failures recorded'
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
