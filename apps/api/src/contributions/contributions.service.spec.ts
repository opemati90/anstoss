import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { ContributionCadence, Prisma } from '@prisma/client'
import { ContributionsService, resolveContributionPeriod } from './contributions.service'

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
        findFirst: jest.fn(),
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
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      teamAccess: { findMany: jest.fn().mockResolvedValue([]) },
    }
    auditService = {
      log: jest.fn(),
    }
    pushService = {
      sendToUser: jest.fn(),
    }

    service = new ContributionsService(
      prisma as never,
      auditService as never,
      pushService as never,
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

  it('reserves a reminder key before delivery so concurrent instances send once', async () => {
    prisma.contributionReminder.findFirst.mockResolvedValue(null)
    prisma.contributionReminder.create
      .mockResolvedValueOnce({ id: 'reservation-1' })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      )
    prisma.contributionReminder.update.mockResolvedValue({})
    prisma.contributionRecord.update.mockResolvedValue({})
    pushService.sendToUser.mockResolvedValue({ sent: 1 })
    const item = {
      assignment: {
        id: 'assignment-1',
        clubId: 'club-1',
        planId: 'plan-1',
        memberUserId: 'member-1',
        assignedById: 'admin-1',
        plan: { id: 'plan-1', name: 'Dues', graceDays: 0 },
        member: {
          id: 'member-1',
          name: 'Player',
          email: null,
          preferredLanguage: 'en',
        },
      },
      record: {
        id: 'record-1',
        clubId: 'club-1',
        planId: 'plan-1',
        assignmentId: 'assignment-1',
        memberUserId: 'member-1',
        dueDate: new Date(Date.now() + 86_400_000),
        amount: 2500,
        currency: 'eur',
        status: 'PENDING',
        paidAmount: null,
      },
    }
    const input = {
      clubId: 'club-1',
      clubName: 'Club',
      trigger: 'AUTOMATIC',
      reminderKey: 'auto:record-1:before:1',
    }

    const results = await Promise.all([
      (
        service as unknown as {
          dispatchReminder: (item: unknown, input: unknown) => Promise<{ sent: boolean }>
        }
      ).dispatchReminder(item, input),
      (
        service as unknown as {
          dispatchReminder: (item: unknown, input: unknown) => Promise<{ sent: boolean }>
        }
      ).dispatchReminder(item, input),
    ])

    expect(results.filter((result) => result.sent)).toHaveLength(1)
    expect(pushService.sendToUser).toHaveBeenCalledTimes(1)
  })

  // --- Dues payment paths (markOwnAsPaid / startCheckoutForOwnPlan) ---

  const ownAssignment = {
    id: 'assignment-own',
    clubId: 'club-1',
    planId: 'plan-1',
    memberUserId: 'member-1',
    endDate: null,
    plan: { id: 'plan-1', name: 'Monthly player dues' },
    member: {
      id: 'member-1',
      name: 'Player One',
      email: 'player@example.com',
      avatarUrl: null,
      preferredLanguage: 'en',
    },
  }

  const ensuredFor = (status: string) => [
    {
      assignment: ownAssignment,
      record: {
        id: 'record-1',
        clubId: 'club-1',
        planId: 'plan-1',
        assignmentId: 'assignment-own',
        memberUserId: 'member-1',
        periodStart: new Date('2026-06-01T00:00:00.000Z'),
        periodEnd: new Date('2026-06-30T00:00:00.000Z'),
        dueDate: new Date('2026-06-05T00:00:00.000Z'),
        amount: 2500,
        currency: 'eur',
        status,
        paidAmount: null,
      },
    },
  ]

  it('markOwnAsPaid records an unverified report without forging paid status', async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: 'PLAYER' })
    prisma.contributionAssignment.findFirst.mockResolvedValue(ownAssignment)
    jest
      .spyOn(service as never, 'ensureCurrentRecords')
      .mockResolvedValue(ensuredFor('PENDING') as never)
    prisma.contributionRecord.update.mockResolvedValue({})
    const myContribsSpy = jest
      .spyOn(service, 'getMyContributions')
      .mockResolvedValue({ items: [], hasContributions: true } as never)

    await service.markOwnAsPaid('club-1', 'member-1', 'plan-1')

    expect(prisma.contributionRecord.update).toHaveBeenCalledWith({
      where: { id: 'record-1' },
      data: {
        status: 'PARTIAL',
        paidAmount: 0,
        paidAt: null,
        note: 'PAYMENT_REPORTED_BY_MEMBER',
      },
    })
    expect(prisma.contributionAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clubId: 'club-1',
          planId: 'plan-1',
          memberUserId: 'member-1',
          endDate: null,
        }),
      }),
    )
    expect(myContribsSpy).toHaveBeenCalled()
  })

  it('markOwnAsPaid cannot settle someone elses dues: it only ever queries the caller own assignment', async () => {
    // Authorization is enforced by scoping the assignment lookup to
    // memberUserId === caller. A foreign planId resolves to no assignment.
    prisma.membership.findUnique.mockResolvedValue({ role: 'PLAYER' })
    prisma.contributionAssignment.findFirst.mockResolvedValue(null)

    await expect(
      service.markOwnAsPaid('club-1', 'member-1', 'someone-else-plan'),
    ).rejects.toThrow(NotFoundException)

    expect(prisma.contributionAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ memberUserId: 'member-1' }),
      }),
    )
    expect(prisma.contributionRecord.update).not.toHaveBeenCalled()
  })

  it('markOwnAsPaid rejects a caller who is not a member of the club', async () => {
    prisma.membership.findUnique.mockResolvedValue(null)

    await expect(
      service.markOwnAsPaid('club-1', 'intruder', 'plan-1'),
    ).rejects.toThrow(ForbiddenException)

    expect(prisma.contributionRecord.update).not.toHaveBeenCalled()
  })

  it('markOwnAsPaid is idempotent: an already-reported record is left untouched', async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: 'PLAYER' })
    prisma.contributionAssignment.findFirst.mockResolvedValue(ownAssignment)
    jest
      .spyOn(service as never, 'ensureCurrentRecords')
      .mockResolvedValue(
        [
          {
            ...ensuredFor('PARTIAL')[0],
            record: {
              ...ensuredFor('PARTIAL')[0].record,
              note: 'PAYMENT_REPORTED_BY_MEMBER',
            },
          },
        ] as never,
      )
    const myContribsSpy = jest
      .spyOn(service, 'getMyContributions')
      .mockResolvedValue({ items: [], hasContributions: true } as never)

    await service.markOwnAsPaid('club-1', 'member-1', 'plan-1')

    expect(prisma.contributionRecord.update).not.toHaveBeenCalled()
    expect(myContribsSpy).toHaveBeenCalledWith('club-1', 'member-1')
  })

})

