import { NextRequest, NextResponse } from 'next/server'

const BILLING_PATH = '/dashboard/account/billing'

/** Where a signed email link goes: the API route that checks the token, or the billing page. */
export function emailLinkTarget(
  apiPath: string,
  token: string | null,
  origin: string,
  apiBase = process.env.NEXT_PUBLIC_API_BASE_URL,
): string {
  const base = (apiBase ?? '').replace(/\/+$/, '')
  if (!token || !/^https?:\/\//.test(base)) return `${origin}${BILLING_PATH}`
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
