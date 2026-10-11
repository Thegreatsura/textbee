'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Input, type InputProps } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<InputProps, 'type'>
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className='relative'>
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn('pr-12 sm:pr-10 [&::-ms-reveal]:hidden', className)}
        {...props}
      />
      <button
        type='button'
        aria-label='Show password'
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className='absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-10'
      >
        {visible ? (
          <EyeOff className='h-4 w-4' aria-hidden />
        ) : (
          <Eye className='h-4 w-4' aria-hidden />
        )}
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'

export default PasswordInput
