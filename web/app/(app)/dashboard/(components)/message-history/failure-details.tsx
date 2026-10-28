import { smsPermissionGuideUrl } from '@/config/external-links'
import { format } from 'date-fns'
import { failureView, recoveredLabel, sourceLabel } from './failure-view'
import type { ErrorHistoryEntry, SmsMessage } from './types'

function AttemptList({ attempts }: { attempts: ErrorHistoryEntry[] }) {
  return (
    <ul className='space-y-1.5'>
      {attempts.map((attempt, index) => (
        <li
          key={`${attempt.source}-${attempt.code}-${attempt.at}-${index}`}
          className='break-words text-xs text-muted-foreground'
        >
          {/* Seconds, so retries in the same minute stay apart */}
          <span className='text-foreground'>
            {format(new Date(attempt.at), "MMM d, yyyy 'at' h:mm:ss a")}
          </span>
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
      <div className='space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3'>
        <p className='text-xs text-foreground'>
          No status report from the phone yet. The phone did not report within
          20 minutes.
        </p>
        {view.attempts.length > 0 && <AttemptList attempts={view.attempts} />}
      </div>
    )
  }

  if (view.kind === 'recovered') {
    return (
      <div className='space-y-2 rounded-lg border bg-muted/40 p-3'>
        <p className='text-sm font-medium text-foreground'>
          {recoveredLabel(view)}
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
      {view.others.length > 0 && (
        <div className='space-y-1.5 pt-1.5'>
          <p className='text-xs font-medium text-foreground'>Other failures</p>
          <AttemptList attempts={view.others} />
        </div>
      )}
    </div>
  )
}
