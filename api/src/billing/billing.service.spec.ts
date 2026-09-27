import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import { BillingService } from './billing.service'
import { Plan } from './schemas/plan.schema'
import { Subscription } from './schemas/subscription.schema'
import { User } from '../users/schemas/user.schema'
import { SMS } from '../gateway/schemas/sms.schema'
import { PolarWebhookPayload } from './schemas/polar-webhook-payload.schema'
import { CheckoutSession } from './schemas/checkout-session.schema'
import { BillingNotificationsService } from './billing-notifications.service'
import { BillingNotificationType } from './schemas/billing-notification.schema'
import { UsersService } from '../users/users.service'
import { AnalyticsService } from '../analytics/analytics.service'

describe('BillingService - cancellation handling', () => {
  let service: BillingService

  // 24-hex string so `new Types.ObjectId(userId)` succeeds.
  const userId = '507f1f77bcf86cd799439011'
  const proPlan = { _id: 'plan_pro', name: 'pro' }
  const polarProductId = 'prod_pro_monthly'

  const mockPlanModel = {
    findOne: jest.fn(),
  }
  const mockSubscriptionModel = {
    updateOne: jest.fn(),
    updateMany: jest.fn(),
  }
  const emptyModel = {}
  const mockBillingNotifications = {}
  const mockUsersService = { markMilestone: jest.fn() }
  const mockAnalyticsService = {
    userRegistered: jest.fn(),
    checkoutStarted: jest.fn(),
    purchase: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getModelToken(Plan.name), useValue: mockPlanModel },
        {
          provide: getModelToken(Subscription.name),
          useValue: mockSubscriptionModel,
        },
        { provide: getModelToken(User.name), useValue: emptyModel },
        { provide: getModelToken(SMS.name), useValue: emptyModel },
        {
          provide: getModelToken(PolarWebhookPayload.name),
          useValue: emptyModel,
        },
        {
          provide: getModelToken(CheckoutSession.name),
          useValue: emptyModel,
        },
        {
          provide: BillingNotificationsService,
          useValue: mockBillingNotifications,
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile()

    service = module.get<BillingService>(BillingService)

    jest.clearAllMocks()
    mockUsersService.markMilestone.mockResolvedValue(false)
    mockPlanModel.findOne.mockResolvedValue(proPlan)
    mockSubscriptionModel.updateOne.mockResolvedValue({ modifiedCount: 1 })
  })

  describe('cancelSubscription', () => {
    it('records the scheduled cancellation WITHOUT downgrading (keeps the plan active)', async () => {
      const currentPeriodEnd = new Date('2026-07-17T00:00:00.000Z')

      await service.cancelSubscription({
        userId,
        polarProductId,
        cancelAtPeriodEnd: true,
        currentPeriodEnd,
        status: 'active',
      })

      expect(mockSubscriptionModel.updateOne).toHaveBeenCalledTimes(1)
      const [filter, update] = mockSubscriptionModel.updateOne.mock.calls[0]

      // Filter targets the user's active subscription for this plan.
      expect(filter).toEqual({
        user: expect.any(Types.ObjectId),
        plan: proPlan._id,
        isActive: true,
      })

      // The fix: the cancellation is recorded with the real period end, and
      // the subscription stays active. It must NOT flip isActive to false.
      expect(update).toEqual({
        cancelAtPeriodEnd: true,
        currentPeriodEnd,
        subscriptionEndDate: currentPeriodEnd,
        status: 'active',
      })
      expect(update).not.toHaveProperty('isActive')
    })

    it('defaults cancelAtPeriodEnd to true and omits period fields when not provided', async () => {
      await service.cancelSubscription({ userId, polarProductId })

      const [, update] = mockSubscriptionModel.updateOne.mock.calls[0]
      expect(update).toEqual({ cancelAtPeriodEnd: true })
      expect(update).not.toHaveProperty('currentPeriodEnd')
      expect(update).not.toHaveProperty('subscriptionEndDate')
      expect(update).not.toHaveProperty('isActive')
    })

    it('throws when no plan matches the Polar product id', async () => {
      mockPlanModel.findOne.mockResolvedValue(null)

      await expect(
        service.cancelSubscription({ userId, polarProductId: 'unknown' }),
      ).rejects.toThrow('No plan found for product ID: unknown')
      expect(mockSubscriptionModel.updateOne).not.toHaveBeenCalled()
    })

    it('writes the end cause on every row of the subscription, active or not', async () => {
      mockSubscriptionModel.updateMany.mockResolvedValue({})

      await service.cancelSubscription({
        userId,
        polarProductId,
        cancelAtPeriodEnd: false,
        status: 'canceled',
        churnCause: 'payment_failed',
        polarSubscriptionId: 'sub_1',
      })

      expect(mockSubscriptionModel.updateMany).toHaveBeenCalledWith(
        { polarSubscriptionId: 'sub_1' },
        { $set: { churnCause: 'payment_failed' } },
      )
      const [, update] = mockSubscriptionModel.updateOne.mock.calls[0]
      expect(update).not.toHaveProperty('churnCause')
    })

    it('keeps the end cause when the revoke arrives first', async () => {
      mockSubscriptionModel.updateMany.mockResolvedValue({})

      await service.revokeSubscription({ userId, polarProductId })
      // The revoke already deactivated the row, so the active-only update matches nothing.
      mockSubscriptionModel.updateOne.mockResolvedValue({ modifiedCount: 0 })
      await service.cancelSubscription({
        userId,
        polarProductId,
        churnCause: 'payment_failed',
        polarSubscriptionId: 'sub_1',
      })

      expect(mockSubscriptionModel.updateMany).toHaveBeenCalledWith(
        { polarSubscriptionId: 'sub_1' },
        { $set: { churnCause: 'payment_failed' } },
      )
    })

    it('leaves the end cause alone when the revoke arrives second', async () => {
      mockSubscriptionModel.updateMany.mockResolvedValue({})

      await service.cancelSubscription({
        userId,
        polarProductId,
        churnCause: 'payment_failed',
        polarSubscriptionId: 'sub_1',
      })
      await service.revokeSubscription({ userId, polarProductId })

      const revokeUpdate = mockSubscriptionModel.updateOne.mock.calls[1][1]
      expect(revokeUpdate).toEqual({ isActive: false, subscriptionEndDate: expect.any(Date) })
    })
  })

  describe('revokeSubscription', () => {
    it('performs the real downgrade by deactivating the subscription', async () => {
      await service.revokeSubscription({ userId, polarProductId })

      expect(mockSubscriptionModel.updateOne).toHaveBeenCalledTimes(1)
      const [filter, update] = mockSubscriptionModel.updateOne.mock.calls[0]

      expect(filter).toEqual({
        user: expect.any(Types.ObjectId),
        plan: proPlan._id,
        isActive: true,
      })
      expect(update.isActive).toBe(false)
      expect(update.subscriptionEndDate).toBeInstanceOf(Date)
    })

    it('throws when no plan matches the Polar product id', async () => {
      mockPlanModel.findOne.mockResolvedValue(null)

      await expect(
        service.revokeSubscription({ userId, polarProductId: 'unknown' }),
      ).rejects.toThrow('No plan found for product ID: unknown')
      expect(mockSubscriptionModel.updateOne).not.toHaveBeenCalled()
    })
  })
})

