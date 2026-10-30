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
    ['a same-origin URL with a double slash path', 'https://app.example.com//evil.example.net'],
    ['a dot segment before a double slash', '/.//evil.example.net'],
    ['a parent segment before a double slash', '/x/..//evil.example.net'],
    ['a leading double backslash', '\\\\evil.example.net'],
    ['a slash then a backslash', '/\\evil.example.net'],
    ['a tab in the path', '/\t/evil.example.net'],
    ['a decoded encoded double slash', decodeURIComponent('%2F%2Fevil.example.net')],
  ])('rejects %s', (_label, raw) => {
    expect(safeRedirect(raw, ORIGIN)).toBeNull()
  })

  it('keeps an encoded double slash on this site as a plain path', () => {
    expect(safeRedirect('%2F%2Fevil.example.net', ORIGIN)).toBe('/%2F%2Fevil.example.net')
  })
})
