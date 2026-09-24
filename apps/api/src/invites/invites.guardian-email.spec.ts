import { BadRequestException } from '@nestjs/common'
import { InvitesService } from './invites.service'
import { createFakePrisma, dobForAge } from '../testing/fake-prisma'

// Safeguarding review (M3 applied to invite redemption, 2026-09-24): a child
// redeeming an invite types the guardian email. It must be a third party.
describe('InvitesService under-16 redemption guardian email', () => {
  function build() {
    const prisma = createFakePrisma(
      {
        club: [{ id: 'albatros', name: 'SV Albatros' }],
        team: [{ id: 'u15', clubId: 'albatros', name: 'U15', displayName: 'U15' }],
        user: [
          { id: 'tim', email: 'tim@example.com', name: 'Tim Weber', deletedAt: null },
          { id: 'inviter', email: 'trainer@albatros.de', deletedAt: null },
          { id: 'admin', email: 'kassenwart@albatros.de', deletedAt: null },
          { id: 'coach2', email: 'co@albatros.de', deletedAt: null },
          { id: 'anna', email: 'anna@example.com', deletedAt: null },
        ],
        membership: [
          { userId: 'admin', clubId: 'albatros', role: 'ADMIN' },
          { userId: 'coach2', clubId: 'albatros', role: 'PLAYER' },
        ],
        teamAccess: [
          { id: 'c2', clubId: 'albatros', teamId: 'u15', userId: 'coach2', role: 'ASSISTANT_COACH', status: 'ACTIVE' },
        ],
        invite: [
          {
            id: 'inv',
            clubId: 'albatros',
            teamId: 'u15',
            createdById: 'inviter',
            status: 'PENDING',
            acceptedAt: null,
            revokedAt: null,
            expiresAt: new Date(Date.now() + 86_400_000),
            phase: 'FULL',
            guardianEmail: null,
            childName: null,
          },
        ],
        parentalConsent: [],
      },
      {
        invite: {
          club: { model: 'club', from: 'clubId', to: 'id' },
          team: { model: 'team', from: 'teamId', to: 'id' },
          createdBy: { model: 'user', from: 'createdById', to: 'id' },
        },
      },
    )
    const push = { sendToUserLocalized: jest.fn().mockResolvedValue(undefined) }
    const service = new InvitesService(prisma as never, {} as never, {} as never, undefined, push as never)
    const tim = { id: 'tim', email: 'tim@example.com', name: 'Tim Weber', dateOfBirth: dobForAge(14) }
    const redeem = (guardianEmail: string) =>
      (service as any).requestParentalApproval('inv', tim, { guardianEmail })
    return { prisma, push, redeem }
  }

  it.each([
    ['the child own email', 'TIM@example.com'],
    ['the inviter', 'trainer@albatros.de'],
    ['a club admin', 'kassenwart@albatros.de'],
    ['a team coach', 'co@albatros.de'],
  ])('rejects %s and changes nothing', async (_label, email) => {
    const { prisma, push, redeem } = build()
    await expect(redeem(email)).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.tables.parentalConsent).toEqual([])
    expect(prisma.tables.invite).toHaveLength(1)
    expect(prisma.tables.invite[0].status).toBe('PENDING')
    expect(push.sendToUserLocalized).not.toHaveBeenCalled()
  })

  it('accepts a parent: consent PENDING, access PENDING, guardian pushed', async () => {
    const { prisma, push, redeem } = build()
    await expect(redeem('Anna@Example.com')).resolves.toEqual(
      expect.objectContaining({ status: 'pending_parent_approval', guardianEmail: 'anna@example.com' }),
    )
    expect(prisma.tables.parentalConsent).toEqual([
      expect.objectContaining({ guardianEmail: 'anna@example.com', status: 'PENDING', playerUserId: 'tim' }),
    ])
    expect(prisma.tables.teamAccess.find((a) => a.userId === 'tim')?.status).toBe('PENDING')
    expect(push.sendToUserLocalized).toHaveBeenCalledWith(
      'anna',
      'CONSENT_REQUESTED',
      { clubName: 'SV Albatros', childName: 'Tim Weber', teamName: 'U15' },
      { type: 'consent_requested', clubId: 'albatros' },
    )
  })
})