// Pins apart three failures that used to share one misleading message.
describe('BillingService - checkout guards', () => {
  let service: BillingService

  const user = { _id: new Types.ObjectId('507f1f77bcf86cd799439011') }
  const req = { ip: '127.0.0.1' }

  const mockPlanModel = {
    findOne: jest.fn(),
  }
  const emptyModel = {}

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getModelToken(Plan.name), useValue: mockPlanModel },
        { provide: getModelToken(Subscription.name), useValue: emptyModel },
        { provide: getModelToken(User.name), useValue: emptyModel },
        { provide: getModelToken(SMS.name), useValue: emptyModel },
        {
          provide: getModelToken(PolarWebhookPayload.name),
          useValue: emptyModel,
        },
        { provide: getModelToken(CheckoutSession.name), useValue: emptyModel },
        { provide: BillingNotificationsService, useValue: {} },
        { provide: UsersService, useValue: { markMilestone: jest.fn() } },
        { provide: AnalyticsService, useValue: { purchase: jest.fn(), checkoutStarted: jest.fn() } },
      ],
    }).compile()

    service = module.get<BillingService>(BillingService)
    jest.clearAllMocks()
  })

  it('names the real problem when the request carries no plan name', async () => {
    await expect(
      service.getCheckoutUrl({
        user,
        payload: { billingInterval: 'monthly' },
        req,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PLAN_NAME_REQUIRED' },
    })

    // the plan is never looked up, so it can never be blamed
    expect(mockPlanModel.findOne).not.toHaveBeenCalled()
  })

  it('reports an unknown plan as not found, not as unpurchasable', async () => {
    mockPlanModel.findOne.mockResolvedValue(null)

    await expect(
      service.getCheckoutUrl({
        user,
        payload: { planName: 'enterprise', billingInterval: 'monthly' },
        req,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PLAN_NOT_FOUND' },
    })
  })

  it('still rejects a real plan that has no Polar products', async () => {
    mockPlanModel.findOne.mockResolvedValue({ name: 'pro' })

    await expect(
      service.getCheckoutUrl({
        user,
        payload: { planName: 'pro', billingInterval: 'monthly' },
        req,
      }),
    ).rejects.toThrow('Plan cannot be purchased')
  })
})

