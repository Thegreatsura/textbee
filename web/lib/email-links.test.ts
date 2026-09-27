import { describe, expect, it } from 'vitest'
import { emailLinkTarget } from './email-links'

const ORIGIN = 'https://app.example.com'
const API = 'https://api.example.com/api/v1'

describe('emailLinkTarget', () => {
  it('passes the token to the API route', () => {
    expect(emailLinkTarget('/billing/card', 'abc.def', ORIGIN, API)).toBe(
      'https://api.example.com/api/v1/billing/card?t=abc.def',
    )
  })

  it('encodes the token and trims a trailing slash on the base', () => {
    expect(
      emailLinkTarget('/billing/checkout/resume', 'a b&c', ORIGIN, `${API}/`),
    ).toBe('https://api.example.com/api/v1/billing/checkout/resume?t=a%20b%26c')
  })

  it('sends a link without a token to the billing page', () => {
    expect(emailLinkTarget('/billing/card', null, ORIGIN, API)).toBe(
      'https://app.example.com/dashboard/account/billing',
    )
  })

  it('sends the reader to the billing page when the API base is not set', () => {
    expect(emailLinkTarget('/billing/card', 'abc', ORIGIN, '')).toBe(
      'https://app.example.com/dashboard/account/billing',
    )
  })
})
