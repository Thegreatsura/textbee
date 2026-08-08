/**
 * Android OS version normalization.
 *
 * Older app builds only ever sent `os = Build.VERSION.BASE_OS`, a raw build
 * fingerprint, and never sent an OS version at all. Many installs still run
 * those builds and may never update, so the release is derived here rather
 * than relying on the client to report it.
 *
 * Keep FINGERPRINT_RELEASE in sync with the copy in
 * textbee-tools/src/textbee_tools/backfill_os_version.py
 */

/** Matches the release in a BASE_OS fingerprint: samsung/a13nnxx/a13:14/UP1A.../... */
const FINGERPRINT_RELEASE = /:(\d+(?:\.\d+)*)\//

export interface OsFieldsInput {
  os?: string
  osVersion?: string
  osApiLevel?: number
  osBuildFingerprint?: string
}

export function parseReleaseFromFingerprint(raw?: string): string | null {
  if (!raw) return null
  return raw.match(FINGERPRINT_RELEASE)?.[1] ?? null
}

/**
 * Returns only the keys we have a real value for, so a partial or legacy
 * payload can never overwrite a stored value with '' or null.
 */
export function normalizeOsFields(input: OsFieldsInput): Record<string, any> {
  const patch: Record<string, any> = {}
  const raw = input?.os?.trim()

  const reported = input?.osVersion?.trim()
  if (reported) {
    patch.osVersion = reported
  } else {
    const parsed = parseReleaseFromFingerprint(raw)
    if (parsed) patch.osVersion = parsed
  }

  if (typeof input?.osApiLevel === 'number' && Number.isFinite(input.osApiLevel)) {
    patch.osApiLevel = input.osApiLevel
  }

  if (raw && raw.includes('/')) patch.osBuildFingerprint = raw
  if (input?.os !== undefined) patch.os = 'Android'

  return patch
}