describe('BillingService - syncCheckoutSessionStatus', () => {
  let service: BillingService

  const mockCheckoutSessionModel = {
    updateOne: jest.fn(),
  }
  const emptyModel = {}

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getModelToken(Plan.name), useValue: emptyModel },
        { provide: getModelToken(Subscription.name), useValue: emptyModel },
        { provide: getModelToken(User.name), useValue: emptyModel },
        { provide: getModelToken(SMS.name), useValue: emptyModel },
        {
          provide: getModelToken(PolarWebhookPayload.name),
          useValue: emptyModel,
        },
        {
          provide: getModelToken(CheckoutSession.name),
          useValue: mockCheckoutSessionModel,
        },
        { provide: BillingNotificationsService, useValue: {} },
        { provide: UsersService, useValue: { markMilestone: jest.fn() } },
        { provide: AnalyticsService, useValue: { purchase: jest.fn(), checkoutStarted: jest.fn() } },
      ],
    }).compile()

    service = module.get<BillingService>(BillingService)

    jest.clearAllMocks()
    mockCheckoutSessionModel.updateOne.mockResolvedValue({ modifiedCount: 1 })
  })

  // Nothing wrote isCompleted before this existed, so a checkout the customer
  // had already paid for stayed reusable until it expired.
  it('marks a succeeded checkout completed', async () => {
    await service.syncCheckoutSessionStatus({
      checkoutSessionId: 'checkout_abc',
      status: 'succeeded',
    })

    expect(mockCheckoutSessionModel.updateOne).toHaveBeenCalledWith(
      { checkoutSessionId: 'checkout_abc' },
      expect.objectContaining({ isCompleted: true, completedAt: expect.any(Date) }),
    )
  })

  it('marks an expired checkout abandoned', async () => {
    await service.syncCheckoutSessionStatus({
      checkoutSessionId: 'checkout_abc',
      status: 'expired',
    })

    expect(mockCheckoutSessionModel.updateOne).toHaveBeenCalledWith(
      { checkoutSessionId: 'checkout_abc' },
      { isAbandoned: true },
    )
  })

  // open and confirmed are still in flight and failed is retryable, so the
  // cached checkout URL has to stay usable.
  it.each(['open', 'confirmed', 'failed'])(
    'leaves a %s checkout untouched',
    async (status) => {
      await service.syncCheckoutSessionStatus({
        checkoutSessionId: 'checkout_abc',
        status,
      })

      expect(mockCheckoutSessionModel.updateOne).not.toHaveBeenCalled()
    },
  )

  // The cache holds one row per user, so a late webhook for a checkout that has
  // since been replaced must match nothing rather than clobber the new row.
  it('keys on the checkout id, never on the user', async () => {
    await service.syncCheckoutSessionStatus({
      checkoutSessionId: 'checkout_stale',
      status: 'succeeded',
    })

    const [filter] = mockCheckoutSessionModel.updateOne.mock.calls[0]
    expect(filter).toEqual({ checkoutSessionId: 'checkout_stale' })
    expect(filter).not.toHaveProperty('user')
  })

  it('ignores an event with no checkout id', async () => {
    await service.syncCheckoutSessionStatus({
      checkoutSessionId: undefined as any,
      status: 'succeeded',
    })

    expect(mockCheckoutSessionModel.updateOne).not.toHaveBeenCalled()
  })

  // A webhook handler that throws would make Polar retry the whole event.
  it('does not throw when the write fails', async () => {
    mockCheckoutSessionModel.updateOne.mockRejectedValue(new Error('db down'))

    await expect(
      service.syncCheckoutSessionStatus({
        checkoutSessionId: 'checkout_abc',
        status: 'succeeded',
      }),
    ).resolves.not.toThrow()
  })
})

