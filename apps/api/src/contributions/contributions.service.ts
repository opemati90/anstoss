import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ClubCapability,
  ClubOperationalRole,
  MembershipRole,
  buildClubPermissionMap,
  isValidIban,
  normalizeIban,
  type ContributionOverview,
  type ContributionPlan,
  type ContributionReminderDispatchResult,
  type ContributionSettings,
  type CreateContributionPlanInput,
  type MyContributionSummary,
  type SendContributionReminderInput,
  type UpdateContributionAssignmentsInput,
  type UpdateContributionMemberStatusInput,
  type UpdateContributionPlanInput,
  type UpdateContributionSettingsInput,
} from '@anstoss/shared'
import {
  ContributionCadence,
  ContributionRecordStatus,
  ContributionReminderStatus,
  ContributionReminderTrigger,
  PlanTier,
  Prisma,
  TeamRole,
} from '@prisma/client'
import { AuditService } from '../audit/audit.service'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { formatPush } from '../push/push.templates'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'
import {
  buildContributionReminderEmail,
  buildPaymentReceiptEmail,
  resolveEmailLocale,
} from '../email/email-content'

type ClubMember = {
  userId: string
  role: 'OWNER' | 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT'
  user: {
    id: string
    name: string
    email: string | null
    avatarUrl: string | null
  }
}

type PlanRow = Awaited<ReturnType<ContributionsService['listPlanRows']>>[number]

type AssignmentRow = Awaited<ReturnType<ContributionsService['listActiveAssignments']>>[number]

type EnsuredRecord = {
  assignment: AssignmentRow
  record: {
    id: string
    clubId: string
    planId: string
    assignmentId: string
    memberUserId: string
    periodStart: Date
    periodEnd: Date
    dueDate: Date
    amount: number
    currency: string
    status: ContributionRecordStatus
    paidAmount: number | null
    manualPaidAmount: number
    paidAt: Date | null
    note: string | null
    lastReminderKey: string | null
    lastReminderSentAt: Date | null
    createdAt: Date
    updatedAt: Date
  }
}

