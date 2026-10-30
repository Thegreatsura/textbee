const FROM_PATTERN = /^[a-z0-9_]{1,40}$/
const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export type CheckoutSourceFields = {
  from?: string
  ref?: string
  priorFrom?: string
  priorRef?: string
  fromCookie?: boolean
}

const match = (value: unknown, pattern: RegExp): string | undefined =>
  typeof value === 'string' && pattern.test(value) ? value : undefined

export const checkoutSource = (payload: unknown): CheckoutSourceFields => {
  const input = (payload && typeof payload === 'object' ? payload : {}) as Record<
    string,
    unknown
  >
  const fields: CheckoutSourceFields = {
    from: match(input.from, FROM_PATTERN),
    ref: match(input.ref, REF_PATTERN),
    priorFrom: match(input.priorFrom, FROM_PATTERN),
    priorRef: match(input.priorRef, REF_PATTERN),
    fromCookie: typeof input.fromCookie === 'boolean' ? input.fromCookie : undefined,
  }
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as CheckoutSourceFields
}
