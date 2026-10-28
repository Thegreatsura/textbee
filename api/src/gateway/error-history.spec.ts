import {
  ERROR_HISTORY_LIMIT,
  STATUS_TIMEOUT_DISPATCHED_MESSAGE,
  currentFailureEntry,
  errorHistoryPush,
  inferFailureSource,
  isStatusTimeoutNote,
  storedErrorHistory,
} from './error-history'

describe('errorHistoryPush', () => {
  const at = new Date('2026-09-20T10:00:00.000Z')

  it('appends one entry to both trails and keeps the last ten', () => {
    const fragment = errorHistoryPush(
      { code: 'NO_SERVICE', message: 'no carrier', source: 'device' },
      at,
    )

    const each = {
      $each: [{ code: 'NO_SERVICE', message: 'no carrier', at, source: 'device' }],
      $slice: -10,
    }
    expect(ERROR_HISTORY_LIMIT).toBe(10)
    expect(fragment).toEqual({
      $push: { errorHistory: each, 'metadata.errorHistory': each },
    })
  })

  it('records a code-only failure and omits the empty message', () => {
    const fragment = errorHistoryPush({ code: 'FCM_SEND_ERROR', source: 'push' }, at)

    expect(fragment.$push.errorHistory.$each[0]).toEqual({
      code: 'FCM_SEND_ERROR',
      at,
      source: 'push',
    })
  })

  it('labels a message-only failure UNKNOWN rather than dropping it', () => {
    const fragment = errorHistoryPush({ message: 'timed out', source: 'server' }, at)

    expect(fragment.$push.errorHistory.$each[0].code).toBe('UNKNOWN')
  })

  it('returns null when there is nothing to record', () => {
    expect(errorHistoryPush({ source: 'server' }, at)).toBeNull()
    expect(errorHistoryPush({ code: '  ', message: '', source: 'push' }, at)).toBeNull()
    expect(errorHistoryPush({ code: 42 as any, source: 'push' }, at)).toBeNull()
  })

  it('truncates a long message', () => {
    const fragment = errorHistoryPush(
      { code: 'X', message: 'y'.repeat(1000), source: 'device' },
      at,
    )

    expect(fragment.$push.errorHistory.$each[0].message).toHaveLength(300)
  })
})

describe('storedErrorHistory', () => {
  const t = (minute: number) => new Date(Date.UTC(2026, 9, 1, 10, minute))

  it('merges both trails, dedupes, maps fcm to push and sorts by time', () => {
    const history = storedErrorHistory({
      metadata: {
        errorHistory: [
          { code: 'FCM_SEND_TIMEOUT', at: t(1), source: 'fcm' },
          { code: '4', at: t(3), source: 'device' },
        ],
      },
      errorHistory: [
        { code: '4', at: t(3).toISOString(), source: 'device' },
        { code: '1', at: t(2), source: 'device', message: 'generic' },
      ],
    })

    expect(history).toEqual([
      { code: 'FCM_SEND_TIMEOUT', at: t(1), source: 'push' },
      { code: '1', at: t(2), source: 'device', message: 'generic' },
      { code: '4', at: t(3), source: 'device' },
    ])
  })

  it('keeps only the newest ten', () => {
    const history = storedErrorHistory({
      errorHistory: Array.from({ length: 12 }, (_, i) => ({
        code: String(i),
        at: t(i),
        source: 'device',
      })),
    })

    expect(history).toHaveLength(10)
    expect(history[0].code).toBe('2')
  })

  it('skips entries without a usable time and survives odd shapes', () => {
    expect(
      storedErrorHistory({
        errorHistory: [{ code: 'X', at: 'not a date' }, null],
        metadata: { errorHistory: 'nope' },
      }),
    ).toEqual([])
    expect(storedErrorHistory({ metadata: null })).toEqual([])
  })
})

describe('currentFailureEntry', () => {
  const failedAt = new Date('2026-09-01T08:00:00.000Z')

  it('rebuilds the failure the top-level fields still hold', () => {
    expect(
      currentFailureEntry(
        { errorCode: 'PERMISSION_DENIED', errorMessage: 'no permission', failedAt },
        [],
      ),
    ).toEqual({
      code: 'PERMISSION_DENIED',
      message: 'no permission',
      at: failedAt,
      source: 'device',
      backfilled: true,
    })
  })

  it('returns null when the trail already holds it', () => {
    expect(
      currentFailureEntry({ errorCode: '4', failedAt }, [
        { code: '4', at: failedAt, source: 'device' },
      ]),
    ).toBeNull()
  })

  it('never turns the timeout note into a failure', () => {
    expect(
      currentFailureEntry({ errorMessage: STATUS_TIMEOUT_DISPATCHED_MESSAGE }, []),
    ).toBeNull()
  })

  it('never turns the test-skip marker into a failure', () => {
    expect(
      currentFailureEntry(
        { errorCode: 'FCM_SEND_SKIPPED', errorMessage: STATUS_TIMEOUT_DISPATCHED_MESSAGE },
        [],
      ),
    ).toBeNull()
  })

  it('keeps a real code but drops a timeout note next to it', () => {
    const createdAt = new Date('2026-08-01T00:00:00.000Z')
    expect(
      currentFailureEntry(
        { errorCode: '1', errorMessage: STATUS_TIMEOUT_DISPATCHED_MESSAGE, createdAt },
        [],
      ),
    ).toEqual({ code: '1', at: createdAt, source: 'device', backfilled: true })
  })

  it('labels a server failure without a code', () => {
    expect(
      currentFailureEntry({ errorMessage: 'queue down', failedAt }, []),
    ).toEqual(
      expect.objectContaining({ code: 'UNKNOWN', source: 'server', message: 'queue down' }),
    )
  })
})

describe('inferFailureSource', () => {
  it('tells push, server and phone failures apart', () => {
    expect(inferFailureSource('FCM_TOKEN_NOT_REGISTERED', '', null)).toBe('push')
    expect(inferFailureSource(undefined, 'FCM_SEND_TIMEOUT: slow', new Date())).toBe('push')
    expect(inferFailureSource(undefined, 'boom', new Date())).toBe('server')
    expect(inferFailureSource('2', 'radio off', new Date())).toBe('device')
  })
})

describe('isStatusTimeoutNote', () => {
  it('matches only the two notes', () => {
    expect(isStatusTimeoutNote(STATUS_TIMEOUT_DISPATCHED_MESSAGE)).toBe(true)
    expect(isStatusTimeoutNote('Status update timeout')).toBe(false)
    expect(isStatusTimeoutNote(undefined)).toBe(false)
  })
})
