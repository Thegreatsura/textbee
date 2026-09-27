import { NextRequest, NextResponse } from 'next/server'

const BILLING_PATH = '/dashboard/account/billing'

/** https, or http on this machine only. */
export function isAllowedApiBase(base: string): boolean {
  try {
    const url = new URL(base)
    if (url.protocol === 'https:') return true
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    )
  } catch {
    return false
  }
}

/** Where a signed email link goes: the API route that checks the token, or the billing page. */
export function emailLinkTarget(
  apiPath: string,
  token: string | null,
  origin: string,
  apiBase = process.env.NEXT_PUBLIC_API_BASE_URL,
): string {
  const base = (apiBase ?? '').replace(/\/+$/, '')
  if (!token || !isAllowedApiBase(base)) return `${origin}${BILLING_PATH}`
  return `${base}${apiPath}?t=${encodeURIComponent(token)}`
}

export function emailLinkRedirect(request: NextRequest, apiPath: string) {
  const target = emailLinkTarget(
    apiPath,
    request.nextUrl.searchParams.get('t'),
    request.nextUrl.origin,
  )
  const response = NextResponse.redirect(target, 302)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
