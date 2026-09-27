import { Types } from 'mongoose'
import { UserRollupService } from './user-rollup.service'

const USER_ID = new Types.ObjectId('507f1f77bcf86cd799439011')

const chain = (result: any) => {
  const node: any = {}
  node.select = jest.fn().mockReturnValue(node)
  node.sort = jest.fn().mockReturnValue(node)
  node.limit = jest.fn().mockReturnValue(node)
  node.lean = jest.fn().mockResolvedValue(result)
  return node
}

const build = (devices: any[] = [], apiKeyCount = 0) => {
  const userModel: any = {
    updateOne: jest.fn().mockResolvedValue(undefined),
    bulkWrite: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    countDocuments: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockImplementation(() => chain([])),
  }
  const deviceModel: any = {
    find: jest.fn().mockImplementation(() => chain(devices)),
    findOne: jest.fn().mockImplementation(() => chain(null)),
  }
  const apiKeyModel: any = {
    countDocuments: jest.fn().mockResolvedValue(apiKeyCount),
    findOne: jest.fn().mockImplementation(() => chain(null)),
  }
  const smsModel: any = {
    findOne: jest.fn().mockImplementation(() => chain(null)),
  }

  const service = new UserRollupService(
    userModel,
    deviceModel,
    apiKeyModel,
    smsModel,
  )
  return { service, userModel, deviceModel, apiKeyModel, smsModel }
}

const setOf = (t: ReturnType<typeof build>) =>
  t.userModel.updateOne.mock.calls[0][1].$set

describe('UserRollupService.recomputeForUser', () => {
  it('sums the device counters and counts live API keys', async () => {
    const t = build(
      [
        { sentSMSCount: 40, appVersionCode: 19 },
        { sentSMSCount: 2, appVersionCode: 20 },
      ],
      3,
    )

    await t.service.recomputeForUser(USER_ID)

    expect(setOf(t)).toMatchObject({
      'rollup.deviceCount': 2,
      'rollup.apiKeyCount': 3,
      'rollup.totalSentSms': 42,
    })
    // A derived write must not masquerade as a change to the account.
    expect(t.userModel.updateOne.mock.calls[0][2]).toEqual({ timestamps: false })
    expect(t.apiKeyModel.countDocuments).toHaveBeenCalledWith({
      user: USER_ID,
      revokedAt: null,
    })
  })

  it('keeps the oldest app build across the account', async () => {
    const t = build([
      { sentSMSCount: 0, appVersionCode: 20 },
      { sentSMSCount: 0, appVersionCode: 17 },
      { sentSMSCount: 0, appVersionCode: 19 },
    ])

    await t.service.recomputeForUser(USER_ID)

    expect(setOf(t)['rollup.minAppVersionCode']).toBe(17)
  })

  it('prefers the heartbeat version over the registration one', async () => {
    const t = build([
      { sentSMSCount: 0, appVersionCode: 14, appVersionInfo: { versionCode: 20 } },
    ])

    await t.service.recomputeForUser(USER_ID)

    // The dashboard resolves the effective version the same way round.
    expect(setOf(t)['rollup.minAppVersionCode']).toBe(20)
  })

  it('records no version at all rather than zero when none was reported', async () => {
    const t = build([{ sentSMSCount: 5 }])

    await t.service.recomputeForUser(USER_ID)

    // Zero would read as an ancient build and wrongly demand an update.
    expect(setOf(t)['rollup.minAppVersionCode']).toBeNull()
  })

  it('handles an account with nothing on it', async () => {
    const t = build([], 0)

    await t.service.recomputeForUser(USER_ID)

    expect(setOf(t)).toMatchObject({
      'rollup.deviceCount': 0,
      'rollup.apiKeyCount': 0,
      'rollup.totalSentSms': 0,
    })
    expect(setOf(t)['rollup.computedAt']).toBeInstanceOf(Date)
  })

  it('projects the device read, since device documents are large now', async () => {
    const t = build([])
    await t.service.recomputeForUser(USER_ID)
    const node = t.deviceModel.find.mock.results[0].value
    expect(node.select).toHaveBeenCalledWith(
      'sentSMSCount appVersionCode appVersionInfo.versionCode',
    )
  })
})

describe('UserRollupService.recomputeAll', () => {
  it('walks every account in id order and stops at the end', async () => {
    const t = build([{ sentSMSCount: 1 }])
    const first = [{ _id: new Types.ObjectId() }, { _id: new Types.ObjectId() }]
    t.userModel.find
      .mockImplementationOnce(() => chain(first))
      .mockImplementationOnce(() => chain([]))

    const processed = await t.service.recomputeAll({ batchSize: 2 })

    expect(processed).toBe(2)
    expect(t.userModel.bulkWrite).toHaveBeenCalledTimes(1)
    expect(t.userModel.bulkWrite.mock.calls[0][0]).toHaveLength(2)
  })

  it('can be narrowed to accounts never computed', async () => {
    const t = build()
    t.userModel.find.mockImplementation(() => chain([]))

    await t.service.recomputeAll({ onlyMissing: true })

    expect(t.userModel.find).toHaveBeenCalledWith({
      'rollup.computedAt': { $exists: false },
    })
  })
})

describe('UserRollupService.backfillMilestones', () => {
  it('writes derived dates with $min so an earlier real date always wins', async () => {
    const t = build()
    const firstSms = new Date('2026-02-01T00:00:00.000Z')
    t.userModel.find
      .mockImplementationOnce(() => chain([{ _id: USER_ID, milestones: {} }]))
      .mockImplementationOnce(() => chain([]))
    t.smsModel.findOne.mockImplementation(() => chain({ createdAt: firstSms }))

    const processed = await t.service.backfillMilestones({ batchSize: 1 })

    expect(processed).toBe(1)
    const update = t.userModel.bulkWrite.mock.calls[0][0][0].updateOne.update
    // $min, not $set: re-running must never move a milestone forward, and a
    // genuine earlier date must survive.
    expect(update.$min).toEqual({ 'milestones.firstSmsAt': firstSms })
  })

  it('reports what changed, not what was attempted', async () => {
    const t = build()
    t.userModel.find
      .mockImplementationOnce(() => chain([{ _id: USER_ID, milestones: {} }]))
      .mockImplementationOnce(() => chain([]))
    t.smsModel.findOne.mockImplementation(() => chain({ createdAt: new Date() }))
    // A re-run issues the same $min and changes nothing.
    t.userModel.bulkWrite.mockResolvedValue({ modifiedCount: 0 })

    expect(await t.service.backfillMilestones({ batchSize: 1 })).toBe(0)
  })

  it('skips an account with nothing to derive', async () => {
    const t = build()
    t.userModel.find
      .mockImplementationOnce(() => chain([{ _id: USER_ID, milestones: {} }]))
      .mockImplementationOnce(() => chain([]))

    const processed = await t.service.backfillMilestones({ batchSize: 1 })

    expect(processed).toBe(0)
    expect(t.userModel.bulkWrite).not.toHaveBeenCalled()
  })
})

describe('UserRollupService.countMissing', () => {
  it('counts accounts with no rollup yet', async () => {
    const t = build()
    t.userModel.countDocuments.mockResolvedValue(17)

    expect(await t.service.countMissing()).toBe(17)
    expect(t.userModel.countDocuments).toHaveBeenCalledWith({
      'rollup.computedAt': { $exists: false },
    })
  })
})
