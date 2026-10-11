'use client'

import { useSearchParams } from 'next/navigation'

import AuthShell from '../(components)/auth-shell'
import RegisterForm from '../(components)/register-form'
import { Routes } from '@/config/routes'

export default function RegisterPage() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect')

  return (
    <AuthShell
      title='Create your account'
      description='Send SMS from your own Android phone. Free plan, no credit card required.'
      switchPrompt='Already have an account?'
      switchLabel='Log in'
      switchHref={{
        pathname: Routes.login,
        query: {
          redirect: redirect ? decodeURIComponent(redirect) : undefined,
        },
      }}
      className='max-w-[440px]'
    >
      <RegisterForm />
    </AuthShell>
  )
}
