/**
 * M5: pins belong to their channel. Where-matching data so a team-scoped
 * unpin (the old bug) would visibly unpin another channel's message.
 */
import { ForbiddenException } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { CHAT_FAKE_SCHEMA, FakePrisma } from '../test-utils/fake-prisma'

function build(access: Record<string, { canRead: boolean; isManager: boolean }>) {
  const prisma = new FakePrisma(CHAT_FAKE_SCHEMA, {
    message: [
      { id: 'team-pin', teamId: 'team-1', channelId: 'ch-team', isPinned: true, deletedAt: null, createdAt: new Date('2026-09-01') },
      { id: 'coach-msg', teamId: 'team-1', channelId: 'ch-coaches', isPinned: false, deletedAt: null, createdAt: new Date('2026-09-02') },
      { id: 'coach-old-pin', teamId: 'team-1', channelId: 'ch-coaches', isPinned: true, deletedAt: null, createdAt: new Date('2026-08-01') },
    ],
    user: [],
  })
  const channels = {
    getChannelAccess: jest.fn(async (_u: string, channelId: string) => ({
      ...(access[channelId] ?? { canRead: false, isManager: false }),
      channel: { id: channelId, clubId: 'club-1', teamId: 'team-1' },
    })),
  }
  const ageGate = { assertAllowed: jest.fn().mockResolvedValue(undefined) }
  const service = new MessagesService(prisma as never, { assertManageAccess: jest.fn() } as never, channels as never, ageGate as never)
  return { prisma, service, ageGate }
}

describe('MessagesService pins (M5)', () => {
  it('pinning in one channel replaces only that channel’s pin', async () => {
    const { prisma, service, ageGate } = build({ 'ch-coaches': { canRead: true, isManager: true } })
    await service.pinMessage('coach-msg', 'team-1', 'coach')
    const pinned = prisma.rows('message').filter((m) => m.isPinned).map((m) => m.id).sort()
    expect(pinned).toEqual(['coach-msg', 'team-pin'])
    expect(ageGate.assertAllowed).toHaveBeenCalledWith('coach', { clubId: 'club-1', teamId: 'team-1' })
  })

  it('a reader who is not a manager of the channel cannot pin', async () => {
    const { service } = build({ 'ch-coaches': { canRead: true, isManager: false } })
    await expect(service.pinMessage('coach-msg', 'team-1', 'player')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('returns the pin of the requested readable channel only', async () => {
    const { service } = build({ 'ch-team': { canRead: true, isManager: false } })
    await expect(service.getPinnedMessage('team-1', 'player', 'ch-team')).resolves.toMatchObject({ id: 'team-pin' })
    // Coaches channel is not readable for this user; no channel → no pin.
    await expect(service.getPinnedMessage('team-1', 'player', 'ch-coaches')).resolves.toBeNull()
    await expect(service.getPinnedMessage('team-1', 'player')).resolves.toBeNull()
  })
})
