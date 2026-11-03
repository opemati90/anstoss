import {
  createGroupChannelSchema,
  sendDirectMessageSchema,
  updateChatMuteSchema,
  privateMediaPublishSchema,
  privateMediaReserveSchema,
  privateMediaStatusSchema,
} from './chat'

describe('privateMediaStatusSchema', () => {
  it('accepts the bounded client status projection', () => {
    expect(privateMediaStatusSchema.safeParse({ id: 'upload', status: 'PROCESSING', expiresAt: '2026-10-27T12:00:00.000Z' }).success).toBe(true)
  })
  it.each([{ operationId: 'secret' }, { objectKey: 'private-key' }, { uploadId: 'provider-session' },
    { status: 'FINALIZING' }, { expiresAt: 'invalid' }])('rejects internals/invalid status %j', (change) => {
    expect(privateMediaStatusSchema.safeParse({ id: 'upload', status: 'PROCESSING', expiresAt: '2026-10-27T12:00:00.000Z', ...change }).success).toBe(false)
  })
})

describe('privateMediaReserveSchema', () => {
  const requestId = '2f36b5df-8364-4e6f-a082-0f0272819351'
  it.each([
    ['IMAGE', 'image/png', 10], ['VIDEO', 'video/mp4', 100],
    ['VOICE', 'audio/mp4', 25], ['FILE', 'application/pdf', 25],
  ])('enforces the %s size boundary', (messageType, contentType, megabytes) => {
    const expectedBytes = Number(megabytes) * 1024 * 1024
    expect(privateMediaReserveSchema.safeParse({ requestId, messageType, contentType, expectedBytes }).success).toBe(true)
    expect(privateMediaReserveSchema.safeParse({ requestId, messageType, contentType, expectedBytes: expectedBytes + 1 }).success).toBe(false)
  })

  it.each([
    { expectedBytes: 0 }, { expectedBytes: -1 }, { expectedBytes: 1.5 }, { expectedBytes: Infinity },
    { expectedBytes: '42' }, { contentType: 'image/svg+xml' }, { contentType: 'text/html' },
    { contentType: 'application/pdf' }, { messageType: 'TEXT' }, { targetId: 'other' },
    { clubId: 'other' }, { ownerId: 'other' }, { objectKey: 'chosen' }, { state: 'READY' },
    { requestId: 'invalid' }, { requestId: '2F36B5DF-8364-4E6F-A082-0F0272819351' },
  ])('rejects malformed or injected reservation values %j', (change) => {
    expect(privateMediaReserveSchema.safeParse({ requestId, messageType: 'IMAGE', contentType: 'image/png', expectedBytes: 42, ...change }).success).toBe(false)
  })
})

describe('privateMediaPublishSchema', () => {
  it('accepts a bounded reply target and rejects empty or oversized IDs', () => {
    expect(privateMediaPublishSchema.safeParse({ messageType: 'IMAGE', replyToId: 'message-id' }).success).toBe(true)
    expect(privateMediaPublishSchema.safeParse({ messageType: 'IMAGE', replyToId: '' }).success).toBe(false)
    expect(privateMediaPublishSchema.safeParse({ messageType: 'IMAGE', replyToId: 'x'.repeat(201) }).success).toBe(false)
  })
  it('accepts bounded media captions and metadata', () => {
    expect(privateMediaPublishSchema.parse({ messageType: 'IMAGE', content: '  Matchday  ',
      attachmentMeta: { fileName: 'Mannschaft.png', width: 1200, height: 800 } })).toMatchObject({ content: 'Matchday' })
  })

  it.each([
    { messageType: 'TEXT' }, { messageType: 'IMAGE', content: 'x'.repeat(1001) },
    { messageType: 'IMAGE', content: ' '.repeat(1001) },
    { messageType: 'IMAGE', attachmentUrl: 'https://other.invalid/object' },
    { messageType: 'IMAGE', clubId: 'other' },
    { messageType: 'IMAGE', attachmentMeta: { eventId: 'injected' } },
    { messageType: 'IMAGE', attachmentMeta: { fileName: 'x\nsecret' } },
    { messageType: 'IMAGE', attachmentMeta: { fileName: 'x'.repeat(201) } },
    { messageType: 'VOICE', attachmentMeta: { waveform: Array(129).fill(0.5) } },
    { messageType: 'VOICE', attachmentMeta: { durationMs: Infinity } },
    { messageType: 'IMAGE', attachmentMeta: { width: -1 } },
    { messageType: 'IMAGE', attachmentMeta: { sizeBytes: -1 } },
    { messageType: 'IMAGE', attachmentMeta: null },
  ])('rejects invalid or injected fields %j', (input) => {
    expect(privateMediaPublishSchema.safeParse(input).success).toBe(false)
  })
})

describe('updateChatMuteSchema (L6)', () => {
  it('rejects a mutedUntil in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(updateChatMuteSchema.safeParse({ muted: true, mutedUntil: past }).success).toBe(false)
  })

  it('accepts a future mutedUntil, an open-ended mute and an unmute', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString()
    expect(updateChatMuteSchema.safeParse({ muted: true, mutedUntil: future }).success).toBe(true)
    expect(updateChatMuteSchema.safeParse({ muted: true, mutedUntil: null }).success).toBe(true)
    expect(updateChatMuteSchema.safeParse({ muted: false }).success).toBe(true)
  })
})

describe('createGroupChannelSchema (B1)', () => {
  it('needs at least one other member', () => {
    expect(createGroupChannelSchema.safeParse({ name: 'Torwarttraining', teamId: 't' }).success).toBe(false)
    expect(
      createGroupChannelSchema.safeParse({ name: 'Torwarttraining', teamId: 't', memberIds: ['u'] }).success,
    ).toBe(true)
  })
})

describe('sendDirectMessageSchema', () => {
  it('accepts text, media and lineup cards', () => {
    expect(sendDirectMessageSchema.safeParse({ messageType: 'TEXT', content: 'Hallo' }).success).toBe(true)
    expect(
      sendDirectMessageSchema.safeParse({
        messageType: 'IMAGE',
        attachmentUrl: 'https://cdn.example/dm/c/x/image/a.jpg',
        attachmentMeta: { width: 10, height: 10 },
      }).success,
    ).toBe(true)
    expect(
      sendDirectMessageSchema.safeParse({
        messageType: 'LINEUP',
        lineup: { source: 'FORMATION', formation: '4-4-2', slots: [{ position: 'TW', playerName: 'Jonas' }] },
      }).success,
    ).toBe(true)
  })

  it('rejects unknown meta keys, bad formations and oversize cards', () => {
    expect(
      sendDirectMessageSchema.safeParse({
        messageType: 'IMAGE',
        attachmentUrl: 'https://cdn.example/a.jpg',
        attachmentMeta: { eventId: 'smuggled' },
      }).success,
    ).toBe(false)
    expect(
      sendDirectMessageSchema.safeParse({
        messageType: 'LINEUP',
        lineup: { source: 'FORMATION', formation: 'all-out-attack', slots: [{ position: 'ST', playerName: 'x' }] },
      }).success,
    ).toBe(false)
    expect(
      sendDirectMessageSchema.safeParse({
        messageType: 'LINEUP',
        lineup: {
          source: 'FORMATION',
          formation: '4-4-2',
          slots: Array.from({ length: 12 }, () => ({ position: 'ST', playerName: 'x' })),
        },
      }).success,
    ).toBe(false)
    expect(sendDirectMessageSchema.safeParse({ messageType: 'POLL', content: 'x' }).success).toBe(false)
  })
})
