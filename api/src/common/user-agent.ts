import * as Bowser from 'bowser'

const MAX_USER_AGENT = 512

const OS_FAMILIES = new Map([
  ['windows', 'windows'],
  ['macos', 'macos'],
  ['ios', 'ios'],
  ['android', 'android'],
  ['linux', 'linux'],
  ['chrome os', 'chromeos'],
])

const BROWSER_FAMILIES = new Map([
  ['chrome', 'chrome'],
  ['chromium', 'chrome'],
  ['safari', 'safari'],
  ['firefox', 'firefox'],
  ['focus', 'firefox'],
  ['microsoft edge', 'edge'],
  ['opera', 'opera'],
  ['opera coast', 'opera'],
  ['samsung internet for android', 'samsung'],
  ['android browser', 'android'],
  ['uc browser', 'uc'],
  ['yandex browser', 'yandex'],
  ['internet explorer', 'ie'],
])

const DESKTOP_OS = new Set(['windows', 'macos', 'linux', 'chromeos'])
const MAC_PLATFORM = /macintosh/i
const IOS_APP_TOKEN = /mobile\/|crios\/|edgios\/|fxios\//i
const BROWSER_TOKEN = /^mozilla\//i

export type ClientDescription = {
  device: string
  os: string
  browser: string
  userAgent: string
  at: Date
}

type Parsed = { os?: string; browser?: string }

function clean(userAgent: unknown): string | undefined {
  if (typeof userAgent !== 'string') return undefined
  return userAgent.trim().slice(0, MAX_USER_AGENT) || undefined
}

function parse(userAgent: string): Parsed {
  try {
    const { os, browser } = Bowser.parse(userAgent)
    return { os: os.name?.toLowerCase(), browser: browser.name?.toLowerCase() }
  } catch {
    return {}
  }
}

function osFamily(userAgent: string, parsed: Parsed): string {
  if (MAC_PLATFORM.test(userAgent) && IOS_APP_TOKEN.test(userAgent)) {
    return 'ios'
  }
  return OS_FAMILIES.get(parsed.os) ?? 'other'
}

function deviceFor(os: string): string {
  if (os === 'android' || os === 'ios') return os
  return DESKTOP_OS.has(os) ? 'desktop' : 'other'
}

export function classifyDevice(userAgent?: string): string {
  const ua = clean(userAgent)
  if (!ua) return 'unknown'
  return deviceFor(osFamily(ua, parse(ua)))
}

export function describeClient(
  userAgent?: string,
  at = new Date(),
): ClientDescription | undefined {
  const ua = clean(userAgent)
  if (!ua || !BROWSER_TOKEN.test(ua)) return undefined

  const parsed = parse(ua)
  const os = osFamily(ua, parsed)
  return {
    device: deviceFor(os),
    os,
    browser: BROWSER_FAMILIES.get(parsed.browser) ?? 'other',
    userAgent: ua,
    at,
  }
}
