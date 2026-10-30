import { signLink } from './email-render'

const base = (value: string | undefined, fallback: string) =>
  (value || fallback).replace(/\/+$/, '')

export const apiPublicUrl = () =>
  base(process.env.API_PUBLIC_URL, 'https://api.textbee.dev')

export const appPublicUrl = () =>
  base(process.env.APP_PUBLIC_URL, 'https://app.textbee.dev')

export const emailLinkSecret = () => process.env.EMAIL_LINK_SECRET || ''

export const billingUrl = () => `${appPublicUrl()}/dashboard/account/billing`

/** Exactly "monthly" in DEFAULT_BILLING_INTERVAL gives monthly; anything else gives yearly. */
export const defaultBillingInterval = (): 'monthly' | 'yearly' =>
  process.env.DEFAULT_BILLING_INTERVAL === 'monthly' ? 'monthly' : 'yearly'

const emailSource = (ref?: string) => (ref ? `from=email&ref=${encodeURIComponent(ref)}` : 'from=email')

export const upgradeUrl = (ref?: string) =>
  `${appPublicUrl()}/checkout/pro?billingInterval=${defaultBillingInterval()}&${emailSource(ref)}`

export const scaleUpgradeUrl = (ref?: string) =>
  `${appPublicUrl()}/checkout/scale?billingInterval=${defaultBillingInterval()}&${emailSource(ref)}`

export const billingEmailUrl = (ref?: string) => `${billingUrl()}?${emailSource(ref)}`

/** Signed one-click link; without a secret it points at the account page. */
export const unsubscribeUrl = (userId: string): string => {
  const secret = emailLinkSecret()
  if (!secret) return `${appPublicUrl()}/dashboard/account`
  const token = signLink(secret, 'unsubscribe', userId, 0)
  return `${apiPublicUrl()}/api/v1/email/unsubscribe?t=${token}`
}