describe('BillingService - canPerformAction account checks', () => {
  let service: BillingService

  const userId = '507f1f77bcf86cd799439011'
  const freePlan = { _id: 'plan_free', name: 'free', dailyLimit: 50, monthlyLimit: 300, bulkSendLimit: 50 }

  const select = jest.fn()
  const mockUserModel = { findById: jest.fn(() => ({ select })) }
  const mockSubscriptionModel = { findOne: jest.fn() }
  const mockPlanModel = { findOne: jest.fn(), findById: jest.fn() }
  const mockSmsModel = { countDocuments: jest.fn() }
  const mockBillingNotifications = { notifyOnce: jest.fn() }
  const emptyModel = {}

  const givenUser = (fields: Record<string, unknown> | null) =>
    select.mockResolvedValue(
      fields && { _id: userId, email: 'ada@example.com', isBanned: false, ...fields },
    )

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getModelToken(Plan.name), useValue: mockPlanModel },
        { provide: getModelToken(Subscription.name), useValue: mockSubscriptionModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(SMS.name), useValue: mockSmsModel },
        { provide: getModelToken(PolarWebhookPayload.name), useValue: emptyModel },
        { provide: getModelToken(CheckoutSession.name), useValue: emptyModel },
        { provide: BillingNotificationsService, useValue: mockBillingNotifications },
        { provide: UsersService, useValue: { markMilestone: jest.fn() } },
        { provide: AnalyticsService, useValue: { purchase: jest.fn(), checkoutStarted: jest.fn() } },
      ],
    }).compile()

    service = module.get<BillingService>(BillingService)

    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    mockSubscriptionModel.findOne.mockResolvedValue(null)
    mockPlanModel.findOne.mockResolvedValue(freePlan)
    mockSmsModel.countDocuments.mockResolvedValue(0)
    mockBillingNotifications.notifyOnce.mockResolvedValue(undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  it('loads the waiver field that is hidden by default', async () => {
    givenUser({ emailVerifiedAt: new Date() })

    await service.canPerformAction(userId, 'send_sms', 1)

    expect(select).toHaveBeenCalledWith('+emailVerificationWaivedAt')
  })

  it('blocks an account whose emailVerifiedAt was never written', async () => {
    givenUser({})

    await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
      response: { message: 'Please verify your email to continue' },
      status: 400,
    })
    expect(mockSmsModel.countDocuments).not.toHaveBeenCalled()
  })

  it('blocks an account whose emailVerifiedAt is null', async () => {
    givenUser({ emailVerifiedAt: null })

    await expect(service.canPerformAction(userId, 'receive_sms', 1)).rejects.toMatchObject({
      status: 400,
    })
  })

  it.each(['send_sms', 'bulk_send_sms', 'receive_sms'] as const)(
    'allows a verified account to %s',
    async (action) => {
      givenUser({ emailVerifiedAt: new Date() })

      await expect(service.canPerformAction(userId, action, 1)).resolves.toEqual({
        overLimit: false,
      })
    },
  )

  it('allows an unverified account with a waiver', async () => {
    givenUser({ emailVerificationWaivedAt: new Date() })

    await expect(service.canPerformAction(userId, 'send_sms', 1)).resolves.toEqual({
      overLimit: false,
    })
  })

  describe('LIMIT_EXEMPT_USER_IDS', () => {
    const originalExempt = process.env.LIMIT_EXEMPT_USER_IDS

    afterEach(() => {
      if (originalExempt === undefined) delete process.env.LIMIT_EXEMPT_USER_IDS
      else process.env.LIMIT_EXEMPT_USER_IDS = originalExempt
    })

    it.each(['send_sms', 'bulk_send_sms', 'receive_sms'] as const)(
      'skips usage limits for a listed account on %s',
      async (action) => {
        process.env.LIMIT_EXEMPT_USER_IDS = ` 64b000000000000000000001 , ${userId} `
        givenUser({ emailVerifiedAt: new Date() })
        mockSmsModel.countDocuments.mockResolvedValue(1000)

        await expect(service.canPerformAction(userId, action, 500)).resolves.toEqual({
          overLimit: false,
        })
        expect(mockSmsModel.countDocuments).not.toHaveBeenCalled()
      },
    )

    it('still enforces limits for an account that is not listed', async () => {
      process.env.LIMIT_EXEMPT_USER_IDS = '64b000000000000000000001'
      givenUser({ emailVerifiedAt: new Date() })
      mockSmsModel.countDocuments.mockResolvedValue(300)

      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 429,
      })
    })

    it('still requires a verified email for a listed account', async () => {
      process.env.LIMIT_EXEMPT_USER_IDS = userId
      givenUser({})

      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 400,
      })
    })

    it('still blocks a banned listed account', async () => {
      process.env.LIMIT_EXEMPT_USER_IDS = userId
      givenUser({ emailVerifiedAt: new Date(), isBanned: true })

      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 500,
      })
    })
  })

  it('still applies plan limits to a waived account', async () => {
    givenUser({ emailVerificationWaivedAt: new Date() })
    mockSmsModel.countDocuments.mockResolvedValue(freePlan.dailyLimit)

    await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
      status: 429,
    })
  })

  it('still blocks a banned account', async () => {
    givenUser({ emailVerifiedAt: new Date(), isBanned: true })

    await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
      status: 500,
    })
  })

  it('rejects an unknown user instead of allowing the action', async () => {
    givenUser(null)

    await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
      status: 404,
    })
  })

  describe('receives over the plan limit', () => {
    const originalSetting = process.env.RECEIVE_SMS_OVER_LIMIT

    beforeEach(() => {
      delete process.env.RECEIVE_SMS_OVER_LIMIT
      givenUser({ emailVerifiedAt: new Date() })
      mockSmsModel.countDocuments
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(freePlan.monthlyLimit)
    })

    afterEach(() => {
      if (originalSetting === undefined) delete process.env.RECEIVE_SMS_OVER_LIMIT
      else process.env.RECEIVE_SMS_OVER_LIMIT = originalSetting
    })

    it('allows the receive and marks it over the limit', async () => {
      await expect(service.canPerformAction(userId, 'receive_sms', 1)).resolves.toEqual({
        overLimit: true,
      })
      expect(mockBillingNotifications.notifyOnce).toHaveBeenCalledWith(
        expect.objectContaining({
          type: BillingNotificationType.MONTHLY_LIMIT_REACHED,
          emailKey: 'U2',
          recordHit: true,
        }),
      )
    })

    it('still allows the receive when the notification fails', async () => {
      mockBillingNotifications.notifyOnce.mockRejectedValue(new Error('queue unavailable'))

      await expect(service.canPerformAction(userId, 'receive_sms', 1)).resolves.toEqual({
        overLimit: true,
      })
    })

    it('rejects the receive when RECEIVE_SMS_OVER_LIMIT is reject', async () => {
      process.env.RECEIVE_SMS_OVER_LIMIT = 'reject'

      await expect(service.canPerformAction(userId, 'receive_sms', 1)).rejects.toMatchObject({
        status: 429,
      })
    })

    it('still notifies when receives over the limit are rejected', async () => {
      process.env.RECEIVE_SMS_OVER_LIMIT = 'reject'

      await expect(service.canPerformAction(userId, 'receive_sms', 1)).rejects.toMatchObject({
        status: 429,
      })
      expect(mockBillingNotifications.notifyOnce).toHaveBeenCalledWith(
        expect.objectContaining({ meta: expect.objectContaining({ limitTripped: 'monthly' }) }),
      )
    })

    it('still rejects a send over the limit', async () => {
      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 429,
      })
    })

    it('does not mark a paid receive inside the extended monthly allowance', async () => {
      const proPlan = { _id: 'plan_pro', name: 'pro', dailyLimit: -1, monthlyLimit: 5000, bulkSendLimit: -1 }
      mockSubscriptionModel.findOne.mockResolvedValue({ plan: proPlan._id })
      mockPlanModel.findById.mockResolvedValue(proPlan)
      mockSmsModel.countDocuments.mockReset()
      mockSmsModel.countDocuments
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(proPlan.monthlyLimit)

      await expect(service.canPerformAction(userId, 'receive_sms', 1)).resolves.toEqual({
        overLimit: false,
      })
    })
  })

  describe('paid monthly allowance', () => {
    const proPlan = { _id: 'plan_pro', name: 'pro', dailyLimit: -1, monthlyLimit: 5000, bulkSendLimit: -1 }

    const givenPaid = (fields: Record<string, unknown> = {}) => {
      mockSubscriptionModel.findOne.mockResolvedValue({ plan: proPlan._id, ...fields })
      mockPlanModel.findById.mockResolvedValue(proPlan)
    }

    const givenCounts = (today: number, last30Days: number) =>
      mockSmsModel.countDocuments.mockResolvedValueOnce(today).mockResolvedValueOnce(last30Days)

    const originalSetting = process.env.RECEIVE_SMS_OVER_LIMIT

    beforeEach(() => {
      delete process.env.RECEIVE_SMS_OVER_LIMIT
      givenUser({ emailVerifiedAt: new Date() })
    })

    afterEach(() => {
      if (originalSetting === undefined) delete process.env.RECEIVE_SMS_OVER_LIMIT
      else process.env.RECEIVE_SMS_OVER_LIMIT = originalSetting
    })

    const monthlyReached = expect.objectContaining({
      type: BillingNotificationType.MONTHLY_LIMIT_REACHED,
    })

    it('lets a paid plan send past its monthly limit within the allowance', async () => {
      givenPaid()
      givenCounts(10, 5000)

      await expect(service.canPerformAction(userId, 'send_sms', 1)).resolves.toEqual({
        overLimit: false,
      })
      expect(mockBillingNotifications.notifyOnce).not.toHaveBeenCalledWith(monthlyReached)
    })

    it('allows a paid send that lands exactly on the allowance', async () => {
      givenPaid()
      givenCounts(10, 5499)

      await expect(service.canPerformAction(userId, 'send_sms', 1)).resolves.toEqual({
        overLimit: false,
      })
    })

    it('blocks a paid send past the allowance and emails once', async () => {
      givenPaid()
      givenCounts(10, 5500)

      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 429,
      })
      expect(mockBillingNotifications.notifyOnce).toHaveBeenCalledTimes(1)
      expect(mockBillingNotifications.notifyOnce).toHaveBeenCalledWith(monthlyReached)
    })

    it('stores a paid receive past the allowance as over the limit', async () => {
      givenPaid()
      givenCounts(10, 5500)

      await expect(service.canPerformAction(userId, 'receive_sms', 1)).resolves.toEqual({
        overLimit: true,
      })
      expect(mockBillingNotifications.notifyOnce).toHaveBeenCalledWith(monthlyReached)
    })

    it('counts the whole batch against the allowance', async () => {
      givenPaid()
      givenCounts(10, 5400)

      await expect(service.canPerformAction(userId, 'bulk_send_sms', 200)).rejects.toMatchObject({
        status: 429,
      })
    })

    it('gives a free plan no allowance', async () => {
      givenCounts(10, 300)

      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 429,
      })
      expect(mockBillingNotifications.notifyOnce).toHaveBeenCalledWith(monthlyReached)
    })

    it('applies the allowance to a custom monthly limit', async () => {
      givenPaid({ customMonthlyLimit: 1000 })
      givenCounts(10, 1099)
      givenCounts(10, 1100)

      await expect(service.canPerformAction(userId, 'send_sms', 1)).resolves.toEqual({
        overLimit: false,
      })
      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 429,
      })
    })
  })

  describe('approaching limit notices', () => {
    const proPlan = { _id: 'plan_pro', name: 'pro', dailyLimit: -1, monthlyLimit: 5000, bulkSendLimit: -1 }

    const givenPaid = () => {
      mockSubscriptionModel.findOne.mockResolvedValue({ plan: proPlan._id })
      mockPlanModel.findById.mockResolvedValue(proPlan)
    }

    const givenCounts = (today: number, last30Days: number) =>
      mockSmsModel.countDocuments.mockResolvedValueOnce(today).mockResolvedValueOnce(last30Days)

    const noticeOf = (type: BillingNotificationType) =>
      mockBillingNotifications.notifyOnce.mock.calls
        .map(([input]) => input)
        .find((input) => input.type === type)

    beforeEach(() => givenUser({ emailVerifiedAt: new Date() }))

    it('warns when a send brings the account to 80% of its monthly limit', async () => {
      givenPaid()
      givenCounts(10, 3999)

      await expect(service.canPerformAction(userId, 'send_sms', 1)).resolves.toEqual({
        overLimit: false,
      })
      expect(noticeOf(BillingNotificationType.MONTHLY_LIMIT_APPROACHING)).toMatchObject({
        meta: { processedSmsLastMonth: 4000, monthlyLimit: 5000, planName: 'pro' },
        emailKey: 'U1_paid',
      })
    })

    it('warns when a receive brings the account to 80% of its monthly limit', async () => {
      givenPaid()
      givenCounts(10, 3999)

      await service.canPerformAction(userId, 'receive_sms', 1)

      expect(noticeOf(BillingNotificationType.MONTHLY_LIMIT_APPROACHING)).toBeDefined()
    })

    it('does not warn below 80%', async () => {
      givenPaid()
      givenCounts(10, 3998)

      await service.canPerformAction(userId, 'send_sms', 1)

      expect(mockBillingNotifications.notifyOnce).not.toHaveBeenCalled()
    })

    it('does not send the 80% warning inside the paid allowance', async () => {
      givenPaid()
      givenCounts(10, 5000)

      await service.canPerformAction(userId, 'send_sms', 1)

      expect(mockBillingNotifications.notifyOnce).not.toHaveBeenCalled()
    })

    it('warns a free account nearing its daily limit', async () => {
      givenCounts(39, 39)

      await service.canPerformAction(userId, 'send_sms', 1)

      expect(noticeOf(BillingNotificationType.DAILY_LIMIT_APPROACHING)).toMatchObject({
        meta: { processedSmsToday: 40, dailyLimit: 50, planName: 'free' },
        emailKey: 'U3',
      })
      expect(noticeOf(BillingNotificationType.MONTHLY_LIMIT_APPROACHING)).toBeUndefined()
    })

    it('still allows the send when the notice fails', async () => {
      givenPaid()
      givenCounts(10, 3999)
      mockBillingNotifications.notifyOnce.mockRejectedValue(new Error('queue unavailable'))

      await expect(service.canPerformAction(userId, 'send_sms', 1)).resolves.toEqual({
        overLimit: false,
      })
    })
  })

  describe('limit check order and usage email variants', () => {
    const plans = {
      pro: { _id: 'plan_pro', name: 'pro', dailyLimit: -1, monthlyLimit: 5000, bulkSendLimit: -1 },
      scale: { _id: 'plan_scale', name: 'scale', dailyLimit: -1, monthlyLimit: 25000, bulkSendLimit: -1 },
      custom: { _id: 'plan_c', name: 'custom-acme', dailyLimit: 1000, monthlyLimit: 10000, bulkSendLimit: 500 },
    }
    const onPlan = (plan: any) => {
      mockSubscriptionModel.findOne.mockResolvedValue({ plan: plan._id })
      mockPlanModel.findById.mockResolvedValue(plan)
    }
    const givenCounts = (today: number, last30Days: number) =>
      mockSmsModel.countDocuments.mockResolvedValueOnce(today).mockResolvedValueOnce(last30Days)
    const notices = () => mockBillingNotifications.notifyOnce.mock.calls.map(([n]) => n)

    beforeEach(() => {
      delete process.env.RECEIVE_SMS_OVER_LIMIT
      givenUser({ emailVerifiedAt: new Date() })
    })

    it('reports a batch over the batch limit as U5 and nothing else', async () => {
      givenCounts(0, 0)

      await expect(service.canPerformAction(userId, 'bulk_send_sms', 60)).rejects.toMatchObject({
        status: 429,
      })

      expect(notices()).toHaveLength(1)
      expect(notices()[0]).toMatchObject({
        type: BillingNotificationType.BULK_SMS_LIMIT_REACHED,
        emailKey: 'U5',
        recordHit: false,
        meta: { limitTripped: 'bulk', attempted: 60 },
      })
    })

    it('checks the 30-day limit before the daily one', async () => {
      givenCounts(50, 300)

      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 429,
      })

      expect(notices()).toHaveLength(1)
      expect(notices()[0]).toMatchObject({
        type: BillingNotificationType.MONTHLY_LIMIT_REACHED,
        emailKey: 'U2',
      })
    })

    it('reports the daily limit as U4 on the free plan', async () => {
      givenCounts(50, 120)

      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 429,
      })

      expect(notices()[0]).toMatchObject({
        type: BillingNotificationType.DAILY_LIMIT_REACHED,
        emailKey: 'U4',
        recordHit: true,
        meta: { limitTripped: 'daily', processedSmsToday: 50 },
      })
    })

    it('refuses a batch that does not fit the room left without a notice', async () => {
      givenCounts(10, 100)

      await expect(service.canPerformAction(userId, 'bulk_send_sms', 45)).rejects.toMatchObject({
        status: 429,
      })

      expect(mockBillingNotifications.notifyOnce).not.toHaveBeenCalled()
    })

    it('refuses a 30-day overflow on a paid plan without a notice until the count is at the allowance', async () => {
      onPlan(plans.pro)
      givenCounts(10, 5450)

      await expect(service.canPerformAction(userId, 'bulk_send_sms', 100)).rejects.toMatchObject({
        status: 429,
      })

      expect(mockBillingNotifications.notifyOnce).not.toHaveBeenCalled()
    })

    it.each([
      ['pro', 'U2_paid'],
      ['scale', 'U2_top'],
    ])('picks the 30-day email for %s', async (name, key) => {
      const plan = plans[name]
      onPlan(plan)
      givenCounts(10, Math.floor(plan.monthlyLimit * 1.1))

      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 429,
      })

      expect(notices()[0]).toMatchObject({ emailKey: key, meta: { planName: name } })
    })

    it('sends no daily or batch email to a custom plan', async () => {
      onPlan(plans.custom)
      givenCounts(1000, 2000)

      await expect(service.canPerformAction(userId, 'send_sms', 1)).rejects.toMatchObject({
        status: 429,
      })
      expect(notices()[0]).toMatchObject({
        type: BillingNotificationType.DAILY_LIMIT_REACHED,
        emailKey: null,
      })

      jest.clearAllMocks()
      givenCounts(0, 0)
      await expect(service.canPerformAction(userId, 'bulk_send_sms', 600)).rejects.toMatchObject({
        status: 429,
      })
      expect(notices()[0]).toMatchObject({
        type: BillingNotificationType.BULK_SMS_LIMIT_REACHED,
        emailKey: null,
      })
    })

    it('counts today from midnight UTC', async () => {
      givenCounts(0, 0)

      await service.canPerformAction(userId, 'send_sms', 1)

      const since = mockSmsModel.countDocuments.mock.calls[0][0].createdAt.$gte as Date
      expect(since.getUTCHours()).toBe(0)
      expect(since.getUTCMinutes()).toBe(0)
      expect(Date.now() - since.getTime()).toBeLessThan(24 * 3600 * 1000)
    })
  })
})

