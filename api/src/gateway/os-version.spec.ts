import { normalizeOsFields, parseReleaseFromFingerprint } from './os-version'

// Representative BASE_OS fingerprints. These are shared OEM build strings,
// identical across every device on the same build.
const FP_14 = 'samsung/a13nnxx/a13:14/UP1A.231005.007/A135FXXUAEXL2:user/release-keys'
const FP_16 = 'samsung/e3qxxx/e3q:16/BP2A.250605.031.A3/S928BXXU4CYI7:user/release-keys'
const FP_15 = 'Redmi/gale_in/gale:15/AP3A.240905.015.A2/OS2.0.206.0.VGPINXM:user/release-keys'
const FP_7 = 'samsung/j5ylte/j5y17lte:7.0/NRD90M/J530FXXU1AQG3:user/release-keys'

describe('parseReleaseFromFingerprint', () => {
  it('pulls the release out of a fingerprint', () => {
    expect(parseReleaseFromFingerprint(FP_14)).toBe('14')
    expect(parseReleaseFromFingerprint(FP_16)).toBe('16')
    expect(parseReleaseFromFingerprint(FP_15)).toBe('15')
  })

  it('keeps a dotted release verbatim', () => {
    expect(parseReleaseFromFingerprint(FP_7)).toBe('7.0')
  })

  it('returns null when there is nothing to parse', () => {
    expect(parseReleaseFromFingerprint('')).toBeNull()
    expect(parseReleaseFromFingerprint(undefined)).toBeNull()
    expect(parseReleaseFromFingerprint('Android')).toBeNull()
    expect(parseReleaseFromFingerprint('not/a/fingerprint')).toBeNull()
  })

  it('takes the first match, not a later colon segment', () => {
    // ':user/' trails every fingerprint and must never win.
    expect(parseReleaseFromFingerprint(FP_14)).toBe('14')
  })
})

describe('normalizeOsFields', () => {
  describe('legacy clients (os = BASE_OS, no osVersion)', () => {
    it('derives the version from the fingerprint and canonicalizes os', () => {
      expect(normalizeOsFields({ os: FP_14 })).toEqual({
        osVersion: '14',
        osBuildFingerprint: FP_14,
        os: 'Android',
      })
    })

    it('keeps a dotted release verbatim', () => {
      expect(normalizeOsFields({ os: FP_7 }).osVersion).toBe('7.0')
    })

    // The regression that would silently undo the backfill: BASE_OS is an
    // empty string on many devices, and an empty string is not null, so it
    // reaches $set unless it is dropped here.
    it('emits no osVersion key when BASE_OS is blank', () => {
      const patch = normalizeOsFields({ os: '' })
      expect(patch).not.toHaveProperty('osVersion')
      expect(patch).not.toHaveProperty('osBuildFingerprint')
      expect(patch.os).toBe('Android')
    })

    it('emits no osVersion key when os is absent entirely', () => {
      expect(normalizeOsFields({})).toEqual({})
    })
  })

  describe('current clients (osVersion reported directly)', () => {
    it('passes the reported version and api level through', () => {
      expect(normalizeOsFields({ os: 'Android', osVersion: '16', osApiLevel: 36 })).toEqual({
        osVersion: '16',
        osApiLevel: 36,
        os: 'Android',
      })
    })

    it('prefers the reported version over the fingerprint', () => {
      // A device that upgraded its OS but kept a stale BASE_OS string.
      const patch = normalizeOsFields({ os: FP_14, osVersion: '16', osApiLevel: 36 })
      expect(patch.osVersion).toBe('16')
      expect(patch.osBuildFingerprint).toBe(FP_14)
    })

    it('stores a non-numeric release as reported', () => {
      // Preview builds can report a codename; display handles it via osApiLevel.
      expect(normalizeOsFields({ osVersion: 'Baklava', osApiLevel: 36 })).toEqual({
        osVersion: 'Baklava',
        osApiLevel: 36,
      })
    })

    // Current clients put the build string in its own field, because `os` now
    // carries the plain 'Android' label and so has no '/' to parse. Without
    // this the field is only ever writable by the backfill script.
    it('keeps the build string reported in its own field', () => {
      expect(
        normalizeOsFields({
          os: 'Android',
          osVersion: '16',
          osApiLevel: 36,
          osBuildFingerprint: FP_16,
        }),
      ).toEqual({
        osVersion: '16',
        osApiLevel: 36,
        osBuildFingerprint: FP_16,
        os: 'Android',
      })
    })

    it('prefers the reported build string over one parsed out of os', () => {
      const patch = normalizeOsFields({ os: FP_14, osBuildFingerprint: FP_16 })
      expect(patch.osBuildFingerprint).toBe(FP_16)
    })

    it('emits no build string when the reported one is blank', () => {
      // BASE_OS is empty on many devices, and '' is not null, so it would
      // otherwise reach $set.
      for (const blank of ['', '   ']) {
        const patch = normalizeOsFields({ os: 'Android', osBuildFingerprint: blank })
        expect(patch).not.toHaveProperty('osBuildFingerprint')
      }
    })

    it('falls back to os when no build string is reported', () => {
      expect(normalizeOsFields({ os: FP_14 }).osBuildFingerprint).toBe(FP_14)
    })
  })

  describe('partial payloads', () => {
    it('emits nothing for a settings-toggle style body', () => {
      expect(normalizeOsFields({} as any)).toEqual({})
    })

    it('ignores a blank reported version and falls back to the fingerprint', () => {
      expect(normalizeOsFields({ os: FP_15, osVersion: '   ' }).osVersion).toBe('15')
    })

    it('ignores a non-numeric api level', () => {
      const patch = normalizeOsFields({ osApiLevel: NaN as any })
      expect(patch).not.toHaveProperty('osApiLevel')
    })
  })
})
