'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { NotificationAction, ServedNotification } from '@/lib/api'

// Presentational. Everything it shows was decided server side, so it holds no
// targeting logic and takes no data of its own. The markup is deliberately
// plain semantic utilities: the admin app renders this same shape in its preview
// on an older Tailwind, and utilities like bg-linear-to-r would not survive the
// trip.

const isExternal = (href: string) => /^https?:\/\//i.test(href)

function ActionButton({
  action,
  index,
  onActivate,
}: {
  action: NotificationAction
  index: number
  onActivate: () => void
}) {
  const variant = action.style === 'secondary' || index > 0 ? 'outline' : 'default'
  const external = isExternal(action.href) || action.target === 'blank'

  return (
    <Button
      variant={variant}
      size='sm'
      asChild
      className='text-xs md:text-sm'
      onClick={onActivate}
    >
      {external ? (
        <a href={action.href} target='_blank' rel='noopener noreferrer'>
          {action.label}
        </a>
      ) : (
        <Link href={action.href}>{action.label}</Link>
      )}
    </Button>
  )
}

export function NotificationTile({
  notification,
  onImpression,
  onClick,
  onDismiss,
}: {
  notification: ServedNotification
  onImpression: (notification: ServedNotification) => void
  onClick: (notification: ServedNotification) => void
  onDismiss: (notification: ServedNotification) => void
}) {
  const impressionSent = useRef(false)
  useEffect(() => {
    if (impressionSent.current) return
    impressionSent.current = true
    onImpression(notification)
  }, [notification, onImpression])

  // Some messages hold the close control shut briefly, so it cannot be cleared
  // before it has been read.
  const holdSeconds = notification.dismissAfterSeconds ?? 0
  const [canDismiss, setCanDismiss] = useState(holdSeconds <= 0)
  useEffect(() => {
    if (holdSeconds <= 0) return
    const timer = setTimeout(() => setCanDismiss(true), holdSeconds * 1000)
    return () => clearTimeout(timer)
  }, [holdSeconds])

  return (
    <Alert variant={notification.tone}>
      <AlertDescription className='flex flex-col items-center gap-2 sm:flex-row md:gap-4'>
        <span className='w-full text-center text-sm font-medium sm:flex-1 sm:text-left md:text-base'>
          {notification.title}
        </span>
        {notification.body ? (
          <span className='w-full text-center text-xs sm:flex-1 sm:text-left md:text-sm'>
            {notification.body}
          </span>
        ) : null}
        <div className='mt-2 flex w-full flex-wrap items-center justify-center gap-2 sm:mt-0 sm:w-auto sm:justify-end'>
          {notification.actions.map((action, index) => (
            <ActionButton
              key={`${action.label}-${index}`}
              action={action}
              index={index}
              onActivate={() => onClick(notification)}
            />
          ))}
          {notification.dismissible && canDismiss ? (
            <button
              type='button'
              aria-label={`Dismiss: ${notification.title}`}
              onClick={() => onDismiss(notification)}
              className='rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/60'
            >
              <X className='h-4 w-4' />
            </button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  )
}
