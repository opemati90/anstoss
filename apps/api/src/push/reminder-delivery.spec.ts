import {
  advanceReminderDelivery,
  RECEIPT_WAIT_MS,
  type ReminderDeliveryState,
} from './reminder-delivery'

describe('durable event reminder receipts', () => {
  const now = Date.parse('2026-11-16T12:00:00Z')
  const date = new Date(now + 3600_000)
  const token = { id: 'ios-token-id', token: 'never-persist-this-token' }
  function setup() {
    const transport = {
      send: jest.fn().mockResolvedValue([{ status: 'ok', id: 'receipt-1' }]),
      receipts: jest.fn().mockResolvedValue({}),
    }
    const input = {
      saved: null as unknown,
      now,
      eventDate: date,
      tokens: [token],
      canSend: true,
      transport,
    }
    return { transport, input }
  }
  it('persists ticket IDs but not tokens and resumes polling after process restart', async () => {
    const { input, transport } = setup()
    const first = await advanceReminderDelivery(input)
    expect(first.complete).toBe(false)
    expect(first.state.devices[0].status).toBe('receipt')
    expect(JSON.stringify(first.state)).not.toContain(token.token)
    const reloaded = JSON.parse(JSON.stringify(first.state))
    transport.receipts.mockResolvedValue({ 'receipt-1': { status: 'ok' } })
    const second = await advanceReminderDelivery({
      ...input,
      saved: reloaded,
      now: now + RECEIPT_WAIT_MS,
    })
    expect(second.complete).toBe(true)
    expect(second.state.devices[0].status).toBe('accepted')
    expect(transport.send).toHaveBeenCalledTimes(1)
    expect(transport.receipts).toHaveBeenCalledWith(['receipt-1'])
  })
  it('retries a deferred rate error with backoff, not at receipt poll time', async () => {
    const { input, transport } = setup()
    const first = await advanceReminderDelivery(input)
    transport.receipts.mockResolvedValue({
      'receipt-1': { status: 'error', code: 'MessageRateExceeded' },
    })
    const second = await advanceReminderDelivery({
      ...input,
      saved: first.state,
      now: now + RECEIPT_WAIT_MS,
    })
    expect(second.state.devices[0]).toMatchObject({ status: 'pending', attempts: 1 })
    expect(transport.send).toHaveBeenCalledTimes(1)
    await advanceReminderDelivery({ ...input, saved: second.state, now: second.nextAt.getTime() })
    expect(transport.send).toHaveBeenCalledTimes(2)
  })
  it('does not resend to an accepted device when another device failed', async () => {
    const { input, transport } = setup()
    input.tokens.push({ id: 'android-token-id', token: 'other-private-token' })
    transport.send.mockResolvedValueOnce([
      { status: 'ok', id: 'ios-receipt' },
      { status: 'error', code: 'ProviderUnavailable' },
    ])
    const first = await advanceReminderDelivery(input)
    await advanceReminderDelivery({ ...input, saved: first.state, now: now + 60_000 })
    expect(transport.send.mock.calls[1][0]).toEqual([input.tokens[1]])
  })
  it.each(['InvalidCredentials', 'MismatchSenderId', 'MessageTooBig', 'DeviceNotRegistered'])(
    'stops retrying permanent %s receipt errors',
    async (code) => {
      const { input, transport } = setup()
      const first = await advanceReminderDelivery(input)
      transport.receipts.mockResolvedValue({ 'receipt-1': { status: 'error', code } })
      const second = await advanceReminderDelivery({
        ...input,
        saved: first.state,
        now: now + RECEIPT_WAIT_MS,
      })
      expect(second.complete).toBe(true)
      expect(second.state.devices[0]).toMatchObject({ status: 'failed', error: code })
      expect(transport.send).toHaveBeenCalledTimes(1)
      if (code === 'DeviceNotRegistered')
        expect(second.deadTokens).toEqual([{ id: token.id, attemptedAt: now }])
    },
  )
  it('re-polls missing receipts and ends unknown without duplicate send', async () => {
    const { input, transport } = setup()
    const first = await advanceReminderDelivery(input)
    const waiting = await advanceReminderDelivery({
      ...input,
      saved: first.state,
      now: now + RECEIPT_WAIT_MS,
    })
    expect(waiting.complete).toBe(false)
    const last = await advanceReminderDelivery({
      ...input,
      saved: waiting.state,
      now: now + 20 * 60_000,
    })
    expect(last.state.devices[0].status).toBe('unknown')
    expect(last.complete).toBe(true)
    expect(transport.send).toHaveBeenCalledTimes(1)
  })
  it('bounds repeated transient failures', async () => {
    const { input, transport } = setup()
    transport.send.mockResolvedValue([{ status: 'error', code: 'ProviderUnavailable' }])
    let saved: ReminderDeliveryState | null = null
    let at = now
    for (let i = 0; i < 6; i++) {
      const step = await advanceReminderDelivery({ ...input, saved, now: at })
      saved = step.state
      at = step.nextAt.getTime()
    }
    expect(transport.send).toHaveBeenCalledTimes(5)
    expect(saved!.devices[0].status).toBe('failed')
  })
  it('still polls receipts while quiet hours suppress new sends', async () => {
    const { input, transport } = setup()
    const first = await advanceReminderDelivery(input)
    transport.receipts.mockResolvedValue({ 'receipt-1': { status: 'ok' } })
    const last = await advanceReminderDelivery({
      ...input,
      saved: first.state,
      now: now + RECEIPT_WAIT_MS,
      canSend: false,
    })
    expect(last.complete).toBe(true)
    expect(transport.send).toHaveBeenCalledTimes(1)
  })
  it('does not send at or after kickoff', async () => {
    const { input, transport } = setup()
    await advanceReminderDelivery({ ...input, now: date.getTime() })
    expect(transport.send).not.toHaveBeenCalled()
  })
  it('drains late receipts after kickoff without sending again', async () => {
    const { input, transport } = setup()
    const first = await advanceReminderDelivery({ ...input, now: date.getTime() - 5 * 60_000 })
    transport.receipts.mockResolvedValue({ 'receipt-1': { status: 'ok' } })
    const last = await advanceReminderDelivery({
      ...input,
      saved: first.state,
      now: date.getTime() + 10 * 60_000,
    })
    expect(last.complete).toBe(true)
    expect(last.state.devices[0].status).toBe('accepted')
    expect(transport.send).toHaveBeenCalledTimes(1)
  })
  it.each(['UnknownAcceptance', 'MalformedResponse'])(
    'does not retry an ambiguous %s send',
    async (code) => {
      const { input, transport } = setup()
      transport.send.mockResolvedValue([{ status: 'error', code }])
      const first = await advanceReminderDelivery(input)
      expect(first.state.devices[0].status).toBe('unknown')
      await advanceReminderDelivery({ ...input, saved: first.state, now: now + 60_000 })
      expect(transport.send).toHaveBeenCalledTimes(1)
    },
  )
  it('discards a removed/transferred device and does not poll its receipt', async () => {
    const { input, transport } = setup()
    const first = await advanceReminderDelivery(input)
    await advanceReminderDelivery({
      ...input,
      saved: first.state,
      tokens: [],
      now: now + RECEIPT_WAIT_MS,
    })
    expect(transport.receipts).not.toHaveBeenCalled()
    expect(transport.send).toHaveBeenCalledTimes(1)
  })
  it('starts a new delivery generation after a kickoff change', async () => {
    const { input, transport } = setup()
    const first = await advanceReminderDelivery(input)
    await advanceReminderDelivery({
      ...input,
      saved: first.state,
      eventDate: new Date(date.getTime() + 3600_000),
    })
    expect(transport.send).toHaveBeenCalledTimes(2)
  })
})
