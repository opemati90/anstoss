import { MembershipRole } from '@anstoss/shared'
import { FussballService } from './fussball.service'

const TEAM_ID = '0123456789ABCDEFGHIJKLMNOPQRSTUV'

function createService(role: MembershipRole = MembershipRole.OWNER) {
  const persistedLink = {
    id: 'link-1',
    clubId: 'club-1',
    teamId: 'team-1',
    provider: 'FUSSBALL_PUBLIC_PAGE',
    externalTeamId: TEAM_ID,
    externalClubId: null,
    externalUrl: `https://next.fussball.de/mannschaft/-/${TEAM_ID}`,
    label: 'FUSSBALL.DE · 01234567',
    status: 'ACTIVE',
    lastSyncedAt: null,
    createdAt: new Date('2026-08-26T12:00:00.000Z'),
    updatedAt: new Date('2026-08-26T12:00:00.000Z'),
  }
  const prisma = {
    externalTeamLink: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(persistedLink),
      update: jest.fn(),
    },
  }
  const teamsService = {
    assertManageAccess: jest.fn().mockResolvedValue({
      team: { id: 'team-1', clubId: 'club-1' },
      membership: { role },
    }),
    assertReadableAccess: jest.fn(),
  }
  const provider = {
    fetchTeamPage: jest.fn(),
    fetchTeamRoster: jest.fn(),
  }
  const scraper = {
    isAvailable: jest.fn().mockReturnValue(false),
    isConfigured: jest.fn().mockReturnValue(true),
  }
  const service = new FussballService(
    prisma as never,
    teamsService as never,
    provider as never,
    scraper as never,
    {} as never,
    {} as never,
  )

  return { persistedLink, prisma, provider, service }
}