describe('resolveContributionPeriod', () => {
  const assignmentStart = new Date('2026-02-20T10:00:00.000Z')

  it('uses one stable calendar-quarter record rather than a monthly record', () => {
    const period = resolveContributionPeriod(
      ContributionCadence.QUARTERLY,
      { dueDay: 10, dueMonth: null, assignmentStart },
      new Date('2026-08-24T10:00:00.000Z'),
    )
    expect(period.periodStart.toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(period.periodEnd.toISOString()).toBe('2026-09-30T23:59:59.999Z')
    expect(period.dueDate.toISOString()).toBe('2026-07-10T12:00:00.000Z')
  })

  it('anchors one-off dues to the assignment so later sweeps cannot create repeats', () => {
    const august = resolveContributionPeriod(
      ContributionCadence.ONE_OFF,
      { dueDay: 25, dueMonth: null, assignmentStart },
      new Date('2026-08-24T10:00:00.000Z'),
    )
    const december = resolveContributionPeriod(
      ContributionCadence.ONE_OFF,
      { dueDay: 25, dueMonth: null, assignmentStart },
      new Date('2026-12-24T10:00:00.000Z'),
    )
    expect(december).toEqual(august)
    expect(august.periodStart.toISOString()).toBe('2026-02-20T00:00:00.000Z')
  })
})
