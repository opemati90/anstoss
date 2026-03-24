import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { MembershipRole } from '@anstoss/shared'
import { UsersService } from './users.service'

describe('UsersService.updateClubMemberRole', () => {
  function createService() {
    const prisma = {
      membership: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      teamAccess: {
        findMany: jest.fn(),
      },
    }

    const service = new UsersService(prisma as never, {} as never)

    return { prisma, service }
  }

  it('allows an owner to promote a member to admin', async () => {
    const { prisma, service } = createService()

    prisma.membership.findUnique
      .mockResolvedValueOnce({
        userId: 'owner-user',
        clubId: 'club-1',
        role: MembershipRole.OWNER,
      })
      .mockResolvedValueOnce({
        userId: 'member-user',
        clubId: 'club-1',
        role: MembershipRole.COACH,
        user: {
          id: 'member-user',
          name: 'Alex Admin',
          email: 'alex@example.com',
          avatarUrl: null,
        },
      })
    prisma.teamAccess.findMany.mockResolvedValue([])
    prisma.membership.update.mockResolvedValue({
      userId: 'member-user',
      clubId: 'club-1',
      role: MembershipRole.ADMIN,
      user: {
        id: 'member-user',
        name: 'Alex Admin',
        email: 'alex@example.com',
        avatarUrl: null,
      },
    })

    const result = await service.updateClubMemberRole(
      'club-1',
      'owner-user',
      'member-user',
      MembershipRole.ADMIN,
    )

    expect(result.role).toBe(MembershipRole.ADMIN)
    expect(prisma.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { role: MembershipRole.ADMIN },
      }),
    )
  })

  it('prevents admins from assigning admin role', async () => {
    const { prisma, service } = createService()

    prisma.membership.findUnique
      .mockResolvedValueOnce({
        userId: 'admin-user',
        clubId: 'club-1',
        role: MembershipRole.ADMIN,
      })
      .mockResolvedValueOnce({
        userId: 'member-user',
        clubId: 'club-1',
        role: MembershipRole.PLAYER,
        user: {
          id: 'member-user',
          name: 'Pat Player',
          email: 'pat@example.com',
          avatarUrl: null,
        },
      })

    await expect(
      service.updateClubMemberRole(
        'club-1',
        'admin-user',
        'member-user',
        MembershipRole.ADMIN,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('blocks demoting an active squad coach into a non-staff role', async () => {
    const { prisma, service } = createService()

    prisma.membership.findUnique
      .mockResolvedValueOnce({
        userId: 'owner-user',
        clubId: 'club-1',
        role: MembershipRole.OWNER,
      })
      .mockResolvedValueOnce({
        userId: 'coach-user',
        clubId: 'club-1',
        role: MembershipRole.COACH,
        user: {
          id: 'coach-user',
          name: 'Casey Coach',
          email: 'casey@example.com',
          avatarUrl: null,
        },
      })
    prisma.teamAccess.findMany.mockResolvedValue([{ id: 'ta_1' }])

    await expect(
      service.updateClubMemberRole(
        'club-1',
        'owner-user',
        'coach-user',
        MembershipRole.PLAYER,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('blocks changing your own role', async () => {
    const { prisma, service } = createService()

    prisma.membership.findUnique
      .mockResolvedValueOnce({
        userId: 'admin-user',
        clubId: 'club-1',
        role: MembershipRole.ADMIN,
      })
      .mockResolvedValueOnce({
        userId: 'admin-user',
        clubId: 'club-1',
        role: MembershipRole.ADMIN,
        user: {
          id: 'admin-user',
          name: 'Ari Admin',
          email: 'ari@example.com',
          avatarUrl: null,
        },
      })

    await expect(
      service.updateClubMemberRole(
        'club-1',
        'admin-user',
        'admin-user',
        MembershipRole.COACH,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
