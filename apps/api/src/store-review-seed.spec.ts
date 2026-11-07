import type { Prisma } from '@prisma/client'
import { inspectStoreReviewFixture } from '../prisma/seed-store-review'

function fixture() {
  const clubId = 'store-review-2026-club'
  const teamId = 'store-review-2026-senior-team'
  const groupId = 'store-review-2026-senior-group'
  const names = ['sofia', 'max', 'tim', 'leo', 'emir']
  const ids = names.map(name => `store-review-2026-${name}`)
  const roles = ['OWNER', 'COACH', 'PLAYER', 'PLAYER', 'PLAYER']
  const teamRoles = ['HEAD_COACH', 'ASSISTANT_COACH', 'PLAYER', 'PLAYER', 'PLAYER']
  const users = names.map((name, i) => ({ id: ids[i], email: `${name}@demo.anstoss.app`,
    deletedAt: null as Date | null, platformRole: 'NONE', registrationRole: ['CLUB_ADMIN', 'COACH', 'PLAYER', 'PLAYER', 'PLAYER'][i] }))
  const events = ['training', 'match'].map(name => ({ id: `store-review-2026-${name}`, clubId, teamId,
    type: name.toUpperCase(), archivedAt: null as Date | null, cancelledAt: null as Date | null }))
  const rows = (data: unknown[]) => ({ findMany: jest.fn().mockResolvedValue(data) })
  const tx = {
    club: rows([{ id: clubId, slug: 'fc-musterstadt-review' }]), user: rows(users),
    team: rows([{ id: teamId, clubId, groupId }]), teamGroup: rows([{ id: groupId, clubId }]),
    membership: rows(ids.map((userId, i) => ({ userId, clubId, role: roles[i] }))),
    teamAccess: rows(ids.map((userId, i) => ({ userId, clubId, teamId, role: teamRoles[i], status: 'ACTIVE', phase: 'FULL' }))),
    teamMember: rows(ids.slice(2).map(userId => ({ userId, teamId }))), event: rows(events),
    channel: rows([{ id: 'store-review-2026-team-chat', clubId, teamId, kind: 'TEAM', visibility: 'MEMBERS' },
      { id: 'store-review-2026-announcements', clubId, teamId, kind: 'ANNOUNCEMENTS', visibility: 'MEMBERS' }]),
    message: rows([{ id: 'store-review-2026-welcome', clubId, teamId, channelId: 'store-review-2026-announcements', senderId: ids[0], deletedAt: null }]),
    rsvp: rows(ids.slice(2).map((userId, i) => ({ userId, status: ['YES', 'MAYBE', 'NO'][i] }))),
  }
  return { tx: tx as unknown as Prisma.TransactionClient, events, users }
}

describe('store-review event refresh safety', () => {
  it('accepts the complete original fictional fixture', async () => {
    await expect(inspectStoreReviewFixture(fixture().tx)).resolves.toBe('already-seeded')
  })
  it('allows archived fixture events only in the explicit refresh mode', async () => {
    const { tx, events } = fixture()
    events[0].archivedAt = new Date()
    await expect(inspectStoreReviewFixture(tx)).rejects.toThrow('collision or partial state')
    await expect(inspectStoreReviewFixture(tx, true)).resolves.toBe('already-seeded')
  })
  it('still rejects cancelled events', async () => {
    const { tx, events } = fixture()
    events[0].cancelledAt = new Date()
    await expect(inspectStoreReviewFixture(tx, true)).rejects.toThrow('collision or partial state')
  })
  it('never revives a deleted review account', async () => {
    const { tx, users } = fixture()
    users[4].deletedAt = new Date()
    await expect(inspectStoreReviewFixture(tx, true)).rejects.toThrow('collision or partial state')
  })
  it('refuses a fixture user granted platform authority', async () => {
    const { tx, users } = fixture()
    users[0].platformRole = 'SUPER_ADMIN'
    await expect(inspectStoreReviewFixture(tx, true)).rejects.toThrow('collision or partial state')
  })
})
