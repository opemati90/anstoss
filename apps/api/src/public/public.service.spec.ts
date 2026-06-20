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
          directoryEntry: null,
          _count: { memberships: 10, teams: 3 },
        }),
      },
      clubDirectoryEntry: {
        findUnique: jest.fn(),
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
      activeClubId: 'c1',
      directoryEntryId: null,
      name: 'FC Bayern',
      slug: 'fc-bayern',
      badgeUrl: null,
      primaryColor: '#D50000',
      city: 'Munich',
      state: null,
      association: null,
      source: 'ANSTOSS',
      isActive: true,
      memberCount: 10,
      teamCount: 3,
    })
  })

  it('returns a directory club preview when no active club exists', async () => {
    const prisma = {
      club: { findUnique: jest.fn().mockResolvedValue(null) },
      clubDirectoryEntry: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dir1',
          activeClubId: null,
          source: 'FUSSBALL_DE',
          name: 'SV Directory',
          slug: 'sv-directory',
          badgeUrl: null,
          primaryColor: '#1A1A18',
          city: 'Berlin',
          state: 'BE',
          association: 'Berliner FV',
          activeClub: null,
        }),
      },
    }

    const svc = new PublicService(
      {} as never,
      {} as never,
      prisma as never,
    )

    const result = await svc.getClubBySlug('sv-directory')

    expect(result).toEqual({
      id: 'dir1',
      activeClubId: null,
      directoryEntryId: 'dir1',
      name: 'SV Directory',
      slug: 'sv-directory',
      badgeUrl: null,
      primaryColor: '#1A1A18',
      city: 'Berlin',
      state: 'BE',
      association: 'Berliner FV',
      source: 'FUSSBALL_DE',
      isActive: false,
      memberCount: 0,
      teamCount: 0,
    })
  })

  it('resolves linked directory slugs to the active club preview', async () => {
    const prisma = {
      club: { findUnique: jest.fn().mockResolvedValue(null) },
      clubDirectoryEntry: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dir1',
          activeClubId: 'c1',
          source: 'FUSSBALL_DE',
          name: 'SV Directory',
          slug: 'sv-directory-berlin',
          badgeUrl: null,
          primaryColor: '#1A1A18',
          city: 'Berlin',
          state: 'BE',
          association: 'Berliner FV',
          activeClub: {
            id: 'c1',
            name: 'SV Directory',
            slug: 'sv-directory-berlin',
            badgeUrl: null,
            primaryColor: '#1A1A18',
            city: 'Berlin',
            directoryEntry: {
              id: 'dir1',
              state: 'BE',
              association: 'Berliner FV',
            },
            _count: { memberships: 2, teams: 1 },
          },
        }),
      },
    }

    const svc = new PublicService(
      {} as never,
      {} as never,
      prisma as never,
    )

    const result = await svc.getClubBySlug('sv-directory-berlin')

    expect(result).toEqual({
      id: 'c1',
      activeClubId: 'c1',
      directoryEntryId: 'dir1',
      name: 'SV Directory',
      slug: 'sv-directory-berlin',
      badgeUrl: null,
      primaryColor: '#1A1A18',
      city: 'Berlin',
      state: 'BE',
      association: 'Berliner FV',
      source: 'ANSTOSS',
      isActive: true,
      memberCount: 2,
      teamCount: 1,
    })
  })

  it('throws NotFound when slug missing', async () => {
    const prisma = {
      club: { findUnique: jest.fn().mockResolvedValue(null) },
      clubDirectoryEntry: { findUnique: jest.fn().mockResolvedValue(null) },
    }
    const svc = new PublicService({} as never, {} as never, prisma as never)

    await expect(svc.getClubBySlug('nope')).rejects.toBeInstanceOf(NotFoundException)
  })
})
