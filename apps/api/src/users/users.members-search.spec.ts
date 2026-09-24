import { MembershipRole } from '@anstoss/shared'
import { UsersService } from './users.service'

// club-admin review fixes (L2): accent-insensitive member search, email for admins.
describe('UsersService.listClubMembersPage search', () => {
  function createService(callerRole: MembershipRole = MembershipRole.ADMIN) {
    const member = (userId: string, name: string, email: string | null = `${userId}@example.com`) => ({
      id: `m-${userId}`,
      userId,
      clubId: 'club-1',
      role: MembershipRole.PLAYER,
      operationalRoles: [],
      user: { id: userId, name, email, avatarUrl: null, teamAccess: [] },
    })
    const prisma = {
      membership: {
        findUnique: jest.fn().mockResolvedValue({ role: callerRole }),
        findMany: jest.fn().mockResolvedValue([
          member('jose', 'José Álvarez'),
          member('mueller', 'Jörg Müller', 'j.mueller@sv-albatros.de'),
          member('gross', 'Lena Groß'),
          member('weber', 'Tim Weber'),
          member('noemail', 'Zoë Noël', null),
        ]),
      },
      teamAccess: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    }
    const service = new UsersService(prisma as never, {} as never, {} as never, {} as never, {} as never)
    return { service }
  }

  async function search(q: string | undefined, role?: MembershipRole) {
    const { service } = createService(role)
    const page = await service.listClubMembersPage('club-1', 'caller', {
      limit: 50,
      offset: 0,
      filter: 'all',
      q,
    })
    return page.items.map((row: any) => row.userId)
  }

  it('ignores accents in names and query (José, Álvarez)', async () => {
    expect(await search('jose')).toEqual(['jose'])
    expect(await search('JOSÉ')).toEqual(['jose'])
    expect(await search('alvarez')).toEqual(['jose'])
  })

  it('matches umlauts plain, with umlaut, and transliterated (Müller/Muller/Mueller)', async () => {
    expect(await search('Müller')).toEqual(['mueller'])
    expect(await search('muller')).toEqual(['mueller'])
    expect(await search('Mueller')).toEqual(['mueller'])
    expect(await search('jorg')).toEqual(['mueller'])
    expect(await search('zoe noel')).toEqual(['noemail'])
  })

  it('matches ß as ss', async () => {
    expect(await search('gross')).toEqual(['gross'])
    expect(await search('Groß')).toEqual(['gross'])
  })

  it('lets admins find members by email', async () => {
    expect(await search('sv-albatros.de')).toEqual(['mueller'])
    expect(await search('weber@example')).toEqual(['weber'])
  })

  it('never matches emails for non-admin callers (emails are nulled)', async () => {
    expect(await search('sv-albatros.de', MembershipRole.PLAYER)).toEqual([])
    expect(await search('müller', MembershipRole.PLAYER)).toEqual(['mueller'])
  })

  it('treats empty and whitespace-only queries as no filter', async () => {
    expect(await search('')).toHaveLength(5)
    expect(await search('   ')).toHaveLength(5)
    expect(await search(undefined)).toHaveLength(5)
  })

  it('returns nothing for a query that matches no one, and survives a null email', async () => {
    expect(await search('xyz')).toEqual([])
  })
})

// club-admin review fixes (H3): offboarding ends the staff activity, so the
// Führungszeugnis is deleted in the same transaction (§72a(5) SGB VIII).
describe('UsersService.offboardClubMember compliance retention', () => {
  it('deletes the Führungszeugnis record inside the offboarding transaction', async () => {
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      membership: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ role: MembershipRole.OWNER, operationalRoles: [] })
          .mockResolvedValueOnce({
            role: MembershipRole.COACH,
            operationalRoles: [],
            user: { id: 'coach-a', name: 'Mara Schulz', email: null, avatarUrl: null },
          }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({
          role: MembershipRole.PLAYER,
          operationalRoles: [],
          user: { id: 'coach-a', name: 'Mara Schulz', email: null, avatarUrl: null },
        }),
      },
      teamAccess: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      complianceRecord: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    }
    const prisma: any = { $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)) }
    const service = new UsersService(prisma as never, {} as never, {} as never, {} as never, {} as never)
    await service.offboardClubMember('club-1', 'owner-1', 'coach-a', { preservePlayerAccess: true })
    expect(tx.complianceRecord.deleteMany).toHaveBeenCalledWith({
      where: { clubId: 'club-1', memberUserId: 'coach-a', kind: 'FUEHRUNGSZEUGNIS' },
    })
    expect(tx.complianceRecord.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.membership.update.mock.invocationCallOrder[0],
    )
  })
})
