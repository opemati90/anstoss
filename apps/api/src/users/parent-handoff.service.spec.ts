import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { ParentHandoffService } from './parent-handoff.service'

describe('ParentHandoffService', () => {
  function createService() {
    const prisma = {
      parentHandoff: {
        findUnique: jest.fn(),
      },
      team: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    }
    const managedSubProfiles = { createInTransaction: jest.fn() }
    const service = new ParentHandoffService(
      prisma as never,
      managedSubProfiles as never,
    )
    return { prisma, managedSubProfiles, service }
  }

  const future = new Date(Date.now() + 86_400_000)
  const past = new Date(Date.now() - 86_400_000)
  const pending = {
    id: 'ho-1',
    code: 'AB12CD34',
    childFirstName: 'Lena',
    guardianEmail: 'parent@example.com',
    childDateOfBirth: new Date('2014-03-01T00:00:00.000Z'),
    status: 'PENDING',
    expiresAt: future,
  }

  describe('getByCode', () => {
    it('returns the child name + DOB for a pending, unexpired code owned by this guardian email', async () => {
      const { prisma, service } = createService()
      prisma.parentHandoff.findUnique.mockResolvedValue(pending)
      prisma.user.findUnique.mockResolvedValue({ email: 'parent@example.com' })

      const out = await service.getByCode('parent-1', 'AB12CD34')

      expect(out.childFirstName).toBe('Lena')
      expect(out.childDateOfBirth).toContain('2014-03-01')
      expect(out.team).toBeNull()
    })

    it('includes the remembered team (open slots only) for an invite-path handoff', async () => {
      const { prisma, service } = createService()
      prisma.parentHandoff.findUnique.mockResolvedValue({ ...pending, teamId: 'team-1' })
      prisma.user.findUnique.mockResolvedValue({ email: 'parent@example.com' })
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        clubId: 'club-1',
        name: 'U14',
        displayName: 'U14',
        club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null, primaryColor: '#1B4F9C' },
        rosterSlots: [{ id: 'slot-1', fullName: 'Lena', position: null, jerseyNumber: null }],
      })
      const out = await service.getByCode('parent-1', 'AB12CD34')
      expect(out.team?.team.id).toBe('team-1')
      expect(out.team?.rosterSlots).toHaveLength(1)
    })

    it('rejects an unknown code', async () => {
      const { prisma, service } = createService()
      prisma.parentHandoff.findUnique.mockResolvedValue(null)
      await expect(service.getByCode('parent-1', 'NOPE')).rejects.toThrow(NotFoundException)
    })

    it('rejects an already-redeemed or expired code', async () => {
      const { prisma, service } = createService()
      prisma.parentHandoff.findUnique.mockResolvedValue({
        ...pending,
        expiresAt: past,
      })
      await expect(service.getByCode('parent-1', 'OLD')).rejects.toThrow(ConflictException)
    })

    it('rejects preview for a different guardian email', async () => {
      const { prisma, service } = createService()
      prisma.parentHandoff.findUnique.mockResolvedValue(pending)
      prisma.user.findUnique.mockResolvedValue({ email: 'other@example.com' })

      await expect(service.getByCode('parent-1', 'AB12CD34')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('getTeamForCode', () => {
    it('returns the team and open roster slots for a valid handoff + join code', async () => {
      const { prisma, service } = createService()
      prisma.parentHandoff.findUnique.mockResolvedValue(pending)
      prisma.user.findUnique.mockResolvedValue({ email: 'parent@example.com' })
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        clubId: 'club-1',
        name: 'U12',
        displayName: 'U12 Blue',
        club: { id: 'club-1', name: 'SV Test', badgeUrl: null, primaryColor: '#123456' },
        rosterSlots: [
          { id: 'slot-1', fullName: 'Lena', position: 'MIDFIELDER', jerseyNumber: 8 },
        ],
      })

      const out = await service.getTeamForCode('parent-1', 'ab12cd34', 't3am9k7p2q')

      expect(prisma.parentHandoff.findUnique).toHaveBeenCalledWith({
        where: { code: 'AB12CD34' },
      })
      expect(prisma.team.findUnique).toHaveBeenCalledWith({
        where: { joinCode: 'T3AM9K7P2Q' },
        select: expect.objectContaining({
          rosterSlots: expect.objectContaining({
            where: { claimedByUserId: null },
          }),
        }),
      })
      expect(out.team.id).toBe('team-1')
      expect(out.rosterSlots).toHaveLength(1)
    })

    it('rejects an invalid team code without leaking slots', async () => {
      const { prisma, service } = createService()
      prisma.parentHandoff.findUnique.mockResolvedValue(pending)
      prisma.user.findUnique.mockResolvedValue({ email: 'parent@example.com' })
      prisma.team.findUnique.mockResolvedValue(null)

      await expect(service.getTeamForCode('parent-1', 'AB12CD34', 'NOPE')).rejects.toThrow(NotFoundException)
    })
  })

  describe('redeem', () => {
    it('atomically claims the code and creates the managed sub-profile in the same transaction', async () => {
      const { prisma, managedSubProfiles, service } = createService()
      const tx = createRedeemTx()
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubId: 'club-1' })
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))
      managedSubProfiles.createInTransaction.mockResolvedValue({ user: { id: 'kid-1' } })

      const out = await service.redeem('parent-1', {
        code: 'AB12CD34',
        teamJoinCode: 'T3AM9K7P2Q',
        rosterSlotId: 'slot-1',
      })

      expect(prisma.team.findUnique).toHaveBeenCalledWith({
        where: { joinCode: 'T3AM9K7P2Q' },
        select: { id: true, clubId: true },
      })
      expect(tx.parentHandoff.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ho-1',
          status: 'PENDING',
          expiresAt: { gt: expect.any(Date) },
        },
        data: expect.objectContaining({
          status: 'REDEEMED',
          redeemedByUserId: 'parent-1',
          redeemedAt: expect.any(Date),
        }),
      })
      expect(managedSubProfiles.createInTransaction).toHaveBeenCalledWith(
        tx,
        'parent-1',
        expect.objectContaining({
          fullName: 'Lena',
          teamId: 'team-1',
          rosterSlotId: 'slot-1',
          guardianEmail: 'parent@example.com',
          expectedClubId: 'club-1',
        }),
      )
      expect(out.profile).toEqual({ user: { id: 'kid-1' } })
    })

    it('rejects when the team join code is invalid', async () => {
      const { prisma, managedSubProfiles, service } = createService()
      prisma.team.findUnique.mockResolvedValue(null)

      await expect(
        service.redeem('parent-1', {
          code: 'AB12CD34',
          teamJoinCode: 'BAD99',
          rosterSlotId: 'slot-1',
        }),
      ).rejects.toThrow(NotFoundException)
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(managedSubProfiles.createInTransaction).not.toHaveBeenCalled()
    })

    it('rejects when another guardian already claimed the code (race)', async () => {
      const { prisma, managedSubProfiles, service } = createService()
      const tx = createRedeemTx()
      tx.parentHandoff.updateMany.mockResolvedValue({ count: 0 })
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubId: 'club-1' })
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))

      await expect(
        service.redeem('parent-1', {
          code: 'AB12CD34',
          teamJoinCode: 'T3AM9K7P2Q',
          rosterSlotId: 's',
        }),
      ).rejects.toThrow(ConflictException)
      expect(managedSubProfiles.createInTransaction).not.toHaveBeenCalled()
    })

    it('relies on transaction rollback when sub-profile creation fails', async () => {
      const { prisma, managedSubProfiles, service } = createService()
      const tx = createRedeemTx()
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubId: 'club-1' })
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))
      managedSubProfiles.createInTransaction.mockRejectedValue(new Error('slot taken'))

      await expect(
        service.redeem('parent-1', {
          code: 'AB12CD34',
          teamJoinCode: 'T3AM9K7P2Q',
          rosterSlotId: 's',
        }),
      ).rejects.toThrow('slot taken')

      expect(tx.parentHandoff.updateMany).toHaveBeenCalledTimes(1)
    })

    it('rejects an under-16 guardian account before burning the code', async () => {
      const { prisma, managedSubProfiles, service } = createService()
      const tx = createRedeemTx({
        email: 'parent@example.com',
        dateOfBirth: new Date('2014-03-01T00:00:00.000Z'),
      })
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubId: 'club-1' })
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))

      await expect(
        service.redeem('parent-1', {
          code: 'AB12CD34',
          teamJoinCode: 'T3AM9K7P2Q',
          rosterSlotId: 's',
        }),
      ).rejects.toThrow(ForbiddenException)

      expect(tx.parentHandoff.updateMany).not.toHaveBeenCalled()
      expect(managedSubProfiles.createInTransaction).not.toHaveBeenCalled()
    })

    // onboarding review fix (B2): 16 is not enough to act as a guardian.
    it('rejects a 17-year-old guardian (guardians need a DOB showing 18+)', async () => {
      const { prisma, managedSubProfiles, service } = createService()
      const seventeen = new Date()
      seventeen.setFullYear(seventeen.getFullYear() - 17)
      const tx = createRedeemTx({ email: 'parent@example.com', dateOfBirth: seventeen })
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubId: 'club-1' })
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))

      const err = await service
        .redeem('parent-1', { code: 'AB12CD34', teamJoinCode: 'T3AM9K7P2Q', rosterSlotId: 's' })
        .catch((e) => e)
      expect(err).toBeInstanceOf(ForbiddenException)
      expect(err.getResponse()).toMatchObject({ code: 'GUARDIAN_UNDER_18' })
      expect(managedSubProfiles.createInTransaction).not.toHaveBeenCalled()
    })

    it('rejects a guardian with only the legacy 16+ declaration and no DOB', async () => {
      const { prisma, service } = createService()
      const tx = createRedeemTx({ email: 'parent@example.com', dateOfBirth: null as never })
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubId: 'club-1' })
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))
      await expect(
        service.redeem('parent-1', { code: 'AB12CD34', teamJoinCode: 'T3AM9K7P2Q', rosterSlotId: 's' }),
      ).rejects.toThrow(ForbiddenException)
    })

    // onboarding review fix (H5): the team code is optional when the handoff
    // came from an invite and remembers its team.
    it('redeems without a team code into the team the handoff remembers', async () => {
      const { prisma, managedSubProfiles, service } = createService()
      const tx = createRedeemTx()
      prisma.parentHandoff.findUnique.mockResolvedValue({ teamId: 'team-9' })
      prisma.team.findUnique.mockResolvedValue({ id: 'team-9', clubId: 'club-9' })
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))
      managedSubProfiles.createInTransaction.mockResolvedValue({ user: { id: 'kid-1' } })

      await service.redeem('parent-1', { code: 'AB12CD34', rosterSlotId: 'slot-1' })

      expect(prisma.team.findUnique).toHaveBeenCalledWith({
        where: { id: 'team-9' },
        select: { id: true, clubId: true },
      })
      expect(managedSubProfiles.createInTransaction).toHaveBeenCalledWith(
        tx,
        'parent-1',
        expect.objectContaining({ teamId: 'team-9', expectedClubId: 'club-9' }),
      )
    })

    it('asks for a team code when the handoff has no team', async () => {
      const { prisma, service } = createService()
      prisma.parentHandoff.findUnique.mockResolvedValue({ teamId: null })
      const err = await service.redeem('parent-1', { code: 'AB12CD34', rosterSlotId: 's' }).catch((e) => e)
      expect(err.getResponse()).toMatchObject({ code: 'TEAM_CODE_REQUIRED' })
    })

    it('rejects a parent deleted before the lifecycle-locked activation', async () => {
      const { prisma, managedSubProfiles, service } = createService()
      const tx = createRedeemTx()
      tx.user.findFirst.mockResolvedValue(null)
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubId: 'club-1' })
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))

      await expect(
        service.redeem('parent-1', {
          code: 'AB12CD34',
          teamJoinCode: 'T3AM9K7P2Q',
          rosterSlotId: 'slot-1',
        }),
      ).rejects.toThrow(ForbiddenException)

      expect(tx.$executeRaw).toHaveBeenCalled()
      expect(tx.parentHandoff.updateMany).not.toHaveBeenCalled()
      expect(managedSubProfiles.createInTransaction).not.toHaveBeenCalled()
    })

    it('rejects a mismatched guardian email before burning the code', async () => {
      const { prisma, managedSubProfiles, service } = createService()
      const tx = createRedeemTx({
        email: 'other@example.com',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
      })
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubId: 'club-1' })
      prisma.$transaction.mockImplementation((fn: any) => fn(tx))

      await expect(
        service.redeem('parent-1', {
          code: 'AB12CD34',
          teamJoinCode: 'T3AM9K7P2Q',
          rosterSlotId: 's',
        }),
      ).rejects.toThrow(ForbiddenException)

      expect(tx.parentHandoff.updateMany).not.toHaveBeenCalled()
      expect(managedSubProfiles.createInTransaction).not.toHaveBeenCalled()
    })
  })

  function createRedeemTx(
    user = {
      email: 'parent@example.com',
      dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    },
  ) {
    return {
      $executeRaw: jest.fn().mockResolvedValue(1),
      parentHandoff: {
        findUnique: jest.fn().mockResolvedValue(pending),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
      },
    }
  }
})
