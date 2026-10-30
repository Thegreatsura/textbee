import { checkoutSource } from './checkout-source'

describe('checkoutSource', () => {
  it('keeps valid values', () => {
    expect(
      checkoutSource({
        from: 'site_home_pricing',
        ref: 'Ab_9-x',
        priorFrom: 'email',
        priorRef: 'U2_paid',
        fromCookie: true,
      }),
    ).toEqual({
      from: 'site_home_pricing',
      ref: 'Ab_9-x',
      priorFrom: 'email',
      priorRef: 'U2_paid',
      fromCookie: true,
    })
  })

  it.each([
    ['uppercase', 'App'],
    ['a hyphen', 'app-billing'],
    ['a space', 'app billing'],
    ['too long', 'a'.repeat(41)],
    ['empty', ''],
    ['a number', 7],
    ['an object', { $ne: null }],
  ])('drops a from with %s', (_label, value) => {
    expect(checkoutSource({ from: value, priorFrom: value })).toEqual({})
  })

  it('accepts a from of exactly 40 characters', () => {
    expect(checkoutSource({ from: 'a'.repeat(40) })).toEqual({ from: 'a'.repeat(40) })
  })

  it.each([
    ['a dot', 'a.b'],
    ['a slash', 'a/b'],
    ['too long', 'a'.repeat(65)],
    ['empty', ''],
    ['an array', ['U1']],
  ])('drops a ref with %s', (_label, value) => {
    expect(checkoutSource({ ref: value, priorRef: value })).toEqual({})
  })

  it('accepts a ref of exactly 64 characters', () => {
    expect(checkoutSource({ ref: 'A'.repeat(64) })).toEqual({ ref: 'A'.repeat(64) })
  })

  it('keeps fromCookie only as a boolean', () => {
    expect(checkoutSource({ fromCookie: false })).toEqual({ fromCookie: false })
    expect(checkoutSource({ fromCookie: 'true' })).toEqual({})
  })

  it('handles a missing payload', () => {
    expect(checkoutSource(undefined)).toEqual({})
    expect(checkoutSource(null)).toEqual({})
  })
})
