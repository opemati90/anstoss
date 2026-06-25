import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { createClerkClient } from '@clerk/backend'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import {
  AGE_GATE,
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
  rsvpStatusSchema,
} from '@anstoss/shared'
import type {
  CompleteOnboardingInput,
  CrossTeamEventItem,
} from '@anstoss/shared'
import type { ParentHandoffInput } from '@anstoss/shared'
import { TeamsService } from '../teams/teams.service'
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
import { R2Provider } from '../assets/r2.provider'
import { tenantContext } from '../prisma/tenant.context'

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
  ) {}

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
    const dob = new Date(input.childDateOfBirth)
    if (Number.isNaN(dob.getTime()) || getAge(dob) >= AGE_GATE.MIN_AGE) {
      throw new BadRequestException(
        'Parent handoff is only available for under-16 sign-ups',
      )
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { clerkId: true, preferredLanguage: true },
    })
    if (!user) {
      throw new NotFoundException('User not found')
    }

    const guardianEmail = input.guardianEmail.toLowerCase()

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
          expiresAt: new Date(Date.now() + PARENT_HANDOFF_TTL_MS),
        },
      })

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

  /** Allocate a collision-free, human-typeable handoff code. */
  private async allocateHandoffCode(
    client: { parentHandoff: { findUnique: typeof this.prisma.parentHandoff.findUnique } } = this.prisma,
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

    const ageGate =
      age === null
        ? {
            isUnder16: false,
            status: 'DOB_REQUIRED' as const,
            guardianEmail: null,
            message: null,
          }
        : age >= AGE_GATE.MIN_AGE || latestConsent?.status === ParentalConsentStatus.APPROVED
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
    const teamMembers = user.teamAccess.map((teamAccess: typeof user.teamAccess[number]) => ({
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

    const pendingJoinRequest = await this.prisma.joinRequest.findFirst({
      where: { userId, status: 'PENDING' },
      select: { id: true, clubId: true },
      orderBy: { createdAt: 'desc' },
    })

    return {
      ...user,
      memberships: user.memberships.map((membership: typeof user.memberships[number]) =>
        attachMembershipPermissions(membership),
      ),
      teamMembers,
      ageGate,
      pendingJoinRequest,
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
    },
  ) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true, registrationRole: true },
    })

    if (!currentUser) {
      throw new NotFoundException('User not found')
    }

    const updateData: {
      name?: string
      avatarUrl?: string
      dateOfBirth?: Date
      preferredLanguage?: string
      registrationRole?: RegistrationRole
    } = {}

    if (data.registrationRole !== undefined) {
      // First-write-only: the role is fixed on the User row once it leaves
      // the JIT default (PLAYER). Wizard sets it once during onboarding;
      // later PATCHes can resend the same value (idempotent) but cannot
      // change to a different role. Role swaps must go through admin tooling.
      if (
        currentUser.registrationRole &&
        currentUser.registrationRole !== RegistrationRole.PLAYER &&
        currentUser.registrationRole !== data.registrationRole
      ) {
        throw new BadRequestException(
          'registrationRole is read-only after onboarding',
        )
      }
      if (data.registrationRole === RegistrationRole.CLUB_ADMIN) {
        const existingMembership = await this.prisma.membership.findFirst({
          where: { userId },
          select: { id: true },
        })
        if (existingMembership) {
          throw new BadRequestException(
            'Cannot change registration role to CLUB_ADMIN after joining a club',
          )
        }
      }
      updateData.registrationRole = data.registrationRole
    }

    if (data.name !== undefined) {
      updateData.name = data.name
    }

    if (data.avatarUrl !== undefined) {
      updateData.avatarUrl = data.avatarUrl
    }

    if (data.preferredLanguage !== undefined) {
      // Two-letter ISO-639-1 normalization; only persist if supported.
      const head = data.preferredLanguage.split(/[-_]/)[0]?.toLowerCase()
      const supported = ['de', 'en', 'fr', 'pt', 'it', 'tr', 'ar']
      if (head && supported.includes(head)) {
        updateData.preferredLanguage = head
      }
    }

    if (data.dateOfBirth) {
      const parsedDate = new Date(data.dateOfBirth)
      if (Number.isNaN(parsedDate.getTime())) {
        throw new BadRequestException('Invalid date of birth')
      }

      if (
        currentUser.dateOfBirth &&
        !isPlaceholderDate(currentUser.dateOfBirth) &&
        currentUser.dateOfBirth.toISOString().slice(0, 10) !==
          parsedDate.toISOString().slice(0, 10)
      ) {
        throw new BadRequestException(
          'Date of birth is read-only after registration',
        )
      }

      updateData.dateOfBirth = parsedDate
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    })
  }

  /**
   * Complete role-based onboarding — validates role match, updates profile,
   * dispatches role-specific work (club creation / invite redemption / free-agent profile).
   */
  async completeOnboarding(userId: string, input: CompleteOnboardingInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, registrationRole: true },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (user.registrationRole !== input.registrationRole) {
      throw new BadRequestException(
        'registrationRole in payload must match the user record',
      )
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
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.profile.displayName,
        dateOfBirth: new Date(input.profile.dateOfBirth),
        ...(input.profile.photoUrl
          ? { avatarUrl: input.profile.photoUrl }
          : {}),
      },
    })

    switch (input.registrationRole) {
      case RegistrationRole.CLUB_ADMIN: {
        const { clubCreate } = input
        return this.clubsService.createClubWithTeam(
          userId,
          {
            name: clubCreate.name,
            primaryColor: clubCreate.primaryColor,
            badgeUrl: clubCreate.badgeUrl,
            welcomeText: clubCreate.welcomeText,
          },
          { name: clubCreate.firstTeamName },
        )
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
          return this.invitesService.redeem(
            parentLink.approvalInviteCode,
            userId,
          )
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
        throw new BadRequestException(
          `Unsupported registrationRole: ${String(_exhaustive)}`,
        )
      }
    }
  }

  /**
   * Get a user's profile within a club context (visible to teammates).
   */
  async getClubProfile(
    requesterUserId: string,
    targetUserId: string,
    clubId: string,
  ) {
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
          status: TeamAccessStatus.ACTIVE,
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

      const teamMemberByUserId = new Map(
        teamMembers.map((member: any) => [member.userId, member]),
      )

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
      where: { clubId },
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
                status: TeamAccessStatus.ACTIVE,
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
      membership.role === MembershipRole.OWNER ||
      membership.role === MembershipRole.ADMIN

    return memberships.map((member: any) => {
      const withPerms = attachMembershipPermissions(member)
      if (!callerIsAdmin && withPerms.user) {
        return { ...withPerms, user: { ...withPerms.user, email: null } }
      }
      return { ...withPerms }
    })
  }

  async updateClubMemberRole(
    clubId: string,
    actorUserId: string,
    memberUserId: string,
    nextRole: MembershipRole,
  ) {
    const [actorMembership, targetMembership] = await Promise.all([
      this.prisma.membership.findUnique({
        where: {
          userId_clubId: {
            userId: actorUserId,
            clubId,
          },
        },
      }),
      this.prisma.membership.findUnique({
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

    const activeCoachAssignments = await this.prisma.teamAccess.findMany({
      where: {
        clubId,
        userId: memberUserId,
        status: TeamAccessStatus.ACTIVE,
        role: {
          in: [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH],
        },
      },
      select: {
        id: true,
      },
    })

    if (
      activeCoachAssignments.length > 0 &&
      !isStaffMembershipRole(nextRole)
    ) {
      throw new BadRequestException(
        'Reassign squad coaching responsibilities before removing club staff role',
      )
    }

    const membership = await this.prisma.membership.update({
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
    const [actorMembership, targetMembership] = await Promise.all([
      this.prisma.membership.findUnique({
        where: {
          userId_clubId: {
            userId: actorUserId,
            clubId,
          },
        },
      }),
      this.prisma.membership.findUnique({
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

    const updatedMembership = await this.prisma.membership.update({
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
    const [actorMembership, targetMembership] = await Promise.all([
      this.prisma.membership.findUnique({
        where: {
          userId_clubId: {
            userId: actorUserId,
            clubId,
          },
        },
      }),
      this.prisma.membership.findUnique({
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

    const remainingCriticalHolders = await this.prisma.membership.findMany({
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
      .filter((role) =>
        CRITICAL_OPERATIONAL_ROLES.has(role as ClubOperationalRole),
      )
      .every((role) =>
        remainingCriticalHolders.some((membership: any) =>
          membership.operationalRoles.includes(role),
        ),
      )

    if (
      targetMembership.operationalRoles.some((role) =>
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

    const updatedMembership = await this.prisma.$transaction(async (tx: any) => {
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

    const userEmailCandidates = uniqueValues([
      user.email,
      user.email?.trim().toLowerCase(),
    ])

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
    const mediaObjectKeys = await this.collectDeletionObjectKeys({
      userId,
      avatarUrl: user.avatarUrl,
      freeAgentProfileId: user.freeAgentProfile?.id ?? null,
    })

    await this.prisma.$transaction(async (tx: any) => {
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
        data: { content: '[deleted]' },
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

      for (const clubId of accountDeletionClubIds) {
        await tenantContext.run({ clubId, userId }, async () => {
          await tx.teamAccess.deleteMany({ where: { userId } })
          await tx.eventCheckIn.deleteMany({ where: { userId } })
          await tx.message.updateMany({
            where: { senderId: userId },
            data: {
              content: '[deleted]',
              attachmentUrl: null,
              attachmentMeta: Prisma.JsonNull,
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
          if (user.freeAgentProfile) {
            await tx.trialInvite.deleteMany({
              where: { freeAgentProfileId: user.freeAgentProfile.id },
            })
          }
          await tx.contributionAssignment.updateMany({
            where: { memberUserId: userId, endDate: null },
            data: { endDate: deletedAt },
          })
          await tx.contributionReminder.deleteMany({ where: { memberUserId: userId } })

          if (emailCandidates.length > 0) {
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

      if (user.freeAgentProfile) {
        await tx.freeAgentMedia.deleteMany({
          where: { profileId: user.freeAgentProfile.id },
        })
        await tx.freeAgentExperience.deleteMany({
          where: { profileId: user.freeAgentProfile.id },
        })
        await tx.freeAgentProfile.delete({
          where: { id: user.freeAgentProfile.id },
        })
      }

      // 6. Anonymize audit actor fields where this user was the actor. Audit
      // summaries/metadata may still need a formal retention policy.
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

    await this.deleteR2ObjectsForAccountDeletion(mediaObjectKeys)

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
    ])
  }

  private async collectDeletionObjectKeys(input: {
    userId: string
    avatarUrl: string | null
    freeAgentProfileId: string | null
  }) {
    if (!this.r2) return []

    const [messages, freeAgentMedia] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          senderId: input.userId,
          attachmentUrl: { not: null },
        },
        select: { attachmentUrl: true },
      }),
      input.freeAgentProfileId
        ? this.prisma.freeAgentMedia.findMany({
            where: { profileId: input.freeAgentProfileId },
            select: { url: true, thumbnailUrl: true },
          })
        : Promise.resolve([]),
    ])

    const urls = [
      input.avatarUrl,
      ...messages.map((message: any) => message.attachmentUrl),
      ...freeAgentMedia.flatMap((media: any) => [media.url, media.thumbnailUrl]),
    ].filter((url): url is string => typeof url === 'string' && url.length > 0)

    return uniqueValues(
      urls
        .map((url) => this.r2?.objectKeyFromUrl(url) ?? null)
        .filter((objectKey): objectKey is string => !!objectKey),
    )
  }

  private async deleteR2ObjectsForAccountDeletion(objectKeys: string[]) {
    if (!this.r2 || objectKeys.length === 0) return
    try {
      await this.r2.deleteObjects(objectKeys)
    } catch (error) {
      this.logger.error(
        `Account deletion committed, but R2 object deletion failed for ${objectKeys.length} object(s)`,
        error instanceof Error ? error.stack : String(error),
      )
    }
  }

  /**
   * Get upcoming events across all teams for a parent's children.
   * Queries GuardianRelationship → child TeamAccess → Events.
   */
  async getChildrenEvents(
    userId: string,
    filters?: { dateFrom?: string; dateTo?: string },
  ): Promise<CrossTeamEventItem[]> {
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
        status: TeamAccessStatus.ACTIVE,
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
    const teamToChildMap = new Map<string, string>() // teamId → childUserId
    for (const ta of teamAccessRecords) {
      if (!teamNameMap.has(ta.teamId)) {
        teamNameMap.set(ta.teamId, {
          name: ta.team.name,
          displayName: ta.team.group?.displayName
            ? `${ta.team.group.displayName} — ${ta.team.name}`
            : ta.team.name,
        })
      }
      teamToChildMap.set(ta.teamId, ta.userId)
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
      },
      include: {
        _count: { select: { rsvps: true } },
        rsvps: {
          select: { userId: true, status: true },
        },
      },
      orderBy: { date: 'asc' },
    })

    return events.map((event: any) => {
      const teamInfo = teamNameMap.get(event.teamId)
      const childUserId = teamToChildMap.get(event.teamId) ?? undefined
      const childName = childUserId ? childNameMap.get(childUserId) : undefined
      const childRsvp = childUserId
        ? (event.rsvps.find((rsvp: any) => rsvp.userId === childUserId)?.status ?? null)
        : null
      return {
        id: event.id,
        teamId: event.teamId,
        clubId: event.clubId,
        title: event.title,
        type: event.type,
        date: event.date.toISOString(),
        location: event.location ?? null,
        notes: event.notes ?? null,
        createdById: event.createdById,
        createdAt: event.createdAt.toISOString(),
        responseCount: event._count.rsvps,
        yesCount: event.rsvps.filter((rsvp: any) => rsvp.status === RsvpStatus.YES).length,
        maybeCount: event.rsvps.filter((rsvp: any) => rsvp.status === RsvpStatus.MAYBE).length,
        noCount: event.rsvps.filter((rsvp: any) => rsvp.status === RsvpStatus.NO).length,
        myRsvp:
          event.rsvps.find((rsvp: any) => rsvp.userId === userId)?.status ?? null,
        teamName: teamInfo?.name ?? '',
        teamDisplayName: teamInfo?.displayName ?? '',
        childUserId,
        childName: childName || undefined,
        childRsvp,
      }
    })
  }
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
    .filter((p): p is PlayerPosition =>
      (Object.values(PlayerPosition) as string[]).includes(p),
    )

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

function canAssignMembershipRole(
  actorRole: string,
  nextRole: MembershipRole,
) {
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
    role === MembershipRole.OWNER ||
    role === MembershipRole.ADMIN ||
    role === MembershipRole.COACH
  )
}
