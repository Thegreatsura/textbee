import * as mongoose from 'mongoose'
import { SMSSchema } from './sms.schema'

describe('SMSSchema simUsed', () => {
  const SmsModel = mongoose.model('SmsSchemaSimUsedSpec', SMSSchema)

  it('stores the used SIM without an id of its own', () => {
    const sms = new SmsModel({ simUsed: { subscriptionId: 19, slotIndex: 1 } })

    expect(sms.toObject().simUsed).toEqual({ subscriptionId: 19, slotIndex: 1 })
  })

  it('drops keys the schema does not define', () => {
    const sms = new SmsModel({ simUsed: { subscriptionId: 19, carrier: 'x' } })

    expect(sms.toObject().simUsed).toEqual({ subscriptionId: 19 })
  })
})

describe('SMSSchema errorHistory', () => {
  const SmsModel = mongoose.model('SmsSchemaErrorHistorySpec', SMSSchema)

  it('is absent until a failure is recorded', () => {
    expect(new SmsModel({}).toObject().errorHistory).toBeUndefined()
  })

  it('stores entries without an id of their own', () => {
    const at = new Date('2026-10-01T10:00:00.000Z')
    const sms = new SmsModel({
      errorHistory: [{ code: '1', message: 'generic', at, source: 'device' }],
    })

    expect(sms.toObject().errorHistory).toEqual([
      { code: '1', message: 'generic', at, source: 'device' },
    ])
  })
})
