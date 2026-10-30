import { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockBillingPlans } from '@/test/fixtures'
import CheckoutPage from './page'

let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated' }),
}))

vi.mock('@/lib/api', () => ({
  useBillingPlans: () => ({ data: mockBillingPlans, isPending: false }),
}))

const post = vi.fn()
vi.mock('@/lib/httpBrowserClient', () => ({
  default: { post: (...a: unknown[]) => post(...a) },
}))

const track = vi.fn()
vi.mock('@/lib/analytics/track', () => ({
  track: (...a: unknown[]) => track(...a),
}))

const originalLocation = window.location

const setStored = (value: Record<string, string>) => {
  document.cookie = `tb_cfrom=${encodeURIComponent(
    JSON.stringify({ ...value, at: '2026-10-01T00:00:00.000Z' })
  )}; path=/`
}

const renderPage = async () => {
  const params = Promise.resolve({ planName: 'pro' })
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <CheckoutPage params={params} />
      </Suspense>
    )
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '' },
  })
})
afterEach(() => {
  document.cookie = 'tb_cfrom=; path=/; max-age=0'
  search = ''
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  })
})

describe('CheckoutPage source', () => {
  it('sends the link source, the stored one as prior, and tags begin_checkout', async () => {
    search = 'billingInterval=yearly&from=app_billing'
    setStored({ from: 'email', ref: 'U1' })
    post.mockResolvedValue({ data: { redirectUrl: 'https://pay.test/co_1' } })

    await renderPage()

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post).toHaveBeenCalledWith('/billing/checkout', {
      planName: 'pro',
      billingInterval: 'yearly',
      from: 'app_billing',
      priorFrom: 'email',
      priorRef: 'U1',
    })
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('begin_checkout', {
        plan: 'pro',
        billing_interval: 'yearly',
        from: 'app_billing',
      })
    )
  })

  it('falls back to the stored source when the link has none', async () => {
    search = 'billingInterval=monthly'
    setStored({ from: 'notice', ref: 'n1' })
    post.mockResolvedValue({ data: { redirectUrl: 'https://pay.test/co_1' } })

    await renderPage()

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/billing/checkout', {
        planName: 'pro',
        billingInterval: 'monthly',
        from: 'notice',
        ref: 'n1',
        fromCookie: true,
      })
    )
  })

  it('sends no source and no from prop when there is none', async () => {
    search = 'billingInterval=monthly&from=Not%20Valid'
    post.mockResolvedValue({ data: { redirectUrl: 'https://pay.test/co_1' } })

    await renderPage()

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/billing/checkout', {
        planName: 'pro',
        billingInterval: 'monthly',
      })
    )
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('begin_checkout', {
        plan: 'pro',
        billing_interval: 'monthly',
      })
    )
  })

  it('sends the source with the confirmed plan change', async () => {
    search = 'billingInterval=yearly&from=email&ref=U2_paid'
    post
      .mockResolvedValueOnce({
        data: {
          planChange: {
            currentPlan: 'pro',
            currentInterval: 'monthly',
            newPlan: 'pro',
            newInterval: 'yearly',
            isUpgrade: false,
            cancelAtPeriodEnd: false,
          },
        },
      })
      .mockResolvedValueOnce({ data: { success: true, plan: 'pro' } })

    await renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Confirm change' }))

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    expect(post).toHaveBeenLastCalledWith('/billing/change-plan', {
      planName: 'pro',
      billingInterval: 'yearly',
      from: 'email',
      ref: 'U2_paid',
    })
  })
})
