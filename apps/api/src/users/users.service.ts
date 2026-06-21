import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { randomInt } from 'node:crypto'
import { createClerkClient } from '@clerk/backend'
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly clubsService: ClubsService,
    private readonly invitesService: InvitesService,
    private readonly marketplaceService: MarketplaceService,
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
  async getClubProfile(userId: string, clubId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
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
    })

    if (!membership) {
      throw new NotFoundException('Member not found in this club')
    }

    return membership
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
        createdAt: true,
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    const [memberships, rsvps, messages, freeAgentProfile] = await Promise.all([
      this.prisma.membership.findMany({
        where: { userId },
        include: {
          club: { select: { name: true } },
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
      this.prisma.message.findMany({
        where: { senderId: userId },
        include: {
          team: { select: { name: true } },
          club: { select: { name: true } },
        },
      }),
      this.prisma.freeAgentProfile.findUnique({
        where: { userId },
        include: { experience: true },
      }),
    ])

    // Gather team memberships from teamAccess (covers all roles)
    const teamAccess = await this.prisma.teamAccess.findMany({
      where: { userId },
      include: {
        team: { select: { name: true } },
      },
    })

    return {
      profile: user,
      memberships: memberships.map((m: any) => ({
        clubName: m.club.name,
        role: m.role,
        joinedAt: m.createdAt,
      })),
      teamMemberships: teamAccess.map((ta: any) => ({
        teamName: ta.team.name,
        role: ta.role,
      })),
      rsvps: rsvps.map((r: any) => ({
        eventTitle: r.event.title,
        status: r.status,
        date: r.event.date,
      })),
      messages: messages.map((m: any) => ({
        content: m.content,
        createdAt: m.createdAt,
        teamName: m.team.name,
        clubName: m.club.name,
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
      select: { id: true, freeAgentProfile: { select: { id: true } } },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    await this.prisma.$transaction(async (tx: any) => {
      // 1. Delete all team access records
      await tx.teamAccess.deleteMany({ where: { userId } })

      // 2. Delete all team member records
      await tx.teamMember.deleteMany({ where: { userId } })

      // 3. Delete all memberships
      await tx.membership.deleteMany({ where: { userId } })

      // 4. Anonymize messages
      await tx.message.updateMany({
        where: { senderId: userId },
        data: { content: '[deleted]' },
      })

      // 5. Delete push tokens
      await tx.pushToken.deleteMany({ where: { userId } })

      // 6. Delete notification preferences
      await tx.notificationPreference.deleteMany({ where: { userId } })

      // 7. Delete free agent profile and experiences
      if (user.freeAgentProfile) {
        await tx.freeAgentExperience.deleteMany({
          where: { profileId: user.freeAgentProfile.id },
        })
        await tx.freeAgentProfile.delete({
          where: { id: user.freeAgentProfile.id },
        })
      }

      // 8. Delete join requests
      await tx.joinRequest.deleteMany({ where: { userId } })

      // 9. Soft delete + anonymize the user record
      // clerkId is nulled so the Clerk identity is unlinked: a future sign-up
      // with the same Clerk account will JIT-create a fresh user row instead of
      // rehydrating this deleted record (data-resurrection / cross-account fix).
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          clerkId: null,
          name: 'Deleted User',
          email: `deleted-${userId}@anstoss.io`,
        },
      })
    })

    return { success: true }
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
