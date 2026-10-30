/** The same-origin path a redirect param points at, or null for anything else. */
export function safeRedirect(
  raw: string | null | undefined,
  origin: string
): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw, origin)
    if (url.origin !== origin) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function redirectFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return safeRedirect(
    new URLSearchParams(window.location.search).get('redirect'),
    window.location.origin
  )
}
