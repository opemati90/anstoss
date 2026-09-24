import {
  createGroupChannelSchema,
  sendDirectMessageSchema,
  updateChatMuteSchema,
} from './chat'

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
