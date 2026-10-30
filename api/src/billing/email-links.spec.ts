import { BillingService } from './billing.service'
import { signLink } from '../mail/email-render'

describe('BillingService - signed email links', () => {
  const secret = 'link-secret'
  const env = { ...process.env }
  const nowS = () => Math.floor(Date.now() / 1000)
  const BILLING = 'https://app.textbee.dev/dashboard/account/billing'

  const build = ({ subscription = null as any, session = null as any } = {}) => {
    const subscriptionModel = { findOne: jest.fn().mockResolvedValue(subscription) }
    const checkoutSessionModel = { findOne: jest.fn().mockResolvedValue(session) }
    const service = new BillingService(
      {} as any,
      subscriptionModel as any,
      {} as any,
      {} as any,
      {} as any,
      checkoutSessionModel as any,
      {} as any,
      {} as any,
      {} as any,
    )
    const create = jest.fn().mockResolvedValue({
      customer_portal_url: 'https://polar.test/portal/abc',
    })
    ;(service as any).polarApi = { customerSessions: { create } }
    return { service, subscriptionModel, checkoutSessionModel, create }
  }

  beforeEach(() => {
    process.env = { ...env, EMAIL_LINK_SECRET: secret }
    delete process.env.APP_PUBLIC_URL
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    process.env = env
    jest.restoreAllMocks()
  })

  describe('card update', () => {
    const token = (exp = nowS() + 3600) => signLink(secret, 'card', 'sub_1', exp)

    it('opens the customer portal for a valid link', async () => {
      const { service, subscriptionModel, create } = build({
        subscription: { polarCustomerId: 'cus_1' },
      })

      await expect(service.cardUpdateRedirect(token())).resolves.toBe(
        'https://polar.test/portal/abc',
      )
      expect(subscriptionModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ polarSubscriptionId: 'sub_1' }),
      )
      expect(create).toHaveBeenCalledWith({ customer_id: 'cus_1', return_url: BILLING })
    })

    it.each([
      ['expired', () => token(nowS() - 1)],
      ['tampered', () => token().slice(0, -2) + 'xx'],
      ['for another purpose', () => signLink(secret, 'unsubscribe', 'sub_1', 0)],
      ['missing', () => undefined],
    ])('sends an %s link to the billing page', async (_label, make) => {
      const { service, create } = build({ subscription: { polarCustomerId: 'cus_1' } })

      await expect(service.cardUpdateRedirect(make())).resolves.toBe(BILLING)
      expect(create).not.toHaveBeenCalled()
    })

    it('sends the reader to the billing page when the provider call fails', async () => {
      const { service, create } = build({ subscription: { polarCustomerId: 'cus_1' } })
      create.mockRejectedValue(new Error('down'))

      await expect(service.cardUpdateRedirect(token())).resolves.toBe(BILLING)
    })

    it('does nothing without a secret', async () => {
      delete process.env.EMAIL_LINK_SECRET
      const { service, subscriptionModel } = build()

      await expect(service.cardUpdateRedirect(token())).resolves.toBe(BILLING)
      expect(subscriptionModel.findOne).not.toHaveBeenCalled()
    })
  })

  describe('checkout resume', () => {
    const token = (exp = nowS() + 3600) => signLink(secret, 'checkout-resume', 'co_1', exp)
    const open = {
      checkoutUrl: 'https://polar.test/checkout/co_1',
      planName: 'scale',
      billingInterval: 'yearly',
      expiresAt: new Date(Date.now() + 3600_000),
      isCompleted: false,
      isAbandoned: false,
    }

    it('returns to the open checkout', async () => {
      const { service, checkoutSessionModel } = build({ session: open })

      await expect(service.checkoutResumeRedirect(token())).resolves.toBe(open.checkoutUrl)
      expect(checkoutSessionModel.findOne).toHaveBeenCalledWith({ checkoutSessionId: 'co_1' })
    })

    it.each([
      ['expired', { expiresAt: new Date(Date.now() - 1000) }],
      ['completed', { isCompleted: true }],
    ])('starts a new checkout for the same plan when the session is %s', async (_l, change) => {
      const { service } = build({ session: { ...open, ...change } })

      await expect(service.checkoutResumeRedirect(token())).resolves.toBe(
        'https://app.textbee.dev/checkout/scale?billingInterval=yearly',
      )
    })

    it('defaults to Pro monthly when the session is gone', async () => {
      const { service } = build()

      await expect(service.checkoutResumeRedirect(token())).resolves.toBe(
        'https://app.textbee.dev/checkout/pro?billingInterval=monthly',
      )
    })

    it.each([
      ['expired', () => token(nowS() - 1)],
      ['tampered', () => token().replace(/^./, 'x')],
    ])('sends an %s link to the billing page', async (_l, make) => {
      const { service, checkoutSessionModel } = build({ session: open })

      await expect(service.checkoutResumeRedirect(make())).resolves.toBe(BILLING)
      expect(checkoutSessionModel.findOne).not.toHaveBeenCalled()
    })
  })

  describe('switch to yearly', () => {
    const token = (exp = nowS() + 3600) => signLink(secret, 'yearly', 'sub_1', exp)
    const plan = { name: 'pro', polarYearlyProductId: 'prod_pro_y' }
    const active = { status: 'active', polarCustomerId: 'cus_1', plan }
    const YEARLY = 'https://app.textbee.dev/checkout/pro?billingInterval=yearly'

    const buildYearly = (subscription: any) => {
      const built = build()
      const populate = jest.fn().mockResolvedValue(subscription)
      built.subscriptionModel.findOne = jest.fn(() => ({ populate })) as any
      return { ...built, populate }
    }

    it.each([
      ['expired', () => token(nowS() - 1)],
      ['tampered', () => token().slice(0, -2) + 'xx'],
      ['for another purpose', () => signLink(secret, 'card', 'sub_1', nowS() + 3600)],
      ['missing', () => undefined],
    ])('sends an %s link to the billing page', async (_label, make) => {
      const { service, subscriptionModel } = buildYearly(active)

      await expect(service.yearlySwitchRedirect(make())).resolves.toBe(BILLING)
      expect(subscriptionModel.findOne).not.toHaveBeenCalled()
    })

    it('loads the active subscription by its provider id, with its plan', async () => {
      const { service, subscriptionModel, populate } = buildYearly(active)

      await service.yearlySwitchRedirect(token())

      expect(subscriptionModel.findOne).toHaveBeenCalledWith({
        polarSubscriptionId: 'sub_1',
        isActive: true,
      })
      expect(populate).toHaveBeenCalledWith('plan')
    })

    it.each([
      ['there is no subscription', null],
      ['the plan is custom', { ...active, plan: { ...plan, name: 'custom-acme' } }],
      ['the plan has no yearly product', { ...active, plan: { name: 'pro' } }],
    ])('sends the reader to the billing page when %s', async (_label, subscription) => {
      const { service, create } = buildYearly(subscription)

      await expect(service.yearlySwitchRedirect(token())).resolves.toBe(BILLING)
      expect(create).not.toHaveBeenCalled()
    })

    it('opens the yearly confirm screen for the current plan', async () => {
      const { service, create } = buildYearly(active)

      await expect(service.yearlySwitchRedirect(token())).resolves.toBe(YEARLY)
      expect(create).not.toHaveBeenCalled()
    })

    it('encodes the plan name in the checkout path', async () => {
      const { service } = buildYearly({ ...active, plan: { ...plan, name: 'pro plus' } })

      await expect(service.yearlySwitchRedirect(token())).resolves.toBe(
        'https://app.textbee.dev/checkout/pro%20plus?billingInterval=yearly',
      )
    })

    it('sends a past due customer to fix the card first, then back', async () => {
      const { service, create } = buildYearly({ ...active, status: 'past_due' })

      await expect(service.yearlySwitchRedirect(token())).resolves.toBe(
        'https://polar.test/portal/abc',
      )
      expect(create).toHaveBeenCalledWith({ customer_id: 'cus_1', return_url: YEARLY })
    })

    it('skips the portal for a past due subscription with no customer id', async () => {
      const { service, create } = buildYearly({
        ...active,
        status: 'past_due',
        polarCustomerId: undefined,
      })

      await expect(service.yearlySwitchRedirect(token())).resolves.toBe(YEARLY)
      expect(create).not.toHaveBeenCalled()
    })

    it.each([
      ['the provider call fails', (create: jest.Mock) => create.mockRejectedValue(new Error('down'))],
      [
        'the portal url is not https',
        (create: jest.Mock) =>
          create.mockResolvedValue({ customer_portal_url: 'http://polar.test/portal/abc' }),
      ],
    ])('goes straight to the yearly confirm screen when %s', async (_label, arrange) => {
      const { service, create } = buildYearly({ ...active, status: 'past_due' })
      arrange(create)

      await expect(service.yearlySwitchRedirect(token())).resolves.toBe(YEARLY)
    })

    it('sends the reader to the billing page when the lookup fails', async () => {
      const { service, populate } = buildYearly(active)
      populate.mockRejectedValue(new Error('db down'))

      await expect(service.yearlySwitchRedirect(token())).resolves.toBe(BILLING)
    })
  })
})
