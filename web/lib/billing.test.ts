import { describe, expect, it } from 'vitest'
import { mockBillingPlans } from '@/test/fixtures'
import {
  billingPriceLabel,
  deriveBillingState,
  yearlySwitchTier,
} from './billing'

// The exact shape billing.service.ts synthesises when findOne turns up no
// subscription: a plan and usage, no status, no amount, no dates.
const freePayload = {
  plan: { name: 'free', dailyLimit: 50, monthlyLimit: 300 },
  isActive: true,
  usage: { processedSmsToday: 3 },
}

const proPayload = {
  plan: { name: 'Pro' },
  status: 'active',
  amount: 999,
  currency: 'usd',
  recurringInterval: 'month',
  subscriptionStartDate: '2026-06-01T00:00:00.000Z',
  currentPeriodEnd: '2026-08-01T00:00:00.000Z',
}

describe('deriveBillingState', () => {
  // The defect this helper exists for: a free user was shown "Unknown".
  it('reads the no-subscription payload as Free, not as unknown', () => {
    const state = deriveBillingState(freePayload)

    expect(state.isFree).toBe(true)
    expect(state.status).toBeUndefined()
    expect(state.planName).toBe('Free')
  })

  it('treats a missing subscription entirely as Free', () => {
    expect(deriveBillingState(undefined).isFree).toBe(true)
    expect(deriveBillingState({}).isFree).toBe(true)
  })

  // Absence of a status means "no subscription". A status that is absent from
  // a payload that clearly IS a paid plan is a different thing, and must not
  // be quietly downgraded to Free.
  it('does not flatten a paid plan with a missing status into Free', () => {
    const state = deriveBillingState({ plan: { name: 'Pro' } })

    expect(state.isFree).toBe(false)
    expect(state.planName).toBe('Pro')
  })

  it('reads a real subscription without changing its status', () => {
    const state = deriveBillingState(proPayload)

    expect(state.isFree).toBe(false)
    expect(state.status).toBe('active')
    expect(state.planName).toBe('Pro')
  })

  it('uses the marketing casing rather than whatever the DB stored', () => {
    expect(deriveBillingState(freePayload).planName).toBe('Free')
    expect(deriveBillingState({ plan: { name: '  SCALE ' } }).planName).toBe(
      'Scale'
    )
  })

  describe('upgradeTier', () => {
    it('sells Pro to a free user', () => {
      expect(deriveBillingState(freePayload).upgradeTier?.id).toBe('pro')
    })

    it('sells Scale to a Pro user', () => {
      expect(deriveBillingState(proPayload).upgradeTier?.id).toBe('scale')
    })

    it('sells nothing at the top of the ladder', () => {
      const state = deriveBillingState({
        plan: { name: 'Scale' },
        status: 'active',
      })
      expect(state.upgradeTier).toBeUndefined()
    })

    // A bespoke arrangement is not on the self-serve ladder, so pushing it up
    // one rung would be wrong in both directions.
    it('sells nothing for an unrecognised plan', () => {
      const state = deriveBillingState({
        plan: { name: 'Enterprise' },
        status: 'active',
      })
      expect(state.upgradeTier).toBeUndefined()
      expect(state.planName).toBe('Enterprise')
    })
  })

  describe('hasBillingDates', () => {
    it('is false for a free account, which has no dates to show', () => {
      expect(deriveBillingState(freePayload).hasBillingDates).toBe(false)
    })

    it('is true once a subscription carries a date', () => {
      expect(deriveBillingState(proPayload).hasBillingDates).toBe(true)
    })
  })

  describe('isCanceling', () => {
    it('is true for a paid subscription set to cancel at period end', () => {
      expect(
        deriveBillingState({ ...proPayload, cancelAtPeriodEnd: true })
          .isCanceling
      ).toBe(true)
    })

    it('is false when the subscription renews', () => {
      expect(deriveBillingState(proPayload).isCanceling).toBe(false)
      expect(
        deriveBillingState({ ...proPayload, cancelAtPeriodEnd: false })
          .isCanceling
      ).toBe(false)
    })

    it('is false for a free account', () => {
      expect(
        deriveBillingState({ ...freePayload, cancelAtPeriodEnd: true })
          .isCanceling
      ).toBe(false)
    })
  })

  describe('canManageBilling', () => {
    it('is false for a free account with nothing to manage', () => {
      expect(deriveBillingState(freePayload).canManageBilling).toBe(false)
    })

    it('is true for a subscriber', () => {
      expect(deriveBillingState(proPayload).canManageBilling).toBe(true)
    })
  })
})

describe('billingPriceLabel', () => {
  it('returns the amount for a paying customer', () => {
    expect(billingPriceLabel(proPayload)).toBe(999)
  })

  it('returns nothing when there is no charge', () => {
    expect(billingPriceLabel(freePayload)).toBeNull()
    expect(billingPriceLabel({ amount: 0 })).toBeNull()
    expect(billingPriceLabel(undefined)).toBeNull()
  })
})

describe('yearlySwitchTier', () => {
  const monthly = {
    plan: { name: 'Pro' },
    status: 'active',
    recurringInterval: 'month',
    cancelAtPeriodEnd: false,
  }

  it('offers the current tier, priced, to an active monthly subscriber', () => {
    const tier = yearlySwitchTier(monthly, mockBillingPlans)
    expect(tier?.id).toBe('pro')
    expect(tier?.yearlyPrice).toBe(120)
    expect(
      yearlySwitchTier({ ...monthly, recurringInterval: 'monthly' }, mockBillingPlans)?.id
    ).toBe('pro')
  })

  it.each([
    ['no subscription', undefined],
    ['a yearly subscription', { ...monthly, recurringInterval: 'year' }],
    ['a past due subscription', { ...monthly, status: 'past_due' }],
    ['a canceling subscription', { ...monthly, cancelAtPeriodEnd: true }],
    ['a custom plan', { ...monthly, plan: { name: 'custom-acme' } }],
    ['a free account', { plan: { name: 'free' } }],
  ])('offers nothing for %s', (_label, subscription) => {
    expect(yearlySwitchTier(subscription, mockBillingPlans)).toBeUndefined()
  })

  it('offers nothing while either price is unknown', () => {
    expect(yearlySwitchTier(monthly, undefined)).toBeUndefined()
    expect(
      yearlySwitchTier(monthly, [{ name: 'pro', monthlyPrice: 1900 }])
    ).toBeUndefined()
    expect(
      yearlySwitchTier(monthly, [{ name: 'pro', yearlyPrice: 12000 }])
    ).toBeUndefined()
  })
})
