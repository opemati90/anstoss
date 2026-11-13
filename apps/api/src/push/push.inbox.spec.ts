import { PushService } from './push.service'

/**
 * Inbox side-record of pushes: written for inbox-worthy templates even when
 * the push itself is held back by a mute or quiet hours; never for chat.
 */
describe('PushService → inbox', () => {
  function build() {
    const prisma = {
      teamAccess: {
        findMany: jest.fn().mockResolvedValue([
          { userId: 'coach', clubId: 'c1' },
          { userId: 'p1', clubId: 'c1' },
          { userId: 'p2', clubId: 'c1' },
        ]),
      },
      pushToken: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ preferredLanguage: 'de' }) },
      notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const notifications = {
      getMutedUserIds: jest.fn().mockResolvedValue(new Set(['p2'])),
      isInQuietHours: jest.fn().mockResolvedValue(true),
      isMuted: jest.fn().mockResolvedValue(true),
    }
    const inbox = { record: jest.fn().mockResolvedValue(undefined) }
    const service = new PushService(prisma as never, notifications, undefined, inbox as never)
    return { service, inbox }
  }

  it('records a user template push even when the user is in quiet hours', async () => {
    const { service, inbox } = build()
    await service.sendToUserLocalized(
      'admin',
      'JOIN_REQUEST',
      { userName: 'Paul', clubName: 'SV' },
      { type: 'join_request', clubId: 'c1', requestId: 'r1' },
      { clubId: 'c1' },
    )
    expect(inbox.record).toHaveBeenCalledWith(
      ['admin'],
      expect.objectContaining({ kind: 'template', type: 'JOIN_REQUEST', clubId: 'c1' }),
    )
  })

  it('does not record chat pushes', async () => {
    const { service, inbox } = build()
    await service.sendToUserLocalized('p1', 'DM_MESSAGE' as never, { senderName: 'A', preview: 'hi' } as never)
    expect(inbox.record).not.toHaveBeenCalled()
  })

  it('records a team template push for every active member except the sender, muted ones included', async () => {
    const { service, inbox } = build()
    await service.sendToTeamLocalized(
      't1',
      'FULL_TIME',
      { scoreline: 'SV 2:1 RW' },
      { eventId: 'e1' },
      'coach',
      { clubId: 'c1', category: 'events' },
    )
    expect(inbox.record).toHaveBeenCalledWith(
      ['p1', 'p2'],
      expect.objectContaining({ type: 'FULL_TIME', teamId: 't1', clubId: 'c1' }),
    )
  })

  it('records a rendered team push only when an inbox type is given', async () => {
    const { service, inbox } = build()
    const render = () => ({ title: 'T', body: 'B' })
    await service.sendToTeamRendered('t1', render, { fixtureId: 'f1' }, undefined, { clubId: 'c1' })
    expect(inbox.record).not.toHaveBeenCalled()
    await service.sendToTeamRendered('t1', render, { fixtureId: 'f1' }, undefined, {
      clubId: 'c1',
      inboxType: 'FIXTURE_CHANGED',
    })
    expect(inbox.record).toHaveBeenCalledWith(
      ['coach', 'p1', 'p2'],
      expect.objectContaining({ kind: 'rendered', type: 'FIXTURE_CHANGED' }),
    )
  })
})
