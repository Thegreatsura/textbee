import {
  FCM_SEND_TIMEOUT_MS,
  FcmSendTimeoutError,
  SEND_JOB_TIMEOUT_MS,
  withSendTimeout,
} from './send-timeout'

describe('withSendTimeout', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('passes the push result through when it settles in time', async () => {
    await expect(withSendTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  it('passes the push error through when it fails in time', async () => {
    await expect(
      withSendTimeout(Promise.reject(new Error('fcm down')), 1000),
    ).rejects.toThrow('fcm down')
  })

  it('rejects with a timeout error when the push never settles', async () => {
    jest.useFakeTimers()
    const pending = withSendTimeout(new Promise(() => undefined), 120_000)
    jest.advanceTimersByTime(120_000)

    const error = (await pending.catch((e) => e)) as FcmSendTimeoutError
    expect(error).toBeInstanceOf(FcmSendTimeoutError)
    expect(error.code).toBe('FCM_SEND_TIMEOUT')
    expect(error.message).toBe(
      'Push to the device timed out after 120 seconds. The message may not have reached the phone.',
    )
  })

  it('clears its timer once the push settles', async () => {
    jest.useFakeTimers()
    await withSendTimeout(Promise.resolve('ok'), 120_000)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('leaves room for the job timeout above the push timeout', () => {
    expect(SEND_JOB_TIMEOUT_MS).toBeGreaterThan(FCM_SEND_TIMEOUT_MS)
  })
})
