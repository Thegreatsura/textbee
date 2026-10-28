import { resolveReportAttempt, resolveReportedAt } from './status-report-input'

describe('resolveReportedAt', () => {
  const now = new Date('2026-09-20T10:00:00.000Z')

  it('takes a plausible millisecond timestamp, as a number or a string', () => {
    const sent = new Date('2026-09-20T09:59:30.000Z')

    expect(resolveReportedAt(sent.getTime(), now)).toEqual(sent)
    expect(resolveReportedAt(String(sent.getTime()), now)).toEqual(sent)
  })

  it('ignores missing and unparseable values', () => {
    for (const value of [undefined, null, '', '   ', 'yesterday', NaN, {}, []]) {
      expect(resolveReportedAt(value, now)).toBeUndefined()
    }
  })

  it('ignores zero and negative values', () => {
    expect(resolveReportedAt(0, now)).toBeUndefined()
    expect(resolveReportedAt(-1000, now)).toBeUndefined()
  })

  it('rejects a clock too far ahead but tolerates ordinary skew', () => {
    const skewed = now.getTime() + 2 * 60 * 60 * 1000
    const absurd = now.getTime() + 48 * 60 * 60 * 1000

    expect(resolveReportedAt(skewed, now)).toEqual(new Date(skewed))
    expect(resolveReportedAt(absurd, now)).toBeUndefined()
  })

  it('rejects a time sent in seconds or microseconds instead of milliseconds', () => {
    const now = new Date('2026-10-28T12:00:00.000Z')
    expect(resolveReportedAt(Math.floor(now.getTime() / 1000), now)).toBeUndefined()
    expect(resolveReportedAt(now.getTime() * 1000, now)).toBeUndefined()
  })

  it('rejects a timestamp older than 30 days', () => {
    const old = now.getTime() - 31 * 24 * 60 * 60 * 1000

    expect(resolveReportedAt(old, now)).toBeUndefined()
  })
})

describe('resolveReportAttempt', () => {
  it('takes a positive attempt number', () => {
    expect(resolveReportAttempt(1)).toBe(1)
    expect(resolveReportAttempt('7')).toBe(7)
    expect(resolveReportAttempt(3.9)).toBe(3)
  })

  it('ignores anything that is not a countable attempt', () => {
    for (const value of [undefined, null, 0, -2, 'later', {}]) {
      expect(resolveReportAttempt(value)).toBeUndefined()
    }
  })

  it('caps a runaway counter', () => {
    expect(resolveReportAttempt(5000)).toBe(100)
  })
})
