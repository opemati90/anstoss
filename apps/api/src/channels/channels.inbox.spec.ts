import { ForbiddenException } from '@nestjs/common'
import { ChannelsService } from './channels.service'
import { CHAT_FAKE_SCHEMA, FakePrisma } from '../test-utils/fake-prisma'

const d = (iso: string) => new Date(iso)
const active = { status: 'ACTIVE', phase: 'FULL', loanEndDate: null }

function channel(id: string, kind: string, teamId: string | null, visibility = 'MEMBERS') {
  return {
    id,
    clubId: 'club-1',
    teamId,
    slug:
      kind === 'CUSTOM'
        ? id
        : teamId
          ? ({ TEAM: 'team', ANNOUNCEMENTS: 'announcements', COACHES: 'coaches', PARENTS: 'parents' } as Record<string, string>)[kind]
          : ({ CLUB_NEWS: 'news', ANNOUNCEMENTS: 'announcements', COACHES: 'staff' } as Record<string, string>)[kind],
    kind,
    name: id,
    description: null,
    visibility,
    createdAt: d('2026-09-01T00:00:00Z'),
    updatedAt: d('2026-09-01T00:00:00Z'),
  }
}

function make(role = 'COACH') {
  const prisma = new FakePrisma(CHAT_FAKE_SCHEMA, {
    user: [{ id: 'u-2', name: 'Tim Weber' }],
    membership: [{ id: 'm', userId: 'coach', clubId: 'club-1', role, createdAt: d('2026-01-01') }],
    team: [
      { id: 'team-herren', clubId: 'club-1', ageGroup: 'Herren', displayName: 'Herren I', name: 'Herren I' },
      { id: 'team-u13', clubId: 'club-1', ageGroup: 'U13', displayName: 'U13', name: 'U13' },
      { id: 'team-other', clubId: 'club-1', ageGroup: 'U17', displayName: 'U17', name: 'U17' },
      { id: 'team-foreign', clubId: 'club-2', ageGroup: 'Herren', displayName: 'X', name: 'X' },
    ],
    teamAccess: [
      { id: 'a1', userId: 'coach', clubId: 'club-1', teamId: 'team-herren', role: 'HEAD_COACH', ...active, createdAt: d('2026-01-01') },
      { id: 'a2', userId: 'coach', clubId: 'club-1', teamId: 'team-u13', role: 'ASSISTANT_COACH', ...active, createdAt: d('2026-01-01') },
    ],
    guardianRelationship: [],
    channel: [
      channel('club-news', 'CLUB_NEWS', null),
      channel('club-ann', 'ANNOUNCEMENTS', null), // empty → hidden in inbox
      channel('club-staff', 'COACHES', null, 'COACHES_ONLY'),
      channel('h-team', 'TEAM', 'team-herren'),
      channel('h-announcements', 'ANNOUNCEMENTS', 'team-herren'),
      channel('h-coaches', 'COACHES', 'team-herren', 'COACHES_ONLY'),
      channel('h-parents', 'PARENTS', 'team-herren', 'PARENTS_ONLY'), // adult + empty → hidden
      channel('h-group', 'CUSTOM', 'team-herren'),
      channel('h-group-not-member', 'CUSTOM', 'team-herren'),
      channel('u-team', 'TEAM', 'team-u13'),
      channel('u-parents', 'PARENTS', 'team-u13', 'PARENTS_ONLY'),
      channel('u-announcements', 'ANNOUNCEMENTS', 'team-u13'),
      channel('u-coaches', 'COACHES', 'team-u13', 'COACHES_ONLY'),
      channel('x-group', 'CUSTOM', 'team-other'),
      // Another club's channel must never leak in.
      { ...channel('foreign', 'TEAM', 'team-foreign'), clubId: 'club-2' },
    ],
    channelMember: [
      { id: 'cm1', channelId: 'h-group', userId: 'coach', muted: false, mutedUntil: null, createdAt: d('2026-03-01') },
      { id: 'cm2', channelId: 'x-group', userId: 'coach', muted: false, mutedUntil: null, createdAt: d('2026-03-01') },
      { id: 'cm3', channelId: 'h-team', userId: 'coach', muted: true, mutedUntil: null, createdAt: d('2026-03-01') },
    ],
    message: [
      { id: 'm-news', channelId: 'club-news', senderId: 'u-2', content: 'Sommerfest', messageType: 'TEXT', deletedAt: null, createdAt: d('2026-09-20T10:00:00Z') },
      { id: 'm-h', channelId: 'h-team', senderId: 'u-2', content: 'Bin dabei', messageType: 'TEXT', deletedAt: null, createdAt: d('2026-09-22T10:00:00Z') },
    ],
  })
  prisma.queryRawResult = [{ channelId: 'h-team', count: 2 }]
  const teams = { assertReadableAccess: jest.fn() }
  return {
    prisma,
    service: new ChannelsService(prisma as never, teams as never, { emit: jest.fn() } as never),
  }
}

describe('ChannelsService.listInboxChannels', () => {
  it('lists each channel once, hides all Coming Soon parent channels, empty club announcements and foreign clubs', async () => {
    const { service } = make()
    const ids = (await service.listInboxChannels('coach', 'club-1')).map((c) => c.id).sort()
    expect(ids).toEqual(
      [
        'club-news',
        'club-staff',
        'h-announcements',
        'h-coaches',
        'h-group',
        'h-team',
        'u-announcements',
        'u-coaches',
        'u-team',
      ].sort(),
    )
  })

  it('carries unread, mute, team name and the raw last message', async () => {
    const { service } = make()
    const channels = await service.listInboxChannels('coach', 'club-1')
    const team = channels.find((c) => c.id === 'h-team')!
    expect(team).toMatchObject({
      unreadCount: 2,
      muted: true,
      teamName: 'Herren I',
      lastMessageRaw: { senderName: 'Tim Weber', content: 'Bin dabei', type: 'TEXT' },
    })
  })

  it('does not run per-team access checks (one pass, H4)', async () => {
    const { service, prisma } = make()
    await service.listInboxChannels('coach', 'club-1')
    const channelReads = prisma.calls.filter((c) => c.model === 'channel' && c.op === 'findMany')
    // provisioning reads (2 teams + club) + one listing read
    expect(channelReads.length).toBe(4)
    const before = prisma.calls.length
    await service.listInboxChannels('coach', 'club-1')
    const second = prisma.calls.slice(before).filter((c) => c.model === 'channel')
    expect(second).toHaveLength(1)
  })

  it('a player (not club manager) does not see a group on a team they are not on', async () => {
    const { service, prisma } = make('PLAYER')
    const ids = (await service.listInboxChannels('coach', 'club-1')).map((c) => c.id)
    expect(ids).not.toContain('x-group')
    expect(ids).toContain('h-group')
    void prisma
  })

  it('rejects non-members of the club', async () => {
    const { service } = make()
    await expect(service.listInboxChannels('x', 'club-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })
})