/*
 * Reporting a sale to an ad platform more than once teaches it to bid on the
 * wrong thing, so the first-payment event has to survive the shapes Polar
 * actually sends: created then active for one signup, an upgrade that creates a
 * second subscription row, a renewal, and a re-subscribe after a revoke.
 */
describe('BillingService - first payment reporting', () => {
  let service: BillingService

  const userId = '507f1f77bcf86cd799439011'
  const proPlan = { _id: 'plan_pro', name: 'pro' }

  const mockPlanModel = { findOne: jest.fn() }
  const mockSubscriptionModel = { updateMany: jest.fn(), updateOne: jest.fn() }
  const mockUserModel = { findById: jest.fn() }
  const mockUsersService = { markMilestone: jest.fn() }
  const mockAnalyticsService = { purchase: jest.fn(), checkoutStarted: jest.fn() }
  const emptyModel = {}

  const activePayment = {
    userId,
    newPlanName: 'pro',
    status: 'active',
    amount: 1200,
    currency: 'usd',
    polarSubscriptionId: 'sub_1',
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: getModelToken(Plan.name), useValue: mockPlanModel },
        {
          provide: getModelToken(Subscription.name),
          useValue: mockSubscriptionModel,
        },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(SMS.name), useValue: emptyModel },
        {
          provide: getModelToken(PolarWebhookPayload.name),
          useValue: emptyModel,
        },
        { provide: getModelToken(CheckoutSession.name), useValue: emptyModel },
        { provide: BillingNotificationsService, useValue: {} },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile()

    service = module.get<BillingService>(BillingService)

    jest.clearAllMocks()
    mockPlanModel.findOne.mockResolvedValue(proPlan)
    mockSubscriptionModel.updateMany.mockResolvedValue({ modifiedCount: 0 })
    mockSubscriptionModel.updateOne.mockResolvedValue({ upsertedCount: 1 })
    mockUserModel.findById.mockResolvedValue({
      _id: userId,
      email: 'ada@example.com',
    })
    mockUsersService.markMilestone.mockResolvedValue(true)
  })

  it('reports the sale the first time an account pays', async () => {
    await service.switchPlan(activePayment)

    expect(mockUsersService.markMilestone).toHaveBeenCalledWith(
      userId,
      'firstPaidAt',
    )
    expect(mockAnalyticsService.purchase).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com' }),
      expect.objectContaining({
        amount: 1200,
        currency: 'usd',
        plan: 'pro',
        subscriptionId: 'sub_1',
      }),
    )
  })

  it('reports nothing on a renewal, an upgrade, or a re-subscribe', async () => {
    // The milestone is already stamped, so every later payment is a no-op
    // regardless of whether the subscription row was created or updated.
    mockUsersService.markMilestone.mockResolvedValue(false)

    mockSubscriptionModel.updateOne.mockResolvedValue({ upsertedCount: 0 })
    await service.switchPlan(activePayment)

    // An upgrade creates a second {user, plan} row, which upsertedCount would
    // have treated as a brand new sale.
    mockSubscriptionModel.updateOne.mockResolvedValue({ upsertedCount: 1 })
    await service.switchPlan({ ...activePayment, newPlanName: 'scale' })

    expect(mockAnalyticsService.purchase).not.toHaveBeenCalled()
  })

  it('ignores a subscription that is not active yet', async () => {
    // subscription.created can arrive before the card is charged.
    await service.switchPlan({ ...activePayment, status: 'incomplete' })
    await service.switchPlan({ ...activePayment, status: 'trialing' })

    expect(mockUsersService.markMilestone).not.toHaveBeenCalled()
    expect(mockAnalyticsService.purchase).not.toHaveBeenCalled()
  })

  it('ignores an event that carries no money', async () => {
    await service.switchPlan({ ...activePayment, amount: undefined })
    await service.switchPlan({ ...activePayment, amount: 0 })

    expect(mockUsersService.markMilestone).not.toHaveBeenCalled()
    expect(mockAnalyticsService.purchase).not.toHaveBeenCalled()
  })

  it('still switches the plan when reporting fails', async () => {
    mockUsersService.markMilestone.mockRejectedValue(new Error('mongo down'))

    await expect(service.switchPlan(activePayment)).resolves.toEqual({
      success: true,
      plan: 'pro',
    })
  })
})

