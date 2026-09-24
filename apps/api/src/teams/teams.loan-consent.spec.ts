import { BadRequestException } from '@nestjs/common'
import { TeamsService } from './teams.service'
import { createFakePrisma, dobForAge } from '../testing/fake-prisma'

// Privacy (safeguarding review H3, 2026-09-24): a loan must not re-admit an
// under-16 whose team access was revoked by a consent withdrawal.
describe('TeamsService.createPlayerLoan consent check (H3)', () => {
  function build(opts: {
    age: number
    targetStatus?: 'REVOKED' | null
    consents: Array<{ teamId: string; status: string; clubId?: string }>
  }) {
    const prisma = createFakePrisma({
      team: [
        { id: 'u15', clubId: 'albatros' },
        { id: 'u17', clubId: 'albatros' },
      ],
      user: [{ id: 'tim', dateOfBirth: dobForAge(opts.age), deletedAt: null }],
      teamAccess: [
        { id: 'src', clubId: 'albatros', teamId: 'u15', userId: 'tim', role: 'PLAYER', status: 'ACTIVE', loanedFromTeamId: null, loanEndDate: null },
        ...(opts.targetStatus
          ? [{ id: 'old', clubId: 'albatros', teamId: 'u17', userId: 'tim', role: 'PLAYER', status: opts.targetStatus }]
          : []),
      ],
      parentalConsent: opts.consents.map((c, i) => ({
        id: `c${i}`,
        clubId: c.clubId ?? 'albatros',
        playerUserId: 'tim',
        teamId: c.teamId,
        status: c.status,
      })),
    })
    const service = new TeamsService(prisma as never)
    jest.spyOn(service as any, 'assertLoanManageAccess').mockResolvedValue(undefined)
    const loan = () =>
      service.createPlayerLoan('albatros', 'u15', 'coach', {
        playerUserId: 'tim',
        targetTeamId: 'u17',
      } as never)
    return { prisma, loan }
  }

  it('refuses to reactivate a REVOKED row for an under-16 without consent on the target team', async () => {
    const { prisma, loan } = build({
      age: 14,
      targetStatus: 'REVOKED',
      consents: [
        { teamId: 'u15', status: 'APPROVED' },
        { teamId: 'u17', status: 'WITHDRAWN' },
      ],
    })
    await expect(loan()).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.tables.teamAccess.find((a) => a.id === 'old')?.status).toBe('REVOKED')
  })

  it('reactivates when the target team has an APPROVED consent', async () => {
    const { prisma, loan } = build({
      age: 14,
      targetStatus: 'REVOKED',
      consents: [{ teamId: 'u17', status: 'APPROVED' }],
    })
    await loan()
    expect(prisma.tables.teamAccess.find((a) => a.id === 'old')?.status).toBe('ACTIVE')
  })

  it('a fresh loan needs the lending team consent; a consent in another club does not count', async () => {
    await expect(
      build({ age: 14, consents: [{ teamId: 'u15', status: 'APPROVED', clubId: 'babelsberg' }] }).loan(),
    ).rejects.toBeInstanceOf(BadRequestException)
    const ok = build({ age: 14, consents: [{ teamId: 'u15', status: 'APPROVED' }] })
    await ok.loan()
    expect(ok.prisma.tables.teamAccess.some((a) => a.teamId === 'u17' && a.status === 'ACTIVE')).toBe(true)
  })

  it('does not require consent for a 16+ player', async () => {
    const { prisma, loan } = build({ age: 17, targetStatus: 'REVOKED', consents: [] })
    await loan()
    expect(prisma.tables.teamAccess.find((a) => a.id === 'old')?.status).toBe('ACTIVE')
  })
})
