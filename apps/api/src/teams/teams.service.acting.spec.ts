import { TeamAccessDeniedError } from '@anstoss/shared'
import { TeamsService } from './teams.service'

/**
 * Vorschau und Vertretung: a running stand-in session gives a board member
 * coach-level access to that one team; nothing else changes.
 */
describe('TeamsService acting-session grant', () => {
  function createService(opts: {
    membership?: { role: string; operationalRoles: string[] } | null
    session?: { id: string } | null
  }) {
    const prisma = {
      team: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', clubId: 'c1', group: null }),
      },
      membership: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts.membership === undefined
              ? { role: 'PLAYER', operationalRoles: ['BOARD_MEMBER'] }
              : opts.membership,
          ),
      },
      teamAccess: { findMany: jest.fn().mockResolvedValue([]) },
      actingSession: {
        findFirst: jest.fn().mockResolvedValue(opts.session === undefined ? null : opts.session),
      },
    }
    return { prisma, service: new TeamsService(prisma as never) }
  }

  it('denies event management without a session', async () => {
    const { service } = createService({})
    await expect(service.assertEventManagementAccess('u1', 't1')).rejects.toBeInstanceOf(
      TeamAccessDeniedError,
    )
  })

  it('grants event management and team management while a session runs', async () => {
    const { service, prisma } = createService({ session: { id: 'as1' } })
    await expect(service.assertEventManagementAccess('u1', 't1')).resolves.toMatchObject({
      team: { id: 't1' },
    })
    await expect(service.assertManageAccess('u1', 't1')).resolves.toMatchObject({ team: { id: 't1' } })
    expect(prisma.actingSession.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        actorUserId: 'u1',
        teamId: 't1',
        clubId: 'c1',
        endedAt: null,
        role: 'COACH',
        expiresAt: { gt: expect.any(Date) },
      }),
      select: { id: true },
    })
  })

  it('ignores a session once the actor left the club', async () => {
    const { service, prisma } = createService({ membership: null, session: { id: 'as1' } })
    await expect(service.assertManageAccess('u1', 't1')).rejects.toBeInstanceOf(TeamAccessDeniedError)
    expect(prisma.actingSession.findFirst).not.toHaveBeenCalled()
  })
})