describe('BillingService - reads raise no usage notices', () => {
  it('getCurrentSubscription does not notify at 100% usage', async () => {
    const notifyOnce = jest.fn()
    const freePlan = { name: 'free', dailyLimit: 50, monthlyLimit: 300, bulkSendLimit: 50 }
    const service = new BillingService(
      { findOne: jest.fn().mockResolvedValue(freePlan) } as any,
      { findOne: jest.fn(() => ({ populate: jest.fn().mockResolvedValue(null) })) } as any,
      {} as any,
      { countDocuments: jest.fn().mockResolvedValue(300) } as any,
      {} as any,
      {} as any,
      { notifyOnce } as any,
      {} as any,
      {} as any,
    )

    const result = await service.getCurrentSubscription({ _id: '507f1f77bcf86cd799439011' })

    expect(result.usage.monthlyRemaining).toBe(0)
    expect(notifyOnce).not.toHaveBeenCalled()
  })
})

describe('BillingService - payment retry state and churn cause', () => {
  const eventAt = new Date('2026-09-20T12:00:00Z')
  const build = ({ pastDue = null as any, storedPastDue = null as any } = {}) => {
    const subscriptionModel = {
      updateMany: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue(pastDue),
    }
    const payloadModel = { exists: jest.fn().mockResolvedValue(storedPastDue) }
    const service = new BillingService(
      {} as any,
      subscriptionModel as any,
      {} as any,
      {} as any,
      payloadModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    )
    return { service, subscriptionModel, payloadModel }
  }
  const failedCancel = {
    polarSubscriptionId: 'sub_1',
    status: 'canceled',
    cancelAtPeriodEnd: false,
    endsAt: new Date('2026-09-20T13:00:00Z'),
    eventAt,
  }

  it('keeps the first retry period start when the provider gives none', async () => {
    const { service, subscriptionModel } = build()

    await service.syncPastDue({ polarSubscriptionId: 'sub_1', status: 'past_due', eventAt })

    expect(subscriptionModel.updateMany).toHaveBeenCalledWith(
      { polarSubscriptionId: 'sub_1', isActive: true, pastDueAt: null },
      { $set: { pastDueAt: eventAt } },
    )
  })

  it('uses the provider time when present', async () => {
    const { service, subscriptionModel } = build()

    await service.syncPastDue({
      polarSubscriptionId: 'sub_1',
      status: 'past_due',
      pastDueAt: '2026-09-18T00:00:00Z',
      eventAt,
    })

    expect(subscriptionModel.updateMany).toHaveBeenCalledWith(
      { polarSubscriptionId: 'sub_1', isActive: true },
      { $set: { pastDueAt: new Date('2026-09-18T00:00:00Z') } },
    )
  })

  it('clears the retry period once the subscription is active again', async () => {
    const { service, subscriptionModel } = build()

    await service.syncPastDue({ polarSubscriptionId: 'sub_1', status: 'active', eventAt })

    expect(subscriptionModel.updateMany).toHaveBeenCalledWith(
      { polarSubscriptionId: 'sub_1', pastDueAt: { $ne: null } },
      { $unset: { pastDueAt: 1 } },
    )
  })

  it('reads an immediate end after a retry period as payment_failed', async () => {
    const { service } = build({ pastDue: { _id: 's' } })

    await expect(service.churnCause(failedCancel)).resolves.toBe('payment_failed')
  })

  it('falls back to a stored past_due payload from the last 35 days', async () => {
    const { service, payloadModel } = build({ storedPastDue: { _id: 'p' } })

    await expect(service.churnCause(failedCancel)).resolves.toBe('payment_failed')
    const filter = payloadModel.exists.mock.calls[0][0]
    expect(filter).toMatchObject({
      'payload.data.id': 'sub_1',
      'payload.data.status': 'past_due',
    })
    expect(eventAt.getTime() - filter.createdAt.$gte.getTime()).toBe(35 * 86400000)
  })

  it.each([
    ['a scheduled cancellation', { cancelAtPeriodEnd: true }],
    ['a status that is still active', { status: 'active' }],
    ['an end more than 3 hours away', { endsAt: new Date('2026-09-20T15:30:00Z') }],
    ['no end date', { endsAt: null }],
  ])('reads %s as customer', async (_label, change) => {
    const { service } = build({ pastDue: { _id: 's' } })

    await expect(service.churnCause({ ...failedCancel, ...change })).resolves.toBe('customer')
  })

  it('reads an immediate end without a retry period as customer', async () => {
    const { service } = build()

    await expect(service.churnCause(failedCancel)).resolves.toBe('customer')
  })

  it('clears the cancellation and cause on uncancel', async () => {
    const { service, subscriptionModel } = build()

    await service.uncancelSubscription({ polarSubscriptionId: 'sub_1' })

    expect(subscriptionModel.updateMany).toHaveBeenCalledWith(
      { polarSubscriptionId: 'sub_1', isActive: true },
      { $set: { cancelAtPeriodEnd: false }, $unset: { churnCause: 1 } },
    )
  })
})