@Injectable()
export class ContributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly pushService: PushService,
    private readonly clubEntitlements: ClubEntitlementsService,
  ) {}

  async getSettings(clubId: string, userId: string): Promise<ContributionSettings> {
    await this.assertBillingAccess(clubId, userId)
    const settings = await this.ensureSettings(clubId)
    return toContributionSettings(settings)
  }

  async updateSettings(
    clubId: string,
    userId: string,
    input: UpdateContributionSettingsInput,
  ): Promise<ContributionSettings> {
    await this.assertBillingAccess(clubId, userId)

    // Bank-transfer fields are optional on the payload: `undefined` means
    // "leave unchanged" (the toggle PATCH omits them), `null`/'' clears them,
    // a value normalizes + validates. Keeps the settings toggles and the
    // bank-details editor on the same endpoint without wiping each other.
    const bankAccountHolder = normalizeNullableText(input.bankAccountHolder)
    const bankReference = normalizeNullableText(input.bankReference)
    let bankIban: string | null | undefined
    if (input.bankIban === undefined) {
      bankIban = undefined
    } else {
      const normalized = normalizeIban(input.bankIban ?? '')
      if (!normalized) {
        bankIban = null
      } else if (!isValidIban(normalized)) {
        throw new BadRequestException('Enter a valid IBAN.')
      } else {
        bankIban = normalized
      }
    }

    const settings = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contribution-settings:${clubId}`}))`
      const before = await tx.clubContributionSettings.findUnique({ where: { clubId } })
      const updated = await tx.clubContributionSettings.upsert({
        where: { clubId },
        create: {
          clubId,
          enabled: input.enabled,
          autoRemindersEnabled: input.autoRemindersEnabled,
          defaultCurrency: normalizeCurrency(input.defaultCurrency),
          bankAccountHolder: bankAccountHolder ?? null,
          bankIban: bankIban ?? null,
          bankReference: bankReference ?? null,
        },
        update: {
          enabled: input.enabled,
          autoRemindersEnabled: input.autoRemindersEnabled,
          defaultCurrency: normalizeCurrency(input.defaultCurrency),
          bankAccountHolder,
          bankIban,
          bankReference,
        },
      })
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'contribution.settings_updated',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: 'Contribution settings updated.',
          metadata: {
            beforeEnabled: before?.enabled ?? false,
            afterEnabled: updated.enabled,
            beforeAutoReminders: before?.autoRemindersEnabled ?? true,
            afterAutoReminders: updated.autoRemindersEnabled,
            bankDetailsChanged:
              before?.bankIban !== updated.bankIban ||
              before?.bankAccountHolder !== updated.bankAccountHolder ||
              before?.bankReference !== updated.bankReference,
          },
        },
      })
      return updated
    })

    return toContributionSettings(settings)
  }

  async listPlans(clubId: string, userId: string): Promise<ContributionPlan[]> {
    await this.assertBillingAccess(clubId, userId)
    const plans = await this.listPlanRows(clubId)
    return plans.map(toContributionPlan)
  }

  async createPlan(
    clubId: string,
    userId: string,
    input: CreateContributionPlanInput,
  ): Promise<ContributionPlan> {
    await this.assertBillingAccess(clubId, userId)

    validatePlanInput(input)

    const refreshed = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contribution-plans:${clubId}`}))`
      const plan = await tx.contributionPlan.create({
        data: {
        clubId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        amount: input.amount,
        currency: normalizeCurrency(input.currency),
        cadence: input.cadence,
        targetRole: input.targetRole,
        dueDay: input.dueDay,
        dueMonth: input.cadence === 'YEARLY' ? (input.dueMonth ?? 1) : null,
        graceDays: input.graceDays ?? 0,
        reminderDaysBefore: normalizeDayOffsets(input.reminderPolicy.daysBefore),
        reminderDaysAfter: normalizeDayOffsets(input.reminderPolicy.daysAfter),
        active: input.active ?? true,
        createdById: userId,
        },
        include: {
          assignments: { where: { endDate: null }, select: { id: true } },
        },
      })
      const desiredUserIds = Array.from(
        new Set((input.memberUserIds ?? []).map((value) => value.trim()).filter(Boolean)),
      )
      if (desiredUserIds.length) {
        const eligible = await this.listEligibleMembers(clubId, plan.targetRole, tx)
        const eligibleIds = new Set(eligible.map((member) => member.userId))
        if (desiredUserIds.some((memberUserId) => !eligibleIds.has(memberUserId))) {
          throw new BadRequestException(
            'Selected member is not compatible with this contribution plan.',
          )
        }
        const now = new Date()
        for (const memberUserId of desiredUserIds) {
          await tx.contributionAssignment.create({
            data: {
              clubId,
              planId: plan.id,
              memberUserId,
              assignedById: userId,
              startDate: now,
            },
          })
        }
        const assignments = await this.listActiveAssignments(
          clubId,
          { planId: plan.id, memberUserIds: desiredUserIds },
          tx,
        )
        await this.ensureCurrentRecords(assignments, tx)
      }
      await tx.clubContributionSettings.upsert({
        where: { clubId },
        create: {
          clubId,
          enabled: true,
          autoRemindersEnabled: true,
          defaultCurrency: normalizeCurrency(input.currency),
        },
        update: { enabled: true },
      })
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'contribution.plan_created',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: `${input.name.trim()} contribution plan created.`,
          metadata: {
            cadence: input.cadence,
            targetRole: input.targetRole,
            amount: input.amount,
            memberUserIds: desiredUserIds,
          },
        },
      })
      return tx.contributionPlan.findFirst({
        where: { id: plan.id },
        include: {
          assignments: { where: { endDate: null }, select: { id: true } },
        },
      })
    })

    if (!refreshed) throw new NotFoundException('Contribution plan not found after create')

    return toContributionPlan(refreshed)
  }

  async updatePlan(
    clubId: string,
    planId: string,
    userId: string,
    input: UpdateContributionPlanInput,
  ): Promise<ContributionPlan> {
    await this.assertBillingAccess(clubId, userId)

    const updated = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contribution-plan:${clubId}:${planId}`}))`
      const currentPlan = await tx.contributionPlan.findFirst({
        where: { id: planId, clubId },
      })
      if (!currentPlan) throw new NotFoundException('Contribution plan not found')

      validatePlanInput({
      name: input.name ?? currentPlan.name,
      description: input.description ?? currentPlan.description ?? undefined,
      amount: input.amount ?? currentPlan.amount,
      currency: input.currency ?? currentPlan.currency,
      cadence: input.cadence ?? currentPlan.cadence,
      targetRole: input.targetRole ?? currentPlan.targetRole,
      dueDay: input.dueDay ?? currentPlan.dueDay,
      dueMonth: input.dueMonth ?? currentPlan.dueMonth ?? undefined,
      graceDays: input.graceDays ?? currentPlan.graceDays,
      reminderPolicy: {
        daysBefore: input.reminderPolicy?.daysBefore ?? currentPlan.reminderDaysBefore,
        daysAfter: input.reminderPolicy?.daysAfter ?? currentPlan.reminderDaysAfter,
      },
      active: input.active ?? currentPlan.active,
      })

      const next = await tx.contributionPlan.update({
      where: { id: planId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && {
          description: input.description.trim() || null,
        }),
        ...(input.amount !== undefined && { amount: input.amount }),
        ...(input.currency !== undefined && {
          currency: normalizeCurrency(input.currency),
        }),
        ...(input.cadence !== undefined && { cadence: input.cadence }),
        ...(input.targetRole !== undefined && { targetRole: input.targetRole }),
        ...(input.dueDay !== undefined && { dueDay: input.dueDay }),
        ...((input.cadence ?? currentPlan.cadence) === 'YEARLY'
          ? input.dueMonth !== undefined
            ? { dueMonth: input.dueMonth }
            : {}
          : { dueMonth: null }),
        ...(input.graceDays !== undefined && { graceDays: input.graceDays }),
        ...(input.reminderPolicy?.daysBefore !== undefined && {
          reminderDaysBefore: normalizeDayOffsets(input.reminderPolicy.daysBefore),
        }),
        ...(input.reminderPolicy?.daysAfter !== undefined && {
          reminderDaysAfter: normalizeDayOffsets(input.reminderPolicy.daysAfter),
        }),
        ...(input.active !== undefined && { active: input.active }),
      },
      include: {
        assignments: {
          where: { endDate: null },
          select: { id: true },
        },
      },
      })
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'contribution.plan_updated',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: `${next.name} contribution plan updated.`,
          metadata: {
            planId,
            previousAmount: currentPlan.amount,
            amount: next.amount,
            previousCadence: currentPlan.cadence,
            cadence: next.cadence,
            previousActive: currentPlan.active,
            active: next.active,
          },
        },
      })
      return next
    })

    return toContributionPlan(updated)
  }

  /**
   * Soft-delete a plan: deactivate it, end any active assignments, and
   * mark records orphaned-by-plan-removal. Hard-delete only when no
   * record has been billed against the plan yet — once a record exists
   * we keep the plan row around for audit history (the plan name is
   * referenced by reminders + audit logs).
   */
  async deletePlan(clubId: string, planId: string, userId: string) {
    await this.assertBillingAccess(clubId, userId)

    return this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contribution-plan:${clubId}:${planId}`}))`
      const plan = await tx.contributionPlan.findFirst({ where: { id: planId, clubId } })
      if (!plan) throw new NotFoundException('Contribution plan not found')
      const recordCount = await tx.contributionRecord.count({ where: { planId } })
      const now = new Date()

      if (recordCount === 0) {
      // No financial history yet — safe to fully drop. End assignments
      // first to satisfy the FK chain, then delete the plan.
      await tx.contributionAssignment.deleteMany({
        where: { planId },
      })
      await tx.contributionPlan.delete({ where: { id: planId } })
      } else {
      // History exists — soft-delete: deactivate the plan + end open
      // assignments. Records and reminders stay intact for audit.
      await tx.contributionAssignment.updateMany({
        where: { planId, endDate: null },
        data: { endDate: now },
      })
      await tx.contributionPlan.update({
        where: { id: planId },
        data: { active: false },
      })
      }
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'contribution.plan_deleted',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: `${plan.name} contribution plan ${recordCount === 0 ? 'deleted' : 'archived (history retained)'}.`,
          metadata: { planId, hadHistory: recordCount > 0 },
        },
      })
      return { ok: true, planId, hardDeleted: recordCount === 0 }
    })
  }

  async replaceAssignments(
    clubId: string,
    userId: string,
    input: UpdateContributionAssignmentsInput,
  ) {
    await this.assertBillingAccess(clubId, userId)

    const desiredUserIds = Array.from(
      new Set(input.memberUserIds.map((memberUserId) => memberUserId.trim())),
    ).filter(Boolean)
    await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contribution-plan:${clubId}:${input.planId}`}))`
      const plan = await tx.contributionPlan.findFirst({
        where: { id: input.planId, clubId },
      })
      if (!plan) throw new NotFoundException('Contribution plan not found')

      const eligibleMembers = await this.listEligibleMembers(clubId, plan.targetRole, tx)
      const eligibleUserIds = new Set(eligibleMembers.map((member) => member.userId))
      if (desiredUserIds.some((memberUserId) => !eligibleUserIds.has(memberUserId))) {
        throw new BadRequestException(
          'Selected member is not compatible with this contribution plan.',
        )
      }
      const existingAssignments = await tx.contributionAssignment.findMany({
        where: { planId: plan.id },
      })
      const now = new Date()
      const activeAssignments = existingAssignments.filter(
        (assignment: any) => assignment.endDate === null,
      )
      const activeUserIds = new Set(
        activeAssignments.map((assignment: any) => assignment.memberUserId),
      )

      for (const memberUserId of desiredUserIds) {
        // Assignments are additive: a one-off fee must not silently end a
        // member's recurring dues (and vice versa).
        await tx.contributionAssignment.upsert({
        where: {
          planId_memberUserId: {
            planId: plan.id,
            memberUserId,
          },
        },
        create: {
          clubId,
          planId: plan.id,
          memberUserId,
          assignedById: userId,
          startDate: now,
        },
        update: {
          endDate: null,
          assignedById: userId,
          startDate: now,
        },
        })
      }

      const removedUserIds = activeAssignments
        .map((assignment: any) => assignment.memberUserId)
        .filter((memberUserId: string) => !desiredUserIds.includes(memberUserId))
      if (removedUserIds.length > 0) {
        await tx.contributionAssignment.updateMany({
        where: {
          planId: plan.id,
          memberUserId: { in: removedUserIds },
          endDate: null,
        },
        data: { endDate: now },
        })
      }
      const nextActiveUserIds = desiredUserIds.filter(
        (memberUserId) => !activeUserIds.has(memberUserId),
      )
      if (nextActiveUserIds.length > 0) {
        const assignments = await this.listActiveAssignments(
          clubId,
          { planId: plan.id, memberUserIds: nextActiveUserIds },
          tx,
        )
        await this.ensureCurrentRecords(assignments, tx)
      }
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'contribution.assignments_replaced',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: `Updated assignments for ${plan.name}.`,
          metadata: {
            planId: plan.id,
            beforeUserIds: activeAssignments.map((item: any) => item.memberUserId),
            afterUserIds: desiredUserIds,
          },
        },
      })
    })

    return this.getOverview(clubId, userId)
  }

  async updateMemberStatus(
    clubId: string,
    memberUserId: string,
    userId: string,
    input: UpdateContributionMemberStatusInput,
  ) {
    await this.assertBillingAccess(clubId, userId)

    const assignment = await this.prisma.contributionAssignment.findFirst({
      where: {
        clubId,
        planId: input.planId,
        memberUserId,
        endDate: null,
      },
      include: {
        plan: true,
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            preferredLanguage: true,
            dateOfBirth: true,
          },
        },
      },
    })

    if (!assignment) {
      throw new NotFoundException('Contribution assignment not found')
    }

    const ensured = await this.ensureCurrentRecords([assignment])
    const current = ensured[0]

    if (!current) {
      throw new NotFoundException('Contribution period not found')
    }

    const paidAmount = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contribution-record:${current.record.id}`}))`
      const latest = await tx.contributionRecord.findUnique({
        where: { id: current.record.id },
      })
      if (!latest || latest.clubId !== clubId) {
        throw new NotFoundException('Contribution period not found')
      }

      const nextPaidAmount = validatePaidAmount(input.status, input.paidAmount, latest.amount)
      const imported = await tx.contributionMatch.aggregate({
        where: { recordId: latest.id, status: 'CONFIRMED' },
        _sum: { amount: true },
      })
      const importedPaidAmount = imported._sum.amount ?? 0
      const desiredPaidAmount = nextPaidAmount ?? 0
      if (desiredPaidAmount < importedPaidAmount) {
        throw new BadRequestException(
          'The entered amount cannot be lower than confirmed bank payments. Reverse the bank match first.',
        )
      }
      const manualPaidAmount = desiredPaidAmount - importedPaidAmount
      await tx.contributionRecord.update({
        where: { id: latest.id },
        data: {
          status: input.status as ContributionRecordStatus,
          paidAmount: nextPaidAmount,
          manualPaidAmount,
          paidAt: input.status === 'PAID' || input.status === 'PARTIAL' ? new Date() : null,
          note: input.note?.trim() || null,
        },
      })
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'contribution.status_updated',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: `${assignment.member.name} marked as ${input.status.toLowerCase()} for ${assignment.plan.name}.`,
          metadata: {
            memberUserId,
            planId: assignment.planId,
            previousStatus: latest.status,
            previousPaidAmount: latest.paidAmount,
            status: input.status,
            paidAmount: nextPaidAmount,
            manualPaidAmount,
            importedPaidAmount,
          },
        },
      })
      return nextPaidAmount
    })

    if (input.status === 'PAID') {
      await this.notifyContributionPaid({
        clubId,
        memberUserId,
        planName: assignment.plan.name,
        amount: paidAmount ?? current.record.amount,
        currency: current.record.currency,
      })
    }

    return this.getOverview(clubId, userId)
  }

  async sendManualReminders(
    clubId: string,
    userId: string,
    input: SendContributionReminderInput,
  ): Promise<ContributionReminderDispatchResult> {
    await this.assertBillingAccess(clubId, userId)

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true, primaryColor: true, badgeUrl: true },
    })

    const assignments = await this.listActiveAssignments(clubId, {
      planId: input.planId,
      memberUserIds: input.memberUserIds,
    })

    const ensured = await this.ensureCurrentRecords(assignments)
    const filtered = ensured.filter(({ record, assignment }) => {
      const derivedStatus = deriveContributionStatus(record, assignment.plan)
      if (input.onlyOverdue) {
        return derivedStatus === 'OVERDUE'
      }
      return derivedStatus !== 'PAID' && derivedStatus !== 'WAIVED' && derivedStatus !== 'EXEMPT'
    })

    let sent = 0
    let skipped = 0

    for (const item of filtered) {
      const result = await this.dispatchReminder(item, {
        clubId,
        clubName: club?.name ?? 'Your club',
        clubPrimaryColor: club?.primaryColor ?? null,
        clubBadgeUrl: club?.badgeUrl ?? null,
        trigger: ContributionReminderTrigger.MANUAL,
        reminderKey: `manual:${formatDateKey(new Date())}`,
      })
      sent += result.sent ? 1 : 0
      skipped += result.sent ? 0 : 1
    }

    return {
      requested: filtered.length,
      sent,
      skipped,
    }
  }

  async runAutomaticReminderSweep(clubId: string): Promise<ContributionReminderDispatchResult> {
    const entitlement = await this.clubEntitlements.resolve(clubId)
    if (entitlement.tier === PlanTier.FREE) {
      return { requested: 0, sent: 0, skipped: 0 }
    }
    const settings = await this.ensureSettings(clubId)
    if (!settings.enabled || !settings.autoRemindersEnabled) {
      return {
        requested: 0,
        sent: 0,
        skipped: 0,
      }
    }

    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { name: true, primaryColor: true, badgeUrl: true },
    })
    const assignments = await this.listActiveAssignments(clubId)
    const ensured = await this.ensureCurrentRecords(assignments)

    return this.dispatchAutomaticReminders(
      clubId,
      {
        name: club?.name ?? 'Your club',
        primaryColor: club?.primaryColor ?? null,
        badgeUrl: club?.badgeUrl ?? null,
      },
      ensured,
    )
  }

  /**
   * Check whether a user has any OVERDUE contribution as of `asOf` for
   * the given club. Used by the events RSVP path to enforce the
   * pay-to-play rule (a player who is delinquent can't commit to the
   * next match). Returns the list of overdue items so the caller can
   * surface specific copy ("Pay your Mitgliedsbeitrag to RSVP").
   *
   * Skipped silently when contributions are disabled for the club, or
   * when the user is not a club member (e.g. coach across clubs).
   */
  async getOverdueContributionsForUser(
    clubId: string,
    userId: string,
    asOf: Date = new Date(),
  ): Promise<
    Array<{ planId: string; planName: string; amount: number; currency: string; dueDate: Date }>
  > {
    const settings = await this.prisma.clubContributionSettings.findUnique({
      where: { clubId },
      select: { enabled: true },
    })
    if (!settings?.enabled) return []

    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { id: true },
    })
    if (!membership) return []

    const assignments = await this.listActiveAssignments(clubId, {
      memberUserIds: [userId],
    })
    if (assignments.length === 0) return []

    const ensured = await this.ensureCurrentRecords(assignments)
    const overdue: Array<{
      planId: string
      planName: string
      amount: number
      currency: string
      dueDate: Date
    }> = []

    for (const item of ensured) {
      const status = deriveContributionStatus(item.record, item.assignment.plan)
      if (status !== 'OVERDUE') continue
      // The block kicks in only if the contribution was due before the
      // event the player is RSVPing to. A future-dated due-date doesn't
      // block today's match.
      if (item.record.dueDate.getTime() > asOf.getTime()) continue
      overdue.push({
        planId: item.assignment.planId,
        planName: item.assignment.plan.name,
        amount: item.record.amount,
        currency: item.record.currency,
        dueDate: item.record.dueDate,
      })
    }
    return overdue
  }

  async getMyContributions(
    clubId: string,
    userId: string,
    locale: 'en' | 'de' = 'en',
  ): Promise<MyContributionSummary> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    })

    if (!membership) {
      throw new ForbiddenException('You are not a member of this club.')
    }

    const clubSettings = await this.prisma.clubContributionSettings.findUnique({
      where: { clubId },
    })
    const bankTransfer =
      clubSettings?.bankIban && clubSettings?.bankAccountHolder
        ? {
            accountHolder: clubSettings.bankAccountHolder,
            iban: clubSettings.bankIban,
            reference: clubSettings.bankReference ?? null,
          }
        : null

    const assignments = await this.listActiveAssignments(clubId, {
      memberUserIds: [userId],
    })

    if (assignments.length === 0) {
      return { items: [], hasContributions: false, bankTransfer }
    }

    const ensured = await this.ensureCurrentRecords(assignments)

    const items = ensured.map((item) => ({
      planId: item.assignment.planId,
      planName: localizedPlanName(item.assignment.plan, locale),
      amount: item.record.amount,
      currency: item.record.currency,
      cadence: item.assignment.plan.cadence,
      dueDate: item.record.dueDate.toISOString(),
      status: deriveContributionStatus(item.record, item.assignment.plan)!,
      paidAmount: item.record.paidAmount,
      paidAt: item.record.paidAt?.toISOString() ?? null,
      paymentReported: item.record.note === 'PAYMENT_REPORTED_BY_MEMBER',
    }))

    items.sort((a, b) => {
      const ao = getContributionStatusSortOrder(a.status)
      const bo = getContributionStatusSortOrder(b.status)
      return ao !== bo ? ao - bo : a.dueDate.localeCompare(b.dueDate)
    })

    return { items, hasContributions: true, bankTransfer }
  }

  async markOwnAsPaid(
    clubId: string,
    userId: string,
    planId: string,
    locale: 'en' | 'de' = 'en',
  ): Promise<MyContributionSummary> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    })

    if (!membership) {
      throw new ForbiddenException('You are not a member of this club.')
    }

    const assignment = await this.prisma.contributionAssignment.findFirst({
      where: {
        clubId,
        planId,
        memberUserId: userId,
        endDate: null,
      },
      include: {
        plan: true,
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            preferredLanguage: true,
            dateOfBirth: true,
          },
        },
      },
    })

    if (!assignment) {
      throw new NotFoundException('Contribution assignment not found')
    }

    const ensured = await this.ensureCurrentRecords([assignment])
    const current = ensured[0]

    if (!current) {
      throw new NotFoundException('Contribution period not found')
    }

    if (
      current.record.status === ContributionRecordStatus.PAID ||
      current.record.note === 'PAYMENT_REPORTED_BY_MEMBER'
    ) {
      return this.getMyContributions(clubId, userId)
    }

    await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contribution-record:${current.record.id}`}))`
      const latest = await tx.contributionRecord.findUnique({
        where: { id: current.record.id },
      })
      if (!latest || latest.clubId !== clubId) {
        throw new NotFoundException('Contribution period not found')
      }
      if (
        latest.status === ContributionRecordStatus.PAID ||
        latest.note === 'PAYMENT_REPORTED_BY_MEMBER'
      ) {
        return
      }
      await tx.contributionRecord.update({
        where: { id: latest.id },
        data: {
          note: 'PAYMENT_REPORTED_BY_MEMBER',
        },
      })
      await tx.auditLog.create({
        data: {
          clubId,
          type: 'contribution.self_marked_paid',
          actorType: 'user',
          actorId: userId,
          actorLabel: null,
          summary: `Member reported an offline payment for ${assignment.plan.name}; awaiting verification.`,
          metadata: { planId, recordId: latest.id },
        },
      })
    })

    return this.getMyContributions(clubId, userId, locale)
  }

  async getOverview(clubId: string, userId: string): Promise<ContributionOverview> {
    await this.assertBillingAccess(clubId, userId)

    const [settings, plans, members] = await Promise.all([
      this.ensureSettings(clubId),
      this.listPlanRows(clubId),
      this.listClubMembers(clubId),
    ])

    const recordsByMember = new Map<string, EnsuredRecord>()

    for (const item of await this.ensureCurrentRecords(await this.listActiveAssignments(clubId))) {
      recordsByMember.set(item.assignment.memberUserId, item)
    }

    const summary = {
      assignedMembers: 0,
      paidMembers: 0,
      overdueMembers: 0,
      outstandingMembers: 0,
      expectedAmount: 0,
      collectedAmount: 0,
    }

    const memberItems = members.map((member) => {
      const current = recordsByMember.get(member.userId)
      const derivedStatus = current
        ? deriveContributionStatus(current.record, current.assignment.plan)
        : null

      if (current) {
        summary.assignedMembers += 1
        if (derivedStatus === 'PAID') {
          summary.paidMembers += 1
          summary.collectedAmount += current.record.paidAmount ?? current.record.amount
        } else if (derivedStatus === 'PARTIAL') {
          summary.outstandingMembers += 1
          summary.collectedAmount += current.record.paidAmount ?? 0
          summary.expectedAmount += current.record.amount
        } else if (derivedStatus === 'OVERDUE') {
          summary.overdueMembers += 1
          summary.outstandingMembers += 1
          summary.expectedAmount += current.record.amount
        } else if (derivedStatus === 'PENDING') {
          summary.outstandingMembers += 1
          summary.expectedAmount += current.record.amount
        }
      }

      return {
        memberUserId: member.userId,
        name: member.user.name,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl,
        role: member.role,
        planId: current?.assignment.planId ?? null,
        planName: current?.assignment.plan.name ?? null,
        cadence: current?.assignment.plan.cadence ?? null,
        amount: current?.record.amount ?? null,
        currency: current?.record.currency ?? null,
        dueDate: current?.record.dueDate.toISOString() ?? null,
        status: derivedStatus,
        paidAmount: current?.record.paidAmount ?? null,
        paidAt: current?.record.paidAt?.toISOString() ?? null,
        note: current?.record.note ?? null,
        lastReminderSentAt: current?.record.lastReminderSentAt?.toISOString() ?? null,
      }
    })

    memberItems.sort((left, right) => {
      const leftStatus = left.status ? getContributionStatusSortOrder(left.status) : 99
      const rightStatus = right.status ? getContributionStatusSortOrder(right.status) : 99

      if (leftStatus !== rightStatus) {
        return leftStatus - rightStatus
      }

      return left.name.localeCompare(right.name)
    })

    return {
      settings: toContributionSettings(settings),
      summary,
      plans: plans.map(toContributionPlan),
      members: memberItems,
    }
  }

  private async assertBillingAccess(clubId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_clubId: {
          userId,
          clubId,
        },
      },
    })

    if (!membership) {
      throw new NotFoundException('Club membership not found')
    }

    const permissions = buildClubPermissionMap({
      membershipRole: membership.role as MembershipRole,
      operationalRoles: membership.operationalRoles as ClubOperationalRole[],
    })

    if (!permissions[ClubCapability.BILLING]) {
      throw new ForbiddenException('You do not manage billing for this club.')
    }

    return membership
  }

  private async ensureSettings(clubId: string) {
    return this.prisma.clubContributionSettings.upsert({
      where: { clubId },
      create: {
        clubId,
        enabled: false,
        autoRemindersEnabled: true,
        defaultCurrency: 'eur',
      },
      update: {},
    })
  }

  private async listPlanRows(clubId: string) {
    return this.prisma.contributionPlan.findMany({
      where: { clubId },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: {
        assignments: {
          where: { endDate: null },
          select: { id: true },
        },
      },
    })
  }

  private async listClubMembers(clubId: string, db: any = this.prisma): Promise<ClubMember[]> {
    return db.membership.findMany({
      where: {
        clubId,
        role: {
          in: [
            MembershipRole.OWNER,
            MembershipRole.ADMIN,
            MembershipRole.COACH,
            MembershipRole.PLAYER,
            MembershipRole.PARENT,
          ],
        },
      },
      orderBy: { user: { name: 'asc' } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    })
  }

  private async listEligibleMembers(
    clubId: string,
    targetRole: string,
    db: any = this.prisma,
  ): Promise<ClubMember[]> {
    const members = await this.listClubMembers(clubId, db)
    if (targetRole === 'CUSTOM' || targetRole === 'ADMIN') {
      return members.filter((member) => isMemberCompatible(member.role, targetRole))
    }
    const relevantTeamRoles: TeamRole[] =
      targetRole === 'PLAYER'
        ? [TeamRole.PLAYER]
        : targetRole === 'COACH'
          ? [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH]
          : [TeamRole.PARENT]
    const access = await db.teamAccess.findMany({
      where: {
        clubId,
        status: 'ACTIVE',
        role: { in: relevantTeamRoles },
      },
      distinct: ['userId'],
      select: { userId: true },
    })
    const additiveUsers = new Set(access.map((row: { userId: string }) => row.userId))
    return members.filter(
      (member) =>
        additiveUsers.has(member.userId) || isMemberCompatible(member.role, targetRole),
    )
  }

  private async listActiveAssignments(
    clubId: string,
    filters?: { planId?: string; memberUserIds?: string[] },
    db: any = this.prisma,
  ) {
    return db.contributionAssignment.findMany({
      where: {
        clubId,
        endDate: null,
        ...(filters?.planId && { planId: filters.planId }),
        ...(filters?.memberUserIds?.length && {
          memberUserId: { in: filters.memberUserIds },
        }),
        plan: {
          active: true,
        },
      },
      include: {
        plan: true,
        member: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            preferredLanguage: true,
            dateOfBirth: true,
          },
        },
      },
    })
  }

  private async ensureCurrentRecords(
    assignments: AssignmentRow[],
    db: any = this.prisma,
  ): Promise<EnsuredRecord[]> {
    const now = new Date()
    const records: EnsuredRecord[] = []

    for (const assignment of assignments) {
      const period = resolveContributionPeriod(
        assignment.plan.cadence,
        {
          dueDay: assignment.plan.dueDay,
          dueMonth: assignment.plan.dueMonth,
          assignmentStart: assignment.startDate,
        },
        now,
      )

      const record = await db.contributionRecord.upsert({
        where: {
          assignmentId_periodStart: {
            assignmentId: assignment.id,
            periodStart: period.periodStart,
          },
        },
        create: {
          clubId: assignment.clubId,
          planId: assignment.planId,
          assignmentId: assignment.id,
          memberUserId: assignment.memberUserId,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          dueDate: period.dueDate,
          amount: assignment.amountOverride ?? assignment.plan.amount,
          currency: assignment.plan.currency,
          status: ContributionRecordStatus.PENDING,
        },
        // Issued financial records are immutable snapshots. Plan edits affect
        // only future periods; they must never rewrite an existing obligation.
        update: {},
      })

      records.push({ assignment, record })
    }

    return records
  }

  private async dispatchAutomaticReminders(
    clubId: string,
    club: { name: string; primaryColor: string | null; badgeUrl: string | null },
    records: EnsuredRecord[],
  ): Promise<ContributionReminderDispatchResult> {
    let requested = 0
    let sent = 0
    let skipped = 0

    for (const item of records) {
      const keys = getAutomaticReminderKeys(item.record, item.assignment.plan)
      for (const reminderKey of keys) {
        requested += 1
        const result = await this.dispatchReminder(item, {
          clubId,
          clubName: club.name,
          clubPrimaryColor: club.primaryColor,
          clubBadgeUrl: club.badgeUrl,
          trigger: ContributionReminderTrigger.AUTOMATIC,
          reminderKey,
        })
        sent += result.sent ? 1 : 0
        skipped += result.sent ? 0 : 1
      }
    }

    return {
      requested,
      sent,
      skipped,
    }
  }

  private async dispatchReminder(
    item: EnsuredRecord,
    input: {
      clubId: string
      clubName: string
      clubPrimaryColor?: string | null
      clubBadgeUrl?: string | null
      trigger: ContributionReminderTrigger
      reminderKey: string
    },
  ) {
    const existing = await this.prisma.contributionReminder.findFirst({
      where: {
        recordId: item.record.id,
        reminderKey: input.reminderKey,
      },
    })

    if (
      existing &&
      (existing.status === ContributionReminderStatus.SENT ||
        existing.status === ContributionReminderStatus.SKIPPED)
    ) {
      return { sent: false }
    }
    if (existing?.status === ContributionReminderStatus.FAILED) {
      const retried = await this.prisma.contributionReminder.updateMany({
        where: { id: existing.id, status: ContributionReminderStatus.FAILED },
        data: {
          status: ContributionReminderStatus.PROCESSING,
          sentAt: new Date(),
          message: 'Retrying failed reminder dispatch.',
        },
      })
      if (retried.count !== 1) return { sent: false }
    } else if (existing) {
      const reclaimed = await this.prisma.contributionReminder.updateMany({
        where: {
          id: existing.id,
          status: ContributionReminderStatus.PROCESSING,
          sentAt: { lte: new Date(Date.now() - 15 * 60 * 1000) },
        },
        data: { sentAt: new Date(), message: 'Reminder dispatch reclaimed after timeout.' },
      })
      if (reclaimed.count !== 1) return { sent: false }
    } else {
      try {
        await this.prisma.contributionReminder.create({
          data: {
            clubId: input.clubId,
            planId: item.assignment.planId,
            assignmentId: item.assignment.id,
            recordId: item.record.id,
            memberUserId: item.assignment.memberUserId,
            trigger: input.trigger,
            reminderKey: input.reminderKey,
            status: ContributionReminderStatus.PROCESSING,
            message: 'Reminder dispatch reserved.',
          },
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return { sent: false }
        }
        throw error
      }
    }

    const derivedStatus = deriveContributionStatus(item.record, item.assignment.plan)
    if (derivedStatus === 'PAID' || derivedStatus === 'WAIVED' || derivedStatus === 'EXEMPT') {
      await this.prisma.contributionReminder.update({
        where: { recordId_reminderKey: { recordId: item.record.id, reminderKey: input.reminderKey } },
        data: {
          status: ContributionReminderStatus.SKIPPED,
          message: `Skipped because status is ${derivedStatus}.`,
        },
      })
      return { sent: false }
    }

    const amountLabel = formatAmount(item.record.amount, item.record.currency)
    const dueDateLabel = formatGermanDate(item.record.dueDate)

    const memberIsMinor = isUnder16(item.assignment.member.dateOfBirth)
    const recipients = memberIsMinor
      ? (
          await this.prisma.guardianRelationship.findMany({
            where: {
              clubId: input.clubId,
              playerUserId: item.assignment.memberUserId,
            },
            include: {
              parent: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  preferredLanguage: true,
                },
              },
            },
          })
        ).map((relationship: any) => relationship.parent)
      : [item.assignment.member]

    const deliveries = await Promise.all(
      recipients.map(async (recipient: any) => {
        const locale = resolveEmailLocale(recipient.preferredLanguage)
        const email = buildContributionReminderEmail({
          locale,
          clubName: input.clubName,
          primaryColor: input.clubPrimaryColor,
          badgeUrl: input.clubBadgeUrl,
          memberName: recipient.name,
          planName: item.assignment.plan.name,
          amountCents: item.record.amount,
          currency: item.record.currency,
          dueDate: item.record.dueDate,
          status: derivedStatus === 'OVERDUE' ? 'OVERDUE' : 'OUTSTANDING',
        })
        const duePush = formatPush(
          'CONTRIBUTION_DUE',
          {
            clubName: input.clubName,
            planName: item.assignment.plan.name,
            amountLabel,
            dueDate: dueDateLabel,
          },
          locale,
        )
        const [emailSent, pushSent] = await Promise.all([
          recipient.email
            ? sendContributionReminderEmail({
                to: recipient.email,
                subject: email.subject,
                html: email.html,
                text: email.text,
              }).catch(() => false)
            : Promise.resolve(false),
          this.pushService
            .sendToUser(
              recipient.id,
              duePush.title,
              duePush.body,
              {
                type: 'contribution',
                clubId: input.clubId,
                memberUserId: item.assignment.memberUserId,
              },
              { clubId: input.clubId },
            )
            .then(() => true)
            .catch(() => false),
        ])
        return { emailSent, pushSent }
      }),
    )
    const emailSent = deliveries.some((delivery) => delivery.emailSent)
    const pushSent = deliveries.some((delivery) => delivery.pushSent)

    await this.prisma.contributionReminder.update({
      where: { recordId_reminderKey: { recordId: item.record.id, reminderKey: input.reminderKey } },
      data: {
        emailSent,
        pushSent,
        status:
          emailSent || pushSent
            ? ContributionReminderStatus.SENT
            : ContributionReminderStatus.FAILED,
        message:
          emailSent || pushSent
            ? null
            : memberIsMinor && recipients.length === 0
              ? 'No linked guardian is available for this minor.'
              : 'No reminder channel succeeded.',
      },
    })

    if (emailSent || pushSent) {
      await this.prisma.contributionRecord.update({
        where: { id: item.record.id },
        data: {
          lastReminderKey: input.reminderKey,
          lastReminderSentAt: new Date(),
        },
      })
    }

    await this.auditService.log({
      clubId: input.clubId,
      type: 'contribution.reminder_sent',
      actorType: input.trigger === ContributionReminderTrigger.MANUAL ? 'user' : 'system',
      actorId:
        input.trigger === ContributionReminderTrigger.MANUAL ? item.assignment.assignedById : null,
      actorLabel: null,
      summary:
        emailSent || pushSent
          ? `Contribution reminder sent to ${item.assignment.member.name} for ${item.assignment.plan.name}.`
          : `Contribution reminder delivery failed for ${item.assignment.member.name} and ${item.assignment.plan.name}.`,
      metadata: {
        planId: item.assignment.planId,
        memberUserId: item.assignment.memberUserId,
        trigger: input.trigger,
      },
    })

    return { sent: emailSent || pushSent }
  }

  private async notifyContributionPaid(input: {
    clubId: string
    memberUserId: string
    planName: string
    amount: number
    currency: string
  }) {
    try {
      const club = await this.prisma.club.findUnique({
        where: { id: input.clubId },
        select: { name: true, primaryColor: true, badgeUrl: true },
      })
      const clubName = club?.name ?? 'Your club'
      const amountLabel = formatAmount(input.amount, input.currency)
      await this.pushService.sendToUserLocalized(
        input.memberUserId,
        'CONTRIBUTION_PAID',
        {
          clubName,
          planName: input.planName,
          amountLabel,
        },
        // 'kind' matches the convention used by chat/event/announce
        // pushes so the mobile deep-link router has a single dispatch
        // surface (apps/mobile/app/_layout.tsx).
        {
          kind: 'CONTRIBUTION_PAID',
          clubId: input.clubId,
          planName: input.planName,
        },
        { clubId: input.clubId },
      )

      // Receipt email — branded + localized to the member's language. The
      // member keeps it as proof of payment; best-effort, mirrors the reminder.
      const member = await this.prisma.user.findUnique({
        where: { id: input.memberUserId },
        select: { name: true, email: true, preferredLanguage: true },
      })
      if (member?.email) {
        const receipt = buildPaymentReceiptEmail({
          locale: resolveEmailLocale(member.preferredLanguage),
          clubName,
          primaryColor: club?.primaryColor,
          badgeUrl: club?.badgeUrl,
          memberName: member.name ?? clubName,
          planName: input.planName,
          amountCents: input.amount,
          currency: input.currency,
          paidAt: new Date(),
        })
        await sendContributionReminderEmail({
          to: member.email,
          subject: receipt.subject,
          html: receipt.html,
          text: receipt.text,
        })
      }
    } catch {
      // Push + email are best-effort — never block the mark-paid flow.
    }
  }
}

