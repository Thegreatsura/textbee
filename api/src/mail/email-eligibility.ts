// Categories this service sends; both ignore the product email preference.
export type EmailCategory = 'account' | 'usage'

export type SkipReason = 'suppressed' | 'disabled' | 'not_eligible'

export interface EligibilityUser {
  email?: string
  isBanned?: boolean
  accountDeletionRequestedAt?: Date | null
}

// Verify email, password reset, password changed: still sent while deletion is pending.
export const ESSENTIAL_TEMPLATES: ReadonlySet<string> = new Set(['T1', 'T2', 'T3'])

/** Why an email must not go to this user, or null when it may. */
export const skipReason = (
  user: EligibilityUser | null | undefined,
  suppressed: boolean,
  templateKey?: string,
): SkipReason | null => {
  if (!user?.email || user.isBanned) return 'not_eligible'
  if (user.accountDeletionRequestedAt && !ESSENTIAL_TEMPLATES.has(templateKey ?? '')) {
    return 'not_eligible'
  }
  return suppressed ? 'suppressed' : null
}
