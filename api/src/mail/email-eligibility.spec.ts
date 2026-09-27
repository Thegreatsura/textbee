import { skipReason } from './email-eligibility'

describe('skipReason', () => {
  const verified = { email: 'a@example.com', emailVerifiedAt: new Date() }

  it('allows a verified account every category', () => {
    for (const c of ['account', 'usage', 'activation', 'conversion', 'dunning', 'reengagement'] as const) {
      expect(skipReason(verified, c, 'X', false)).toBeNull()
    }
  })

  it('respects the product email preference only for product categories', () => {
    const user = { ...verified, emailPreferences: { productEmails: false } }
    expect(skipReason(user, 'activation', 'A1', false)).toBe('unsubscribed')
    expect(skipReason(user, 'reengagement', 'R3', false)).toBe('unsubscribed')
    expect(skipReason(user, 'reengagement', 'R1', false)).toBeNull()
    expect(skipReason(user, 'usage', 'U2', false)).toBeNull()
    expect(skipReason(user, 'dunning', 'D1', false)).toBeNull()
  })

  it('needs a verified or waived address for product categories', () => {
    expect(skipReason({ email: 'a@example.com' }, 'conversion', 'C1', false)).toBe('not_eligible')
    expect(
      skipReason({ email: 'a@example.com', emailVerificationWaivedAt: new Date() }, 'conversion', 'C1', false),
    ).toBeNull()
    expect(skipReason({ email: 'a@example.com' }, 'account', 'T1', false)).toBeNull()
  })

  it('always skips suppressed, banned and deleting accounts', () => {
    expect(skipReason(verified, 'account', 'T2', true)).toBe('suppressed')
    expect(skipReason({ ...verified, isBanned: true }, 'account', 'T2', false)).toBe('not_eligible')
    expect(
      skipReason({ ...verified, accountDeletionRequestedAt: new Date() }, 'usage', 'U2', false),
    ).toBe('not_eligible')
    expect(skipReason(null, 'account', 'T2', false)).toBe('not_eligible')
  })
})