function localizedPlanName(
  plan: { name: string; nameEn: string | null; nameDe: string | null },
  locale: 'en' | 'de',
): string {
  if (locale === 'de') {
    return plan.nameDe ?? plan.name
  }
  return plan.nameEn ?? plan.name
}

/** undefined → leave unchanged; ''/whitespace → null (clear); else trimmed. */
function normalizeNullableText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

function toContributionSettings(
  settings: Awaited<ReturnType<PrismaService['clubContributionSettings']['upsert']>>,
): ContributionSettings {
  return {
    clubId: settings.clubId,
    enabled: settings.enabled,
    autoRemindersEnabled: settings.autoRemindersEnabled,
    defaultCurrency: settings.defaultCurrency,
    bankAccountHolder: settings.bankAccountHolder ?? null,
    bankIban: settings.bankIban ?? null,
    bankReference: settings.bankReference ?? null,
  }
}

function toContributionPlan(plan: PlanRow): ContributionPlan {
  return {
    id: plan.id,
    clubId: plan.clubId,
    name: plan.name,
    description: plan.description,
    amount: plan.amount,
    currency: plan.currency,
    cadence: plan.cadence,
    targetRole: plan.targetRole,
    dueDay: plan.dueDay,
    dueMonth: plan.dueMonth,
    graceDays: plan.graceDays,
    reminderPolicy: {
      daysBefore: [...plan.reminderDaysBefore].sort((left, right) => right - left),
      daysAfter: [...plan.reminderDaysAfter].sort((left, right) => left - right),
    },
    active: plan.active,
    assignedMemberCount: plan.assignments.length,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  }
}

