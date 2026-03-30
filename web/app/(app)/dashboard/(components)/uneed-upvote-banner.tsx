'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ExternalLinks } from '@/config/external-links'
import { ArrowUpRight, ThumbsUp } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

type BannerVariant = {
  title: string
  subtitle: string
  cta: string
}

const TITLES = [
  'Launch day: help keep textbee visible on uneed.best',
  'Help others find textbee',
  'textbee is live on uneed.best',
  'Enjoying textbee so far?',
  'Find us on uneed.best',
] as const

const SUBTITLES = [
  'Thanks for being here,an upvote helps us reach more developers.',
  'If you’ve found it useful, a quick upvote helps others discover it.',
  'If textbee helped you, an upvote today makes a big difference.',
] as const

const CTA_TEXTS = [
  'Upvote on uneed.best',
  'View on uneed.best',
] as const

function pick<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)]
}

export default function UneedUpvoteBanner() {
  const variants = useMemo<BannerVariant[]>(
    () =>
      TITLES.flatMap((title) =>
        SUBTITLES.map((subtitle) => ({
          title,
          subtitle,
          cta: pick(CTA_TEXTS),
        }))
      ),
    []
  )

  const [variant] = useState<BannerVariant>(() => pick(variants))

  return (
    <Alert className='border border-brand-200 dark:border-brand-800 bg-gradient-to-r from-brand-50 to-white dark:from-brand-950/50 dark:to-gray-900'>
      <AlertDescription className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <div className='min-w-0'>
          <div className='font-medium text-gray-900 dark:text-white'>
            {variant.title}
          </div>
          <div className='text-sm text-gray-600 dark:text-gray-300'>
            {variant.subtitle}
          </div>
        </div>

        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end'>
          <Button asChild className='bg-brand-600 hover:bg-brand-700 text-white'>
            <Link
              href={ExternalLinks.uneed}
              target='_blank'
              rel='noopener noreferrer'
              prefetch={false}
            >
              <ThumbsUp className='mr-2 h-4 w-4' />
              {variant.cta}
              <ArrowUpRight className='ml-2 h-4 w-4' />
            </Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

