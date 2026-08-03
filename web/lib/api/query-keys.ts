import type { ApiKeyStatusFilter } from './types'

// Single source of truth for react-query cache keys. Values intentionally match
// the ad-hoc string keys used across the app before this refactor (e.g.
// ['devices'], ['currentSubscription'], ['apiKeys', 'active']) so migrated and
// not-yet-migrated components still share the same cache entries.
export const queryKeys = {
  currentUser: ['currentUser'] as const,
  subscription: ['currentSubscription'] as const,
  stats: ['stats'] as const,
  devices: ['devices'] as const,
  webhooks: ['webhooks'] as const,
  billingPlans: ['billingPlans'] as const,
  apiKeys: (status: ApiKeyStatusFilter = 'active') =>
    ['apiKeys', status] as const,
  // Prefix covering every apiKeys list regardless of status filter. Use this
  // to invalidate: a new or revoked key changes the active, revoked and all
  // lists at once, and invalidating only apiKeys('active') leaves the other
  // two serving stale data.
  apiKeysAll: ['apiKeys'] as const,
  deviceMessages: (deviceId: string, filters?: Record<string, unknown>) =>
    filters
      ? (['messages', deviceId, filters] as const)
      : (['messages', deviceId] as const),
  // start/end must be part of the key: they are sent on the request URL, and
  // react-query only refetches when the key changes (see issue #256).
  webhookNotifications: (filters: {
    eventType?: string
    status?: string
    deviceId?: string
    webhookSubscriptionId?: string
    start?: string
    end?: string
    page?: number
    limit?: number
  }) =>
    [
      'webhook-notification',
      filters.eventType ?? '',
      filters.page ?? 1,
      filters.limit ?? 10,
      filters.deviceId ?? '',
      filters.webhookSubscriptionId ?? '',
      filters.status ?? '',
      filters.start ?? '',
      filters.end ?? '',
    ] as const,
}
