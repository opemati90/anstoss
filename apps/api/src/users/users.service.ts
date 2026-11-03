import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { createClerkClient } from '@clerk/backend'
import { ClubClaimStatus, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  AGE_GATE,
  LAUNCH_FEATURES,
  buildClubPermissionMap,
  ClubOperationalRole,
  CRITICAL_OPERATIONAL_ROLES,
  FreeAgentVisibility,
  MembershipRole,
  ParentalConsentStatus,
  PlayerPosition,
  RegistrationRole,
  TeamAccessStatus,
  TeamRole,
  getAge,
  matchesSearchText,
  rsvpStatusSchema,
} from '@anstoss/shared'
import type {
  CompleteOnboardingInput,
  CrossTeamEventItem,
  MemberListFilter,
  MemberListQuery,
} from '@anstoss/shared'
import type { ParentHandoffInput } from '@anstoss/shared'
// home revamp: parent home overview
import type {
  ChildOverviewAnnouncement,
  ChildOverviewChild,
  ChildOverviewDuty,
  ChildrenOverview,
} from '@anstoss/shared'
import { TeamsService } from '../teams/teams.service'
import { assertLaunchBirthDate, assertLaunchParticipant, launchClubParticipantWhere, requireYouthParticipation } from '../auth/launch-access-policy'
import { activeLaunchTeamAccessWhere as activeTeamAccessWhere } from '../teams/active-team-access'
import { ClubsService } from '../clubs/clubs.service'
import { InvitesService } from '../invites/invites.service'
import { MarketplaceService } from '../marketplace/marketplace.service'
import { buildParentHandoffEmail, resolveEmailLocale } from '../email/email-content'
import { sendEmail } from '../email/mailer'
import {
  AUTH_IDENTITY_PROVIDER_CLERK,
  hashAuthSubject,
  lockAuthSubject,
} from '../auth/auth-identity-tombstone'
import {
  isUnderageEmailBlocked,
  normalizeTombstoneEmail,
  tombstoneUnderageEmail,
} from '../auth/underage-email-tombstone'
import { R2Provider } from '../assets/r2.provider'
import { lockMediaObject } from '../assets/media-object-lock'
import { cancelAccountPrivateUploads, findAccountPrivateUploads } from '../assets/private-upload-account-erasure'
import { isOwnedPrivateV1Key } from '../media/private-v1-owner'
import { uploadKindFor, type ChatAttachmentType } from '../media/chat-media-limits'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { tenantContext } from '../prisma/tenant.context'
// club-admin review fixes (H3): Führungszeugnis retention on offboarding.
import { deleteStaffCertificate } from '../admin-inbox/compliance-retention'
// Privacy: guardian deletion withdraws the consents they gave.
import {
  CONSENT_WITHDRAWAL_REASON,
  CONSENT_WITHDRAWN_EVENT,
  withdrawApprovedConsentTx,
  type ConsentWithdrawalEffect,
  type ConsentWithdrawnEventPayload,
} from '../consent/consent-withdrawal'

const RsvpStatus = rsvpStatusSchema.enum

