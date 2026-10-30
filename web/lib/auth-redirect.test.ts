import { describe, expect, it } from 'vitest'
import { safeRedirect } from './auth-redirect'

const ORIGIN = 'https://app.example.com'

describe('safeRedirect', () => {
  it('keeps a same-origin URL with its query', () => {
    expect(
      safeRedirect(
        'https://app.example.com/checkout/pro?billingInterval=yearly&from=email&ref=U2',
        ORIGIN
      )
    ).toBe('/checkout/pro?billingInterval=yearly&from=email&ref=U2')
  })

  it('keeps a relative path', () => {
    expect(safeRedirect('/dashboard/account/billing?from=email', ORIGIN)).toBe(
      '/dashboard/account/billing?from=email'
    )
  })

  it.each([
    ['missing', null],
    ['empty', ''],
    ['another origin', 'https://evil.example.net/checkout/pro'],
    ['a protocol-relative URL', '//evil.example.net/x'],
    ['a script URL', 'javascript:alert(1)'],
    ['another scheme on the same host', 'http://app.example.com/checkout/pro'],
  ])('rejects %s', (_label, raw) => {
    expect(safeRedirect(raw, ORIGIN)).toBeNull()
  })
})
