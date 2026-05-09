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
} from '@prisma/client'
import { AuditService } from '../audit/audit.service'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import { formatPush } from '../push/push.templates'
import { BillingService } from '../billing/billing.service'

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

type PlanRow = Awaited<
  ReturnType<ContributionsService['listPlanRows']>
>[number]

type AssignmentRow = Awaited<
  ReturnType<ContributionsService['listActiveAssignments']>
>[number]

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
    private readonly billingService: BillingService,
  ) {}

  async getSettings(
    clubId: string,
    userId: string,
  ): Promise<ContributionSettings> {
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

    const settings = await this.prisma.clubContributionSettings.upsert({
      where: { clubId },
      create: {
        clubId,
        enabled: input.enabled,
        autoRemindersEnabled: input.autoRemindersEnabled,
        defaultCurrency: normalizeCurrency(input.defaultCurrency),
      },
      update: {
        enabled: input.enabled,
        autoRemindersEnabled: input.autoRemindersEnabled,
        defaultCurrency: normalizeCurrency(input.defaultCurrency),
      },
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

    const plan = await this.prisma.contributionPlan.create({
      data: {
        clubId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        amount: input.amount,
        currency: normalizeCurrency(input.currency),
        cadence: input.cadence,
        targetRole: input.targetRole,
        dueDay: input.dueDay,
        dueMonth: input.cadence === 'YEARLY' ? input.dueMonth ?? 1 : null,
        graceDays: input.graceDays ?? 0,
        reminderDaysBefore: normalizeDayOffsets(input.reminderPolicy.daysBefore),
        reminderDaysAfter: normalizeDayOffsets(input.reminderPolicy.daysAfter),
        active: input.active ?? true,
        createdById: userId,
      },
      include: {
        assignments: {
          where: { endDate: null },
          select: { id: true },
        },
      },
    })

    if (input.memberUserIds?.length) {
      await this.replaceAssignments(clubId, userId, {
        planId: plan.id,
        memberUserIds: input.memberUserIds,
      })
    }

    await this.prisma.clubContributionSettings.upsert({
      where: { clubId },
      create: {
        clubId,
        enabled: true,
        autoRemindersEnabled: true,
        defaultCurrency: normalizeCurrency(input.currency),
      },
      update: {
        enabled: true,
      },
    })

    await this.auditService.log({
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
      },
    })

    const refreshed = await this.prisma.contributionPlan.findFirst({
      where: { id: plan.id },
      include: {
        assignments: {
          where: { endDate: null },
          select: { id: true },
        },
      },
    })

    if (!refreshed) {
      throw new NotFoundException('Contribution plan not found after create')
    }

    return toContributionPlan(refreshed)
  }

  async updatePlan(
    clubId: string,
    planId: string,
    userId: string,
    input: UpdateContributionPlanInput,
  ): Promise<ContributionPlan> {
    await this.assertBillingAccess(clubId, userId)

    const currentPlan = await this.prisma.contributionPlan.findFirst({
      where: { id: planId },
    })

    if (!currentPlan) {
      throw new NotFoundException('Contribution plan not found')
    }

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
        daysBefore:
          input.reminderPolicy?.daysBefore ?? currentPlan.reminderDaysBefore,
        daysAfter: input.reminderPolicy?.daysAfter ?? currentPlan.reminderDaysAfter,
      },
      active: input.active ?? currentPlan.active,
    })

    const updated = await this.prisma.contributionPlan.update({
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

    const plan = await this.prisma.contributionPlan.findFirst({
      where: { id: planId, clubId },
    })
    if (!plan) {
      throw new NotFoundException('Contribution plan not found')
    }

    const recordCount = await this.prisma.contributionRecord.count({
      where: { planId },
    })

    const now = new Date()

    if (recordCount === 0) {
      // No financial history yet — safe to fully drop. End assignments
      // first to satisfy the FK chain, then delete the plan.
      await this.prisma.contributionAssignment.deleteMany({
        where: { planId },
      })
      await this.prisma.contributionPlan.delete({ where: { id: planId } })
    } else {
      // History exists — soft-delete: deactivate the plan + end open
      // assignments. Records and reminders stay intact for audit.
      await this.prisma.contributionAssignment.updateMany({
        where: { planId, endDate: null },
        data: { endDate: now },
      })
      await this.prisma.contributionPlan.update({
        where: { id: planId },
        data: { active: false },
      })
    }

    await this.auditService.log({
      clubId,
      type: 'contribution.plan_deleted',
      actorType: 'user',
      actorId: userId,
      actorLabel: null,
      summary: `${plan.name} contribution plan ${recordCount === 0 ? 'deleted' : 'archived (history retained)'}.`,
      metadata: { planId, hadHistory: recordCount > 0 },
    })

    return { ok: true, planId, hardDeleted: recordCount === 0 }
  }

  async replaceAssignments(
    clubId: string,
    userId: string,
    input: UpdateContributionAssignmentsInput,
  ) {
    await this.assertBillingAccess(clubId, userId)

    const plan = await this.prisma.contributionPlan.findFirst({
      where: { id: input.planId },
    })

    if (!plan) {
      throw new NotFoundException('Contribution plan not found')
    }

    const desiredUserIds = Array.from(
      new Set(input.memberUserIds.map((memberUserId) => memberUserId.trim())),
    ).filter(Boolean)

    const eligibleMembers = await this.listEligibleMembers(clubId, plan.targetRole)
    const eligibleUserIds = new Set(eligibleMembers.map((member) => member.userId))

    const incompatibleMemberId = desiredUserIds.find(
      (memberUserId) => !eligibleUserIds.has(memberUserId),
    )

    if (incompatibleMemberId) {
      throw new BadRequestException('Selected member is not compatible with this contribution plan.')
    }

    const existingAssignments = await this.prisma.contributionAssignment.findMany({
      where: {
        planId: plan.id,
      },
    })

    const now = new Date()
    const activeAssignments = existingAssignments.filter(
      (assignment) => assignment.endDate === null,
    )
    const activeUserIds = new Set(activeAssignments.map((assignment) => assignment.memberUserId))

    for (const memberUserId of desiredUserIds) {
      await this.prisma.contributionAssignment.updateMany({
        where: {
          clubId,
          memberUserId,
          endDate: null,
          planId: { not: plan.id },
        },
        data: { endDate: now },
      })

      await this.prisma.contributionAssignment.upsert({
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
      .map((assignment) => assignment.memberUserId)
      .filter((memberUserId) => !desiredUserIds.includes(memberUserId))

    if (removedUserIds.length > 0) {
      await this.prisma.contributionAssignment.updateMany({
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
      const assignments = await this.listActiveAssignments(clubId, {
        planId: plan.id,
        memberUserIds: nextActiveUserIds,
      })
      await this.ensureCurrentRecords(assignments)
    }

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

    const paidAmount =
      input.status === 'PAID'
        ? input.paidAmount ?? current.record.amount
        : input.status === 'PARTIAL'
          ? input.paidAmount ?? Math.max(Math.round(current.record.amount / 2), 1)
          : null

    await this.prisma.contributionRecord.update({
      where: { id: current.record.id },
      data: {
        status: input.status as ContributionRecordStatus,
        paidAmount,
        paidAt:
          input.status === 'PAID' || input.status === 'PARTIAL'
            ? new Date()
            : null,
        note: input.note?.trim() || null,
      },
    })

    await this.auditService.log({
      clubId,
      type: 'contribution.status_updated',
      actorType: 'user',
      actorId: userId,
      actorLabel: null,
      summary: `${assignment.member.name} marked as ${input.status.toLowerCase()} for ${assignment.plan.name}.`,
      metadata: {
        memberUserId,
        planId: assignment.planId,
        status: input.status,
      },
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
      select: { name: true },
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

  async runAutomaticReminderSweep(
    clubId: string,
  ): Promise<ContributionReminderDispatchResult> {
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
      select: { name: true },
    })
    const assignments = await this.listActiveAssignments(clubId)
    const ensured = await this.ensureCurrentRecords(assignments)

    return this.dispatchAutomaticReminders(
      clubId,
      club?.name ?? 'Your club',
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
  ): Promise<Array<{ planId: string; planName: string; amount: number; currency: string; dueDate: Date }>> {
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

    const assignments = await this.listActiveAssignments(clubId, {
      memberUserIds: [userId],
    })

    if (assignments.length === 0) {
      return { items: [], hasContributions: false }
    }

    const ensured = await this.ensureCurrentRecords(assignments)

    const items = ensured.map((item) => ({
      planId: item.assignment.planId,
      planName: localizedPlanName(item.assignment.plan, locale),
      amount: item.record.amount,
      currency: item.record.currency,
      cadence: item.assignment.plan.cadence as 'MONTHLY' | 'YEARLY',
      dueDate: item.record.dueDate.toISOString(),
      status: deriveContributionStatus(item.record, item.assignment.plan)!,
      paidAmount: item.record.paidAmount,
      paidAt: item.record.paidAt?.toISOString() ?? null,
    }))

    items.sort((a, b) => {
      const ao = getContributionStatusSortOrder(a.status)
      const bo = getContributionStatusSortOrder(b.status)
      return ao !== bo ? ao - bo : a.dueDate.localeCompare(b.dueDate)
    })

    return { items, hasContributions: true }
  }

  /**
   * Start a Stripe Checkout flow for the caller's own contribution
   * record. Returns `{ url }` when the club has Stripe Connect; null
   * when not configured. Mobile then either opens the URL or falls
   * back to the soft mark-paid path.
   *
   * Resolving the assignment + record server-side keeps the mobile
   * payload small (just planId) and re-uses the same period-resolution
   * logic markOwnAsPaid uses, so a Checkout session never gets minted
   * against a stale or already-PAID record.
   */
  async startCheckoutForOwnPlan(
    clubId: string,
    userId: string,
    planId: string,
  ): Promise<{ url: string } | null> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    })
    if (!membership) {
      throw new ForbiddenException('You are not a member of this club.')
    }

    const assignment = await this.prisma.contributionAssignment.findFirst({
      where: { clubId, planId, memberUserId: userId, endDate: null },
      include: {
        plan: true,
        member: {
          select: { id: true, name: true, email: true, avatarUrl: true },
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
    if (current.record.status === ContributionRecordStatus.PAID) {
      // Already settled — nothing to charge.
      return null
    }

    return this.billingService.createContributionCheckoutSession({
      clubId,
      recordId: current.record.id,
      memberUserId: userId,
      planName: assignment.plan.name,
      amount: current.record.amount,
      currency: current.record.currency,
    })
  }

  /**
   * Webhook handler — called by BillingService when a Stripe
   * `checkout.session.completed` event arrives with metadata.intent =
   * 'contribution_payment'. Flips the ContributionRecord to PAID and
   * fires the same notify path as markOwnAsPaid so mobile sees the
   * change reflected on next refresh.
   */
  async markRecordPaidByWebhook(input: {
    recordId: string
    paidAmount: number
  }): Promise<void> {
    const record = await this.prisma.contributionRecord.findUnique({
      where: { id: input.recordId },
      include: { plan: true, member: { select: { id: true, name: true } } },
    })
    if (!record) return
    if (record.status === ContributionRecordStatus.PAID) return

    await this.prisma.contributionRecord.update({
      where: { id: record.id },
      data: {
        status: ContributionRecordStatus.PAID,
        paidAmount: input.paidAmount,
        paidAt: new Date(),
      },
    })

    await this.auditService.log({
      clubId: record.clubId,
      type: 'contribution.stripe_paid',
      actorType: 'system',
      actorId: null,
      actorLabel: 'stripe',
      summary: `${record.member.name} paid ${record.plan.name} via Stripe.`,
      metadata: {
        planId: record.planId,
        recordId: record.id,
        memberUserId: record.memberUserId,
      },
    })

    await this.notifyContributionPaid({
      clubId: record.clubId,
      memberUserId: record.memberUserId,
      planName: record.plan.name,
      amount: input.paidAmount,
      currency: record.currency,
    })
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

    if (current.record.status === ContributionRecordStatus.PAID) {
      return this.getMyContributions(clubId, userId)
    }

    await this.prisma.contributionRecord.update({
      where: { id: current.record.id },
      data: {
        status: ContributionRecordStatus.PAID,
        paidAmount: current.record.amount,
        paidAt: new Date(),
      },
    })

    await this.auditService.log({
      clubId,
      type: 'contribution.self_marked_paid',
      actorType: 'user',
      actorId: userId,
      actorLabel: null,
      summary: `Member self-marked ${assignment.plan.name} as paid.`,
      metadata: {
        planId,
        recordId: current.record.id,
      },
    })

    await this.notifyContributionPaid({
      clubId,
      memberUserId: userId,
      planName: assignment.plan.name,
      amount: current.record.amount,
      currency: current.record.currency,
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

  private async listClubMembers(clubId: string): Promise<ClubMember[]> {
    return this.prisma.membership.findMany({
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
  ): Promise<ClubMember[]> {
    const members = await this.listClubMembers(clubId)
    return members.filter((member) => isMemberCompatible(member.role, targetRole))
  }

  private async listActiveAssignments(
    clubId: string,
    filters?: { planId?: string; memberUserIds?: string[] },
  ) {
    return this.prisma.contributionAssignment.findMany({
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
          },
        },
      },
    })
  }

  private async ensureCurrentRecords(assignments: AssignmentRow[]): Promise<EnsuredRecord[]> {
    const now = new Date()
    const records: EnsuredRecord[] = []

    for (const assignment of assignments) {
      const period = resolveContributionPeriod(assignment.plan.cadence, {
        dueDay: assignment.plan.dueDay,
        dueMonth: assignment.plan.dueMonth,
      }, now)

      const record = await this.prisma.contributionRecord.upsert({
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
          amount: assignment.plan.amount,
          currency: assignment.plan.currency,
          status: ContributionRecordStatus.PENDING,
        },
        update: {
          periodEnd: period.periodEnd,
          dueDate: period.dueDate,
          amount: assignment.plan.amount,
          currency: assignment.plan.currency,
        },
      })

      records.push({ assignment, record })
    }

    return records
  }

  private async dispatchAutomaticReminders(
    clubId: string,
    clubName: string,
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
          clubName,
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

    if (existing) {
      return { sent: false }
    }

    const derivedStatus = deriveContributionStatus(item.record, item.assignment.plan)
    if (derivedStatus === 'PAID' || derivedStatus === 'WAIVED' || derivedStatus === 'EXEMPT') {
      await this.prisma.contributionReminder.create({
        data: {
          clubId: input.clubId,
          planId: item.assignment.planId,
          assignmentId: item.assignment.id,
          recordId: item.record.id,
          memberUserId: item.assignment.memberUserId,
          trigger: input.trigger,
          reminderKey: input.reminderKey,
          status: ContributionReminderStatus.SKIPPED,
          message: `Skipped because status is ${derivedStatus}.`,
        },
      })
      return { sent: false }
    }

    const amountLabel = formatAmount(item.record.amount, item.record.currency)
    const dueDateLabel = formatGermanDate(item.record.dueDate)
    const subject = `${input.clubName}: ${item.assignment.plan.name} due`
    const body = [
      `Hello ${item.assignment.member.name},`,
      ``,
      `${item.assignment.plan.name} is currently due for ${amountLabel}.`,
      `Due date: ${dueDateLabel}`,
      `Status: ${derivedStatus === 'OVERDUE' ? 'Overdue' : 'Outstanding'}`,
      ``,
      `If you have already paid, the club can update your status directly in Anstoss.`,
      ``,
      `${input.clubName} via Anstoss`,
    ].join('\n')

    const memberEmail = item.assignment.member.email
    const [emailSent, pushSent] = await Promise.all([
      memberEmail
        ? sendContributionReminderEmail({
            to: memberEmail,
            subject,
            body,
          })
        : Promise.resolve(false),
      this.pushService
        .sendToUser(
          item.assignment.memberUserId,
          `${input.clubName}: contribution due`,
          `${item.assignment.plan.name} · ${amountLabel} · due ${dueDateLabel}`,
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

    await this.prisma.contributionReminder.create({
      data: {
        clubId: input.clubId,
        planId: item.assignment.planId,
        assignmentId: item.assignment.id,
        recordId: item.record.id,
        memberUserId: item.assignment.memberUserId,
        trigger: input.trigger,
        reminderKey: input.reminderKey,
        emailSent,
        pushSent,
        status:
          emailSent || pushSent
            ? ContributionReminderStatus.SENT
            : ContributionReminderStatus.FAILED,
        message: emailSent || pushSent ? null : 'No reminder channel succeeded.',
      },
    })

    await this.prisma.contributionRecord.update({
      where: { id: item.record.id },
      data: {
        lastReminderKey: input.reminderKey,
        lastReminderSentAt: new Date(),
      },
    })

    await this.auditService.log({
      clubId: input.clubId,
      type: 'contribution.reminder_sent',
      actorType: input.trigger === ContributionReminderTrigger.MANUAL ? 'user' : 'system',
      actorId: input.trigger === ContributionReminderTrigger.MANUAL ? item.assignment.assignedById : null,
      actorLabel: null,
      summary: `Contribution reminder sent to ${item.assignment.member.name} for ${item.assignment.plan.name}.`,
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
        select: { name: true },
      })
      const clubName = club?.name ?? 'Your club'
      const amountLabel = formatAmount(input.amount, input.currency)
      const { title, body } = formatPush('CONTRIBUTION_PAID', {
        clubName,
        planName: input.planName,
        amountLabel,
      })
      await this.pushService.sendToUser(
        input.memberUserId,
        title,
        body,
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
    } catch {
      // Push is best-effort — never block the mark-paid flow.
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

function toContributionSettings(
  settings: Awaited<ReturnType<PrismaService['clubContributionSettings']['upsert']>>,
): ContributionSettings {
  return {
    clubId: settings.clubId,
    enabled: settings.enabled,
    autoRemindersEnabled: settings.autoRemindersEnabled,
    defaultCurrency: settings.defaultCurrency,
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

function resolveContributionPeriod(
  cadence: ContributionCadence,
  input: { dueDay: number; dueMonth: number | null },
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

function isPastGraceWindow(dueDate: Date, graceDays: number) {
  const threshold = new Date(dueDate)
  threshold.setUTCDate(threshold.getUTCDate() + graceDays)
  return threshold.getTime() < Date.now()
}

function getAutomaticReminderKeys(
  record: EnsuredRecord['record'],
  plan: AssignmentRow['plan'],
) {
  const result: string[] = []
  const now = new Date()
  const dueDate = record.dueDate
  const diffDays = Math.ceil(
    (startOfDay(dueDate).getTime() - startOfDay(now).getTime()) / 86400000,
  )

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
  body: string
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
      text: input.body,
    }),
  })

  return response.ok
}
