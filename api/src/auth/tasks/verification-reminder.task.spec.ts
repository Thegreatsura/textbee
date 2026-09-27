import { Types } from 'mongoose'
import { VerificationReminderTask } from './verification-reminder.task'

describe('VerificationReminderTask', () => {
  const now = new Date('2026-09-27T12:00:00Z')
  const a = { _id: new Types.ObjectId(), email: 'a@example.com' }
  const b = { _id: new Types.ObjectId(), email: 'b@example.com' }

  const setup = (users: any[], alreadySent: any[] = []) => {
    const lean = jest.fn().mockResolvedValue(users)
    const chain = { select: jest.fn(() => chain), limit: jest.fn(() => chain), lean }
    const userModel: any = { find: jest.fn(() => chain) }
    const sentEmailModel: any = { distinct: jest.fn().mockResolvedValue(alreadySent) }
    const authService: any = {
      mintEmailVerificationLink: jest.fn().mockResolvedValue('https://app.test/verify?c=1'),
    }
    const mailService: any = { sendTemplated: jest.fn().mockResolvedValue('sent') }
    const task = new VerificationReminderTask(userModel, sentEmailModel, authService, mailService)
    return { task, userModel, sentEmailModel, authService, mailService }
  }

  it('looks for unverified password accounts created 24 to 48 hours ago', async () => {
    const { task, userModel } = setup([])

    await task.sendDue(now)

    const filter = userModel.find.mock.calls[0][0]
    expect(filter._id.$gte.getTimestamp()).toEqual(new Date('2026-09-25T12:00:00Z'))
    expect(filter._id.$lt.getTimestamp()).toEqual(new Date('2026-09-26T12:00:00Z'))
    expect(filter).toMatchObject({
      googleId: null,
      emailVerifiedAt: null,
      emailVerificationWaivedAt: null,
      isBanned: { $ne: true },
    })
  })

  it('mints a 24 hour reminder link and sends V2 once per account', async () => {
    const { task, authService, mailService } = setup([a, b], [b._id])

    await expect(task.sendDue(now)).resolves.toBe(1)

    expect(authService.mintEmailVerificationLink).toHaveBeenCalledTimes(1)
    expect(authService.mintEmailVerificationLink).toHaveBeenCalledWith(a, {
      lifetimeMs: 24 * 3600 * 1000,
      source: 'reminder',
    })
    expect(mailService.sendTemplated).toHaveBeenCalledWith({
      key: 'V2',
      userId: a._id,
      vars: { verificationUrl: 'https://app.test/verify?c=1', linkTtl: '24 hours' },
      redactVars: ['verificationUrl'],
    })
  })
})