describe('BillingService - new checkout session', () => {
  it('restarts the stored session on every new checkout', async () => {
    const plan = { name: 'pro', polarMonthlyProductId: 'prod_m', polarYearlyProductId: 'prod_y' }
    const checkoutSessionModel = {
      findOne: jest.fn().mockResolvedValue(null),
      updateOne: jest.fn().mockReturnValue({ catch: jest.fn() }),
    }
    const service = new BillingService(
      { findOne: jest.fn().mockResolvedValue(plan) } as any,
      { findOne: jest.fn(() => ({ populate: jest.fn().mockResolvedValue(null) })) } as any,
      {} as any,
      {} as any,
      {} as any,
      checkoutSessionModel as any,
      {} as any,
      {} as any,
      { checkoutStarted: jest.fn() } as any,
    )
    ;(service as any).polarApi = {
      checkouts: {
        create: jest.fn().mockResolvedValue({
          id: 'co_2',
          url: 'https://pay.test/co_2',
          expiresAt: '2026-09-28T00:00:00Z',
        }),
      },
      discounts: { get: jest.fn() },
    }
    delete process.env.POLAR_DEFAULT_DISCOUNT_ID

    await service.getCheckoutUrl({
      user: { _id: new Types.ObjectId('507f1f77bcf86cd799439011'), email: 'a@example.com' },
      payload: { planName: 'pro', billingInterval: 'monthly' },
      req: { ip: '127.0.0.1', headers: {} },
    })

    const [filter, update, options] = checkoutSessionModel.updateOne.mock.calls[0]
    expect(filter).toEqual({ user: expect.any(Types.ObjectId) })
    expect(update.$set).toMatchObject({
      checkoutSessionId: 'co_2',
      isCompleted: false,
      isAbandoned: false,
    })
    expect(update.$set.sessionStartedAt).toBeInstanceOf(Date)
    expect(update.$unset).toEqual({ completedAt: 1 })
    expect(options).toEqual({ upsert: true })
  })
})
