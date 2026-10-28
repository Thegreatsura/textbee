import { smsPermissionGuideUrl } from '@/config/external-links'
import { toExactLabel } from '@/components/shared/relative-time'
import { failureView, recoveredLabel, sourceLabel } from './failure-view'
import type { ErrorHistoryEntry, SmsMessage } from './types'

function AttemptList({ attempts }: { attempts: ErrorHistoryEntry[] }) {
  return (
    <ul className='space-y-1.5'>
      {attempts.map((attempt) => (
        <li
          key={`${attempt.code}-${attempt.at}`}
          className='break-words text-xs text-muted-foreground'
        >
          <span className='text-foreground'>{toExactLabel(new Date(attempt.at))}</span>
          {' · '}
          {sourceLabel(attempt.source)}
          {' · '}
          Code: {attempt.code}
          {attempt.message && <span className='block'>{attempt.message}</span>}
        </li>
      ))}
    </ul>
  )
}

// The failure box in the message details: the current failure in red, earlier
// failures of a message that went out after all, or a missing phone report.
export default function FailureDetails({ message }: { message: SmsMessage }) {
  const view = failureView(message)
  if (!view) return null

  if (view.kind === 'no-report') {
    return (
      <p className='rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-foreground'>
        No status report from the phone yet. The phone did not report within 20
        minutes, so the message may or may not have gone out.
      </p>
    )
  }

  if (view.kind === 'recovered') {
    return (
      <div className='space-y-2 rounded-lg border bg-muted/40 p-3'>
        <p className='text-sm font-medium text-foreground'>
          {recoveredLabel(view, message.status)}
        </p>
        <AttemptList attempts={view.attempts} />
      </div>
    )
  }

  return (
    <div className='space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3'>
      <p className='text-sm font-medium text-destructive'>Delivery failed</p>
      {view.code && (
        <p className='break-words text-xs text-destructive'>Code: {view.code}</p>
      )}
      {view.message && (
        <p className='break-words text-xs text-destructive'>{view.message}</p>
      )}
      {view.code === 'PERMISSION_DENIED' && (
        <p className='text-xs text-foreground'>
          The textbee app on this phone does not have SMS permission.{' '}
          <a
            href={smsPermissionGuideUrl('message_details')}
            target='_blank'
            rel='noopener noreferrer'
            className='font-medium underline underline-offset-2'
          >
            How to fix it
          </a>
        </p>
      )}
      {view.earlier.length > 0 && (
        <div className='space-y-1.5 pt-1.5'>
          <p className='text-xs font-medium text-foreground'>Earlier attempts</p>
          <AttemptList attempts={view.earlier} />
        </div>
      )}
    </div>
  )
}