describe('FussballService public team-page references', () => {
  beforeEach(() => {
    delete process.env.FUSSBALL_LICENSED_FEED_ENABLED
  })

  it('keeps an official public URL without fetching its contents', async () => {
    const { provider, service } = createService()

    await expect(
      service.previewTeamLink(
        `https://www.fussball.de/mannschaft/example/-/saison/2627/team-id/${TEAM_ID}`,
      ),
    ).resolves.toMatchObject({
      provider: 'fussball_public_page',
      externalTeamId: TEAM_ID,
      externalUrl: `https://www.fussball.de/mannschaft/example/-/saison/2627/team-id/${TEAM_ID}`,
      competition: null,
      pitchAddress: null,
      sourceConfidence: 'unofficial_public',
    })

    expect(provider.fetchTeamPage).not.toHaveBeenCalled()
  })

  it.each([
    ['DFB.DE', 'https://www.dfb.de/vereine/example-team'],
    ['FUPA', 'https://www.fupa.net/team/example-team'],
  ])('accepts a direct %s reference without ingestion', async (brand, url) => {
    process.env.FUSSBALL_LICENSED_FEED_ENABLED = 'true'
    const { provider, service } = createService()

    await expect(service.previewTeamLink(url)).resolves.toMatchObject({
      provider: 'fussball_public_page',
      externalUrl: url,
      label: `${brand} · official team page`,
    })
    expect(provider.fetchTeamPage).not.toHaveBeenCalled()
  })

  it('rejects a lookalike host even when its path contains a valid team id', async () => {
    const { service } = createService()

    await expect(
      service.previewTeamLink(`https://fussball.de.attacker.example/team/${TEAM_ID}`),
    ).rejects.toThrow('Paste a direct HTTPS team link')
  })

  it('stores a public reference without syncing fixtures or importing a roster', async () => {
    const { prisma, provider, service } = createService()

    await expect(
      service.createTeamLink('owner-1', 'club-1', {
        teamId: 'team-1',
        input: `https://next.fussball.de/mannschaft/-/${TEAM_ID}`,
      }),
    ).resolves.toEqual({
      link: expect.objectContaining({
        provider: 'fussball_public_page',
        externalTeamId: TEAM_ID,
        capabilities: { canManualSync: false, canImportRoster: false },
      }),
      sync: null,
    })

    expect(prisma.externalTeamLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'FUSSBALL_PUBLIC_PAGE',
        externalTeamId: TEAM_ID,
      }),
    })
    expect(provider.fetchTeamPage).not.toHaveBeenCalled()
    expect(provider.fetchTeamRoster).not.toHaveBeenCalled()
  })

  it('keeps ingestion disabled even for historical provider rows', async () => {
    const { persistedLink, prisma, service } = createService()
    prisma.externalTeamLink.findMany.mockResolvedValue([
      { ...persistedLink, provider: 'API_FUSSBALL' },
      { ...persistedLink, id: 'link-2', provider: 'LICENSED_FEED' },
    ])

    await expect(service.listTeamLinks('owner-1', 'team-1')).resolves.toEqual([
      expect.objectContaining({
        capabilities: { canManualSync: false, canImportRoster: false },
      }),
      expect.objectContaining({
        capabilities: { canManualSync: false, canImportRoster: false },
      }),
    ])

  })

  it('lets a club admin save a reference without changing semantics when licensed ingestion is enabled', async () => {
    process.env.FUSSBALL_LICENSED_FEED_ENABLED = 'true'
    const { prisma, provider, service } = createService(MembershipRole.ADMIN)

    await expect(
      service.createTeamLink('admin-1', 'club-1', {
        teamId: 'team-1',
        input: `https://www.fussball.de/mannschaft/example/-/saison/2627/team-id/${TEAM_ID}`,
      }),
    ).resolves.toEqual({
      link: expect.objectContaining({ provider: 'fussball_public_page' }),
      sync: null,
    })

    expect(prisma.externalTeamLink.create).toHaveBeenCalledTimes(1)
    expect(provider.fetchTeamPage).not.toHaveBeenCalled()
    expect(provider.fetchTeamRoster).not.toHaveBeenCalled()
  })

  it('does not let a coach manage the club official link', async () => {
    const { prisma, service } = createService(MembershipRole.COACH)

    await expect(
      service.createTeamLink('coach-1', 'club-1', {
        teamId: 'team-1',
        input: `https://www.fussball.de/mannschaft/example/-/saison/2627/team-id/${TEAM_ID}`,
      }),
    ).rejects.toThrow('Only a club owner or admin')

    expect(prisma.externalTeamLink.create).not.toHaveBeenCalled()
  })

  it('does not let a coach trigger a historical licensed sync', async () => {
    process.env.FUSSBALL_LICENSED_FEED_ENABLED = 'true'
    const { persistedLink, prisma, provider, service } = createService(MembershipRole.COACH)
    prisma.externalTeamLink.findFirst.mockResolvedValue({
      ...persistedLink,
      provider: 'API_FUSSBALL',
    })

    await expect(service.syncTeamLink('coach-1', 'club-1', 'link-1')).rejects.toThrow(
      'Only a club owner or admin',
    )
    expect(provider.fetchTeamPage).not.toHaveBeenCalled()
  })

  it('rejects a mismatched club scope before persisting the reference', async () => {
    const { prisma, service } = createService()

    await expect(
      service.createTeamLink('owner-1', 'different-club', {
        teamId: 'team-1',
        input: `https://www.fussball.de/mannschaft/example/-/saison/2627/team-id/${TEAM_ID}`,
      }),
    ).rejects.toThrow('X-Club-Id must match the active club')
    expect(prisma.externalTeamLink.create).not.toHaveBeenCalled()
  })

  it('never derives roster data from a public-page reference', async () => {
    const { persistedLink, prisma, provider, service } = createService()
    prisma.externalTeamLink.findFirst.mockResolvedValue(persistedLink)

    await expect(service.fetchRosterFromTeamLink('owner-1', 'link-1')).resolves.toEqual(
      expect.objectContaining({ players: [], rawCount: 0, source: 'empty' }),
    )
    expect(provider.fetchTeamRoster).not.toHaveBeenCalled()
  })
})
