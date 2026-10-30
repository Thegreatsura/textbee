import { billingEmailUrl, billingUrl, scaleUpgradeUrl, upgradeUrl } from './email-links'

describe('upgrade links', () => {
  const env = { ...process.env }

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.APP_PUBLIC_URL
    delete process.env.DEFAULT_BILLING_INTERVAL
  })
  afterAll(() => {
    process.env = env
  })

  it.each([
    ['unset', undefined],
    ['yearly', 'yearly'],
    ['unrecognised', 'weekly'],
    ['differently cased', 'Monthly'],
  ])('use yearly when the setting is %s', (_label, value) => {
    if (value !== undefined) process.env.DEFAULT_BILLING_INTERVAL = value

    expect(upgradeUrl()).toBe('https://app.textbee.dev/checkout/pro?billingInterval=yearly&from=email')
    expect(scaleUpgradeUrl()).toBe(
      'https://app.textbee.dev/checkout/scale?billingInterval=yearly&from=email',
    )
  })

  it('use monthly when the setting is exactly monthly', () => {
    process.env.DEFAULT_BILLING_INTERVAL = 'monthly'

    expect(upgradeUrl()).toBe('https://app.textbee.dev/checkout/pro?billingInterval=monthly&from=email')
    expect(scaleUpgradeUrl()).toBe(
      'https://app.textbee.dev/checkout/scale?billingInterval=monthly&from=email',
    )
  })

  // Read per call, so a restart with a new value is enough.
  it('follow a change to the setting without a reload', () => {
    expect(upgradeUrl()).toContain('billingInterval=yearly')
    process.env.DEFAULT_BILLING_INTERVAL = 'monthly'
    expect(upgradeUrl()).toContain('billingInterval=monthly')
  })
})

describe('email source on app links', () => {
  const env = { ...process.env }

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.APP_PUBLIC_URL
    delete process.env.DEFAULT_BILLING_INTERVAL
  })
  afterAll(() => {
    process.env = env
  })

  it('tags upgrade links with the template key after the interval', () => {
    expect(upgradeUrl('U2')).toBe(
      'https://app.textbee.dev/checkout/pro?billingInterval=yearly&from=email&ref=U2',
    )
    expect(scaleUpgradeUrl('U2_paid')).toBe(
      'https://app.textbee.dev/checkout/scale?billingInterval=yearly&from=email&ref=U2_paid',
    )
  })

  it('tags the billing page link for emails only', () => {
    expect(billingEmailUrl('U1_paid')).toBe(
      'https://app.textbee.dev/dashboard/account/billing?from=email&ref=U1_paid',
    )
    expect(billingUrl()).toBe('https://app.textbee.dev/dashboard/account/billing')
  })
})
