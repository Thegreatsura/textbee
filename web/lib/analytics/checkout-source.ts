import { readCookie } from './attribution'

export const CHECKOUT_SOURCE_COOKIE = 'tb_cfrom'
export const CHECKOUT_SOURCE_MAX_AGE_DAYS = 7

const FROM_PATTERN = /^[a-z0-9_]{1,40}$/
const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export type CheckoutSource = { from: string; ref?: string }

export type CheckoutSourceFields = {
  from?: string
  ref?: string
  priorFrom?: string
  priorRef?: string
  fromCookie?: boolean
}

export const cleanFrom = (value: unknown): string | undefined =>
  typeof value === 'string' && FROM_PATTERN.test(value) ? value : undefined

export const cleanRef = (value: unknown): string | undefined =>
  typeof value === 'string' && REF_PATTERN.test(value) ? value : undefined

const toSource = (from: unknown, ref: unknown): CheckoutSource | null => {
  const cleanedFrom = cleanFrom(from)
  if (!cleanedFrom) return null
  const cleanedRef = cleanRef(ref)
  return cleanedRef ? { from: cleanedFrom, ref: cleanedRef } : { from: cleanedFrom }
}

export function sourceFromSearch(search: string): CheckoutSource | null {
  const params = new URLSearchParams(search)
  return toSource(params.get('from'), params.get('ref'))
}

export function parseSourceCookie(raw: string | null): CheckoutSource | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    return toSource(parsed.from, parsed.ref)
  } catch {
    return null
  }
}

export function buildSourceCookie(
  source: CheckoutSource,
  { secure, now = new Date() }: { secure: boolean; now?: Date }
): string {
  const value = JSON.stringify({ ...source, at: now.toISOString() })
  const parts = [
    `${CHECKOUT_SOURCE_COOKIE}=${encodeURIComponent(value)}`,
    'path=/',
    `max-age=${CHECKOUT_SOURCE_MAX_AGE_DAYS * 24 * 60 * 60}`,
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function checkoutSourceFields(
  explicit: CheckoutSource | null,
  stored: CheckoutSource | null
): CheckoutSourceFields {
  if (!explicit) {
    if (!stored) return {}
    return { ...stored, fromCookie: true }
  }
  const fields: CheckoutSourceFields = { ...explicit }
  if (stored && (stored.from !== explicit.from || stored.ref !== explicit.ref)) {
    fields.priorFrom = stored.from
    if (stored.ref) fields.priorRef = stored.ref
  }
  return fields
}

const LOCAL_ORIGIN = 'http://local'

export function withNoticeSource(href: string, notificationId: string): string {
  if (!href.startsWith('/checkout')) return href
  let url: URL
  try {
    url = new URL(href, LOCAL_ORIGIN)
  } catch {
    return href
  }
  if (
    url.origin !== LOCAL_ORIGIN ||
    !url.pathname.startsWith('/checkout') ||
    url.pathname.startsWith('//')
  ) {
    return href
  }
  url.searchParams.set('from', 'notice')
  const ref = cleanRef(notificationId)
  if (ref) url.searchParams.set('ref', ref)
  else url.searchParams.delete('ref')
  return `${url.pathname}${url.search}${url.hash}`
}

const COMPLETION_PARAMS = ['checkout-success', 'plan-change-success']

export function captureCheckoutSource(): void {
  if (typeof document === 'undefined') return
  try {
    const params = new URLSearchParams(window.location.search)
    if (COMPLETION_PARAMS.some((name) => params.get(name) === '1')) {
      document.cookie = `${CHECKOUT_SOURCE_COOKIE}=; path=/; max-age=0; SameSite=Lax`
      return
    }
    const source = sourceFromSearch(window.location.search)
    if (!source) return
    document.cookie = buildSourceCookie(source, {
      secure: window.location.protocol === 'https:',
    })
  } catch {
    return
  }
}

export function readCheckoutSource(): CheckoutSource | null {
  if (typeof document === 'undefined') return null
  try {
    return parseSourceCookie(readCookie(CHECKOUT_SOURCE_COOKIE, document.cookie))
  } catch {
    return null
  }
}

export function checkoutSourceBody(
  explicit: CheckoutSource | null
): CheckoutSourceFields {
  try {
    return checkoutSourceFields(explicit, readCheckoutSource())
  } catch {
    return {}
  }
}
