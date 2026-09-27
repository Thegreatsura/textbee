'use client'

import { LegacyAlertStack } from './legacy-alert-stack'
import { useNotifications } from './notification-provider'
import { rendererFor } from './renderers'

// The single switch for the top-of-dashboard slot. Exactly one implementation is
// mounted, never both: each built-in alert runs its own subscription and account
// queries, so keeping them mounted but hidden would both pay for them and risk
// the two stacks painting over each other.
export function NotificationTileStack() {
  const { mode, tiles, recordImpression, recordClick, dismiss } =
    useNotifications()

  // Nothing while the feed is in flight. That is already how this slot behaves:
  // every built-in alert returns null until its own query resolves, so there is
  // no new gap and no flash of one implementation before the other.
  if (mode === 'loading') return null

  if (mode === 'legacy') return <LegacyAlertStack />

  if (!tiles.length) return null

  return (
    <>
      {tiles.map((notification) => {
        const Renderer = rendererFor(notification)
        return (
          <Renderer
            key={notification.id}
            notification={notification}
            onImpression={recordImpression}
            onClick={recordClick}
            onDismiss={dismiss}
          />
        )
      })}
    </>
  )
}
