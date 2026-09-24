import { ForbiddenException } from '@nestjs/common'
import { DmService } from './dm.service'
import { classifyPrivateMessaging } from './private-messaging'

import { yearsAgo } from '../test-utils/fake-prisma'

// L9: DOB fixtures relative to now so they never age across the boundary.
const adultDob = yearsAgo(36)
const minorDob = yearsAgo(12)

function makeService(prisma: any) {
  return new DmService(prisma, { detectAndPersistSource: jest.fn() } as any)
}

describe('classifyPrivateMessaging', () => {
  const adult = { id: 'a', dateOfBirth: adultDob, managedById: null }
  const minor = { id: 'm', dateOfBirth: minorDob, managedById: null }

  it('allows adult pairs and blocks minor pairs (under-16s are group-only)', () => {
    expect(classifyPrivateMessaging(adult, { ...adult, id: 'b' }).kind).toBe('ALLOWED')
    expect(classifyPrivateMessaging(minor, { ...minor, id: 'n' }).kind).toBe('MINOR_BLOCKED')
  })

  it('fails closed without a date of birth', () => {
    expect(classifyPrivateMessaging({ ...adult, dateOfBirth: null }, minor).kind).toBe(
      'AGE_UNVERIFIED',
    )
  })

  it('asks for a guardian link between an adult and a minor', () => {
    expect(classifyPrivateMessaging(minor, adult)).toEqual({
      kind: 'NEEDS_GUARDIAN_LINK',
      adultId: 'a',
      minorId: 'm',
    })
  })

  it('allows the managing account holder', () => {
    expect(classifyPrivateMessaging({ ...minor, managedById: 'a' }, adult).kind).toBe('ALLOWED')
  })
})

describe('DmService.listConversations unread', () => {
  it('uses the real unread count instead of capping at 1', async () => {
    const prisma: any = {
      membership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'm' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      conversationParticipant: {
        findMany: jest.fn().mockResolvedValue([
          {
            conversationId: 'conv-1',
            lastReadAt: new Date('2026-09-20T00:00:00Z'),
            muted: true,
            mutedUntil: null,
            conversation: {
              id: 'conv-1',
              createdAt: new Date('2026-09-01T00:00:00Z'),
              updatedAt: new Date('2026-09-22T00:00:00Z'),
              participants: [
                { userId: 'me', user: { id: 'me', name: 'Ich', avatarUrl: null } },
                { userId: 'peer', user: { id: 'peer', name: 'Tim Weber', avatarUrl: null } },
              ],
              messages: [
                {
                  content: 'Kommst du Samstag?',
                  senderId: 'peer',
                  sender: { name: 'Tim Weber' },
                  createdAt: new Date('2026-09-22T00:00:00Z'),
                },
              ],
            },
          },
        ]),
      },
      userBlock: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{ conversationId: 'conv-1', count: 4 }]),
    }
    const [row] = await makeService(prisma).listConversations('me', 'club-1')
    expect(row.unreadCount).toBe(4)
    expect(row.muted).toBe(true)
    expect(row.lastMessage?.senderName).toBe('Tim Weber')
    // Peer left the club: history stays, writing does not.
    expect(row.peerIsMember).toBe(false)
  })
})

