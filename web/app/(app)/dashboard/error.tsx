'use client'

import ErrorState from '@/components/shared/error-state'

// Keeps the sidebar and header up when a dashboard page throws while rendering.
export default function DashboardError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <div className='flex-1 p-4 sm:p-6 md:p-8'>
      <ErrorState
        // Render errors carry DOM or React internals, not a message for users.
        error={null}
        title='This section could not load'
        onRetry={unstable_retry}
      />
    </div>
  )
}
