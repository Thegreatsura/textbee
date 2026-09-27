export type EmailCategory =
  | 'account'
  | 'usage'
  | 'activation'
  | 'conversion'
  | 'dunning'
  | 'reengagement'

export type SkipReason =
  | 'suppressed'
  | 'unsubscribed'
  | 'disabled'
  | 'frequency_cap'
  | 'not_eligible'

export interface EligibilityUser {
  email?: string
  isBanned?: boolean
  accountDeletionRequestedAt?: Date | null
  emailVerifiedAt?: Date | null
  emailVerificationWaivedAt?: Date | null
  emailPreferences?: { productEmails?: boolean }
}

const PRODUCT_CATEGORIES: EmailCategory[] = ['activation', 'conversion', 'reengagement']

/** Why an email must not go to this user, or null when it may. */
export const skipReason = (
  user: EligibilityUser | null | undefined,
  category: EmailCategory,
  key: string,
  suppressed: boolean,
): SkipReason | null => {
  if (!user?.email || user.isBanned || user.accountDeletionRequestedAt) {
    return 'not_eligible'
  }
  if (suppressed) return 'suppressed'
  if (PRODUCT_CATEGORIES.includes(category) && key !== 'R1') {
    if (user.emailPreferences?.productEmails === false) return 'unsubscribed'
    if (!user.emailVerifiedAt && !user.emailVerificationWaivedAt) return 'not_eligible'
  }
  return null
}
