import { reminderTransport } from './reminder-transport'

describe('bounded reminder transport', () => {
  const originalFetch = global.fetch
  const message = {
    title: 'QA',
    body: 'QA',
    data: { reminderId: 'reminder' },
    expiresAt: new Date('2026-11-16T13:00:00Z'),
  }
  const tokens = [{ id: 'device-id', token: 'private-device-token' }]
  afterEach(() => {
    global.fetch = originalFetch
  })
  it.each([429, 500, 503])('retries explicit HTTP %s rejection', async (status) => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status })
    expect(await reminderTransport(message).send(tokens)).toEqual([
      { status: 'error', code: 'ProviderUnavailable' },
    ])
  })
  it('does not retry permanent HTTP rejection', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 })
    expect(await reminderTransport(message).send(tokens)).toEqual([
      { status: 'error', code: 'InvalidRequest' },
    ])
  })
  it('classifies timeout after possible acceptance as unknown, not retryable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout with sensitive provider details'))
    expect(await reminderTransport(message).send(tokens)).toEqual([
      { status: 'error', code: 'UnknownAcceptance' },
    ])
  })
  it('treats truncated response bodies as ambiguous', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => {
        throw new Error('truncated')
      },
    })
    expect(await reminderTransport(message).send(tokens)).toEqual([
      { status: 'error', code: 'UnknownAcceptance' },
    ])
  })
  it('validates ticket count and attaches expiry plus stable notification ID', async () => {
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) })
    global.fetch = fetch
    expect(await reminderTransport(message).send(tokens)).toEqual([
      { status: 'error', code: 'MalformedResponse' },
    ])
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body[0].expiration).toBe(message.expiresAt.getTime() / 1000)
    expect(body[0].data.notificationId).toContain('reminder:')
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
  it('ignores receipt IDs that were not requested and sanitizes provider errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          ours: { status: 'error', details: { error: 'private-provider-error' } },
          other: { status: 'ok' },
        },
      }),
    })
    expect(await reminderTransport(message).receipts(['ours'])).toEqual({
      ours: { status: 'error', code: 'UnknownProviderError' },
    })
  })
})
