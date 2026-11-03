/** Default launch capabilities: no future-capabilities import. */
import { ForbiddenException } from '@nestjs/common'
import { DmService } from './dm.service'
import { CHAT_FAKE_SCHEMA, FakePrisma, yearsAgo } from '../test-utils/fake-prisma'

function fixture(dob: Date | null, membershipRole = 'PLAYER', teamAccess: Array<Record<string, unknown>> = []) {
  const prisma = new FakePrisma(CHAT_FAKE_SCHEMA, {
    user: [
      { id: 'viewer', dateOfBirth: dob, deletedAt: null },
      { id: 'peer', dateOfBirth: yearsAgo(30), deletedAt: null },
    ],
    membership: [{ id: 'm1', userId: 'viewer', clubId: 'club', role: membershipRole }],
    teamAccess,
    conversation: [{ id: 'conversation', clubId: 'club' }],
    conversationParticipant: [
      { id: 'p1', userId: 'viewer', conversationId: 'conversation' },
      { id: 'p2', userId: 'peer', conversationId: 'conversation' },
    ],
  })
  return { prisma, service: new DmService(prisma as never, {} as never) }
}

describe('private DM media read: adult-launch access', () => {
  it.each([null, yearsAgo(17)])('rejects an unknown-age or underage reader', async (dob) => {
    const { service, prisma } = fixture(dob)
    await expect(service.authorizePrivateMediaRead('viewer', 'club', 'conversation', prisma as never))
      .rejects.toBeInstanceOf(ForbiddenException)
  })

  it('does not grant an adult guardian-only membership a read capability', async () => {
    const { service, prisma } = fixture(yearsAgo(30), 'PARENT')
    await expect(service.authorizePrivateMediaRead('viewer', 'club', 'conversation', prisma as never))
      .rejects.toBeInstanceOf(ForbiddenException)
  })

  it('allows a guardian who also has independent active full player access', async () => {
    const access = [{ id: 't1', userId: 'viewer', clubId: 'club', teamId: 'team', role: 'PLAYER', phase: 'FULL', status: 'ACTIVE', loanEndDate: null }]
    const { service, prisma } = fixture(yearsAgo(30), 'PARENT', access)
    await expect(service.authorizePrivateMediaRead('viewer', 'club', 'conversation', prisma as never))
      .resolves.toEqual({ userId: 'viewer', clubId: 'club', targetType: 'DM', targetId: 'conversation' })
  })
})