function validatePlanInput(input: {
  name?: string
  description?: string
  amount: number
  currency?: string
  cadence: string
  targetRole?: string
  dueDay: number
  dueMonth?: number | null
  graceDays?: number
  reminderPolicy: { daysBefore: number[]; daysAfter: number[] }
  active?: boolean
}) {
  if (!input.name?.trim()) {
    throw new BadRequestException('Contribution plan name is required.')
  }

  if (input.amount < 0) {
    throw new BadRequestException('Contribution amount must be zero or greater.')
  }

  if (input.cadence === 'YEARLY' && !input.dueMonth) {
    throw new BadRequestException('Yearly contribution plans require a due month.')
  }

  if (input.dueDay < 1 || input.dueDay > 28) {
    throw new BadRequestException('Contribution due day must be between 1 and 28.')
  }

  if (
    input.reminderPolicy.daysBefore.some((value) => value < 0) ||
    input.reminderPolicy.daysAfter.some((value) => value < 0)
  ) {
    throw new BadRequestException('Reminder offsets cannot be negative.')
  }
}

function normalizeCurrency(value: string) {
  return value.trim().toLowerCase()
}

function normalizeDayOffsets(values: number[]) {
  return Array.from(new Set(values)).sort((left, right) => left - right)
}

function isMemberCompatible(
  role: 'OWNER' | 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT',
  targetRole: string,
) {
  switch (targetRole) {
    case 'PLAYER':
      return role === MembershipRole.PLAYER
    case 'PARENT':
      return role === MembershipRole.PARENT
    case 'COACH':
      return role === MembershipRole.COACH
    case 'ADMIN':
      return role === MembershipRole.ADMIN || role === MembershipRole.OWNER
    case 'CUSTOM':
      return true
    default:
      return false
  }
}

