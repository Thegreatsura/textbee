import { classifyDevice, describeClient } from './user-agent'

const UA = {
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  windowsEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
  windowsOpera:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/113.0.0.0',
  internetExplorer:
    'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  ubuntuFirefox:
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  samsungInternet:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1',
  ipadSafari:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadChromeDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1',
  ipadEdgeDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/128.0.2739.60 Mobile/15E148 Safari/605.1.15',
  ipadFirefoxDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15',
  ipadWebviewDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  windowsPhone:
    'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0 Mobile Safari/537.36 Edge/15.14977',
  linuxWithMobileToken:
    'Mozilla/5.0 (X11; Linux x86_64; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  vivaldi:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Vivaldi/6.8.3381.48',
}

describe('classifyDevice', () => {
  it('reads the device class from the user agent', () => {
    expect(
      classifyDevice(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36',
      ),
    ).toBe('android')
    expect(
      classifyDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'),
    ).toBe('ios')
    expect(
      classifyDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'),
    ).toBe('desktop')
    expect(classifyDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(
      'desktop',
    )
  })

  it('tells a missing user agent apart from one it cannot place', () => {
    expect(classifyDevice(undefined)).toBe('unknown')
    expect(classifyDevice('')).toBe('unknown')
    expect(classifyDevice('curl/8.4.0')).toBe('other')
  })

  it('places a desktop browser by its platform even with a mobile token', () => {
    expect(classifyDevice(UA.linuxWithMobileToken)).toBe('desktop')
  })

  it('places an iPad in desktop mode by its iOS app token', () => {
    expect(classifyDevice(UA.ipadChromeDesktopMode)).toBe('ios')
  })
})

describe('describeClient', () => {
  it.each([
    {
      name: 'Chrome on Windows',
      ua: UA.windowsChrome,
      os: 'windows',
      browser: 'chrome',
      device: 'desktop',
    },
    {
      name: 'Edge on Windows',
      ua: UA.windowsEdge,
      os: 'windows',
      browser: 'edge',
      device: 'desktop',
    },
    {
      name: 'Opera on Windows',
      ua: UA.windowsOpera,
      os: 'windows',
      browser: 'opera',
      device: 'desktop',
    },
    {
      name: 'Internet Explorer',
      ua: UA.internetExplorer,
      os: 'windows',
      browser: 'ie',
      device: 'desktop',
    },
    {
      name: 'Safari on macOS',
      ua: UA.macSafari,
      os: 'macos',
      browser: 'safari',
      device: 'desktop',
    },
    {
      name: 'Chrome on macOS',
      ua: UA.macChrome,
      os: 'macos',
      browser: 'chrome',
      device: 'desktop',
    },
    {
      name: 'Firefox on Ubuntu',
      ua: UA.ubuntuFirefox,
      os: 'linux',
      browser: 'firefox',
      device: 'desktop',
    },
    {
      name: 'Chrome on ChromeOS',
      ua: UA.chromeOs,
      os: 'chromeos',
      browser: 'chrome',
      device: 'desktop',
    },
    {
      name: 'Chrome on Android',
      ua: UA.androidChrome,
      os: 'android',
      browser: 'chrome',
      device: 'android',
    },
    {
      name: 'Samsung Internet',
      ua: UA.samsungInternet,
      os: 'android',
      browser: 'samsung',
      device: 'android',
    },
    {
      name: 'Safari on iPhone',
      ua: UA.iphoneSafari,
      os: 'ios',
      browser: 'safari',
      device: 'ios',
    },
    {
      name: 'Chrome on iPhone',
      ua: UA.iphoneChrome,
      os: 'ios',
      browser: 'chrome',
      device: 'ios',
    },
    {
      name: 'Safari on iPad',
      ua: UA.ipadSafari,
      os: 'ios',
      browser: 'safari',
      device: 'ios',
    },
    {
      name: 'Chrome on iPad in desktop mode',
      ua: UA.ipadChromeDesktopMode,
      os: 'ios',
      browser: 'chrome',
      device: 'ios',
    },
    {
      name: 'Edge on iPad in desktop mode',
      ua: UA.ipadEdgeDesktopMode,
      os: 'ios',
      browser: 'edge',
      device: 'ios',
    },
    {
      name: 'Firefox on iPad in desktop mode',
      ua: UA.ipadFirefoxDesktopMode,
      os: 'ios',
      browser: 'firefox',
      device: 'ios',
    },
    {
      name: 'an in-app view on iPad in desktop mode',
      ua: UA.ipadWebviewDesktopMode,
      os: 'ios',
      device: 'ios',
    },
    {
      name: 'Windows Phone',
      ua: UA.windowsPhone,
      os: 'other',
      browser: 'edge',
      device: 'other',
    },
  ])('describes $name', ({ ua, name, ...expected }) => {
    expect(describeClient(ua)).toMatchObject({ ...expected, userAgent: ua })
  })

  it('cannot tell iPad Safari in desktop mode from Safari on macOS', () => {
    expect(describeClient(UA.macSafari)).toMatchObject({
      os: 'macos',
      device: 'desktop',
    })
  })

  it('records a browser outside the known families as other', () => {
    expect(describeClient(UA.vivaldi)).toMatchObject({
      os: 'linux',
      browser: 'other',
    })
  })

  it.each([
    undefined,
    '',
    '   ',
    'axios/1.13.2',
    'curl/8.4.0',
    'textbee-android/1.4.0',
    'okhttp/4.12.0',
    'python-requests/2.32.3',
  ])('returns nothing for %p, which is not a browser', (ua) => {
    expect(describeClient(ua)).toBeUndefined()
  })

  it('stamps the time it is given', () => {
    const at = new Date('2026-09-01T00:00:00Z')
    expect(describeClient(UA.windowsChrome, at).at).toBe(at)
  })

  it('caps the stored user agent at 512 characters', () => {
    expect(
      describeClient(`Mozilla/5.0 ${'x'.repeat(5000)}`).userAgent,
    ).toHaveLength(512)
  })

  it('survives malformed input', () => {
    for (const ua of [
      `Mozilla/${'('.repeat(5000)}`,
      'Mozilla/5.0 constructor/1.0',
      'Mozilla/5.0 __proto__/1.0',
    ]) {
      expect(() => describeClient(ua)).not.toThrow()
      expect(typeof describeClient(ua).os).toBe('string')
      expect(typeof describeClient(ua).browser).toBe('string')
    }
  })
})
