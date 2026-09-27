import { Types } from 'mongoose'
import {
  BILLING_NOTIFICATION_DEDUPE_HOURS,
  BillingNotificationsService,
} from './billing-notifications.service'
import { BillingNotificationType } from './schemas/billing-notification.schema'

describe('BillingNotificationsService - notifyOnce', () => {
  const userId = new Types.ObjectId().toString()
  const type = BillingNotificationType.MONTHLY_LIMIT_REACHED
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600 * 1000)

  let model: { findOne: jest.Mock; findOneAndUpdate: jest.Mock; updateOne: jest.Mock }
  let queue: { add: jest.Mock }
  let service: BillingNotificationsService

  const storedDoc = (lastEmailSentAt?: Date) => ({
    _id: 'n1',
    user: userId,
    type,
    title: 'title',
    message: 'message',
    meta: {},
    ...(lastEmailSentAt && { lastEmailSentAt }),
  })

  const notify = (extra: Record<string, any> = {}) =>
    service.notifyOnce({ userId, type, title: 'title', message: 'message', emailKey: 'U2', ...extra })

  const jobOptions = () => queue.add.mock.calls[0][2]

  beforeEach(() => {
    model = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({}),
    }
    queue = { add: jest.fn().mockResolvedValue(undefined) }
    service = new BillingNotificationsService(model as any, queue as any)
  })

  it('queues a first email and releases the job when it finishes', async () => {
    model.findOne.mockResolvedValue(null)
    model.findOneAndUpdate.mockResolvedValue(storedDoc())

    await notify()

    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(jobOptions()).toMatchObject({
      jobId: 'n1:0',
      removeOnComplete: true,
      removeOnFail: true,
    })
  })

  it('keeps a burst of triggers on one pending job', async () => {
    model.findOne.mockResolvedValue(null)
    model.findOneAndUpdate.mockResolvedValue(storedDoc())

    await notify()
    await notify()

    expect(queue.add.mock.calls[0][2].jobId).toBe(queue.add.mock.calls[1][2].jobId)
  })

  it('does not queue inside the dedupe window', async () => {
    model.findOne.mockResolvedValue(storedDoc(hoursAgo(1)))

    await notify()

    expect(model.findOneAndUpdate).not.toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('queues again with a new job id once the window has passed', async () => {
    const lastSent = hoursAgo(31 * 24)
    model.findOne.mockResolvedValue(storedDoc(lastSent))
    model.findOneAndUpdate.mockResolvedValue(storedDoc(lastSent))

    await notify()

    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(jobOptions().jobId).toBe(`n1:${lastSent.getTime()}`)
  })

  it('keeps an in-app notice without queueing an email when there is no template', async () => {
    model.findOne.mockResolvedValue(null)
    model.findOneAndUpdate.mockResolvedValue(storedDoc())

    await notify({ emailKey: null })

    expect(model.findOneAndUpdate).toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('carries the template key to the job', async () => {
    model.findOne.mockResolvedValue(null)
    model.findOneAndUpdate.mockResolvedValue(storedDoc())

    await notify()

    expect(queue.add.mock.calls[0][1]).toMatchObject({ emailKey: 'U2', sendEmail: true })
  })

  it('records the hit day even inside the email window', async () => {
    model.findOne.mockResolvedValue(storedDoc(hoursAgo(1)))

    await notify({ recordHit: true })

    const [filter, update, options] = model.updateOne.mock.calls[0]
    expect(filter).toEqual({ user: expect.any(Types.ObjectId), type })
    expect(update.$addToSet).toEqual({ hitDays: new Date().toISOString().slice(0, 10) })
    expect(update.$set.lastHitAt).toBeInstanceOf(Date)
    expect(options).toEqual({ upsert: true })
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('skips the hit write when the day is recorded and the last hit is recent', async () => {
    const today = new Date().toISOString().slice(0, 10)
    model.findOne.mockResolvedValue({
      ...storedDoc(hoursAgo(1)),
      hitDays: [today],
      lastHitAt: new Date(Date.now() - 10_000),
    })

    await notify({ recordHit: true })

    expect(model.updateOne).not.toHaveBeenCalled()
  })

  it('uses 7 and 30 day windows before queueing again', () => {
    expect(BILLING_NOTIFICATION_DEDUPE_HOURS[BillingNotificationType.DAILY_LIMIT_REACHED]).toBe(168)
    expect(BILLING_NOTIFICATION_DEDUPE_HOURS[BillingNotificationType.MONTHLY_LIMIT_REACHED]).toBe(720)
  })

  it('has a window for every notification type', () => {
    for (const notificationType of Object.values(BillingNotificationType)) {
      expect(BILLING_NOTIFICATION_DEDUPE_HOURS[notificationType]).toBeGreaterThan(0)
    }
  })
})