// Parent-handoff code: unambiguous alphabet (no 0/O/1/I), 8 chars, 30-day TTL.
const HANDOFF_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const HANDOFF_CODE_LENGTH = 8
const PARENT_HANDOFF_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Anti-spam: at most N handoff emails to the same guardian address per window.
const PARENT_HANDOFF_GUARDIAN_CAP = 3
const PARENT_HANDOFF_GUARDIAN_WINDOW_MS = 24 * 60 * 60 * 1000

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly clubsService: ClubsService,
    private readonly invitesService: InvitesService,
    private readonly marketplaceService: MarketplaceService,
    @Optional() private readonly r2?: R2Provider,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  private async assertOwnedAvatarUpload(userId: string, url: string): Promise<void> {
    if (!this.r2?.enabled) return
    const objectKey = this.r2.objectKeyFromUrl(url)
    if (!objectKey || !objectKey.startsWith(`users/${userId}/avatar/`)) {
      throw new BadRequestException('Avatar does not belong to this user upload')
    }
    try {
      await this.r2.assertStoredObject(objectKey, {
        maxBytes: 10 * 1024 * 1024,
        allowedContentTypes: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
      })
    } catch {
      throw new BadRequestException('Avatar upload is invalid or incomplete')
    }
  }

  /**
   * Under-16 parent handoff. Called while the child is still briefly
   * authenticated (right before client sign-out). It:
   *  1. verifies the child is genuinely under 16 (server-side, from the DOB) —
   *     so the email endpoint can't be used by adults to spam arbitrary inboxes;
   *  2. persists a one-time, expiring handoff with a redeemable code;
   *  3. emails the guardian the code (best-effort), localized to the child's
   *     chosen language;
   *  4. removes the child's self-created account (an under-16 must not retain a
   *     login) — soft-delete + best-effort Clerk deletion.
   */
  async sendParentHandoff(userId: string, input: ParentHandoffInput) {
    requireYouthParticipation()
    const dob = new Date(input.childDateOfBirth)
    if (Number.isNaN(dob.getTime()) || getAge(dob) >= AGE_GATE.MIN_AGE) {
      throw new BadRequestException('Parent handoff is only available for under-16 sign-ups')
    }
    // Onboarding review fix (B1/M3): under 13 is blocked on every path; the
    // handoff is the 13-15 route.
    if (getAge(dob) < AGE_GATE.MIN_DIRECT_ACCOUNT_AGE) {
      throw new ForbiddenException({
        message: 'Children under 13 are set up by a parent or guardian',
        code: 'UNDER_13',
      })
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { clerkId: true, preferredLanguage: true, email: true },
    })
    if (!user) {
      throw new NotFoundException('User not found')
    }

    const guardianEmail = input.guardianEmail.trim().toLowerCase()

    // Onboarding review fix (B2): the guardian is a third party. Not the
    // child's own address, and not an address whose under-16 account was
    // removed recently (the same child coming back as their own "parent").
    if (
      guardianEmail === normalizeTombstoneEmail(user.email) ||
      (await isUnderageEmailBlocked(this.prisma, guardianEmail))
    ) {
      throw new BadRequestException({
        message: "The guardian email cannot be the child's own email",
        code: 'GUARDIAN_IS_CHILD',
      })
    }

    // Invite path: remember the team so the guardian only picks the child's
    // spot (the team code becomes optional when redeeming).
    const teamId = input.inviteCode ? await this.resolveInviteTeamId(input.inviteCode) : null

    // Opportunistic retention purge + per-guardian spam cap. Because the gate
    // above trusts a client-submitted DOB and each call deletes the caller's
    // own (cheap-to-mint) account, a per-USER rate limit can't bound abuse — an
    // attacker could fan branded emails out to arbitrary inboxes one throwaway
    // account at a time. Capping by recipient address throttles that, and
    // clearing expired rows here keeps minor PII from lingering (no scheduler
    // exists in this codebase yet — see TODO for a full purge job).
    await this.prisma.parentHandoff.deleteMany({
      where: { guardianEmail, expiresAt: { lt: new Date() } },
    })
    const recent = await this.prisma.parentHandoff.count({
      where: {
        guardianEmail,
        createdAt: { gt: new Date(Date.now() - PARENT_HANDOFF_GUARDIAN_WINDOW_MS) },
      },
    })
    if (recent >= PARENT_HANDOFF_GUARDIAN_CAP) {
      throw new BadRequestException(
        'Too many setup requests for this email. Please try again later.',
      )
    }

    const { code } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`

      const existing = await tx.parentHandoff.findUnique({
        where: { sourceUserId: userId },
        select: { code: true, status: true, expiresAt: true },
      })
      if (existing?.status === 'PENDING' && existing.expiresAt > new Date()) {
        return { code: existing.code }
      }
      if (existing) {
        throw new BadRequestException('A setup handoff already exists for this account')
      }

      const nextCode = await this.allocateHandoffCode(tx)
      await tx.parentHandoff.create({
        data: {
          code: nextCode,
          childFirstName: input.childFirstName,
          childDateOfBirth: dob,
          guardianEmail,
          sourceUserId: userId,
          teamId,
          expiresAt: new Date(Date.now() + PARENT_HANDOFF_TTL_MS),
        },
      })

      // B1: the child's address can't self-register again for 30 days.
      await tombstoneUnderageEmail(tx, user.email, userId, 'underage_parent_handoff')

      // Remove the child's account BEFORE emailing: account removal is the
      // security-critical step (an under-16 must not retain a login). If it threw
      // after the email we'd have promised a handoff while leaving a working
      // child account, so do it first and let a failure abort before we email.
      await this.removeUnderageAccountInTransaction(tx, userId, user.clerkId)

      return { code: nextCode }
    })

    await this.deleteUnderageClerkIdentity(user.clerkId)

    const locale = resolveEmailLocale(user.preferredLanguage)
    const { subject, html, text } = buildParentHandoffEmail({
      locale,
      childFirstName: input.childFirstName,
      code,
    })
    const sent = await sendEmail({ to: guardianEmail, subject, html, text })

    // If the email couldn't be delivered (Resend down / unconfigured), hand the
    // code back so the child can give it to their guardian in person — the
    // account is already removed, so showing the code here is safe (redemption
    // needs a separate parent account).
    return { sent, code: sent ? null : code }
  }

  /** Team of an invite or invite link, or null when the code is unusable. */
  private async resolveInviteTeamId(code: string): Promise<string | null> {
    try {
      const invite = await this.invitesService.validate(code)
      return invite.teamId ?? null
    } catch {
      try {
        const campaign = await this.invitesService.validateCampaign(code)
        return campaign.team?.id ?? null
      } catch {
        return null
      }
    }
  }

  /** Allocate a collision-free, human-typeable handoff code. */
  private async allocateHandoffCode(
    client: { parentHandoff: { findUnique: typeof this.prisma.parentHandoff.findUnique } } = this
      .prisma,
  ): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = Array.from(
        { length: HANDOFF_CODE_LENGTH },
        () => HANDOFF_CODE_ALPHABET[randomInt(HANDOFF_CODE_ALPHABET.length)],
      ).join('')
      const existing = await client.parentHandoff.findUnique({
        where: { code },
        select: { id: true },
      })
      if (!existing) {
        return code
      }
    }
    throw new Error('Unable to allocate a unique parent-handoff code')
  }

  /**
   * Remove an under-16's self-created account: tombstone the Clerk subject,
   * soft-delete/anonymize the backend user, and best-effort delete the Clerk
   * identity so no token can be minted for them.
   */
  private async removeUnderageAccountInTransaction(
    tx: {
      $queryRaw: typeof this.prisma.$queryRaw
      authIdentityTombstone: {
        upsert: typeof this.prisma.authIdentityTombstone.upsert
      }
      user: { update: typeof this.prisma.user.update }
    },
    userId: string,
    clerkId: string | null,
  ) {
    if (clerkId) {
      await lockAuthSubject(tx, clerkId)
      await tx.authIdentityTombstone.upsert({
        where: {
          provider_subjectHash: {
            provider: AUTH_IDENTITY_PROVIDER_CLERK,
            subjectHash: hashAuthSubject(clerkId),
          },
        },
        update: {
          deletedUserId: userId,
          reason: 'underage_parent_handoff',
        },
        create: {
          provider: AUTH_IDENTITY_PROVIDER_CLERK,
          subjectHash: hashAuthSubject(clerkId),
          deletedUserId: userId,
          reason: 'underage_parent_handoff',
        },
      })
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        clerkId: null,
        name: 'Deleted Underage User',
        email: `deleted-underage-${userId}@anstoss.io`,
        dateOfBirth: null,
      },
    })
  }

  private async deleteUnderageClerkIdentity(clerkId: string | null) {
    const secretKey = process.env.CLERK_SECRET_KEY?.trim()
    if (clerkId && secretKey) {
      try {
        await createClerkClient({ secretKey }).users.deleteUser(clerkId)
      } catch {
        // Best-effort: the soft-delete already blocks re-auth on our side.
      }
    }
  }

  /**
   * Get current user's profile with all club memberships.
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                badgeUrl: true,
                primaryColor: true,
                slug: true,
              },
            },
          },
        },
        teamMembers: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
                clubId: true,
                ageGroup: true,
              },
            },
          },
        },
        teamAccess: {
          where: {
            status: {
              in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
            },
          },
          include: {
            team: {
              include: {
                group: true,
              },
            },
          },
          orderBy: [{ createdAt: 'asc' }],
        },
        guardianRelationshipsAsParent: true,
        parentalConsentsAsPlayer: {
          orderBy: [{ requestedAt: 'desc' }],
        },
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const age = user.dateOfBirth ? getAge(user.dateOfBirth) : null
    const latestConsent = user.parentalConsentsAsPlayer[0]
    // Privacy: mirrors AgeGateService with no club context. Any APPROVED
    // consent clears the account; each club is still gated on its own.
    const hasApprovedConsent = user.parentalConsentsAsPlayer.some(
      (c: { status: string }) => c.status === ParentalConsentStatus.APPROVED,
    )

    // onboarding revamp: a coach/parent/admin who declared they are 16+
    // (adultConfirmedAt) and has no DOB on file is cleared like an adult.
    const ageGate =
      !LAUNCH_FEATURES.youthParticipation
        ? {
            isUnder16: age !== null && age < 16,
            status: (age === null ? 'DOB_REQUIRED' : age < LAUNCH_FEATURES.minimumAccountAge ? 'BLOCKED' : 'CLEARED') as 'DOB_REQUIRED' | 'BLOCKED' | 'CLEARED',
            guardianEmail: null,
            message: age !== null && age < LAUNCH_FEATURES.minimumAccountAge ? 'Anstoss currently supports adults aged 18 and over.' : null,
          }
      : age === null && user.adultConfirmedAt
        ? {
            isUnder16: false,
            status: 'CLEARED' as const,
            guardianEmail: null,
            message: null,
          }
        : age === null
        ? {
            isUnder16: false,
            status: 'DOB_REQUIRED' as const,
            guardianEmail: null,
            message: null,
          }
        : age < AGE_GATE.MIN_DIRECT_ACCOUNT_AGE
          ? {
              isUnder16: true,
              status: 'BLOCKED' as const,
              guardianEmail: null,
              message: 'Children under 13 must use a guardian-managed account.',
            }
        : age >= AGE_GATE.MIN_AGE || hasApprovedConsent
          ? {
              isUnder16: age < AGE_GATE.MIN_AGE,
              status: 'CLEARED' as const,
              guardianEmail: latestConsent?.guardianEmail || null,
              message: null,
            }
          : latestConsent
            ? {
                isUnder16: true,
                status: 'PENDING_PARENT_APPROVAL' as const,
                guardianEmail: latestConsent.guardianEmail,
                message:
                  latestConsent.status === ParentalConsentStatus.REJECTED
                    ? 'Parental approval was declined.'
                    : latestConsent.status === ParentalConsentStatus.WITHDRAWN
                      ? 'Parental approval was withdrawn.'
                      : 'Parental approval is still pending.',
              }
            : {
                isUnder16: true,
                status: 'BLOCKED' as const,
                guardianEmail: null,
                message: `You must be at least ${AGE_GATE.MIN_AGE} or have parental approval to access Anstoss.`,
              }

    // Derive teamMembers from teamAccess for the mobile client.
    // Keep access state so clients can avoid treating pending/revoked rows
    // as active team membership.
    const launchTeamAccess = user.teamAccess.filter((entry) => LAUNCH_FEATURES.youthParticipation || entry.role !== TeamRole.PARENT)
    const teamMembers = launchTeamAccess.map((teamAccess: (typeof user.teamAccess)[number]) => ({
      id: teamAccess.id,
      role: teamAccess.role,
      phase: teamAccess.phase,
      status: teamAccess.status,
      team: {
        id: teamAccess.team.id,
        name: teamAccess.team.name,
        displayName: teamAccess.team.displayName,
        clubId: teamAccess.team.clubId,
        ageGroup: teamAccess.team.ageGroup,
      },
    }))

    const [pendingJoinRequest, pendingClubClaim] = await Promise.all([
      this.prisma.joinRequest.findFirst({
        where: { userId, status: 'PENDING' },
        select: { id: true, clubId: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.clubClaim.findFirst({
        where: {
          claimantUserId: userId,
          // A staff-code onboarding flow deliberately creates a STAFF_CLAIM
          // without granting membership. Surface it through /me as well so the
          // client can keep the user in the review flow instead of sending
          // them back to the unlinked-account screen.
          kind: { in: ['FIRST_CLAIM', 'STAFF_CLAIM'] },
          status: { in: ['SUBMITTED', 'NEEDS_INFO'] },
          expiresAt: { gt: new Date() },
        },
        select: { id: true, status: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return {
      ...user,
      teamAccess: launchTeamAccess,
      guardianRelationshipsAsParent: LAUNCH_FEATURES.youthParticipation ? user.guardianRelationshipsAsParent : [],
      memberships: user.memberships.map((membership: (typeof user.memberships)[number]) =>
        attachMembershipPermissions(membership),
      ),
      teamMembers,
      ageGate,
      pendingJoinRequest,
      pendingClubClaim,
    }
  }

  /**
   * Update profile — name, avatarUrl. DOB is read-only after registration.
   */
  async updateProfile(
    userId: string,
    data: {
      name?: string
      avatarUrl?: string
      dateOfBirth?: string
      preferredLanguage?: string
      registrationRole?: RegistrationRole
      confirmAdult?: true
    },
  ) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        deletedAt: true,
        dateOfBirth: true,
        registrationRole: true,
        adultConfirmedAt: true,
        email: true,
        clerkId: true,
      },
    })

    if (!currentUser || currentUser.deletedAt) {
      throw new NotFoundException('User not found')
    }

    const updateData: {
      name?: string
      avatarUrl?: string
      dateOfBirth?: Date
      preferredLanguage?: string
      registrationRole?: RegistrationRole
    } = {}

    // Onboarding review fix (B1): every self-registering user gives a date of
    // birth. The "I am at least 16" declaration can no longer be made; an
    // existing declaration (legacy accounts) is left as it is and a repeat of
    // it is a no-op.
    if (data.confirmAdult === true && !currentUser.adultConfirmedAt) {
      throw new BadRequestException({
        message: 'A date of birth is required',
        code: 'DOB_REQUIRED',
      })
    }

    const knownDob =
      currentUser.dateOfBirth && !isPlaceholderDate(currentUser.dateOfBirth)
        ? currentUser.dateOfBirth
        : null

    if (data.name !== undefined) {
      updateData.name = data.name
    }

    if (data.avatarUrl !== undefined) {
      await this.assertOwnedAvatarUpload(userId, data.avatarUrl)
      updateData.avatarUrl = data.avatarUrl
    }

    if (data.preferredLanguage !== undefined) {
      // Two-letter ISO-639-1 normalization; only persist if supported.
      const head = data.preferredLanguage.split(/[-_]/)[0]?.toLowerCase()
      const supported = ['de', 'en', 'fr', 'pt', 'it', 'tr']
      if (head && supported.includes(head)) {
        updateData.preferredLanguage = head
      }
    }

    if (data.dateOfBirth) {
      const parsedDate = new Date(data.dateOfBirth)
      if (Number.isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Invalid date of birth')
      }
      assertLaunchBirthDate(parsedDate)

      if (
        knownDob &&
        knownDob.toISOString().slice(0, 10) !== parsedDate.toISOString().slice(0, 10)
      ) {
        throw new BadRequestException('Date of birth is read-only after registration')
      }

      if (!knownDob) {
        await this.assertSelfRegistrationAge(userId, currentUser, parsedDate)
      }

      updateData.dateOfBirth = parsedDate
    }

    if (
      data.registrationRole !== undefined &&
      data.registrationRole !== currentUser.registrationRole
    ) {
      // Onboarding review fix (H3): the role is no longer write-once. It can
      // change while the account has no club membership and no pending club
      // claim (someone who tapped "Verein anlegen" and gave up can still join
      // as a player). The JIT default (PLAYER) can always be left.
      const leavingDefault =
        !currentUser.registrationRole ||
        currentUser.registrationRole === RegistrationRole.PLAYER
      const [membership, pendingClaim] = await Promise.all([
        this.prisma.membership.findFirst({ where: { userId }, select: { id: true } }),
        this.prisma.clubClaim.findFirst({
          where: {
            claimantUserId: userId,
            status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        }),
      ])
      if (!leavingDefault && (membership || pendingClaim)) {
        throw new BadRequestException({
          message: 'registrationRole is read-only while you belong to a club or a claim is pending',
          code: 'ROLE_LOCKED',
        })
      }
      if (data.registrationRole === RegistrationRole.CLUB_ADMIN && membership) {
        throw new BadRequestException(
          'Cannot change registration role to CLUB_ADMIN after joining a club',
        )
      }
    }

    if (data.registrationRole !== undefined) {
      if (data.registrationRole === RegistrationRole.PARENT) requireYouthParticipation()
      // Onboarding review fix (B3): "Spieler ohne Verein" needs a real DOB and
      // must be 16+ (the Wechselbörse is not for children).
      if (data.registrationRole === RegistrationRole.FREE_AGENT) {
        const dob = updateData.dateOfBirth ?? knownDob
        if (!dob) {
          throw new BadRequestException({
            message: 'A date of birth is required to be listed as a free agent',
            code: 'DOB_REQUIRED',
          })
        }
        if (getAge(dob) < AGE_GATE.MIN_AGE) {
          throw new ForbiddenException({
            message: 'Free agents must be at least 16',
            code: 'FREE_AGENT_UNDER_16',
          })
        }
      }
      updateData.registrationRole = data.registrationRole
    }

    return this.prisma.$transaction(async (tx) => {
      // Match account erasure's first lock. Slow avatar/provider validation
      // above must never allow an old request to restore erased profile data.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      const latest = await tx.user.findUnique({ where: { id: userId }, select: {
        deletedAt: true, dateOfBirth: true, registrationRole: true,
      } })
      if (!latest || latest.deletedAt) throw new NotFoundException('User not found')
      if ((data.dateOfBirth && latest.dateOfBirth?.getTime() !== currentUser.dateOfBirth?.getTime())
        || (data.registrationRole !== undefined && latest.registrationRole !== currentUser.registrationRole)) {
        throw new BadRequestException('Profile changed. Refresh and try again.')
      }
      if (data.registrationRole !== undefined && data.registrationRole !== latest.registrationRole) {
        const leavingDefault = !latest.registrationRole || latest.registrationRole === RegistrationRole.PLAYER
        if (!leavingDefault || data.registrationRole === RegistrationRole.CLUB_ADMIN) {
          // Approval/claim writes share the account lock. A club could have
          // admitted this user while validation/provider work was in flight.
          const [membership, pendingClaim] = await Promise.all([
            tx.membership.findFirst({ where: { userId }, select: { id: true } }),
            tx.clubClaim.findFirst({ where: { claimantUserId: userId,
              status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
              expiresAt: { gt: new Date() } }, select: { id: true } }),
          ])
          if (!leavingDefault && (membership || pendingClaim)) throw new BadRequestException({
            message: 'registrationRole is read-only while you belong to a club or a claim is pending', code: 'ROLE_LOCKED',
          })
          if (data.registrationRole === RegistrationRole.CLUB_ADMIN && membership) {
            throw new BadRequestException('Cannot change registration role to CLUB_ADMIN after joining a club')
          }
        }
      }
      const avatarKey = data.avatarUrl !== undefined && this.r2?.enabled
        ? this.r2.objectKeyFromUrl(data.avatarUrl) : null
      if (avatarKey) {
        // Same account -> object order as attachment publication. A cleanup
        // worker only takes the object lock and never waits for an account.
        await lockMediaObject(tx, avatarKey)
        if (await tx.accountMediaDeletion.findUnique({ where: { objectKey: avatarKey } })) {
          throw new BadRequestException('Avatar is being removed; upload it again')
        }
      }
      return tx.user.update({ where: { id: userId, deletedAt: null }, data: updateData })
    })
  }

  /**
   * Onboarding review fix (B1/M3): the age rules for a self-registering
   * account (no club membership yet), identical on every path:
   *  - under 13: no own account. The account is removed, the address is
   *    blocked for 30 days, and the app explains that a parent sets it up.
   *  - 13-15: the parent handoff (POST /me/parent-handoff) is the only way
   *    in, so the DOB is not stored on a self-registered account.
   * Members (legacy accounts giving a DOB late) keep the consent flow.
   */
  private async assertSelfRegistrationAge(
    userId: string,
    currentUser: { email: string | null; clerkId: string | null },
    dob: Date,
  ) {
    const age = getAge(dob)
    if (age >= AGE_GATE.MIN_AGE) return
    const membership = await this.prisma.membership.findFirst({
      where: { userId },
      select: { id: true },
    })
    if (membership) return
    if (age < AGE_GATE.MIN_DIRECT_ACCOUNT_AGE) {
      await this.prisma.$transaction(async (tx) => {
        await tombstoneUnderageEmail(tx, currentUser.email, userId, 'underage_blocked')
        await this.removeUnderageAccountInTransaction(tx, userId, currentUser.clerkId)
      })
      await this.deleteUnderageClerkIdentity(currentUser.clerkId)
      throw new ForbiddenException({
        message: 'Children under 13 are set up by a parent or guardian',
        code: 'UNDER_13',
      })
    }
    throw new ForbiddenException({
      message: 'Under-16 sign-ups are set up by a parent or guardian',
      code: 'UNDER_16_HANDOFF',
    })
  }

  /**
   * Complete role-based onboarding — validates role match, updates profile,
   * dispatches role-specific work (club creation / invite redemption / free-agent profile).
   */
  async completeOnboarding(userId: string, input: CompleteOnboardingInput) {
    if (input.registrationRole === RegistrationRole.PARENT) requireYouthParticipation()
    assertLaunchBirthDate(new Date(input.profile.dateOfBirth))
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, registrationRole: true, deletedAt: true },
    })

    if (!user || user.deletedAt) {
      throw new NotFoundException('User not found')
    }

    if (user.registrationRole !== input.registrationRole) {
      throw new BadRequestException('registrationRole in payload must match the user record')
    }

    // Pre-validate any invite code BEFORE writing the profile. This avoids
    // the previous half-written state when an invite was expired or
    // mistyped: profile would persist, dispatch would throw, retry would
    // run against an inconsistent record. Cheap lookup, fails fast.
    if (
      input.registrationRole === RegistrationRole.COACH ||
      input.registrationRole === RegistrationRole.PLAYER
    ) {
      const inviteCode = input.join.inviteCode
      if (inviteCode) {
        await this.invitesService.validate(inviteCode)
      }
    }
    if (input.registrationRole === RegistrationRole.PARENT) {
      const inviteCode = input.parentLink.approvalInviteCode
      if (inviteCode) {
        await this.invitesService.validate(inviteCode)
      }
    }

    // Profile update runs before dispatch. With pre-validation above, the
    // remaining failure modes (DB outages, ClubsService errors) are rare;
    // a client retry is idempotent because the same values get rewritten.
    // `createClubWithTeam` opens its own transaction and Prisma does not
    // support nested interactive transactions, so we don't wrap here.
    if (input.profile.photoUrl) {
      await this.assertOwnedAvatarUpload(userId, input.profile.photoUrl)
    }

    await this.prisma.$transaction(async (tx) => {
      // Deletion and profile edits share this lifecycle lock. The initial
      // lookup and potentially slow invite/avatar checks are only preflight.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { deletedAt: true, registrationRole: true, dateOfBirth: true },
      })
      if (!current || current.deletedAt) throw new NotFoundException('User not found')
      if (current.registrationRole !== input.registrationRole) {
        throw new BadRequestException('registrationRole in payload must match the user record')
      }
      const dob = new Date(input.profile.dateOfBirth)
      if (current.dateOfBirth && !isPlaceholderDate(current.dateOfBirth)
        && current.dateOfBirth.toISOString().slice(0, 10) !== dob.toISOString().slice(0, 10)) {
        throw new BadRequestException('Date of birth is read-only after registration')
      }
      const avatarKey = input.profile.photoUrl && this.r2?.enabled
        ? this.r2.objectKeyFromUrl(input.profile.photoUrl) : null
      if (avatarKey) {
        await lockMediaObject(tx, avatarKey)
        if (await tx.accountMediaDeletion.findUnique({ where: { objectKey: avatarKey } })) {
          throw new BadRequestException('Avatar is being removed; upload it again')
        }
      }
      await tx.user.update({
        where: { id: userId, deletedAt: null },
        data: {
          name: input.profile.displayName,
          dateOfBirth: dob,
          ...(input.profile.photoUrl ? { avatarUrl: input.profile.photoUrl } : {}),
        },
      })
    })

    switch (input.registrationRole) {
      case RegistrationRole.CLUB_ADMIN: {
        return {
          status: 'pending_club_claim',
          role: user.registrationRole,
          message: 'Profile complete — submit a verified club claim to activate club access.',
        }
      }

      case RegistrationRole.COACH:
      case RegistrationRole.PLAYER: {
        const { join } = input
        if (join.inviteCode) {
          return this.invitesService.redeem(join.inviteCode, userId)
        }
        // No invite code provided — user is registered but not yet attached
        // to a club. They land on a "join or wait for invite" screen client-
        // side. Keep MVP shippable; the explicit club-id-search flow ships
        // post-MVP. Returning a structured "pending" payload instead of
        // throwing 501 lets the wizard finish cleanly.
        return {
          status: 'pending_club',
          role: user.registrationRole,
          message: 'Onboarding complete — waiting on a club invite code.',
        }
      }

      case RegistrationRole.PARENT: {
        const { parentLink } = input
        if (parentLink.approvalInviteCode) {
          return this.invitesService.redeem(parentLink.approvalInviteCode, userId)
        }
        // Same shape as COACH/PLAYER — registered, awaiting parental link
        // invite from a club admin. The child-email-search flow lands later.
        return {
          status: 'pending_parent_link',
          role: user.registrationRole,
          message: 'Onboarding complete — waiting on a parental approval link.',
        }
      }

      case RegistrationRole.FREE_AGENT: {
        const translated = translateFreeAgentOnboarding(input.freeAgent)
        return this.marketplaceService.createFreeAgentProfile(userId, translated)
      }

      default: {
        // Exhaustiveness check — compile-time guarantee all roles handled.
        const _exhaustive: never = input
        throw new BadRequestException(`Unsupported registrationRole: ${String(_exhaustive)}`)
      }
    }
  }

  /**
   * Get a user's profile within a club context (visible to teammates).
   */
  async getClubProfile(requesterUserId: string, targetUserId: string, clubId: string) {
    await assertLaunchParticipant(this.prisma, targetUserId)
    const [requesterMembership, targetMembership] = await Promise.all([
      this.prisma.membership.findUnique({
        where: { userId_clubId: { userId: requesterUserId, clubId } },
        select: { userId: true },
      }),
      this.prisma.membership.findUnique({
        where: { userId_clubId: { userId: targetUserId, clubId } },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              teamMembers: {
                where: {
                  team: { clubId },
                },
                include: {
                  team: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
      }),
    ])

    if (!requesterMembership || !targetMembership) {
      throw new NotFoundException('Member not found in this club')
    }

    return targetMembership
  }

  /**
   * List all members of a club (for roster view).
   */
  async listClubMembers(clubId: string, userId: string, teamId?: string) {
    if (teamId) {
      await this.teamsService.assertReadableAccess(userId, teamId)

      const accessEntries = await this.prisma.teamAccess.findMany({
        where: {
          clubId,
          teamId,
          user: launchClubParticipantWhere(clubId),
          ...activeTeamAccessWhere(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          loanedFromTeam: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
        orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
      })

      const teamMembers = await this.prisma.teamMember.findMany({
        where: {
          teamId,
          userId: {
            in: accessEntries.map((entry: any) => entry.userId),
          },
        },
      })

      const teamMemberByUserId = new Map(teamMembers.map((member: any) => [member.userId, member]))

      return accessEntries.map((entry: any) => {
        const teamMember = teamMemberByUserId.get(entry.userId)
        return {
          ...entry,
          position: teamMember?.position ?? null,
          jerseyNumber: teamMember?.jerseyNumber ?? null,
          operationalStatus: teamMember?.operationalStatus ?? 'ACTIVE',
          loanedFromTeamName: entry.loanedFromTeam
            ? entry.loanedFromTeam.displayName || entry.loanedFromTeam.name
            : null,
        }
      })
    }

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

    const memberships = await this.prisma.membership.findMany({
      where: { clubId, user: launchClubParticipantWhere(clubId) },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            teamAccess: {
              where: {
                clubId,
                ...activeTeamAccessWhere(),
                role: {
                  in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH],
                },
              },
              include: {
                team: {
                  select: {
                    id: true,
                    displayName: true,
                    group: {
                      select: {
                        id: true,
                        displayName: true,
                      },
                    },
                  },
                },
              },
              orderBy: [{ createdAt: 'asc' }],
            },
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    })

    // Member emails are admin-only PII. Non-admin members (players,
    // parents, coaches) get the roster without email addresses.
    const callerIsAdmin =
      membership.role === MembershipRole.OWNER || membership.role === MembershipRole.ADMIN

    return memberships.map((member: any) => {
      const withPerms = attachMembershipPermissions(member)
      if (!callerIsAdmin && withPerms.user) {
        return { ...withPerms, user: { ...withPerms.user, email: null } }
      }
      return { ...withPerms }
    })
  }

  /**
   * club-admin revamp: paginated member list with aktiv/passiv/jugend
   * filters. Rows keep the exact shape of `listClubMembers` plus
   * `isActive`, `isYouth` and `teamNames`. `total` is the filtered count;
   * `counts.all` equals the membership count used by /stats and the inbox.
   */
  async listClubMembersPage(clubId: string, userId: string, query: MemberListQuery) {
    const rows = (await this.listClubMembers(clubId, userId)) as any[]
    const now = new Date()
    const userIds = rows.map((row) => row.userId)
    const [access, users] = await Promise.all([
      this.prisma.teamAccess.findMany({
        where: { clubId, userId: { in: userIds }, ...activeTeamAccessWhere(now) },
        select: {
          userId: true,
          role: true,
          team: { select: { name: true, displayName: true, group: { select: { type: true } } } },
        },
      }),
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, dateOfBirth: true },
      }),
    ])
    const dobByUser = new Map(users.map((u: any) => [u.id, u.dateOfBirth as Date | null]))
    const accessByUser = new Map<string, any[]>()
    for (const entry of access as any[]) {
      const list = accessByUser.get(entry.userId) ?? []
      list.push(entry)
      accessByUser.set(entry.userId, list)
    }

    const activeTeamRoles: string[] = [TeamRole.PLAYER, TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH]
    const youthGroupTypes = ['YOUTH', 'MINI']
    const staffRoles: string[] = [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.COACH]

    const enriched = rows.map((row) => {
      const entries = accessByUser.get(row.userId) ?? []
      const dob = dobByUser.get(row.userId)
      const under18 = dob ? getAge(dob) < 18 : false
      const isYouth =
        under18 ||
        entries.some(
          (entry) =>
            entry.role === TeamRole.PLAYER && youthGroupTypes.includes(entry.team?.group?.type),
        )
      const isActive =
        staffRoles.includes(row.role) || entries.some((entry) => activeTeamRoles.includes(entry.role))
      const teamNames = [
        ...new Set(
          entries
            .filter((entry) => entry.role !== TeamRole.PARENT)
            .map((entry) => entry.team?.displayName || entry.team?.name)
            .filter(Boolean) as string[],
        ),
      ]
      return { ...row, isActive, isYouth, teamNames }
    })

    const matchesFilter = (row: { isActive: boolean; isYouth: boolean }, filter: MemberListFilter) =>
      filter === 'all'
        ? true
        : filter === 'active'
          ? row.isActive
          : filter === 'passive'
            ? !row.isActive
            : row.isYouth

    const counts: Record<MemberListFilter, number> = {
      all: enriched.length,
      active: enriched.filter((row) => row.isActive).length,
      passive: enriched.filter((row) => !row.isActive).length,
      youth: enriched.filter((row) => row.isYouth).length,
    }

    // club-admin review fixes (L2): accent-insensitive (José, Müller/Mueller)
    // and by email. listClubMembers already nulls emails for non-admins, so
    // only admins can find a member by address.
    const needle = query.q?.trim() ?? ''
    const filtered = enriched.filter(
      (row) =>
        matchesFilter(row, query.filter) &&
        (!needle ||
          matchesSearchText(row.user?.name, needle) ||
          matchesSearchText(row.user?.email, needle)),
    )

    return {
      items: filtered.slice(query.offset, query.offset + query.limit),
      total: filtered.length,
      offset: query.offset,
      limit: query.limit,
      counts,
    }
  }

  async searchClubMemberDirectory(
    clubId: string,
    userId: string,
    input: { query: string; role?: string; cursor?: string; limit: number },
  ) {
    const query = input.query.trim()
    if (query.length < 2) {
      throw new BadRequestException('Enter at least two characters')
    }
    if (query.length > 120) {
      throw new BadRequestException('Enter no more than 120 characters')
    }
    const requester = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { id: true },
    })
    if (!requester) throw new NotFoundException('Club membership not found')

    const membershipRoles = Object.values(MembershipRole) as string[]
    const teamRoles = Object.values(TeamRole) as string[]
    const requestedRole = input.role?.trim().toUpperCase()
    if (
      requestedRole &&
      !membershipRoles.includes(requestedRole) &&
      !teamRoles.includes(requestedRole)
    ) {
      throw new BadRequestException('Unknown member role')
    }

    const roleWhere = requestedRole
      ? {
          OR: [
            ...(membershipRoles.includes(requestedRole)
              ? [{ role: requestedRole as MembershipRole }]
              : []),
            ...(teamRoles.includes(requestedRole)
              ? [
                  {
                    user: {
                      teamAccess: {
                        some: {
                          clubId,
                          AND: [activeTeamAccessWhere(), { role: requestedRole as TeamRole }],
                        },
                      },
                    },
                  },
                ]
              : []),
          ],
        }
      : {}

    const rows = await this.prisma.membership.findMany({
      where: {
        clubId,
        ...roleWhere,
        user: {
          AND: [launchClubParticipantWhere(clubId)],
          deletedAt: null,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            {
              teamAccess: {
                some: {
                  clubId,
                  ...activeTeamAccessWhere(),
                  team: { displayName: { contains: query, mode: 'insensitive' } },
                },
              },
            },
          ],
        },
      },
      select: {
        id: true,
        role: true,
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            teamAccess: {
              where: { clubId, ...activeTeamAccessWhere() },
              select: {
                role: true,
                team: { select: { id: true, displayName: true } },
              },
              orderBy: [{ createdAt: 'asc' }],
            },
          },
        },
      },
      orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
      cursor: input.cursor ? { id: input.cursor } : undefined,
      skip: input.cursor ? 1 : 0,
      take: input.limit + 1,
    })

    const hasMore = rows.length > input.limit
    const items = hasMore ? rows.slice(0, input.limit) : rows
    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.id ?? null : null,
    }
  }

  async updateClubMemberRole(
    clubId: string,
    actorUserId: string,
    memberUserId: string,
    nextRole: MembershipRole,
  ) {
    if (nextRole === MembershipRole.PARENT) requireYouthParticipation()
    await assertLaunchParticipant(this.prisma, memberUserId)
    const membership = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${clubId}`}))`
      const [actorMembership, targetMembership] = await Promise.all([
      tx.membership.findUnique({
        where: {
          userId_clubId: {
            userId: actorUserId,
            clubId,
          },
        },
      }),
      tx.membership.findUnique({
        where: {
          userId_clubId: {
            userId: memberUserId,
            clubId,
          },
        },
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
      }),
      ])

    if (!actorMembership) {
      throw new NotFoundException('Club membership not found')
    }

    if (!targetMembership) {
      throw new NotFoundException('Member not found in this club')
    }

    if (actorUserId === memberUserId) {
      throw new BadRequestException('You cannot change your own club role here')
    }

    if (targetMembership.role === MembershipRole.OWNER) {
      throw new BadRequestException('Owner role cannot be changed here')
    }

    if (!canManageMembershipRole(actorMembership.role)) {
      throw new ForbiddenException('You do not manage club roles')
    }

    if (!canAssignMembershipRole(actorMembership.role, nextRole)) {
      throw new ForbiddenException('Only club owners can assign admin role')
    }

    if (
      actorMembership.role === MembershipRole.ADMIN &&
      targetMembership.role === MembershipRole.ADMIN
    ) {
      throw new ForbiddenException('Admins cannot change other admins')
    }

    if (targetMembership.role === nextRole) {
      return targetMembership
    }

    const activeCoachAssignments = await tx.teamAccess.findMany({
      where: {
        clubId,
        userId: memberUserId,
        ...activeTeamAccessWhere(),
        role: {
          in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH],
        },
      },
      select: {
        id: true,
      },
    })

    if (activeCoachAssignments.length > 0 && !isStaffMembershipRole(nextRole)) {
      throw new BadRequestException(
        'Reassign squad coaching responsibilities before removing club staff role',
      )
    }

      return tx.membership.update({
      where: {
        userId_clubId: {
          userId: memberUserId,
          clubId,
        },
      },
      data: {
        role: nextRole,
      },
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
    })

    this.eventEmitter?.emit('realtime.access.changed', { userId: memberUserId })

    return {
      ...attachMembershipPermissions(membership),
    }
  }

  async updateOperationalRoles(
    clubId: string,
    actorUserId: string,
    memberUserId: string,
    operationalRoles: ClubOperationalRole[],
  ) {
    if (operationalRoles.length > 0) await assertLaunchParticipant(this.prisma, memberUserId)
    const updatedMembership = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${clubId}`}))`
      const [actorMembership, targetMembership] = await Promise.all([
      tx.membership.findUnique({
        where: {
          userId_clubId: {
            userId: actorUserId,
            clubId,
          },
        },
      }),
      tx.membership.findUnique({
        where: {
          userId_clubId: {
            userId: memberUserId,
            clubId,
          },
        },
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
      }),
      ])

    if (!actorMembership) {
      throw new NotFoundException('Club membership not found')
    }

    if (!targetMembership) {
      throw new NotFoundException('Member not found in this club')
    }

    if (!canManageMembershipRole(actorMembership.role)) {
      throw new ForbiddenException('You do not manage club roles')
    }

    if (
      actorMembership.role === MembershipRole.ADMIN &&
      operationalRoles.some((role) => CRITICAL_OPERATIONAL_ROLES.has(role))
    ) {
      throw new ForbiddenException(
        'Only club owners can assign secretary or treasurer responsibilities',
      )
    }

    if (
      actorMembership.role === MembershipRole.ADMIN &&
      targetMembership.role === MembershipRole.ADMIN
    ) {
      throw new ForbiddenException('Admins cannot change other admins')
    }

      return tx.membership.update({
      where: {
        userId_clubId: {
          userId: memberUserId,
          clubId,
        },
      },
      data: {
        operationalRoles,
      },
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
    })

    return {
      ...attachMembershipPermissions(updatedMembership),
    }
  }

  async offboardClubMember(
    clubId: string,
    actorUserId: string,
    memberUserId: string,
    options: { preservePlayerAccess: boolean },
  ) {
    const updatedMembership = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${clubId}`}))`
      const [actorMembership, targetMembership] = await Promise.all([
      tx.membership.findUnique({
        where: {
          userId_clubId: {
            userId: actorUserId,
            clubId,
          },
        },
      }),
      tx.membership.findUnique({
        where: {
          userId_clubId: {
            userId: memberUserId,
            clubId,
          },
        },
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
      }),
      ])

    if (!actorMembership) {
      throw new NotFoundException('Club membership not found')
    }

    if (!targetMembership) {
      throw new NotFoundException('Member not found in this club')
    }

    if (!canManageMembershipRole(actorMembership.role)) {
      throw new ForbiddenException('You do not manage club roles')
    }

    if (actorUserId === memberUserId) {
      throw new BadRequestException('You cannot offboard your own club access here')
    }

    if (targetMembership.role === MembershipRole.OWNER) {
      throw new BadRequestException('Owner role cannot be changed here')
    }

    if (
      actorMembership.role === MembershipRole.ADMIN &&
      targetMembership.role === MembershipRole.ADMIN
    ) {
      throw new ForbiddenException('Admins cannot change other admins')
    }

    const remainingCriticalHolders = await tx.membership.findMany({
      where: {
        clubId,
        userId: {
          not: memberUserId,
        },
      },
      select: {
        operationalRoles: true,
      },
    })

    const hasReplacementForAllCriticalRoles = targetMembership.operationalRoles
      .filter((role: ClubOperationalRole) =>
        CRITICAL_OPERATIONAL_ROLES.has(role as ClubOperationalRole),
      )
      .every((role: ClubOperationalRole) =>
        remainingCriticalHolders.some((membership: any) =>
          membership.operationalRoles.includes(role),
        ),
      )

    if (
      targetMembership.operationalRoles.some((role: ClubOperationalRole) =>
        CRITICAL_OPERATIONAL_ROLES.has(role as ClubOperationalRole),
      ) &&
      !hasReplacementForAllCriticalRoles
    ) {
      throw new BadRequestException(
        'Reassign secretary or treasurer responsibilities before offboarding this member',
      )
    }

    const nextRole =
      targetMembership.role === MembershipRole.PARENT
        ? MembershipRole.PARENT
        : MembershipRole.PLAYER

      await tx.teamAccess.updateMany({
        where: {
          clubId,
          userId: memberUserId,
          role: {
            in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH],
          },
          status: {
            in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
          },
        },
        data: {
          status: TeamAccessStatus.REVOKED,
        },
      })

      // club-admin review fixes (H3): the staff activity ends here, so the
      // Führungszeugnis goes with it (§72a(5) SGB VIII).
      await deleteStaffCertificate(tx, clubId, memberUserId)

      if (!options.preservePlayerAccess) {
        await tx.teamAccess.updateMany({
          where: {
            clubId,
            userId: memberUserId,
            role: {
              in: [TeamRole.PLAYER, TeamRole.PARENT],
            },
            status: {
              in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING],
            },
          },
          data: {
            status: TeamAccessStatus.REVOKED,
          },
        })
      }

      return tx.membership.update({
        where: {
          userId_clubId: {
            userId: memberUserId,
            clubId,
          },
        },
        data: {
          role: nextRole,
          operationalRoles: [],
        },
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
    })

    this.eventEmitter?.emit('realtime.access.changed', { userId: memberUserId })

    return {
      ...attachMembershipPermissions(updatedMembership),
    }
  }

  /**
   * GDPR data export — returns all user data as a plain object.
   */
  async exportUserData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        avatarUrl: true,
        registrationRole: true,
        dateOfBirth: true,
        preferredLanguage: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const userEmailCandidates = uniqueValues([user.email, user.email?.trim().toLowerCase()])

    const [
      memberships,
      teamAccess,
      teamMembers,
      guardianRelationshipsAsParent,
      guardianRelationshipsAsPlayer,
      parentalConsentsAsPlayer,
      parentalConsentsAsGuardian,
      rsvps,
      eventCheckIns,
      coachAttendance,
      coachAttendanceChanges,
      coachAttendanceActions,
      eventReminderPreferences,
      messages,
      messageReactions,
      messageReadReceipts,
      messageReports,
      pollVotes,
      conversationParticipants,
      directMessages,
      blocksMade,
      blocksReceived,
      notificationPreferences,
      pushTokens,
      joinRequests,
      freeAgentProfile,
      sentTrialInvites,
      injuriesAsPlayer,
      injuriesAsReporter,
      dutyAssignments,
      contributionAssignments,
      contributionRecords,
      contributionReminders,
      parentHandoffsCreated,
      parentHandoffsRedeemed,
      claimedRosterSlot,
    ] = await Promise.all([
      this.prisma.membership.findMany({
        where: { userId },
        include: {
          club: { select: { name: true } },
        },
      }),
      this.prisma.teamAccess.findMany({
        where: { userId },
        include: {
          club: { select: { name: true } },
          team: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.teamMember.findMany({
        where: { userId },
        include: {
          team: { select: { name: true, displayName: true, club: { select: { name: true } } } },
        },
      }),
      this.prisma.guardianRelationship.findMany({
        where: { parentUserId: userId },
        include: {
          club: { select: { name: true } },
          team: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.guardianRelationship.findMany({
        where: { playerUserId: userId },
        include: {
          club: { select: { name: true } },
          team: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.parentalConsent.findMany({
        where: { playerUserId: userId },
        include: {
          club: { select: { name: true } },
          team: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.parentalConsent.findMany({
        where: {
          OR: [
            { guardianUserId: userId },
            ...userEmailCandidates.map((email) => ({ guardianEmail: email })),
          ],
        },
        include: {
          club: { select: { name: true } },
          team: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.rsvp.findMany({
        where: { userId },
        include: {
          event: {
            select: { title: true, date: true },
          },
        },
      }),
      this.prisma.eventCheckIn.findMany({
        where: { userId },
        include: {
          event: { select: { title: true, date: true } },
          club: { select: { name: true } },
          team: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.coachAttendance.findMany({ where: { userId }, include: { event: { select: { title: true, date: true } } } }),
      this.prisma.coachAttendanceChange.findMany({ where: { userId }, include: { event: { select: { title: true, date: true } } } }),
      this.prisma.coachAttendanceChange.findMany({ where: { actorId: userId }, include: { event: { select: { title: true, date: true } } } }),
      this.prisma.eventReminderPreference.findMany({
        where: { userId },
        include: {
          event: { select: { title: true, date: true } },
        },
      }),
      this.prisma.message.findMany({
        where: { senderId: userId },
        include: {
          team: { select: { name: true } },
          club: { select: { name: true } },
        },
      }),
      this.prisma.messageReaction.findMany({
        where: { userId },
        include: {
          message: { select: { id: true, createdAt: true, club: { select: { name: true } } } },
        },
      }),
      this.prisma.messageReadReceipt.findMany({
        where: { userId },
        include: {
          message: { select: { id: true, createdAt: true, club: { select: { name: true } } } },
        },
      }),
      this.prisma.messageReport.findMany({
        where: { reporterUserId: userId },
        include: {
          message: { select: { id: true, createdAt: true, club: { select: { name: true } } } },
        },
      }),
      this.prisma.pollVote.findMany({
        where: { userId },
        include: {
          poll: {
            select: {
              question: true,
              message: { select: { id: true, club: { select: { name: true } } } },
            },
          },
          option: { select: { label: true } },
        },
      }),
      this.prisma.conversationParticipant.findMany({
        where: { userId },
        include: {
          conversation: { select: { id: true, club: { select: { name: true } } } },
        },
      }),
      this.prisma.directMessage.findMany({
        where: { senderId: userId },
        include: {
          conversation: { select: { id: true, club: { select: { name: true } } } },
        },
      }),
      this.prisma.userBlock.findMany({
        where: { blockerUserId: userId },
        include: {
          blocked: { select: { id: true, name: true } },
        },
      }),
      this.prisma.userBlock.findMany({
        where: { blockedUserId: userId },
        include: {
          blocker: { select: { id: true, name: true } },
        },
      }),
      this.prisma.notificationPreference.findMany({
        where: { userId },
      }),
      this.prisma.pushToken.findMany({
        where: { userId },
        select: { platform: true, token: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.joinRequest.findMany({
        where: { userId },
        include: {
          club: { select: { name: true } },
        },
      }),
      this.prisma.freeAgentProfile.findUnique({
        where: { userId },
        include: { experience: true, media: true, trialInvites: true },
      }),
      this.prisma.trialInvite.findMany({
        where: { sentByUserId: userId },
        include: {
          club: { select: { name: true } },
          team: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.injuryReport.findMany({
        where: { userId },
        include: {
          club: { select: { name: true } },
          team: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.injuryReport.findMany({
        where: { reportedById: userId },
        include: {
          club: { select: { name: true } },
          team: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.teamDutyAssignment.findMany({
        where: { assignedUserId: userId },
        include: {
          club: { select: { name: true } },
          team: { select: { name: true, displayName: true } },
        },
      }),
      this.prisma.contributionAssignment.findMany({
        where: { memberUserId: userId },
        include: {
          club: { select: { name: true } },
          plan: { select: { name: true, amount: true, currency: true, cadence: true } },
        },
      }),
      this.prisma.contributionRecord.findMany({
        where: { memberUserId: userId },
        include: {
          club: { select: { name: true } },
          plan: { select: { name: true } },
        },
      }),
      this.prisma.contributionReminder.findMany({
        where: { memberUserId: userId },
        include: {
          club: { select: { name: true } },
          plan: { select: { name: true } },
        },
      }),
      this.prisma.parentHandoff.findMany({
        where: { sourceUserId: userId },
      }),
      this.prisma.parentHandoff.findMany({
        where: { redeemedByUserId: userId },
      }),
      this.prisma.rosterSlot.findUnique({
        where: { claimedByUserId: userId },
        include: {
          team: { select: { name: true, displayName: true, club: { select: { name: true } } } },
        },
      }),
    ])

    return {
      profile: user,
      memberships: memberships.map((m: any) => ({
        clubName: m.club.name,
        role: m.role,
        joinedAt: m.createdAt,
      })),
      teamMemberships: teamAccess.map((ta: any) => ({
        clubName: ta.club?.name ?? null,
        teamName: ta.team.displayName || ta.team.name,
        role: ta.role,
        phase: ta.phase,
        status: ta.status,
        createdAt: ta.createdAt,
        updatedAt: ta.updatedAt,
      })),
      rosterRows: teamMembers.map((member: any) => ({
        clubName: member.team?.club?.name ?? null,
        teamName: member.team?.displayName || member.team?.name,
        position: member.position,
        jerseyNumber: member.jerseyNumber,
        operationalStatus: member.operationalStatus,
      })),
      guardianLinksAsParent: guardianRelationshipsAsParent.map((link: any) => ({
        clubName: link.club?.name ?? null,
        teamName: link.team?.displayName || link.team?.name || null,
        childName: link.childName,
        playerUserId: link.playerUserId,
        createdAt: link.createdAt,
      })),
      guardianLinksAsPlayer: guardianRelationshipsAsPlayer.map((link: any) => ({
        clubName: link.club?.name ?? null,
        teamName: link.team?.displayName || link.team?.name || null,
        parentUserId: link.parentUserId,
        childName: link.childName,
        createdAt: link.createdAt,
      })),
      parentalConsentsAsPlayer: parentalConsentsAsPlayer.map(formatConsentForExport),
      parentalConsentsAsGuardian: parentalConsentsAsGuardian.map(formatConsentForExport),
      rsvps: rsvps.map((r: any) => ({
        eventTitle: r.event.title,
        status: r.status,
        reason: r.reason,
        date: r.event.date,
        updatedAt: r.updatedAt,
      })),
      eventCheckIns: eventCheckIns.map((checkIn: any) => ({
        clubName: checkIn.club?.name ?? null,
        teamName: checkIn.team?.displayName || checkIn.team?.name || null,
        eventTitle: checkIn.event?.title,
        eventDate: checkIn.event?.date,
        checkedInAt: checkIn.checkedInAt,
      })),
      coachAttendance: coachAttendance.map((entry) => ({ eventTitle: entry.event.title, eventDate: entry.event.date,
        status: entry.status, updatedAt: entry.updatedAt })),
      coachAttendanceHistory: coachAttendanceChanges.map((entry) => ({ eventTitle: entry.event.title, eventDate: entry.event.date,
        previous: entry.previous, status: entry.status, createdAt: entry.createdAt })),
      coachAttendanceActions: coachAttendanceActions.map((entry) => ({ eventTitle: entry.event.title, eventDate: entry.event.date,
        playerUserId: entry.userId, previous: entry.previous, status: entry.status, createdAt: entry.createdAt })),
      eventReminderPreferences: eventReminderPreferences.map((pref: any) => ({
        eventTitle: pref.event?.title,
        eventDate: pref.event?.date,
        remindAt: pref.remindAt,
        sent: pref.sent,
      })),
      messages: messages.map((m: any) => ({
        id: m.id,
        content: m.content,
        messageType: m.messageType,
        attachmentUrl: m.attachmentUrl,
        attachmentMeta: m.attachmentMeta,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        deletedAt: m.deletedAt,
        teamName: m.team?.name ?? null,
        clubName: m.club?.name ?? null,
      })),
      chatActivity: {
        reactions: messageReactions.map((reaction: any) => ({
          messageId: reaction.messageId,
          clubName: reaction.message?.club?.name ?? null,
          emoji: reaction.emoji,
          createdAt: reaction.createdAt,
        })),
        readReceipts: messageReadReceipts.map((receipt: any) => ({
          messageId: receipt.messageId,
          clubName: receipt.message?.club?.name ?? null,
          readAt: receipt.readAt,
        })),
        reports: messageReports.map((report: any) => ({
          messageId: report.messageId,
          clubName: report.message?.club?.name ?? null,
          reason: report.reason,
          resolvedAt: report.resolvedAt,
          resolution: report.resolution,
          createdAt: report.createdAt,
        })),
        pollVotes: pollVotes.map((vote: any) => ({
          pollQuestion: vote.poll?.question ?? null,
          option: vote.option?.label ?? null,
          clubName: vote.poll?.message?.club?.name ?? null,
          votedAt: vote.votedAt,
        })),
      },
      directMessages: {
        conversations: conversationParticipants.map((participant: any) => ({
          conversationId: participant.conversationId,
          clubName: participant.conversation?.club?.name ?? null,
          lastReadAt: participant.lastReadAt,
          createdAt: participant.createdAt,
        })),
        sentMessages: directMessages.map((message: any) => ({
          conversationId: message.conversationId,
          clubName: message.conversation?.club?.name ?? null,
          content: message.content,
          sourceLanguage: message.sourceLanguage,
          createdAt: message.createdAt,
        })),
      },
      moderation: {
        blocksMade: blocksMade.map((block: any) => ({
          blockedUserId: block.blockedUserId,
          blockedName: block.blocked?.name ?? null,
          createdAt: block.createdAt,
        })),
        blocksReceived: blocksReceived.map((block: any) => ({
          blockerUserId: block.blockerUserId,
          blockerName: block.blocker?.name ?? null,
          createdAt: block.createdAt,
        })),
      },
      notificationPreferences,
      pushTokens,
      joinRequests: joinRequests.map((request: any) => ({
        clubName: request.club?.name ?? null,
        teamId: request.teamId,
        role: request.role,
        message: request.message,
        status: request.status,
        reviewedBy: request.reviewedBy,
        reviewedAt: request.reviewedAt,
        createdAt: request.createdAt,
      })),
      freeAgentProfile: freeAgentProfile
        ? {
            position: freeAgentProfile.position,
            preferredFoot: freeAgentProfile.preferredFoot,
            city: freeAgentProfile.city,
            bio: freeAgentProfile.bio,
            experience: freeAgentProfile.experience.map((e: any) => ({
              clubName: e.clubName,
              roleLabel: e.roleLabel,
              fromYear: e.fromYear,
              toYear: e.toYear,
            })),
            media: freeAgentProfile.media.map((media: any) => ({
              type: media.type,
              url: media.url,
              thumbnailUrl: media.thumbnailUrl,
              sortOrder: media.sortOrder,
              createdAt: media.createdAt,
            })),
            trialInvites: freeAgentProfile.trialInvites.map((invite: any) => ({
              clubId: invite.clubId,
              teamId: invite.teamId,
              message: invite.message,
              expiresAt: invite.expiresAt,
              status: invite.status,
              respondedAt: invite.respondedAt,
              createdAt: invite.createdAt,
            })),
          }
        : null,
      sentTrialInvites: sentTrialInvites.map((invite: any) => ({
        clubName: invite.club?.name ?? null,
        teamName: invite.team?.displayName || invite.team?.name || null,
        message: invite.message,
        expiresAt: invite.expiresAt,
        status: invite.status,
        respondedAt: invite.respondedAt,
        createdAt: invite.createdAt,
      })),
      injuriesAsPlayer: injuriesAsPlayer.map(formatInjuryForExport),
      injuriesAsReporter: injuriesAsReporter.map(formatInjuryForExport),
      dutyAssignments: dutyAssignments.map((duty: any) => ({
        clubName: duty.club?.name ?? null,
        teamName: duty.team?.displayName || duty.team?.name || null,
        kind: duty.kind,
        status: duty.status,
        dueDate: duty.dueDate,
        notes: duty.notes,
        completedAt: duty.completedAt,
        createdAt: duty.createdAt,
      })),
      contributions: {
        assignments: contributionAssignments.map((assignment: any) => ({
          clubName: assignment.club?.name ?? null,
          planName: assignment.plan?.name ?? null,
          amount: assignment.plan?.amount ?? null,
          currency: assignment.plan?.currency ?? null,
          cadence: assignment.plan?.cadence ?? null,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
          note: assignment.note,
          createdAt: assignment.createdAt,
          updatedAt: assignment.updatedAt,
        })),
        records: contributionRecords.map((record: any) => ({
          clubName: record.club?.name ?? null,
          planName: record.plan?.name ?? null,
          periodStart: record.periodStart,
          periodEnd: record.periodEnd,
          dueDate: record.dueDate,
          amount: record.amount,
          currency: record.currency,
          status: record.status,
          paidAmount: record.paidAmount,
          paidAt: record.paidAt,
          note: record.note,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        })),
        reminders: contributionReminders.map((reminder: any) => ({
          clubName: reminder.club?.name ?? null,
          planName: reminder.plan?.name ?? null,
          trigger: reminder.trigger,
          reminderKey: reminder.reminderKey,
          emailSent: reminder.emailSent,
          pushSent: reminder.pushSent,
          status: reminder.status,
          message: reminder.message,
          sentAt: reminder.sentAt,
        })),
      },
      parentHandoffs: {
        created: parentHandoffsCreated,
        redeemed: parentHandoffsRedeemed,
      },
      claimedRosterSlot: claimedRosterSlot
        ? {
            clubName: claimedRosterSlot.team?.club?.name ?? null,
            teamName: claimedRosterSlot.team?.displayName || claimedRosterSlot.team?.name,
            fullName: claimedRosterSlot.fullName,
            phone: claimedRosterSlot.phone,
            dateOfBirth: claimedRosterSlot.dateOfBirth,
            position: claimedRosterSlot.position,
            jerseyNumber: claimedRosterSlot.jerseyNumber,
            claimedAt: claimedRosterSlot.claimedAt,
            createdAt: claimedRosterSlot.createdAt,
            updatedAt: claimedRosterSlot.updatedAt,
          }
        : null,
      exportedAt: new Date().toISOString(),
    }
  }

  /**
   * GDPR account deletion — soft delete + anonymization in a transaction.
   */
  async deleteAccount(userId: string) {
    // This authenticated self-account operation spans every club, including
    // abandoned uploads. Never let an ambient selected club truncate erasure.
    return tenantContext.exit(() => this.deleteAccountUnscoped(userId))
  }

  private async deleteAccountUnscoped(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        clerkId: true,
        avatarUrl: true,
        freeAgentProfile: { select: { id: true } },
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const deletedAt = new Date()
    const normalizedEmail = user.email?.trim().toLowerCase() || null
    const anonymizedEmail = `deleted-${userId}@anstoss.io`
    const emailCandidates = uniqueValues([user.email, normalizedEmail])
    const accountDeletionClubIds = await this.collectAccountDeletionClubIds(
      userId,
      emailCandidates,
      user.freeAgentProfile?.id ?? null,
    )

    // Privacy: consents withdrawn because this user was a child's guardian.
    const withdrawnConsentEffects: ConsentWithdrawalEffect[] = []
    await this.prisma.$transaction(async (tx: any) => {
      // Account lifecycle lock shared with club setup and ownership acceptance.
      // It prevents a club OWNER membership from being created after the
      // deletion preflight but before access rows are removed.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
      // Serialize deletion against persisted DM sends. A send takes this same
      // participant lock and revalidates after acquiring it.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dm-user:${userId}`}))`
      // Profile and free-agent writes may have committed after the preflight.
      // Re-read both under the lifecycle lock before discovering dependent data.
      const lockedUser = await tx.user.findUnique({ where: { id: userId }, select: {
        avatarUrl: true, freeAgentProfile: { select: { id: true } },
      } })
      if (!lockedUser) throw new NotFoundException('User not found')
      const lockedFreeAgentProfileId: string | null = lockedUser.freeAgentProfile?.id ?? null
      // Membership/invite approvals share the lifecycle lock above. Refresh
      // the access-derived club set after acquiring it so a transaction that
      // completed during deletion preflight cannot leave tenant-scoped rows.
      // Privacy (M5): consents are re-read under the lock too. A consent that
      // names this user as guardian (by id or email) in a club found after the
      // preflight must still be withdrawn below.
      const [freshMemberships, freshTeamAccess, freshConsents, privateUploads, freshProfileTrials] = await Promise.all([
        tx.membership.findMany({ where: { userId }, select: { clubId: true } }),
        tx.teamAccess.findMany({ where: { userId }, select: { clubId: true } }),
        tx.parentalConsent.findMany({
          where: {
            OR: [
              { playerUserId: userId },
              { guardianUserId: userId },
              ...emailCandidates.map((email) => ({ guardianEmail: email })),
            ],
          },
          select: { clubId: true },
        }),
        findAccountPrivateUploads(tx, userId),
        lockedFreeAgentProfileId
          ? tx.trialInvite.findMany({ where: { freeAgentProfileId: lockedFreeAgentProfileId }, select: { clubId: true } })
          : Promise.resolve([]),
      ])
      const deletionClubIds = uniqueValues([
        ...accountDeletionClubIds,
        ...freshMemberships.map((row: { clubId: string }) => row.clubId),
        ...freshTeamAccess.map((row: { clubId: string }) => row.clubId),
        ...freshConsents.map((row: { clubId: string }) => row.clubId),
        ...privateUploads.map((row) => row.clubId),
        ...freshProfileTrials.map((row: { clubId: string }) => row.clubId),
      ])
      for (const clubId of [...deletionClubIds].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`owner:${clubId}`}))`
      }
      const ownerMembership = await tx.membership.findFirst({
        where: { userId, role: MembershipRole.OWNER },
        select: { clubId: true },
      })
      if (ownerMembership) {
        throw new BadRequestException(
          'Transfer club ownership before deleting your account',
        )
      }
      // Match moderation's locks before snapshotting evidence or removing
      // content. Reports that win the lock retain evidence; reports that lose
      // see deletedAt and cannot snapshot a disappearing attachment.
      const [channelRows, directRows] = await Promise.all([
        tx.message.findMany({ where: { senderId: userId }, select: { id: true } }),
        tx.directMessage.findMany({ where: { senderId: userId }, select: { id: true } }),
      ])
      const messageLocks = [
        ...channelRows.map((row: { id: string }) => `chat-message:${row.id}`),
        ...directRows.map((row: { id: string }) => `dm-message:${row.id}`),
      ].sort()
      await cancelAccountPrivateUploads(tx, userId, privateUploads, messageLocks)
      // Unpublished v1 uploads have no message to inventory. Transfer their
      // durable reservations to the user-independent erasure queue before
      // anonymising the owner, while excluding concurrent publication.
      const pendingV1: Array<{ objectKey: string }> = await tx.accountMediaDeletion.findMany({
        where: { uploadOwnerId: userId, uploadState: 'PENDING' }, select: { objectKey: true },
      })
      for (const { objectKey } of pendingV1.sort((a, b) => a.objectKey.localeCompare(b.objectKey))) {
        await lockMediaObject(tx, objectKey)
        await tx.accountMediaDeletion.updateMany({
          where: { objectKey, uploadOwnerId: userId, uploadState: 'PENDING' },
          data: { uploadOwnerId: null, uploadRequestId: null, uploadFingerprint: null,
            uploadExpiresAt: null, uploadState: null, uploadMessageId: null, availableAt: new Date() },
        })
      }
      const mediaObjectKeys = await this.collectDeletionObjectKeys({
        userId, avatarUrl: lockedUser.avatarUrl,
        freeAgentProfileId: lockedFreeAgentProfileId,
        privateUploads,
      }, tx)
      if (mediaObjectKeys.length) {
        // Commit the cleanup intent alongside erasure. Queue failure rolls back
        // erasure; storage outages after commit cannot lose the object inventory.
        await tx.accountMediaDeletion.createMany({
          data: mediaObjectKeys.map((objectKey) => ({ objectKey })), skipDuplicates: true,
        })
      }
      // Block legacy Clerk subjects from being linked back to this row if an
      // old client/auth path is ever re-enabled. Custom JWTs are still blocked
      // by deletedAt below.
      if (user.clerkId) {
        await lockAuthSubject(tx, user.clerkId)
        await tx.authIdentityTombstone.upsert({
          where: {
            provider_subjectHash: {
              provider: AUTH_IDENTITY_PROVIDER_CLERK,
              subjectHash: hashAuthSubject(user.clerkId),
            },
          },
          update: {
            deletedUserId: userId,
            reason: 'account_deletion',
          },
          create: {
            provider: AUTH_IDENTITY_PROVIDER_CLERK,
            subjectHash: hashAuthSubject(user.clerkId),
            deletedUserId: userId,
            reason: 'account_deletion',
          },
        })
      }

      // 1. Remove access, roster, channels, conversations, and active club rows.
      await tx.teamMember.deleteMany({ where: { userId } })
      await tx.channelMember.deleteMany({ where: { userId } })
      await tx.conversationParticipant.deleteMany({ where: { userId } })
      await tx.membership.deleteMany({ where: { userId } })
      await tx.joinRequest.deleteMany({ where: { userId } })
      await tx.clubClaim.updateMany({
        where: {
          claimantUserId: userId,
          status: { in: [ClubClaimStatus.SUBMITTED, ClubClaimStatus.NEEDS_INFO] },
        },
        data: {
          status: ClubClaimStatus.WITHDRAWN,
          reviewNote: 'Claim withdrawn because the claimant deleted their account.',
          reviewedAt: deletedAt,
        },
      })

      // 2. Remove per-user interaction traces that would otherwise continue to
      // identify the deleted user in chat, event, moderation, and poll surfaces.
      await tx.messageReaction.deleteMany({ where: { userId } })
      await tx.messageReadReceipt.deleteMany({ where: { userId } })
      await tx.messageReport.deleteMany({ where: { reporterUserId: userId } })
      await tx.userBlock.deleteMany({
        where: {
          OR: [{ blockerUserId: userId }, { blockedUserId: userId }],
        },
      })
      await tx.pollVote.deleteMany({ where: { userId } })
      await tx.rsvp.deleteMany({ where: { userId } })
      await tx.coachAttendance.deleteMany({ where: { userId } })
      await tx.coachAttendanceChange.deleteMany({ where: { userId } })
      await tx.coachAttendanceRejection.deleteMany({ where: { actorId: userId } })
      await tx.coachAttendance.updateMany({ where: { actorId: userId }, data: { actorId: null } })
      await tx.coachAttendanceChange.updateMany({ where: { actorId: userId }, data: { actorId: null } })
      await tx.eventReminderPreference.deleteMany({ where: { userId } })

      // 3. Anonymize public chat and direct-message content. Delete cached
      // translations first: otherwise the original text survives in translated
      // form even after Message.content is replaced.
      await tx.messageTranslation.deleteMany({
        where: { message: { is: { senderId: userId } } },
      })
      await tx.directMessageTranslation.deleteMany({
        where: { directMessage: { is: { senderId: userId } } },
      })
      await tx.directMessage.updateMany({
        where: { senderId: userId },
        data: { content: '[deleted]', attachmentUrl: null, attachmentMeta: Prisma.DbNull, deletedAt } satisfies Prisma.DirectMessageUpdateManyMutationInput,
      })

      // 4. Remove private profile, notification, auth, child/guardian, invite,
      // roster-claim, injury, duty, and marketplace rows.
      await tx.pushToken.deleteMany({ where: { userId } })
      await tx.notificationPreference.deleteMany({ where: { userId } })
      if (normalizedEmail) {
        await tx.otpCode.deleteMany({ where: { email: normalizedEmail } })
      }

      if (normalizedEmail) {
        for (const emailValue of emailCandidates) {
          await tx.$executeRaw`
            UPDATE "AuditLog"
            SET
              "summary" = replace("summary", ${emailValue}, '[redacted-email]'),
              "metadata" = CASE
                WHEN "metadata" IS NULL THEN NULL
                ELSE replace("metadata"::text, ${emailValue}, '[redacted-email]')::jsonb
              END
            WHERE
              position(${emailValue} in "summary") > 0
              OR ("metadata" IS NOT NULL AND position(${emailValue} in "metadata"::text) > 0)
          `
        }
      }

      for (const clubId of deletionClubIds) {
        await tenantContext.run({ clubId, userId }, async () => {
          // Privacy (guardian deletion): a deleted guardian can no longer hold
          // a consent. Withdraw every APPROVED consent this user gave and, where
          // no other guardian's approval covers the child on that team, revoke
          // the child's dependent team access in this same transaction.
          const guardianConsents = await tx.parentalConsent.findMany({
            where: {
              clubId,
              status: ParentalConsentStatus.APPROVED,
              OR: [
                { guardianUserId: userId },
                ...(emailCandidates.length > 0
                  ? [{ guardianEmail: { in: emailCandidates }, guardianUserId: null }]
                  : []),
              ],
            },
            select: { id: true, playerUserId: true },
          })
          for (const guardianConsent of guardianConsents) {
            if (guardianConsent.playerUserId === userId) continue
            const effect = await withdrawApprovedConsentTx(tx, {
              consentId: guardianConsent.id,
              clubId,
              actorUserId: null,
              reason: CONSENT_WITHDRAWAL_REASON.GUARDIAN_ACCOUNT_DELETED,
            })
            if (effect) withdrawnConsentEffects.push(effect)
          }

          await tx.teamAccess.deleteMany({ where: { userId } })
          await tx.eventCheckIn.deleteMany({ where: { userId } })
          // Soft-deleting User does not run the schema's FK cascades. Remove
          // location-bearing carpool offers/seats and sensitive compliance
          // documents explicitly before the account is anonymized.
          await tx.carpoolSeat.deleteMany({ where: { clubId, userId } })
          await tx.carpoolRide.deleteMany({ where: { clubId, driverUserId: userId } })
          await tx.complianceRecord.deleteMany({ where: { clubId, memberUserId: userId } })
          await tx.complianceRecord.updateMany({
            where: { clubId, createdById: userId },
            data: { createdById: null },
          })
          await tx.message.updateMany({
            where: { senderId: userId },
            data: {
              content: '[deleted]',
              attachmentUrl: null,
              attachmentMeta: Prisma.JsonNull,
              deletedAt,
            },
          })
          await tx.guardianRelationship.deleteMany({
            where: {
              OR: [{ parentUserId: userId }, { playerUserId: userId }],
            },
          })
          await tx.parentalConsent.deleteMany({ where: { playerUserId: userId } })
          await tx.parentalConsent.updateMany({
            where: { guardianUserId: userId },
            data: { guardianUserId: null },
          })
          await tx.injuryReport.deleteMany({
            where: {
              OR: [{ userId }, { reportedById: userId }],
            },
          })
          await tx.teamDutyAssignment.deleteMany({
            where: {
              OR: [{ assignedUserId: userId }, { createdById: userId }],
            },
          })
          await tx.trialInvite.deleteMany({ where: { sentByUserId: userId } })
          if (lockedFreeAgentProfileId) {
            await tx.trialInvite.deleteMany({
              where: { freeAgentProfileId: lockedFreeAgentProfileId },
            })
          }
          await tx.contributionAssignment.updateMany({
            where: { memberUserId: userId, endDate: null },
            data: { endDate: deletedAt },
          })
          await tx.contributionReminder.deleteMany({ where: { memberUserId: userId } })

          if (emailCandidates.length > 0) {
            // Privacy (H4): a request still PENDING with the deleted guardian
            // can never be decided. Close it as withdrawn so the club sees it
            // and a request to another guardian re-admits the child.
            await tx.parentalConsent.updateMany({
              where: {
                guardianEmail: { in: emailCandidates },
                status: ParentalConsentStatus.PENDING,
                playerUserId: { not: userId },
              },
              data: {
                status: ParentalConsentStatus.WITHDRAWN,
                withdrawnAt: deletedAt,
                withdrawnByUserId: null,
                withdrawalReason: CONSENT_WITHDRAWAL_REASON.GUARDIAN_ACCOUNT_DELETED,
              },
            })
            await tx.parentalConsent.updateMany({
              where: { guardianEmail: { in: emailCandidates } },
              data: {
                guardianEmail: `deleted-guardian-${userId}@anstoss.io`,
                guardianUserId: null,
              },
            })
            await tx.invite.updateMany({
              where: { recipientEmail: { in: emailCandidates } },
              data: { recipientEmail: null },
            })
            await tx.invite.updateMany({
              where: { guardianEmail: { in: emailCandidates } },
              data: { guardianEmail: null },
            })
          }
          await tx.invite.updateMany({
            where: { acceptedByUserId: userId },
            data: { acceptedByUserId: null },
          })
        })
      }

      if (normalizedEmail) {
        await tx.parentHandoff.updateMany({
          where: { guardianEmail: { in: emailCandidates } },
          data: { guardianEmail: `deleted-guardian-${userId}@anstoss.io` },
        })
      }
      await tx.supportAction.updateMany({
        where: {
          OR: [
            { actorId: userId },
            ...emailCandidates.map((email) => ({
              actorEmail: email,
            })),
          ],
        },
        data: {
          actorId: 'deleted-user',
          actorEmail: anonymizedEmail,
        },
      })
      await tx.parentHandoff.deleteMany({
        where: { sourceUserId: userId },
      })
      await tx.parentHandoff.updateMany({
        where: { redeemedByUserId: userId },
        data: { redeemedByUserId: null },
      })
      await tx.rosterSlot.updateMany({
        where: { claimedByUserId: userId },
        data: {
          fullName: 'Deleted player',
          phone: null,
          dateOfBirth: null,
          position: null,
          jerseyNumber: null,
          claimedByUserId: null,
          claimedAt: null,
        },
      })
      await tx.user.updateMany({
        where: { managedById: userId },
        data: { managedById: null },
      })

      if (lockedFreeAgentProfileId) {
        await tx.freeAgentMedia.deleteMany({
          where: { profileId: lockedFreeAgentProfileId },
        })
        await tx.freeAgentExperience.deleteMany({
          where: { profileId: lockedFreeAgentProfileId },
        })
        await tx.freeAgentProfile.delete({
          where: { id: lockedFreeAgentProfileId },
        })
      }

      // 6. Anonymize audit actor fields where this user was the actor. The
      // event remains for security and governance accountability under the
      // documented retention matrix, without a direct user identifier.
      await tx.auditLog.updateMany({
        where: { actorId: userId },
        data: { actorId: null, actorLabel: 'Deleted User' },
      })

      // 7. Soft delete + anonymize the user record.
      // clerkId is nulled so the Clerk identity is unlinked: a future sign-up
      // with the same Clerk account will JIT-create a fresh user row instead of
      // rehydrating this deleted record (data-resurrection / cross-account fix).
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt,
          clerkId: null,
          managedById: null,
          name: 'Deleted User',
          email: anonymizedEmail,
          avatarUrl: null,
          dateOfBirth: null,
        },
      })
    })

    // Terminate the deleted user's existing rooms across all namespaces too;
    // rejecting future JWT requests alone does not stop passive socket delivery.
    this.eventEmitter?.emit('realtime.access.changed', { userId })

    // Privacy: after commit, notify club admins and drop revoked sockets.
    if (withdrawnConsentEffects.length > 0 && this.eventEmitter) {
      const payload: ConsentWithdrawnEventPayload = {
        effects: withdrawnConsentEffects,
        actorUserId: null,
      }
      this.eventEmitter.emit(CONSENT_WITHDRAWN_EVENT, payload)
      for (const effect of withdrawnConsentEffects) {
        if (effect.accessRevoked) {
          this.eventEmitter.emit('realtime.access.changed', { userId: effect.playerUserId })
        }
        for (const parentUserId of effect.disconnectedParentUserIds) {
          if (parentUserId !== userId) {
            this.eventEmitter.emit('realtime.access.changed', { userId: parentUserId })
          }
        }
      }
    }

    return { success: true }
  }

  private async collectAccountDeletionClubIds(
    userId: string,
    emailCandidates: string[],
    freeAgentProfileId: string | null,
  ) {
    const [
      memberships,
      teamAccess,
      teamMembers,
      guardianRelationships,
      parentalConsents,
      messages,
      eventCheckIns,
      injuryReports,
      dutyAssignments,
      trialInvitesSent,
      trialInvitesForProfile,
      contributionAssignments,
      contributionRecords,
      contributionReminders,
      invites,
      notificationPreferences,
      rsvps,
      eventReminderPreferences,
      complianceRecords,
      carpoolRides,
      carpoolSeats,
    ] = await Promise.all([
      this.prisma.membership.findMany({
        where: { userId },
        select: { clubId: true },
      }),
      this.prisma.teamAccess.findMany({
        where: { userId },
        select: { clubId: true },
      }),
      this.prisma.teamMember.findMany({
        where: { userId },
        select: { team: { select: { clubId: true } } },
      }),
      this.prisma.guardianRelationship.findMany({
        where: {
          OR: [{ parentUserId: userId }, { playerUserId: userId }],
        },
        select: { clubId: true },
      }),
      this.prisma.parentalConsent.findMany({
        where: {
          OR: [
            { playerUserId: userId },
            { guardianUserId: userId },
            ...emailCandidates.map((email) => ({ guardianEmail: email })),
          ],
        },
        select: { clubId: true },
      }),
      this.prisma.message.findMany({
        where: { senderId: userId },
        select: { clubId: true },
      }),
      this.prisma.eventCheckIn.findMany({
        where: { userId },
        select: { clubId: true },
      }),
      this.prisma.injuryReport.findMany({
        where: {
          OR: [{ userId }, { reportedById: userId }],
        },
        select: { clubId: true },
      }),
      this.prisma.teamDutyAssignment.findMany({
        where: {
          OR: [{ assignedUserId: userId }, { createdById: userId }],
        },
        select: { clubId: true },
      }),
      this.prisma.trialInvite.findMany({
        where: { sentByUserId: userId },
        select: { clubId: true },
      }),
      freeAgentProfileId
        ? this.prisma.trialInvite.findMany({
            where: { freeAgentProfileId },
            select: { clubId: true },
          })
        : Promise.resolve([]),
      this.prisma.contributionAssignment.findMany({
        where: { memberUserId: userId },
        select: { clubId: true },
      }),
      this.prisma.contributionRecord.findMany({
        where: { memberUserId: userId },
        select: { clubId: true },
      }),
      this.prisma.contributionReminder.findMany({
        where: { memberUserId: userId },
        select: { clubId: true },
      }),
      this.prisma.invite.findMany({
        where: {
          OR: [
            { acceptedByUserId: userId },
            ...emailCandidates.map((email) => ({ recipientEmail: email })),
            ...emailCandidates.map((email) => ({ guardianEmail: email })),
          ],
        },
        select: { clubId: true },
      }),
      this.prisma.notificationPreference.findMany({
        where: { userId },
        select: { clubId: true },
      }),
      this.prisma.rsvp.findMany({
        where: { userId },
        select: { event: { select: { clubId: true } } },
      }),
      this.prisma.eventReminderPreference.findMany({
        where: { userId },
        select: { event: { select: { clubId: true } } },
      }),
      this.prisma.complianceRecord.findMany({
        where: { OR: [{ memberUserId: userId }, { createdById: userId }] },
        select: { clubId: true },
      }),
      this.prisma.carpoolRide.findMany({
        where: { driverUserId: userId },
        select: { clubId: true },
      }),
      this.prisma.carpoolSeat.findMany({
        where: { userId },
        select: { clubId: true },
      }),
    ])

    return uniqueValues([
      ...memberships.map((row: any) => row.clubId),
      ...teamAccess.map((row: any) => row.clubId),
      ...teamMembers.map((row: any) => row.team?.clubId),
      ...guardianRelationships.map((row: any) => row.clubId),
      ...parentalConsents.map((row: any) => row.clubId),
      ...messages.map((row: any) => row.clubId),
      ...eventCheckIns.map((row: any) => row.clubId),
      ...injuryReports.map((row: any) => row.clubId),
      ...dutyAssignments.map((row: any) => row.clubId),
      ...trialInvitesSent.map((row: any) => row.clubId),
      ...trialInvitesForProfile.map((row: any) => row.clubId),
      ...contributionAssignments.map((row: any) => row.clubId),
      ...contributionRecords.map((row: any) => row.clubId),
      ...contributionReminders.map((row: any) => row.clubId),
      ...invites.map((row: any) => row.clubId),
      ...notificationPreferences.map((row: any) => row.clubId),
      ...rsvps.map((row: any) => row.event?.clubId),
      ...eventReminderPreferences.map((row: any) => row.event?.clubId),
      ...complianceRecords.map((row: any) => row.clubId),
      ...carpoolRides.map((row: any) => row.clubId),
      ...carpoolSeats.map((row: any) => row.clubId),
    ])
  }

  private async collectDeletionObjectKeys(input: {
    userId: string
    avatarUrl: string | null
    freeAgentProfileId: string | null
    privateUploads: Array<{ id: string; clubId: string; ownerId: string; targetId: string; targetType: string; messageId: string | null; objectKey: string }>
  }, client: Prisma.TransactionClient = this.prisma) {
    const [messages, directMessages, freeAgentMedia, complianceDocuments] = await Promise.all([
      client.message.findMany({
        where: {
          senderId: input.userId,
          attachmentUrl: { not: null },
        },
        select: { id: true, attachmentUrl: true, clubId: true, teamId: true, channelId: true, messageType: true },
      }),
      client.directMessage.findMany({
        where: { senderId: input.userId, attachmentUrl: { not: null } },
        select: { id: true, attachmentUrl: true, conversationId: true, messageType: true, conversation: { select: { clubId: true } } },
      }),
      input.freeAgentProfileId
        ? client.freeAgentMedia.findMany({
            where: { profileId: input.freeAgentProfileId },
            select: { url: true, thumbnailUrl: true },
          })
        : Promise.resolve([]),
      client.complianceRecord.findMany({
        where: { memberUserId: input.userId, documentUrl: { not: null } },
        select: { documentUrl: true, clubId: true },
      }),
    ])

    // Old marketplace rows may contain arbitrary external or cross-account
    // thumbnail URLs. Erasure may only enqueue profile assets in this user's
    // own namespace; never turn someone else's file into a deletion target.
    const ownedKey = (url: string | null | undefined, prefix: string): string | null => {
      if (!url) return null
      const key = this.r2?.objectKeyFromUrl(url) ?? null
      if (!key) {
        let pathname = ''
        try { pathname = decodeURIComponent(new URL(url).pathname) } catch { /* unknown external URL */ }
        // Never clear an apparently owned object reference if storage
        // configuration cannot identify the object for the durable outbox.
        if (pathname.includes(`/${prefix}`)) {
          throw new ServiceUnavailableException('Media cleanup cannot be scheduled safely')
        }
      }
      return key?.startsWith(prefix) ? key : null
    }
    const legacyChatKey = (url: string | null | undefined, prefix: string,
      binding: { messageId: string; clubId: string; targetType: 'CHANNEL' | 'DM'; targetId: string | null;
        storageTargetId: string; messageType: string }) => {
      if (!url) return null
      if (url.startsWith('https://private-media.anstoss.invalid/private-chat/v2/')) {
        const upload = input.privateUploads.find((row) => row.ownerId === input.userId
          && row.clubId === binding.clubId && row.messageId === binding.messageId
          && row.targetType === binding.targetType && row.targetId === binding.targetId
          && row.objectKey === `private-chat/v2/${row.id}`
          && url === `https://private-media.anstoss.invalid/private-chat/v2/${row.id}`)
        if (!upload) throw new ServiceUnavailableException('Private chat media needs support review before account deletion can complete')
        return null
      }
      // Legacy attachments lack an uploader binding even when the URL matches
      // the message's team/conversation.
      const key = ownedKey(url, prefix) // Surface unresolvable apparently-bound objects.
      if (key && ['IMAGE', 'VIDEO', 'FILE', 'VOICE'].includes(binding.messageType)
        && isOwnedPrivateV1Key(key, { targetType: binding.targetType === 'CHANNEL' ? 'chat' : 'dm',
          clubId: binding.clubId, targetId: binding.storageTargetId, ownerId: input.userId,
          kind: uploadKindFor(binding.messageType as ChatAttachmentType) })) return key
      throw new ServiceUnavailableException(
        'Legacy chat media needs support review before account deletion can complete',
      )
    }
    const complianceKey = (url: string | null | undefined, clubId: string) => {
      if (!url) return null
      const key = ownedKey(url, `compliance/${clubId}/${input.userId}/`)
      if (!key) throw new ServiceUnavailableException(
        'Legacy compliance media needs support review before account deletion can complete',
      )
      return key
    }
    const keys = [
      ownedKey(input.avatarUrl, `users/${input.userId}/`),
      // V2 objects are retired separately via their per-owner upload ledger.
      ...messages.map((message: any) => legacyChatKey(message.attachmentUrl, `chat/${message.clubId}/${message.teamId}/`, {
        messageId: message.id, clubId: message.clubId, targetType: 'CHANNEL', targetId: message.channelId,
        storageTargetId: message.teamId, messageType: message.messageType,
      })),
      ...directMessages.map((message: any) => legacyChatKey(message.attachmentUrl, `dm/${message.conversation.clubId}/${message.conversationId}/`, {
        messageId: message.id, clubId: message.conversation.clubId, targetType: 'DM', targetId: message.conversationId,
        storageTargetId: message.conversationId, messageType: message.messageType,
      })),
      ...freeAgentMedia.flatMap((media: any) => [
        ownedKey(media.url, `users/${input.userId}/free-agent/`),
        ownedKey(media.thumbnailUrl, `users/${input.userId}/free-agent/`),
      ]),
      // Compliance has no verified general upload-ownership scheme. Only an
      // explicitly member-scoped key is eligible for automatic deletion.
      ...complianceDocuments.map((record: any) => complianceKey(record.documentUrl, record.clubId)),
    ].filter((key): key is string => !!key)

    return uniqueValues(keys)
  }

  /**
   * Get upcoming events across all teams for a parent's children.
   * Queries GuardianRelationship → child TeamAccess → Events.
   */
  async getChildrenEvents(
    userId: string,
    filters?: { dateFrom?: string; dateTo?: string },
  ): Promise<CrossTeamEventItem[]> {
    requireYouthParticipation()
    // Find all guardian relationships for this parent
    const relationships = await this.prisma.guardianRelationship.findMany({
      where: { parentUserId: userId },
      select: {
        playerUserId: true,
        childName: true,
      },
    })

    if (relationships.length === 0) return []

    // Get player user IDs (some might be null if child isn't a registered user)
    const playerUserIds = relationships
      .map((r: any) => r.playerUserId)
      .filter((id: any): id is string => id !== null)

    if (playerUserIds.length === 0) return []

    // Find all active team access records for these children (including loans)
    const teamAccessRecords = await this.prisma.teamAccess.findMany({
      where: {
        userId: { in: playerUserIds },
        ...activeTeamAccessWhere(),
      },
      select: {
        userId: true,
        teamId: true,
        team: {
          select: {
            id: true,
            name: true,
            group: {
              select: { displayName: true },
            },
          },
        },
      },
    })

    const teamIds = [...new Set(teamAccessRecords.map((ta: any) => ta.teamId))]
    if (teamIds.length === 0) return []

    // Build team name lookup and team→child mapping
    const teamNameMap = new Map<string, { name: string; displayName: string }>()
    // teamId → every guarded child on that team (two siblings on one team
    // each get their own row, so a parent can answer for each of them).
    const teamToChildMap = new Map<string, string[]>()
    for (const ta of teamAccessRecords) {
      if (!teamNameMap.has(ta.teamId)) {
        teamNameMap.set(ta.teamId, {
          name: ta.team.name,
          displayName: ta.team.group?.displayName
            ? `${ta.team.group.displayName} — ${ta.team.name}`
            : ta.team.name,
        })
      }
      const kids = teamToChildMap.get(ta.teamId) ?? []
      if (!kids.includes(ta.userId)) kids.push(ta.userId)
      teamToChildMap.set(ta.teamId, kids)
    }

    // Build child name lookup
    const childNameMap = new Map<string, string>()
    for (const r of relationships) {
      if (r.playerUserId) {
        childNameMap.set(r.playerUserId, r.childName || '')
      }
    }

    // Query upcoming events for all those teams
    const dateFilter: Record<string, Date> = { gte: new Date() }
    if (filters?.dateFrom) dateFilter.gte = parseDateBoundary(filters.dateFrom, 'start')
    if (filters?.dateTo) dateFilter.lte = parseDateBoundary(filters.dateTo, 'end')

    const events = await this.prisma.event.findMany({
      where: {
        teamId: { in: teamIds },
        date: dateFilter,
        cancelledAt: null,
        archivedAt: null,
      },
      include: {
        _count: { select: { rsvps: true } },
        rsvps: {
          select: { userId: true, status: true, nominated: true },
        },
      },
      orderBy: { date: 'asc' },
    })

    return events.flatMap((event: any) => {
      const teamInfo = teamNameMap.get(event.teamId)
      const kids = teamToChildMap.get(event.teamId) ?? []
      return kids.map((childUserId) => {
      const childName = childNameMap.get(childUserId)
      const childReply = event.rsvps.find((rsvp: any) => rsvp.userId === childUserId)
      const childRsvp = childReply?.status ?? null
      return {
        id: event.id,
        teamId: event.teamId,
        clubId: event.clubId,
        title: event.title,
        type: event.type,
        date: event.date.toISOString(),
        rsvpDeadline: event.rsvpDeadline?.toISOString() ?? null,
        rsvpLocked: Boolean(event.rsvpLocked),
        location: event.location ?? null,
        notes: event.notes ?? null,
        createdById: event.createdById,
        createdAt: event.createdAt.toISOString(),
        responseCount: event._count.rsvps,
        yesCount: event.rsvps.filter((rsvp: any) => rsvp.status === RsvpStatus.YES).length,
        maybeCount: event.rsvps.filter((rsvp: any) => rsvp.status === RsvpStatus.MAYBE).length,
        noCount: event.rsvps.filter((rsvp: any) => rsvp.status === RsvpStatus.NO).length,
        myRsvp: event.rsvps.find((rsvp: any) => rsvp.userId === userId)?.status ?? null,
        teamName: teamInfo?.name ?? '',
        teamDisplayName: teamInfo?.displayName ?? '',
        childUserId,
        childName: childName || undefined,
        childRsvp,
        cancelledAt: null,
        meetingAt: event.meetingAt?.toISOString() ?? null,
        meetingPoint: event.meetingPoint ?? null,
        opponent: event.opponent ?? null,
        homeAway: event.homeAway ?? null,
        fixtureId: event.fixtureId ?? null,
        carpoolEnabled: event.carpoolEnabled ?? false,
        durationMin: event.durationMin ?? null,
        squadPublishedAt: event.squadPublishedAt?.toISOString() ?? null,
        myNominated: Boolean(childReply?.nominated),
      }
      })
    })
  }

  // ── home revamp: parent home overview ──
  /**
   * GET /me/children-overview?clubId= — everything the parent home shows
   * besides the events feed, for one club:
   *  - children: every guardian-linked child with all their active teams in
   *    the club (children without upcoming events included), plus
   *    unregistered children whose guardian row names a team in this club;
   *  - duties: pending TeamDutyAssignment rows for those children on those
   *    teams, and the parent's own pending duties in the club;
   *  - announcements: latest posts in the children's team ANNOUNCEMENTS
   *    channels and the club-level ones, filtered with the same visibility
   *    rules ChannelsService.userMayRead applies to a parent.
   * Tenancy: the caller must be a member of the club; every query is keyed
   * by that clubId, and team reach comes only from guardian links.
   */
  async getChildrenOverview(
    userId: string,
    clubId: string,
    limit = 3,
  ): Promise<ChildrenOverview> {
    requireYouthParticipation()
    const membership = await this.prisma.membership.findFirst({
      where: { userId, clubId },
      select: { role: true },
    })
    if (!membership) throw new ForbiddenException('Not a club member')

    const relationships = await this.prisma.guardianRelationship.findMany({
      where: { parentUserId: userId },
      select: {
        clubId: true,
        teamId: true,
        playerUserId: true,
        childName: true,
        player: { select: { name: true } },
        team: { select: { id: true, name: true, displayName: true, clubId: true } },
      },
    })

    const childIds = uniqueValues(relationships.map((r: any) => r.playerUserId as string | null))
    const childAccess = childIds.length
      ? await this.prisma.teamAccess.findMany({
          where: { userId: { in: childIds }, clubId, ...activeTeamAccessWhere() },
          select: {
            userId: true,
            teamId: true,
            team: { select: { id: true, name: true, displayName: true } },
          },
        })
      : []

    const teamsByChild = new Map<string, Map<string, { id: string; name: string; displayName: string }>>()
    const teamNames = new Map<string, string>()
    for (const row of childAccess as any[]) {
      const teams = teamsByChild.get(row.userId) ?? new Map()
      teams.set(row.teamId, {
        id: row.team.id,
        name: row.team.name,
        displayName: row.team.displayName || row.team.name,
      })
      teamsByChild.set(row.userId, teams)
      teamNames.set(row.teamId, row.team.displayName || row.team.name)
    }

    const children: ChildOverviewChild[] = []
    const seenChildren = new Set<string>()
    for (const rel of relationships as any[]) {
      const name = (rel.childName || rel.player?.name || '').trim()
      if (rel.playerUserId) {
        if (seenChildren.has(rel.playerUserId)) continue
        const teams = teamsByChild.get(rel.playerUserId)
        // A registered child only counts in this club while on one of its teams.
        if (!teams || teams.size === 0) continue
        seenChildren.add(rel.playerUserId)
        children.push({ userId: rel.playerUserId, name, teams: Array.from(teams.values()) })
      } else if (rel.clubId === clubId && rel.team && rel.team.clubId === clubId) {
        children.push({
          userId: null,
          name,
          teams: [
            {
              id: rel.team.id,
              name: rel.team.name,
              displayName: rel.team.displayName || rel.team.name,
            },
          ],
        })
      }
    }

    const childTeamIds = uniqueValues((childAccess as any[]).map((row) => row.teamId as string))
    const childPairs = (childAccess as any[]).map((row) => ({
      assignedUserId: row.userId as string,
      teamId: row.teamId as string,
    }))

    const dutyRows = await this.prisma.teamDutyAssignment.findMany({
      where: {
        clubId,
        status: 'PENDING',
        OR: [{ assignedUserId: userId }, ...childPairs],
      },
      include: {
        team: { select: { name: true, displayName: true } },
        assignedUser: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    })

    const duties: ChildOverviewDuty[] = (dutyRows as any[]).map((duty) => ({
      id: duty.id,
      clubId: duty.clubId,
      teamId: duty.teamId,
      assignedUserId: duty.assignedUserId,
      createdById: duty.createdById,
      kind: duty.kind,
      status: duty.status,
      dueDate: duty.dueDate?.toISOString() ?? null,
      notes: duty.notes ?? null,
      completedAt: duty.completedAt?.toISOString() ?? null,
      createdAt: duty.createdAt.toISOString(),
      updatedAt: duty.updatedAt.toISOString(),
      assignedUser: duty.assignedUser ?? undefined,
      teamName: duty.team?.displayName || duty.team?.name || '',
      childUserId: duty.assignedUserId === userId ? null : duty.assignedUserId,
    }))

    // Visibility as ChannelsService.userMayRead decides it for this caller:
    // the parent reads MEMBERS and PARENTS_ONLY channels of a guarded team;
    // COACHES_ONLY / ADMINS_ONLY only through their own club role.
    const role = membership.role
    const isAdmin = role === 'OWNER' || role === 'ADMIN'
    const isCoach = isAdmin || role === 'COACH'
    const readable: Array<'MEMBERS' | 'PARENTS_ONLY' | 'COACHES_ONLY' | 'ADMINS_ONLY'> = [
      'MEMBERS',
      'PARENTS_ONLY',
      ...(isCoach ? (['COACHES_ONLY'] as const) : []),
      ...(isAdmin ? (['ADMINS_ONLY'] as const) : []),
    ]

    const messages = await this.prisma.message.findMany({
      where: {
        clubId,
        deletedAt: null,
        messageType: 'TEXT',
        channel: {
          clubId,
          kind: 'ANNOUNCEMENTS',
          visibility: { in: readable },
          OR: [
            { teamId: null },
            ...(childTeamIds.length ? [{ teamId: { in: childTeamIds } }] : []),
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        content: true,
        createdAt: true,
        channel: { select: { teamId: true } },
      },
    })

    const announcements: ChildOverviewAnnouncement[] = (messages as any[]).map((m) => {
      const [title, ...rest] = String(m.content).split(/\n\n+/)
      const teamId = (m.channel?.teamId as string | null) ?? null
      return {
        id: m.id,
        title: (title ?? '').trim(),
        body: rest.join('\n\n').trim(),
        createdAt: m.createdAt.toISOString(),
        teamId,
        teamName: teamId ? (teamNames.get(teamId) ?? null) : null,
      }
    })

    return { children, duties, announcements }
  }
  // ── end home revamp ──
}

// Translates the onboarding `freeAgent` payload into the canonical
// `FreeAgentProfileWriteInput` shape consumed by MarketplaceService.
// The two schemas diverge (Task 6 left the onboarding shape closer to the UI
// and defers the reconciliation to this translator). Picks the first
// user-supplied position that matches a PlayerPosition enum value — multi-
// position support is MVP-deferred to a later phase. Drops `experienceYears`
// and `availableForTrials` since FreeAgentProfile has no columns for them.
function translateFreeAgentOnboarding(
  freeAgent: Extract<
    CompleteOnboardingInput,
    { registrationRole: typeof RegistrationRole.FREE_AGENT }
  >['freeAgent'],
) {
  const validPositions = freeAgent.position
    .map((p) => p.toUpperCase())
    .filter((p): p is PlayerPosition => (Object.values(PlayerPosition) as string[]).includes(p))

  if (validPositions.length === 0) {
    throw new BadRequestException(
      `At least one position must be one of: ${Object.values(PlayerPosition).join(', ')}`,
    )
  }

  return {
    position: validPositions[0],
    city: freeAgent.location,
    bio: freeAgent.bio,
    isOnTransferList: true,
    visibility: FreeAgentVisibility.PUBLIC,
  }
}

function formatConsentForExport(consent: any) {
  return {
    clubName: consent.club?.name ?? null,
    teamName: consent.team?.displayName || consent.team?.name || null,
    playerUserId: consent.playerUserId,
    guardianEmail: consent.guardianEmail,
    guardianUserId: consent.guardianUserId,
    status: consent.status,
    requestedAt: consent.requestedAt,
    approvedAt: consent.approvedAt,
    createdAt: consent.createdAt,
    updatedAt: consent.updatedAt,
  }
}

function formatInjuryForExport(report: any) {
  return {
    clubName: report.club?.name ?? null,
    teamName: report.team?.displayName || report.team?.name || null,
    title: report.title,
    notes: report.notes,
    status: report.status,
    expectedReturnAt: report.expectedReturnAt,
    expectedReturnLabel: report.expectedReturnLabel,
    clearedAt: report.clearedAt,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  }
}

function uniqueValues<T>(values: Array<T | null | undefined>): T[] {
  return Array.from(new Set(values.filter((value): value is T => value != null)))
}

function parseDateBoundary(value: string, boundary: 'start' | 'end') {
  const germanMatch = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  let date: Date

  if (germanMatch) {
    const [, day, month, year] = germanMatch
    date = new Date(Number(year), Number(month) - 1, Number(day))
  } else if (isoMatch) {
    const [, year, month, day] = isoMatch
    date = new Date(Number(year), Number(month) - 1, Number(day))
  } else {
    date = new Date(value)
  }

  if (boundary === 'start') {
    date.setHours(0, 0, 0, 0)
  } else {
    date.setHours(23, 59, 59, 999)
  }

  return date
}

function isPlaceholderDate(value: Date) {
  return value.toISOString().slice(0, 10) === '1990-01-01'
}

function canManageMembershipRole(role: string) {
  return role === MembershipRole.OWNER || role === MembershipRole.ADMIN
}

function attachMembershipPermissions<T extends { role: string; operationalRoles: string[] }>(
  membership: T,
) {
  return {
    ...membership,
    permissions: buildClubPermissionMap({
      membershipRole: membership.role as MembershipRole,
      operationalRoles: membership.operationalRoles as ClubOperationalRole[],
    }),
  }
}

function canAssignMembershipRole(actorRole: string, nextRole: MembershipRole) {
  if (nextRole === MembershipRole.OWNER) {
    return false
  }

  if (actorRole === MembershipRole.OWNER) {
    return true
  }

  if (actorRole === MembershipRole.ADMIN) {
    return nextRole !== MembershipRole.ADMIN
  }

  return false
}

function isStaffMembershipRole(role: MembershipRole) {
  return (
    role === MembershipRole.OWNER || role === MembershipRole.ADMIN || role === MembershipRole.COACH
  )
}
