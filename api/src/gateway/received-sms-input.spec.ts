import {
  isMalformedReceivedSms,
  receivedSmsIgnoreReason,
  resolveReceivedAt,
} from './received-sms-input'

describe('resolveReceivedAt', () => {
  const now = new Date('2026-09-13T12:00:00.000Z')
  const millis = Date.parse('2026-09-13T11:00:00.000Z')

  it('uses receivedAtInMillis when it is a positive number', () => {
    expect(resolveReceivedAt(millis, undefined, now)).toEqual(new Date(millis))
  })

  it('accepts receivedAtInMillis sent as a numeric string', () => {
    expect(resolveReceivedAt(String(millis), undefined, now)).toEqual(
      new Date(millis),
    )
  })

  it('prefers receivedAtInMillis over receivedAt', () => {
    expect(
      resolveReceivedAt(millis, '2020-01-01T00:00:00.000Z', now),
    ).toEqual(new Date(millis))
  })

  it('parses receivedAt sent as a JSON string', () => {
    expect(
      resolveReceivedAt(undefined, '2026-09-13T10:30:00.000Z', now),
    ).toEqual(new Date('2026-09-13T10:30:00.000Z'))
  })

  it('falls back to receivedAt when receivedAtInMillis is 0', () => {
    expect(resolveReceivedAt(0, '2026-09-13T10:30:00.000Z', now)).toEqual(
      new Date('2026-09-13T10:30:00.000Z'),
    )
  })

  it.each([
    ['millis is 0 and receivedAt is absent', 0, undefined],
    ['both are absent', undefined, undefined],
    ['receivedAt does not parse', undefined, 'not a date'],
    ['millis is negative', -5, undefined],
    ['millis is not numeric', 'abc', undefined],
    ['millis is an empty string', '', undefined],
    ['values have the wrong type', true, { at: 1 }],
  ])('uses the server time when %s', (_label, inMillis, at) => {
    expect(resolveReceivedAt(inMillis, at, now)).toBe(now)
  })
})

describe('isMalformedReceivedSms', () => {
  it.each([
    ['a normal message', '+15555550123', 'hello', false],
    ['an empty message', '+15555550123', '', false],
    ['a missing sender', undefined, 'hello', false],
    ['a null sender', null, 'hello', false],
    ['a missing message', '+15555550123', undefined, true],
    ['a non-string message', '+15555550123', 42, true],
    ['a non-string sender', 15555550123, 'hello', true],
  ])('treats %s correctly', (_label, sender, message, expected) => {
    expect(isMalformedReceivedSms(sender, message)).toBe(expected)
  })
})

describe('receivedSmsIgnoreReason', () => {
  it('ignores a message with no text', () => {
    expect(receivedSmsIgnoreReason('+15555550123', '')).toBe('empty_message')
  })

  it.each([undefined, null, '', '   '])('ignores a sender of %p', (sender) => {
    expect(receivedSmsIgnoreReason(sender, 'hello')).toBe('missing_sender')
  })

  it('keeps a message with text and a sender', () => {
    expect(receivedSmsIgnoreReason('+15555550123', 'hello')).toBeNull()
  })
})
