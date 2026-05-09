import { BadRequestException } from '@nestjs/common'
import { ContributionCadence } from '@prisma/client'
import { ContributionsService } from './contributions.service'

describe('ContributionsService', () => {
  let service: ContributionsService
  let prisma: any
  let auditService: { log: jest.Mock }
  let pushService: { sendToUser: jest.Mock }

  beforeEach(() => {
    prisma = {
      membership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      club: {
        findUnique: jest.fn(),
      },
      clubContributionSettings: {
        upsert: jest.fn(),
      },
      contributionPlan: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      contributionAssignment: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      contributionRecord: {
        upsert: jest.fn(),
        update: jest.fn(),
      },
      contributionReminder: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    }
    auditService = {
      log: jest.fn(),
    }
    pushService = {
      sendToUser: jest.fn(),
    }

    const billingService = {
      createContributionCheckoutSession: jest.fn().mockResolvedValue(null),
    }

    service = new ContributionsService(
      prisma as never,
      auditService as never,
      pushService as never,
      billingService as never,
    )
  })

  it('ends conflicting active assignments when a member is moved onto a new plan', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      role: 'OWNER',
      operationalRoles: [],
    })
    prisma.contributionPlan.findFirst.mockResolvedValue({
      id: 'plan-new',
      targetRole: 'PLAYER',
    })
    prisma.membership.findMany.mockResolvedValue([
      {
        userId: 'member-1',
        role: 'PLAYER',
        user: {
          id: 'member-1',
          name: 'Player One',
          email: 'player@example.com',
          avatarUrl: null,
        },
      },
    ])
    prisma.contributionAssignment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'assignment-1',
          clubId: 'club-1',
          planId: 'plan-new',
          memberUserId: 'member-1',
          assignedById: 'admin-1',
          endDate: null,
          plan: {
            id: 'plan-new',
            clubId: 'club-1',
            name: 'Monthly player dues',
            description: null,
            amount: 2500,
            currency: 'eur',
            cadence: ContributionCadence.MONTHLY,
            targetRole: 'PLAYER',
            dueDay: 5,
            dueMonth: null,
            graceDays: 3,
            reminderDaysBefore: [7, 1],
            reminderDaysAfter: [3],
            active: true,
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
          member: {
            id: 'member-1',
            name: 'Player One',
            email: 'player@example.com',
            avatarUrl: null,
          },
        },
      ])
    prisma.contributionAssignment.updateMany.mockResolvedValue({ count: 1 })
    prisma.contributionAssignment.upsert.mockResolvedValue({})
    prisma.contributionRecord.upsert.mockResolvedValue({
      id: 'record-1',
    })

    const getOverviewSpy = jest
      .spyOn(service, 'getOverview')
      .mockResolvedValue({} as never)

    await service.replaceAssignments('club-1', 'admin-1', {
      planId: 'plan-new',
      memberUserIds: ['member-1'],
    })

    expect(prisma.contributionAssignment.updateMany).toHaveBeenCalledWith({
      where: {
        clubId: 'club-1',
        memberUserId: 'member-1',
        endDate: null,
        planId: { not: 'plan-new' },
      },
      data: { endDate: expect.any(Date) },
    })
    expect(getOverviewSpy).toHaveBeenCalledWith('club-1', 'admin-1')
  })

  it('clears dueMonth when a yearly plan is switched to monthly cadence', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      role: 'OWNER',
      operationalRoles: [],
    })
    prisma.contributionPlan.findFirst.mockResolvedValue({
      id: 'plan-1',
      clubId: 'club-1',
      name: 'Annual club fee',
      description: null,
      amount: 9000,
      currency: 'eur',
      cadence: ContributionCadence.YEARLY,
      targetRole: 'PLAYER',
      dueDay: 10,
      dueMonth: 7,
      graceDays: 0,
      reminderDaysBefore: [7],
      reminderDaysAfter: [3],
      active: true,
    })
    prisma.contributionPlan.update.mockResolvedValue({
      id: 'plan-1',
      clubId: 'club-1',
      name: 'Annual club fee',
      description: null,
      amount: 9000,
      currency: 'eur',
      cadence: ContributionCadence.MONTHLY,
      targetRole: 'PLAYER',
      dueDay: 10,
      dueMonth: null,
      graceDays: 0,
      reminderDaysBefore: [7],
      reminderDaysAfter: [3],
      active: true,
      assignments: [],
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    })

    await service.updatePlan('club-1', 'plan-1', 'admin-1', {
      cadence: 'MONTHLY',
    })

    expect(prisma.contributionPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan-1' },
        data: expect.objectContaining({
          cadence: 'MONTHLY',
          dueMonth: null,
        }),
      }),
    )
  })

  it('rejects contribution plans without a usable name', async () => {
    prisma.membership.findUnique.mockResolvedValue({
      role: 'OWNER',
      operationalRoles: [],
    })

    await expect(
      service.createPlan('club-1', 'admin-1', {
        name: '   ',
        description: undefined,
        amount: 1500,
        currency: 'eur',
        cadence: 'MONTHLY',
        targetRole: 'PLAYER',
        dueDay: 5,
        graceDays: 0,
        reminderPolicy: {
          daysBefore: [7, 1],
          daysAfter: [3],
        },
      }),
    ).rejects.toThrow(BadRequestException)

    expect(prisma.contributionPlan.create).not.toHaveBeenCalled()
  })

  it('skips automatic reminder work when contribution tracking is disabled', async () => {
    prisma.clubContributionSettings.upsert.mockResolvedValue({
      clubId: 'club-1',
      enabled: false,
      autoRemindersEnabled: true,
      defaultCurrency: 'eur',
    })

    const result = await service.runAutomaticReminderSweep('club-1')

    expect(result).toEqual({
      requested: 0,
      sent: 0,
      skipped: 0,
    })
    expect(prisma.contributionAssignment.findMany).not.toHaveBeenCalled()
  })
})
