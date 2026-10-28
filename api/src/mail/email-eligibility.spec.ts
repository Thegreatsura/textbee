import { skipReason } from './email-eligibility'

describe('skipReason', () => {
  const user = { email: 'a@example.com' }

  it('allows an account in good standing, verified or not', () => {
    expect(skipReason(user, false)).toBeNull()
  })

  it('ignores the product email preference', () => {
    expect(skipReason({ ...user, emailPreferences: { productEmails: false } } as any, false)).toBeNull()
  })

  it('skips suppressed addresses', () => {
    expect(skipReason(user, true)).toBe('suppressed')
  })

  it('skips banned, deleting and missing accounts', () => {
    expect(skipReason({ ...user, isBanned: true }, false)).toBe('not_eligible')
    expect(skipReason({ ...user, accountDeletionRequestedAt: new Date() }, false)).toBe('not_eligible')
    expect(skipReason({}, false)).toBe('not_eligible')
    expect(skipReason(null, false)).toBe('not_eligible')
  })

  it('sends only essential emails while deletion is pending', () => {
    const deleting = { ...user, accountDeletionRequestedAt: new Date() }
    for (const key of ['T1', 'T2', 'T3']) {
      expect(skipReason(deleting, false, key)).toBeNull()
    }
    for (const key of ['V2', 'U1', 'U2_paid', 'U6']) {
      expect(skipReason(deleting, false, key)).toBe('not_eligible')
    }
  })

  it('never sends to banned accounts, essential or not', () => {
    expect(skipReason({ ...user, isBanned: true }, false, 'T2')).toBe('not_eligible')
  })

  it('still skips a suppressed address for essential emails', () => {
    const deleting = { ...user, accountDeletionRequestedAt: new Date() }
    expect(skipReason(deleting, true, 'T2')).toBe('suppressed')
  })
})