export function resolveContributionPeriod(
  cadence: ContributionCadence,
  input: { dueDay: number; dueMonth: number | null; assignmentStart: Date },
  now: Date,
) {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()

  if (cadence === ContributionCadence.YEARLY) {
    const dueMonthIndex = Math.max((input.dueMonth ?? 1) - 1, 0)
    return {
      periodStart: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
      periodEnd: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
      dueDate: new Date(Date.UTC(year, dueMonthIndex, input.dueDay, 12, 0, 0, 0)),
    }
  }

  if (cadence === ContributionCadence.QUARTERLY) {
    const quarterStartMonth = Math.floor(month / 3) * 3
    return {
      periodStart: new Date(Date.UTC(year, quarterStartMonth, 1, 0, 0, 0, 0)),
      periodEnd: new Date(Date.UTC(year, quarterStartMonth + 3, 0, 23, 59, 59, 999)),
      dueDate: new Date(Date.UTC(year, quarterStartMonth, input.dueDay, 12, 0, 0, 0)),
    }
  }

  if (cadence === ContributionCadence.ONE_OFF) {
    const start = input.assignmentStart
    const startYear = start.getUTCFullYear()
    const startMonth = start.getUTCMonth()
    const startDay = start.getUTCDate()
    const dueMonth = input.dueDay < startDay ? startMonth + 1 : startMonth
    const periodStart = new Date(Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0))
    return {
      periodStart,
      periodEnd: new Date(Date.UTC(startYear, startMonth, startDay, 23, 59, 59, 999)),
      dueDate: new Date(Date.UTC(startYear, dueMonth, input.dueDay, 12, 0, 0, 0)),
    }
  }

  return {
    periodStart: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
    dueDate: new Date(Date.UTC(year, month, input.dueDay, 12, 0, 0, 0)),
  }
}

