import { afterEach, describe, expect, it } from 'vitest'
import {
  CHECKOUT_SOURCE_COOKIE,
  buildSourceCookie,
  captureCheckoutSource,
  checkoutSourceFields,
  parseSourceCookie,
  readCheckoutSource,
  sourceFromSearch,
  withNoticeSource,
} from './checkout-source'

const clearCookie = () => {
  document.cookie = `${CHECKOUT_SOURCE_COOKIE}=; path=/; max-age=0`
}

describe('sourceFromSearch', () => {
  it('reads from and ref', () => {
    expect(sourceFromSearch('?from=email&ref=U1')).toEqual({ from: 'email', ref: 'U1' })
    expect(sourceFromSearch('?billingInterval=yearly&from=app_billing')).toEqual({
      from: 'app_billing',
    })
  })

  it.each([
    ['no from', '?ref=U1'],
    ['an uppercase from', '?from=Email'],
    ['a hyphenated from', '?from=app-billing'],
    ['a from over 40 characters', `?from=${'a'.repeat(41)}`],
  ])('ignores %s', (_label, search) => {
    expect(sourceFromSearch(search)).toBeNull()
  })

  it('drops an invalid ref and keeps the from', () => {
    expect(sourceFromSearch('?from=email&ref=a.b')).toEqual({ from: 'email' })
    expect(sourceFromSearch(`?from=email&ref=${'a'.repeat(65)}`)).toEqual({ from: 'email' })
  })
})

describe('source cookie', () => {
  it('round trips through the cookie value', () => {
    const cookie = buildSourceCookie(
      { from: 'email', ref: 'U1' },
      { secure: false, now: new Date('2026-10-01T00:00:00.000Z') }
    )
    const raw = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='))

    expect(JSON.parse(raw)).toEqual({ from: 'email', ref: 'U1', at: '2026-10-01T00:00:00.000Z' })
    expect(parseSourceCookie(raw)).toEqual({ from: 'email', ref: 'U1' })
  })

  it('sets the name, path, a 7 day lifetime and SameSite=Lax', () => {
    const cookie = buildSourceCookie({ from: 'email' }, { secure: true })

    expect(cookie.startsWith('tb_cfrom=')).toBe(true)
    expect(cookie).toContain('path=/')
    expect(cookie).toContain(`max-age=${7 * 24 * 60 * 60}`)
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Secure')
    expect(buildSourceCookie({ from: 'email' }, { secure: false })).not.toContain('Secure')
  })

  it.each([
    ['missing', null],
    ['not json', 'nope'],
    ['an invalid from', JSON.stringify({ from: 'Bad Value' })],
    ['a non object', '"email"'],
  ])('reads nothing from a %s value', (_label, raw) => {
    expect(parseSourceCookie(raw)).toBeNull()
  })
})

describe('checkoutSourceFields', () => {
  it('sends nothing without a source', () => {
    expect(checkoutSourceFields(null, null)).toEqual({})
  })

  it('uses the explicit source alone when nothing is stored', () => {
    expect(checkoutSourceFields({ from: 'app_billing' }, null)).toEqual({ from: 'app_billing' })
  })

  it('keeps a different stored source as the prior one', () => {
    expect(
      checkoutSourceFields({ from: 'app_billing' }, { from: 'email', ref: 'U1' })
    ).toEqual({ from: 'app_billing', priorFrom: 'email', priorRef: 'U1' })
  })

  it('treats a different ref as a different source', () => {
    expect(
      checkoutSourceFields({ from: 'email', ref: 'U2' }, { from: 'email', ref: 'U1' })
    ).toEqual({ from: 'email', ref: 'U2', priorFrom: 'email', priorRef: 'U1' })
  })

  it('adds no prior source when the stored one is the same', () => {
    expect(
      checkoutSourceFields({ from: 'email', ref: 'U1' }, { from: 'email', ref: 'U1' })
    ).toEqual({ from: 'email', ref: 'U1' })
  })

  it('falls back to the stored source and says so', () => {
    expect(checkoutSourceFields(null, { from: 'email', ref: 'U1' })).toEqual({
      from: 'email',
      ref: 'U1',
      fromCookie: true,
    })
  })
})

describe('captureCheckoutSource', () => {
  afterEach(() => {
    clearCookie()
    window.history.replaceState(null, '', '/')
  })

  it('stores a valid source from the page URL', () => {
    window.history.replaceState(null, '', '/dashboard/account/billing?from=email&ref=U1')

    captureCheckoutSource()

    expect(readCheckoutSource()).toEqual({ from: 'email', ref: 'U1' })
  })

  it('keeps the stored source when the page has none', () => {
    window.history.replaceState(null, '', '/dashboard?from=email&ref=U1')
    captureCheckoutSource()
    window.history.replaceState(null, '', '/dashboard/messaging')
    captureCheckoutSource()

    expect(readCheckoutSource()).toEqual({ from: 'email', ref: 'U1' })
  })

  it('ignores an invalid source', () => {
    window.history.replaceState(null, '', '/dashboard?from=<script>')

    captureCheckoutSource()

    expect(readCheckoutSource()).toBeNull()
  })
})

describe('withNoticeSource', () => {
  it('tags a checkout link with the notice id', () => {
    expect(withNoticeSource('/checkout/pro', '6700000000000000000000a1')).toBe(
      '/checkout/pro?from=notice&ref=6700000000000000000000a1'
    )
    expect(withNoticeSource('/checkout/pro?billingInterval=yearly', 'n1')).toBe(
      '/checkout/pro?billingInterval=yearly&from=notice&ref=n1'
    )
  })

  it('replaces a source already on the link', () => {
    expect(withNoticeSource('/checkout/pro?from=email&ref=U1', 'n1')).toBe(
      '/checkout/pro?from=notice&ref=n1'
    )
  })

  it('leaves out an id that is not a valid ref', () => {
    expect(withNoticeSource('/checkout/pro', 'a.b')).toBe('/checkout/pro?from=notice')
  })

  it.each([
    '/dashboard/account/billing',
    'https://textbee.dev/checkout/pro',
    '/messaging',
  ])('leaves %s alone', (href) => {
    expect(withNoticeSource(href, 'n1')).toBe(href)
  })
})
