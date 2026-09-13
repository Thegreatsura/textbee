import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
vi.mock('@/lib/httpServerClient', () => ({ httpServerClient: { post } }))

import { authOptions } from '@/lib/auth'

function credentialsProvider(id: string) {
  const provider = authOptions.providers.find(
    (entry: any) => entry.options?.id === id
  ) as any
  return provider.options
}

describe('email-password-login', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({
      data: { data: { user: { _id: 'user_1' }, accessToken: 'token' } },
    })
  })

  it("forwards the visitor's browser details to the API", async () => {
    await credentialsProvider('email-password-login').authorize(
      {
        email: 'ada@example.com',
        password: 'a-valid-password',
        turnstileToken: 'turnstile',
      },
      {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'cf-connecting-ip': '203.0.113.4',
          'cf-ipcountry': 'US',
        },
      }
    )

    expect(post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        email: 'ada@example.com',
        client: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          ip: '203.0.113.4',
          country: 'US',
        },
      })
    )
  })
})
