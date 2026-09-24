import { TeamAccessPhase, TeamAccessStatus, TeamRole } from '@anstoss/shared'
import {
  countSquadExclusionsByTeam,
  effectiveAbsence,
  isSquadMember,
  SQUAD_ACCESS_COUNT_WHERE,
} from './squad-count'

const NOW = new Date('2026-09-24T12:00:00.000Z')

const base = {
  role: TeamRole.PLAYER,
  phase: TeamAccessPhase.FULL,
  status: TeamAccessStatus.ACTIVE,
  operationalStatus: 'ACTIVE',
}

describe('isSquadMember', () => {
  it('accepts active and new players', () => {
    expect(isSquadMember(base, NOW)).toBe(true)
    expect(isSquadMember({ ...base, operationalStatus: 'NEW_PLAYER' }, NOW)).toBe(true)
    expect(isSquadMember({ ...base, operationalStatus: null }, NOW)).toBe(true)
  })

  it('rejects coaches, trialists, inactive, pending and ended loans', () => {
    expect(isSquadMember({ ...base, role: TeamRole.HEAD_COACH }, NOW)).toBe(false)
    expect(isSquadMember({ ...base, phase: TeamAccessPhase.TRIAL }, NOW)).toBe(false)
    expect(isSquadMember({ ...base, operationalStatus: 'INACTIVE' }, NOW)).toBe(false)
    expect(isSquadMember({ ...base, status: TeamAccessStatus.PENDING }, NOW)).toBe(false)
    expect(isSquadMember({ ...base, loanEndDate: '2026-09-01T00:00:00.000Z' }, NOW)).toBe(false)
    expect(isSquadMember({ ...base, loanEndDate: '2026-12-01T00:00:00.000Z' }, NOW)).toBe(true)
  })
})

describe('countSquadExclusionsByTeam', () => {
  it('subtracts inactive players and ended loans per team in two queries', async () => {
    const prisma = {
      teamMember: {
        findMany: jest.fn().mockResolvedValue([
          { teamId: 'team-1', userId: 'inactive-1' },
          // Inactive in team-2 only: must not reduce team-1.
          { teamId: 'team-2', userId: 'both-teams' },
        ]),
      },
      teamAccess: {
        findMany: jest.fn().mockResolvedValue([
          { teamId: 'team-1', userId: 'inactive-1', loanEndDate: null },
          { teamId: 'team-1', userId: 'both-teams', loanEndDate: null },
          { teamId: 'team-2', userId: 'both-teams', loanEndDate: null },
          { teamId: 'team-1', userId: 'loan-ended', loanEndDate: new Date('2026-09-01') },
        ]),
      },
    }

    const result = await countSquadExclusionsByTeam(prisma, ['team-1', 'team-2', 'team-1'], NOW)

    expect(result.get('team-1')).toBe(2)
    expect(result.get('team-2')).toBe(1)
    expect(prisma.teamMember.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.teamAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teamId: { in: ['team-1', 'team-2'] },
          ...SQUAD_ACCESS_COUNT_WHERE,
        }),
      }),
    )
  })

  it('skips the queries when there are no teams', async () => {
    const prisma = {
      teamMember: { findMany: jest.fn() },
      teamAccess: { findMany: jest.fn() },
    }
    const result = await countSquadExclusionsByTeam(prisma, [], NOW)
    expect(result.size).toBe(0)
    expect(prisma.teamMember.findMany).not.toHaveBeenCalled()
  })
})

// Kader fix L5: a player on an active loan counts for the borrowing team only.
describe('loaned-out players', () => {
  it('isSquadMember rejects a loaned-out player', () => {
    expect(isSquadMember({ ...base, loanedOut: true }, NOW)).toBe(false)
  })

  it('countSquadExclusionsByTeam subtracts players loaned out of the source team', async () => {
    const prisma = {
      teamMember: { findMany: jest.fn().mockResolvedValue([]) },
      teamAccess: {
        findMany: jest.fn().mockImplementation(async ({ where }: any) =>
          where.loanedFromTeamId
            ? [{ teamId: 'team-2', userId: 'loanee', loanedFromTeamId: 'team-1', loanEndDate: null }]
            : [
                // The loanee's own (source) squad row, and the loan row in team-2.
                { teamId: 'team-1', userId: 'loanee', loanEndDate: null },
                { teamId: 'team-2', userId: 'loanee', loanEndDate: null },
              ],
        ),
      },
    }

    const result = await countSquadExclusionsByTeam(prisma, ['team-1', 'team-2'], NOW)

    expect(result.get('team-1')).toBe(1)
    // The borrowing team keeps counting the player.
    expect(result.get('team-2')).toBeUndefined()
  })
})

describe('effectiveAbsence', () => {
  it('passes through a running absence', () => {
    expect(effectiveAbsence('AWAY', new Date('2026-10-01T00:00:00.000Z'), NOW)).toEqual({
      absence: 'AWAY',
      absenceUntil: '2026-10-01T00:00:00.000Z',
    })
    expect(effectiveAbsence('SUSPENDED', null, NOW)).toEqual({
      absence: 'SUSPENDED',
      absenceUntil: null,
    })
  })

  it('reports an expired or unknown absence as NONE', () => {
    expect(effectiveAbsence('AWAY', new Date('2026-09-01T00:00:00.000Z'), NOW).absence).toBe('NONE')
    expect(effectiveAbsence(undefined, null, NOW)).toEqual({ absence: 'NONE', absenceUntil: null })
  })
})