function deriveContributionStatus(
  record: EnsuredRecord['record'],
  plan: AssignmentRow['plan'],
): ContributionOverview['members'][number]['status'] {
  if (record.status === ContributionRecordStatus.PAID) return 'PAID'
  if (record.status === ContributionRecordStatus.PARTIAL) {
    return isPastGraceWindow(record.dueDate, plan.graceDays) ? 'OVERDUE' : 'PARTIAL'
  }
  if (record.status === ContributionRecordStatus.WAIVED) return 'WAIVED'
  if (record.status === ContributionRecordStatus.EXEMPT) return 'EXEMPT'
  return isPastGraceWindow(record.dueDate, plan.graceDays) ? 'OVERDUE' : 'PENDING'
}

function validatePaidAmount(
  status: UpdateContributionMemberStatusInput['status'],
  requestedAmount: number | undefined,
  amountDue: number,
) {
  if (status === 'PAID') {
    const paidAmount = requestedAmount ?? amountDue
    if (paidAmount !== amountDue) {
      throw new BadRequestException('Paid amount must equal the amount due.')
    }
    return paidAmount
  }
  if (status === 'PARTIAL') {
    if (requestedAmount === undefined || requestedAmount <= 0 || requestedAmount >= amountDue) {
      throw new BadRequestException(
        'Partial amount must be greater than zero and less than the amount due.',
      )
    }
    return requestedAmount
  }
  if (requestedAmount !== undefined && requestedAmount !== 0) {
    throw new BadRequestException('Paid amount is only valid for paid or partial status.')
  }
  return null
}

