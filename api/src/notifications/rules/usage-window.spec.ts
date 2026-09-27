import {
  allowancePercent,
  dailyWindowStart,
  monthlyWindowStart,
} from './usage-window'

// Part of the cross-repo contract: textbee-admin runs the same assertions
// against its copy, so both count usage over identical windows.

describe('dailyWindowStart', () => {
  it('is server-local midnight of the same day', () => {
    const now = new Date(2026, 8, 27, 15, 42, 31, 500)
    const start = dailyWindowStart(now)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(8)
    expect(start.getDate()).toBe(27)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(start.getSeconds()).toBe(0)
    expect(start.getMilliseconds()).toBe(0)
  })

  it('does not mutate its argument', () => {
    const now = new Date(2026, 8, 27, 15, 42, 31)
    const copy = new Date(now.getTime())
    dailyWindowStart(now)
    expect(now.getTime()).toBe(copy.getTime())
  })
})

describe('monthlyWindowStart', () => {
  it('slides back exactly one month and keeps the time of day', () => {
    const now = new Date(2026, 8, 27, 15, 42, 31)
    const start = monthlyWindowStart(now)
    expect(start.getMonth()).toBe(7)
    expect(start.getDate()).toBe(27)
    expect(start.getHours()).toBe(15)
  })

  it('crosses a year boundary', () => {
    const start = monthlyWindowStart(new Date(2026, 0, 15, 9, 0, 0))
    expect(start.getFullYear()).toBe(2025)
    expect(start.getMonth()).toBe(11)
  })

  it('matches the platform rule when the day does not exist in the previous month', () => {
    // 31 March minus one month lands in March again, because February has no
    // 31st. Asserted rather than corrected: billing does exactly this, and the
    // two must agree even where the behaviour is odd.
    const start = monthlyWindowStart(new Date(2026, 2, 31, 12, 0, 0))
    expect(start.getMonth()).toBe(2)
    expect(start.getDate()).toBe(3)
  })

  it('does not mutate its argument', () => {
    const now = new Date(2026, 8, 27, 15, 42, 31)
    const copy = new Date(now.getTime())
    monthlyWindowStart(now)
    expect(now.getTime()).toBe(copy.getTime())
  })
})

describe('allowancePercent', () => {
  it('rounds to a whole percent', () => {
    expect(allowancePercent(1, 3)).toBe(33)
  })

  it('can exceed 100', () => {
    expect(allowancePercent(120, 100)).toBe(120)
  })

  it('is zero for no usage against a real allowance', () => {
    expect(allowancePercent(0, 100)).toBe(0)
  })

  it('is unjudgeable for an unlimited allowance rather than zero', () => {
    expect(allowancePercent(50, -1)).toBeUndefined()
    expect(allowancePercent(50, 0)).toBeUndefined()
  })

  it('is unjudgeable when either side is missing', () => {
    expect(allowancePercent(undefined, 100)).toBeUndefined()
    expect(allowancePercent(50, undefined)).toBeUndefined()
  })
})