describe('DmService mute + detail', () => {
  function prismaFor(clubId = 'club-1') {
    return {
      membership: { findFirst: jest.fn().mockResolvedValue({ id: 'membership' }) },
      conversationParticipant: {
        findFirst: jest.fn().mockImplementation((query: any) => {
          if (query?.select?.conversation) {
            return Promise.resolve({
              conversation: { clubId, participants: [{ userId: 'me' }, { userId: 'peer' }] },
            })
          }
          return Promise.resolve({ muted: false, mutedUntil: null })
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any
  }

  it('mutes only the caller participant row', async () => {
    const prisma = prismaFor()
    await expect(
      makeService(prisma).setConversationMute('me', 'club-1', 'conv-1', {
        muted: true,
        mutedUntil: '2026-10-01T00:00:00.000Z',
      }),
    ).resolves.toEqual({ muted: true, mutedUntil: '2026-10-01T00:00:00.000Z' })
    expect(prisma.conversationParticipant.updateMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', userId: 'me' },
      data: { muted: true, mutedUntil: new Date('2026-10-01T00:00:00.000Z') },
    })
  })

  it('refuses a conversation addressed through another club', async () => {
    const prisma = prismaFor('club-2')
    await expect(
      makeService(prisma).setConversationMute('me', 'club-1', 'conv-1', { muted: true }),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('DmService.listContacts', () => {
  it('groups by team and disables adult↔minor without a guardian link', async () => {
    const prisma: any = {
      membership: {
        findFirst: jest.fn().mockResolvedValue({ role: 'COACH', club: { name: 'SV Albatros' } }),
        findMany: jest.fn().mockResolvedValue([{ userId: 'admin', role: 'ADMIN' }]),
      },
      teamAccess: {
        findMany: jest.fn().mockImplementation((query: any) => {
          if (query?.where?.userId === 'me') return Promise.resolve([{ teamId: 'team-u13' }])
          return Promise.resolve([
            { teamId: 'team-u13', userId: 'kid', role: 'PLAYER' },
            { teamId: 'team-u13', userId: 'linked-kid', role: 'PLAYER' },
            { teamId: 'team-u13', userId: 'parent', role: 'PARENT' },
            { teamId: 'team-u13', userId: 'me', role: 'HEAD_COACH' },
          ])
        }),
      },
      guardianRelationship: {
        findMany: jest.fn().mockImplementation((query: any) => {
          if (query?.where?.OR) {
            return Promise.resolve([{ parentUserId: 'me', playerUserId: 'linked-kid' }])
          }
          return Promise.resolve([])
        }),
      },
      team: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'team-u13', displayName: 'U13', name: 'U13' }]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'me', name: 'Markus Hoffmann', avatarUrl: null, dateOfBirth: adultDob, managedById: null },
          { id: 'kid', name: 'Ben Schulz', avatarUrl: null, dateOfBirth: minorDob, managedById: null },
          { id: 'linked-kid', name: 'Jonas Hoffmann', avatarUrl: null, dateOfBirth: minorDob, managedById: null },
          { id: 'parent', name: 'Nina Becker', avatarUrl: null, dateOfBirth: adultDob, managedById: null },
          { id: 'admin', name: 'Mara Schulte', avatarUrl: null, dateOfBirth: adultDob, managedById: null },
        ]),
      },
      userBlock: { findMany: jest.fn().mockResolvedValue([]) },
      parentalConsent: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const groups = await makeService(prisma).listContacts('me', 'club-1')
    expect(groups.map((g) => g.teamName)).toEqual(['U13', 'SV Albatros'])
    const u13 = groups[0].contacts
    expect(u13.map((c) => c.userId)).not.toContain('me')
    expect(u13.find((c) => c.userId === 'kid')).toMatchObject({
      canMessage: false,
      reason: 'MINOR_ADULT',
    })
    expect(u13.find((c) => c.userId === 'linked-kid')).toMatchObject({ canMessage: true })
    expect(u13.find((c) => c.userId === 'parent')).toMatchObject({ canMessage: true })
    expect(groups[1]).toMatchObject({ teamId: null, contacts: [{ userId: 'admin' }] })
  })
})

describe('DmService.listContacts for an under-16 caller', () => {
  it('enables only their guardian; teammates and coaches are disabled', async () => {
    const prisma: any = {
      membership: {
        findFirst: jest.fn().mockResolvedValue({ role: 'PLAYER', club: { name: 'SV Albatros' } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      teamAccess: {
        findMany: jest.fn().mockImplementation((query: any) => {
          if (query?.where?.userId === 'kid') return Promise.resolve([{ teamId: 'team-u13' }])
          return Promise.resolve([
            { teamId: 'team-u13', userId: 'mate', role: 'PLAYER' },
            { teamId: 'team-u13', userId: 'coach', role: 'HEAD_COACH' },
            { teamId: 'team-u13', userId: 'mum', role: 'PARENT' },
          ])
        }),
      },
      guardianRelationship: {
        findMany: jest.fn().mockImplementation((query: any) => {
          if (query?.where?.OR) return Promise.resolve([{ parentUserId: 'mum', playerUserId: 'kid' }])
          return Promise.resolve([])
        }),
      },
      team: {
        findMany: jest.fn().mockResolvedValue([{ id: 'team-u13', displayName: 'U13', name: 'U13' }]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'kid', name: 'Ben Schulz', avatarUrl: null, dateOfBirth: minorDob, managedById: null },
          { id: 'mate', name: 'Emil Wagner', avatarUrl: null, dateOfBirth: minorDob, managedById: null },
          { id: 'coach', name: 'Markus Hoffmann', avatarUrl: null, dateOfBirth: adultDob, managedById: null },
          { id: 'mum', name: 'Sabine Schulz', avatarUrl: null, dateOfBirth: adultDob, managedById: null },
        ]),
      },
      userBlock: { findMany: jest.fn().mockResolvedValue([]) },
      parentalConsent: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const [group] = await makeService(prisma).listContacts('kid', 'club-1')
    const byId = new Map(group.contacts.map((c) => [c.userId, c]))
    expect(byId.get('mum')).toMatchObject({ canMessage: true, reason: null })
    // L8: minor↔minor has its own reason, distinct from adult↔minor.
    expect(byId.get('mate')).toMatchObject({ canMessage: false, reason: 'MINOR_MINOR' })
    expect(byId.get('coach')).toMatchObject({ canMessage: false, reason: 'MINOR_ADULT' })
  })
})
