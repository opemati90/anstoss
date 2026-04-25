import { NotFoundException } from '@nestjs/common'
import { PublicService } from './public.service'

describe('PublicService.getClubBySlug', () => {
  it('returns city alongside member + team count', async () => {
    const prisma = {
      club: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'c1',
          name: 'FC Bayern',
          slug: 'fc-bayern',
          badgeUrl: null,
          primaryColor: '#D50000',
          city: 'Munich',
          _count: { memberships: 10, teams: 3 },
        }),
      },
    }

    const svc = new PublicService(
      {} as never,
      {} as never,
      prisma as never,
    )

    const result = await svc.getClubBySlug('fc-bayern')

    expect(result).toEqual({
      id: 'c1',
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: null,
      primaryColor: '#D50000',
      city: 'Munich',
      memberCount: 10,
      teamCount: 3,
    })
  })

  it('throws NotFound when slug missing', async () => {
    const prisma = {
      club: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    const svc = new PublicService({} as never, {} as never, prisma as never)

    await expect(svc.getClubBySlug('nope')).rejects.toBeInstanceOf(NotFoundException)
  })
})