function isUnder16(dateOfBirth: Date | null | undefined, now = new Date()) {
  if (!dateOfBirth) return false
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear() - 16, now.getUTCMonth(), now.getUTCDate()),
  )
  return dateOfBirth > cutoff
}

function isPastGraceWindow(dueDate: Date, graceDays: number) {
  const threshold = new Date(dueDate)
  threshold.setUTCDate(threshold.getUTCDate() + graceDays)
  return threshold.getTime() < Date.now()
}

function getAutomaticReminderKeys(record: EnsuredRecord['record'], plan: AssignmentRow['plan']) {
  const result: string[] = []
  const now = new Date()
  const dueDate = record.dueDate
  const diffDays = Math.ceil((startOfDay(dueDate).getTime() - startOfDay(now).getTime()) / 86400000)

  for (const daysBefore of plan.reminderDaysBefore) {
    if (daysBefore === diffDays) {
      result.push(`auto:before:${daysBefore}`)
    }
  }

  for (const daysAfter of plan.reminderDaysAfter) {
    if (diffDays === -daysAfter) {
      result.push(`auto:after:${daysAfter}`)
    }
  }

  return result
}

function getContributionStatusSortOrder(status: string) {
  switch (status) {
    case 'OVERDUE':
      return 0
    case 'PENDING':
      return 1
    case 'PARTIAL':
      return 2
    case 'PAID':
      return 3
    case 'WAIVED':
      return 4
    case 'EXEMPT':
      return 5
    default:
      return 99
  }
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

function formatGermanDate(value: Date) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value)
}

function formatDateKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function startOfDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

async function sendContributionReminderEmail(input: {
  to: string
  subject: string
  html: string
  text: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) {
    return false
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  return response.ok
}
