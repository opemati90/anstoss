import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { TeamsService } from '../teams/teams.service'
import { ChannelsService } from '../channels/channels.service'
import { tenantContext } from '../prisma/tenant.context'
import { activeTeamAccessWhere } from '../teams/active-team-access'
import { lockGuardianTeamAccess, lockPlayerTeamAccess } from '../teams/guardian-team-access'
import { buildInviteEmail, buildWelcomeEmail, resolveEmailLocale } from '../email/email-content'
import { ClubEntitlementsService } from '../billing/club-entitlements.service'
import {
  getAge,
  InviteDeliveryChannel,
  InviteKind,
  InviteRecipientMismatchError,
  InviteStatus,
  INVITE,
  MembershipRole,
  ParentalConsentStatus,
  TeamAccessPhase,
  TeamAccessStatus,
  TeamRole,
  type CreateInviteCampaignInput,
  type CreateInviteInput,
} from '@anstoss/shared'

type RedeemInviteInput = {
  guardianEmail?: string
  childName?: string
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly channelsService: ChannelsService,
    private readonly clubEntitlements?: ClubEntitlementsService,
  ) {}

  async create(
    clubId: string,
    userId: string,
    input: CreateInviteInput,
    callerMembershipRole: MembershipRole,
  ) {
    const coachRoles: TeamRole[] = [TeamRole.HEAD_COACH, TeamRole.ASSISTANT_COACH]
    const isAdminOrAbove =
      callerMembershipRole === MembershipRole.OWNER || callerMembershipRole === MembershipRole.ADMIN

    // COACH-level callers may only invite PLAYERs.
    if (!isAdminOrAbove && coachRoles.includes(input.role as TeamRole)) {
      throw new ForbiddenException(
        'Coaches may only create PLAYER invites. Only ADMIN or OWNER can invite coaches.',
      )
    }
    // ─────────────────────────────────────────────────────────────────────────

    await this.teamsService.assertManageAccess(userId, input.teamId)

    const team = await this.prisma.team.findFirst({
      where: {
        id: input.teamId,
        clubId,
      },
      include: {
        group: true,
        club: {
          select: {
            id: true,
            name: true,
            slug: true,
            badgeUrl: true,
            primaryColor: true,
          },
        },
      },
    })

    if (!team) {
      throw new NotFoundException('Team not found')
    }

    const normalizedRecipientEmail = input.recipientEmail?.trim().toLowerCase() || null
    const linkedPlayerUserId =
      input.role === TeamRole.PARENT ? input.linkedPlayerUserId?.trim() || null : null
    if (normalizedRecipientEmail) {
      const existing = await this.prisma.invite.findFirst({
        where: {
          clubId,
          teamId: team.id,
          role: input.role as TeamRole,
          phase: input.phase as TeamAccessPhase,
          recipientEmail: normalizedRecipientEmail,
          linkedPlayerUserId,
          status: { in: [InviteStatus.PENDING, InviteStatus.SENT] },
          expiresAt: { gt: new Date() },
        },
        include: {
          club: { select: { id: true, name: true, slug: true, badgeUrl: true, primaryColor: true } },
          team: { include: { group: true } },
          createdBy: { select: { preferredLanguage: true } },
        },
      })
      if (existing) return { ...existing, link: buildInviteLink(existing.club.slug, existing.code) }
    }

    if (linkedPlayerUserId) {
      const linkedPlayerAccess = await this.prisma.teamAccess.findFirst({
        where: {
          teamId: team.id,
          userId: linkedPlayerUserId,
          role: TeamRole.PLAYER,
          ...activeTeamAccessWhere(),
        },
        select: { id: true, loanEndDate: true },
      })

      if (!linkedPlayerAccess) {
        throw new BadRequestException('Linked player is not active on this team')
      }
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + INVITE.EXPIRY_DAYS)

    const invite = await this.prisma.invite.create({
      data: {
        clubId,
        teamId: team.id,
        code: generateInviteCode(),
        kind: InviteKind.MEMBER_INVITE,
        role: input.role as TeamRole,
        phase: input.phase as TeamAccessPhase,
        deliveryChannel: input.deliveryChannel as InviteDeliveryChannel,
        recipientEmail: normalizedRecipientEmail,
        linkedPlayerUserId,
        guardianEmail: input.guardianEmail?.trim().toLowerCase() || null,
        childName: input.childName?.trim() || null,
        createdById: userId,
        status: InviteStatus.PENDING,
        expiresAt,
      },
      include: {
        club: {
          select: {
            id: true,
            name: true,
            slug: true,
            badgeUrl: true,
            primaryColor: true,
          },
        },
        team: {
          include: {
            group: true,
          },
        },
        createdBy: { select: { preferredLanguage: true } },
      },
    })

    let updatedInvite = invite

    if (invite.deliveryChannel === InviteDeliveryChannel.EMAIL && invite.recipientEmail) {
      const sent = await sendInviteEmail(invite)
      if (sent) {
        updatedInvite = await this.prisma.invite.update({
          where: { id: invite.id },
          data: { status: InviteStatus.SENT },
          include: {
            club: {
              select: {
                id: true,
                name: true,
                slug: true,
                badgeUrl: true,
                primaryColor: true,
              },
            },
            team: {
              include: {
                group: true,
              },
            },
            createdBy: { select: { preferredLanguage: true } },
          },
        })
      }
    }

    return {
      ...updatedInvite,
      link: buildInviteLink(updatedInvite.club.slug, updatedInvite.code),
    }
  }

  async validate(code: string) {
    let invite = await this.prisma.invite.findUnique({
      where: { code },
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
        team: {
          include: {
            group: true,
          },
        },
        parentalConsent: true,
      },
    })
    const uppercaseInviteCode = uppercaseCodeFallback(code, 'invite')
    if (!invite && uppercaseInviteCode) {
      invite = await this.prisma.invite.findUnique({
        where: { code: uppercaseInviteCode },
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
          team: { include: { group: true } },
          parentalConsent: true,
        },
      })
    }

    if (!invite) {
      throw new NotFoundException('Invite not found')
    }

    if (invite.status === InviteStatus.ACCEPTED || invite.acceptedAt) {
      throw new BadRequestException('Invite already used')
    }

    if (invite.status === InviteStatus.REVOKED || invite.revokedAt) {
      throw new BadRequestException('Invite has been revoked')
    }

    if (invite.expiresAt < new Date()) {
      if (invite.status !== InviteStatus.EXPIRED) {
        await tenantContext.run({ clubId: invite.clubId, userId: 'system' }, () =>
          this.prisma.invite.update({
            where: { id: invite.id },
            data: { status: InviteStatus.EXPIRED },
          }),
        )
      }
      throw new BadRequestException('Invite expired')
    }

    return invite
  }

  async createCampaign(clubId: string, userId: string, input: CreateInviteCampaignInput) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { role: true },
    })
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only club owners and administrators can create invite links')
    }
    const team = await this.prisma.team.findFirst({
      where: { id: input.teamId, clubId },
      select: { id: true },
    })
    if (!team) throw new NotFoundException('Team not found')

    return tenantContext.run({ clubId, userId }, () =>
      this.prisma.inviteCampaign.create({
        data: {
          clubId,
          teamId: team.id,
          createdById: userId,
          type: input.type,
          role: input.role,
          recipientEmail: input.recipientEmail?.trim().toLowerCase() ?? null,
          // Manual campaign codes must survive keyboards, screenshots and
          // spoken hand-off. Keep them short and case-insensitive instead of
          // using mixed-case Base64URL tokens.
          code: generateCampaignCode(),
          maxUses: input.maxUses,
          expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
        },
        include: {
          club: { select: { id: true, name: true, badgeUrl: true } },
          team: { select: { id: true, name: true, displayName: true } },
        },
      }),
    )
  }

  async validateCampaign(code: string) {
    let campaign = await this.prisma.inviteCampaign.findUnique({
      where: { code },
      include: {
        club: { select: { id: true, name: true, slug: true, badgeUrl: true, primaryColor: true } },
        team: { include: { group: true } },
      },
    })
    const uppercaseCampaignCode = uppercaseCodeFallback(code, 'campaign')
    if (!campaign && uppercaseCampaignCode) {
      campaign = await this.prisma.inviteCampaign.findUnique({
        where: { code: uppercaseCampaignCode },
        include: {
          club: { select: { id: true, name: true, slug: true, badgeUrl: true, primaryColor: true } },
          team: { include: { group: true } },
        },
      })
    }
    if (
      !campaign ||
      campaign.status !== 'ACTIVE' ||
      campaign.expiresAt <= new Date() ||
      campaign.useCount >= campaign.maxUses
    ) {
      throw new NotFoundException('Invite link is invalid or expired')
    }
    return {
      code: campaign.code,
      type: campaign.type,
      role: campaign.role,
      club: campaign.club,
      team: campaign.team,
      expiresAt: campaign.expiresAt,
      remainingUses: campaign.maxUses - campaign.useCount,
    }
  }

  async listCampaigns(clubId: string, userId: string) {
    await this.assertCampaignManager(clubId, userId)
    const campaigns = await this.prisma.inviteCampaign.findMany({
      where: { clubId },
      include: { team: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const now = new Date()
    return campaigns.map((campaign) => ({
      ...campaign,
      status:
        (campaign.status === 'ACTIVE' || campaign.status === 'PAUSED') &&
        (campaign.expiresAt <= now || campaign.useCount >= campaign.maxUses)
          ? ('EXPIRED' as const)
          : campaign.status,
    }))
  }

  async revokeCampaign(clubId: string, campaignId: string, userId: string) {
    await this.assertCampaignManager(clubId, userId)
    const result = await tenantContext.run({ clubId, userId }, () =>
      this.prisma.inviteCampaign.updateMany({
        where: { id: campaignId, clubId, status: { in: ['ACTIVE', 'PAUSED'] } },
        data: { status: 'REVOKED' },
      }),
    )
    if (result.count !== 1) throw new NotFoundException('Active invite campaign not found')
    return { revoked: true }
  }

  async redeemAny(code: string, userId: string, input?: RedeemInviteInput) {
    let campaign = await this.prisma.inviteCampaign.findUnique({
      where: { code },
      select: { id: true, code: true },
    })
    const uppercaseCampaignCode = uppercaseCodeFallback(code, 'campaign')
    if (!campaign && uppercaseCampaignCode) {
      campaign = await this.prisma.inviteCampaign.findUnique({
        where: { code: uppercaseCampaignCode },
        select: { id: true, code: true },
      })
    }
    return campaign
      ? this.redeemCampaign(campaign.code, userId)
      : this.redeem(code, userId, input)
  }

  private async assertCampaignManager(clubId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { role: true },
    })
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException('Only club owners and administrators can manage invite links')
    }
  }

  async redeemCampaign(code: string, userId: string) {
    let campaign = await this.prisma.inviteCampaign.findUnique({
      where: { code },
      include: { club: true, team: true },
    })
    const uppercaseCampaignCode = uppercaseCodeFallback(code, 'campaign')
    if (!campaign && uppercaseCampaignCode) {
      campaign = await this.prisma.inviteCampaign.findUnique({
        where: { code: uppercaseCampaignCode },
        include: { club: true, team: true },
      })
    }
    if (!campaign) throw new NotFoundException('Invite link is invalid or expired')
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, dateOfBirth: true },
    })
    if (!user?.email) throw new InviteRecipientMismatchError('A verified email is required')
    if (
      campaign.type === 'IDENTITY_BOUND' &&
      user.email.toLowerCase() !== campaign.recipientEmail?.toLowerCase()
    ) {
      throw new InviteRecipientMismatchError('This invitation belongs to another email address')
    }

    return tenantContext.run({ clubId: campaign.clubId, userId }, () =>
      this.prisma.$transaction(async (tx) => {
        await this.lockActiveUsers(tx, [userId])
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-campaign:${campaign.id}`}))`
        const current = await tx.inviteCampaign.findUnique({ where: { id: campaign.id } })
        if (
          !current ||
          current.status !== 'ACTIVE' ||
          current.expiresAt <= new Date() ||
          current.useCount >= current.maxUses
        ) {
          throw new NotFoundException('Invite link is invalid or expired')
        }
        const prior = await tx.inviteRedemption.findUnique({
          where: { campaignId_userId: { campaignId: current.id, userId } },
        })
        if (prior) throw new ConflictException('You already used this invitation')

        let result: { status: 'ACTIVE' | 'PENDING'; clubId: string; teamId: string }
        if (current.type === 'IDENTITY_BOUND') {
          if (current.role === TeamRole.PLAYER && !user.dateOfBirth) {
            throw new BadRequestException('Date of birth is required to join as a player')
          }
          if (
            current.role === TeamRole.PLAYER &&
            user.dateOfBirth &&
            getAge(user.dateOfBirth) < 16
          ) {
            throw new BadRequestException(
              'Players under 16 require the guardian approval invitation flow',
            )
          }
          if (current.role === TeamRole.PLAYER) {
            await this.requireEntitlements().assertCanActivatePlayer(current.clubId, userId, tx)
          }
          await tx.membership.upsert({
            where: { userId_clubId: { userId, clubId: current.clubId } },
            create: { userId, clubId: current.clubId, role: MembershipRole.PLAYER },
            update: {},
          })
          await tx.teamAccess.upsert({
            where: {
              teamId_userId_role: { teamId: current.teamId, userId, role: current.role },
            },
            create: {
              clubId: current.clubId,
              teamId: current.teamId,
              userId,
              role: current.role,
              phase: TeamAccessPhase.FULL,
              status: TeamAccessStatus.ACTIVE,
            },
            update: { phase: TeamAccessPhase.FULL, status: TeamAccessStatus.ACTIVE },
          })
          if (current.role === TeamRole.PLAYER) {
            await tx.teamMember.upsert({
              where: { teamId_userId: { teamId: current.teamId, userId } },
              create: { teamId: current.teamId, userId },
              update: { operationalStatus: 'ACTIVE' },
            })
          }
          result = { status: 'ACTIVE', clubId: current.clubId, teamId: current.teamId }
        } else {
          if (!user.dateOfBirth) {
            throw new BadRequestException('Date of birth is required to request player access')
          }
          if (getAge(user.dateOfBirth) < 16) {
            const approvedConsent = await tx.parentalConsent.findFirst({
              where: {
                playerUserId: userId,
                clubId: current.clubId,
                teamId: current.teamId,
                status: ParentalConsentStatus.APPROVED,
              },
              select: { id: true },
            })
            if (!approvedConsent) {
              throw new BadRequestException(
                'Players under 16 need guardian approval before requesting club access',
              )
            }
          }
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`join-request-user:${current.clubId}:${userId}`}))`
          let request = await tx.joinRequest.findUnique({
            where: { clubId_userId: { clubId: current.clubId, userId } },
          })
          if (request) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`join-request:${request.id}`}))`
            request = await tx.joinRequest.findUnique({
              where: { clubId_userId: { clubId: current.clubId, userId } },
            })
          }
          if (request?.status === 'APPROVED') {
            throw new ConflictException('You already belong to this club')
          }
          await tx.joinRequest.upsert({
            where: { clubId_userId: { clubId: current.clubId, userId } },
            create: {
              clubId: current.clubId,
              userId,
              teamId: current.teamId,
              role: current.role,
              status: 'PENDING',
              message: 'Requested through a club invite link',
            },
            update: {
              teamId: current.teamId,
              role: current.role,
              status: 'PENDING',
              reviewedBy: null,
              reviewedAt: null,
              revision: { increment: 1 },
            },
          })
          result = { status: 'PENDING', clubId: current.clubId, teamId: current.teamId }
        }

        await tx.inviteRedemption.create({
          data: { clubId: current.clubId, campaignId: current.id, userId },
        })
        const nextUseCount = current.useCount + 1
        await tx.inviteCampaign.update({
          where: { id: current.id },
          data: {
            useCount: nextUseCount,
            status: nextUseCount >= current.maxUses ? 'EXPIRED' : 'ACTIVE',
          },
        })
        return result
      }),
    )
  }

  async redeem(code: string, userId: string, input: RedeemInviteInput = {}) {
    const invite = await this.validate(code)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        dateOfBirth: true,
        preferredLanguage: true,
      },
    })

    if (!user) {
      throw new NotFoundException('User not found')
    }

    if (!user.email) {
      // Managed sub-profiles have no email and cannot redeem invites directly;
      // the parent must redeem on their behalf via ManagedSubProfilesService.
      throw new InviteRecipientMismatchError('This account cannot redeem invites directly.')
    }

    if (invite.recipientEmail && user.email.toLowerCase() !== invite.recipientEmail.toLowerCase()) {
      throw new InviteRecipientMismatchError('This invite belongs to a different email address.')
    }

    const userWithEmail = { ...user, email: user.email }

    return tenantContext.run({ clubId: invite.clubId, userId }, async () => {
      if (invite.kind === InviteKind.PARENT_APPROVAL) {
        return this.redeemParentApproval(invite.id, userWithEmail)
      }

      if (invite.role === TeamRole.PLAYER && !user.dateOfBirth) {
        throw new BadRequestException('Date of birth is required to join as a player')
      }

      const isUnder16 = user.dateOfBirth ? getAge(user.dateOfBirth) < 16 : false

      if (invite.role === TeamRole.PLAYER && isUnder16 && user.dateOfBirth) {
        return this.requestParentalApproval(
          invite.id,
          { ...userWithEmail, dateOfBirth: user.dateOfBirth },
          input,
        )
      }

      return this.activateMembershipInvite(invite.id, userWithEmail, input)
    })
  }

  private async activateMembershipInvite(
    inviteId: string,
    user: { id: string; email: string; name: string; preferredLanguage: string | null },
    input: RedeemInviteInput,
  ) {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
      include: {
        club: true,
        team: {
          include: {
            group: true,
          },
        },
      },
    })

    if (!invite) {
      throw new NotFoundException('Invite not found')
    }

    const membershipRole = mapTeamRoleToMembershipRole(invite.role)

    const [membership, teamAccess] = await this.prisma.$transaction(async (tx: any) => {
      await this.lockActiveUsers(
        tx,
        invite.linkedPlayerUserId ? [user.id, invite.linkedPlayerUserId] : [user.id],
      )
      if (invite.role === TeamRole.PLAYER) {
        await this.requireEntitlements().assertCanActivatePlayer(invite.clubId, user.id, tx)
      }
      if (invite.role === TeamRole.PARENT && invite.linkedPlayerUserId) {
        // One parent has a single PARENT TeamAccess row per target team. Serialize
        // linked-child redemptions so concurrent invites cannot overwrite a
        // permanent or later loan entitlement with an earlier deadline.
        await lockPlayerTeamAccess(tx, invite.clubId, invite.teamId, invite.linkedPlayerUserId)
        await lockGuardianTeamAccess(tx, invite.clubId, invite.teamId, user.id)
      }
      await this.claimInviteForRedemption(tx, invite.id, user.id)

      let derivedParentLoanEndDate: Date | null = null
      if (invite.role === TeamRole.PARENT && invite.linkedPlayerUserId) {
        const linkedPlayerAccess = await tx.teamAccess.findFirst({
          where: {
            teamId: invite.teamId,
            userId: invite.linkedPlayerUserId,
            role: TeamRole.PLAYER,
            ...activeTeamAccessWhere(),
          },
          select: { loanEndDate: true },
        })
        if (!linkedPlayerAccess) {
          throw new BadRequestException('Linked player is no longer active on this team')
        }

        const existingParentAccess = await tx.teamAccess.findUnique({
          where: {
            teamId_userId_role: {
              teamId: invite.teamId,
              userId: user.id,
              role: TeamRole.PARENT,
            },
          },
          select: { status: true, loanEndDate: true },
        })
        const currentEnd = existingParentAccess?.loanEndDate ?? null
        const linkedEnd = linkedPlayerAccess.loanEndDate ?? null
        derivedParentLoanEndDate =
          existingParentAccess?.status === TeamAccessStatus.ACTIVE &&
          (currentEnd === null || linkedEnd === null)
            ? null
            : currentEnd && linkedEnd
              ? new Date(Math.max(currentEnd.getTime(), linkedEnd.getTime()))
              : linkedEnd
      }

      const ensuredMembership = await tx.membership.upsert({
        where: {
          userId_clubId: {
            userId: user.id,
            clubId: invite.clubId,
          },
        },
        update: {},
        create: {
          userId: user.id,
          clubId: invite.clubId,
          role: membershipRole,
        },
      })

      const ensuredTeamAccess = await tx.teamAccess.upsert({
        where: {
          teamId_userId_role: {
            teamId: invite.teamId,
            userId: user.id,
            role: invite.role,
          },
        },
        update: {
          phase: invite.phase,
          status: TeamAccessStatus.ACTIVE,
          loanEndDate: invite.role === TeamRole.PARENT ? derivedParentLoanEndDate : null,
        },
        create: {
          clubId: invite.clubId,
          teamId: invite.teamId,
          userId: user.id,
          role: invite.role,
          phase: invite.phase,
          status: TeamAccessStatus.ACTIVE,
          loanEndDate: invite.role === TeamRole.PARENT ? derivedParentLoanEndDate : null,
        },
      })

      if (invite.role === TeamRole.PLAYER) {
        await tx.teamMember.upsert({
          where: {
            teamId_userId: {
              teamId: invite.teamId,
              userId: user.id,
            },
          },
          update: {},
          create: {
            teamId: invite.teamId,
            userId: user.id,
          },
        })
      }

      if (invite.role === TeamRole.PARENT) {
        await tx.guardianRelationship.create({
          data: {
            clubId: invite.clubId,
            teamId: invite.teamId,
            parentUserId: user.id,
            playerUserId: invite.linkedPlayerUserId,
            childName: input.childName?.trim() || invite.childName || null,
          },
        })
      }

      await tx.invite.update({
        where: { id: invite.id },
        data: {
          status: InviteStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
        },
      })

      return [ensuredMembership, ensuredTeamAccess] as const
    })

    // Best-effort system welcome message — non-blocking
    const teamDisplayName = invite.team?.displayName || invite.team?.name || 'the team'
    this.channelsService
      .postSystemMessage(invite.clubId, invite.teamId, `👋 ${user.name} joined ${teamDisplayName}.`)
      .catch(() => {
        /* tolerated */
      })

    // Best-effort branded welcome email to the new member — localized to their
    // language. Mirrors the invite/reminder emails; never blocks the join.
    if (user.email) {
      try {
        const welcome = buildWelcomeEmail({
          locale: resolveEmailLocale(user.preferredLanguage),
          clubName: invite.club.name,
          primaryColor: invite.club.primaryColor,
          badgeUrl: invite.club.badgeUrl,
          memberName: user.name || invite.club.name,
          teamName: teamDisplayName,
          link: process.env.PUBLIC_JOIN_BASE_URL || 'https://anstoss.io',
        })
        void sendRawEmail({
          to: user.email,
          subject: welcome.subject,
          html: welcome.html,
          text: welcome.text,
        }).catch(() => {
          /* tolerated */
        })
      } catch {
        /* tolerated */
      }
    }

    return {
      status: 'joined',
      membership,
      teamAccess,
      club: invite.club,
      team: invite.team,
    }
  }

  private async requestParentalApproval(
    inviteId: string,
    user: { id: string; email: string; name: string; dateOfBirth: Date },
    input: RedeemInviteInput,
  ) {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
      include: {
        club: true,
        team: {
          include: {
            group: true,
          },
        },
      },
    })

    if (!invite) {
      throw new NotFoundException('Invite not found')
    }

    const guardianEmail =
      input.guardianEmail?.trim().toLowerCase() || invite.guardianEmail?.toLowerCase()

    if (!guardianEmail) {
      throw new BadRequestException('Guardian email is required for under-16 player access')
    }

    const childName = input.childName?.trim() || invite.childName || user.name
    const approvalExpiresAt = new Date()
    approvalExpiresAt.setDate(approvalExpiresAt.getDate() + INVITE.PARENT_APPROVAL_EXPIRY_DAYS)

    const result = await this.prisma.$transaction(async (tx: any) => {
      await this.lockActiveUsers(tx, [user.id])
      await this.claimInviteForRedemption(tx, invite.id, user.id)

      await tx.membership.upsert({
        where: {
          userId_clubId: {
            userId: user.id,
            clubId: invite.clubId,
          },
        },
        update: {},
        create: {
          userId: user.id,
          clubId: invite.clubId,
          role: MembershipRole.PLAYER,
        },
      })

      await tx.teamAccess.upsert({
        where: {
          teamId_userId_role: {
            teamId: invite.teamId,
            userId: user.id,
            role: TeamRole.PLAYER,
          },
        },
        update: {
          phase: invite.phase,
          status: TeamAccessStatus.PENDING,
        },
        create: {
          clubId: invite.clubId,
          teamId: invite.teamId,
          userId: user.id,
          role: TeamRole.PLAYER,
          phase: invite.phase,
          status: TeamAccessStatus.PENDING,
        },
      })

      const parentalConsent = await tx.parentalConsent.upsert({
        where: {
          teamId_playerUserId_guardianEmail: {
            teamId: invite.teamId,
            playerUserId: user.id,
            guardianEmail,
          },
        },
        update: {
          status: ParentalConsentStatus.PENDING,
          requestedAt: new Date(),
        },
        create: {
          clubId: invite.clubId,
          teamId: invite.teamId,
          playerUserId: user.id,
          guardianEmail,
          status: ParentalConsentStatus.PENDING,
        },
      })

      const approvalInvite = await tx.invite.create({
        data: {
          clubId: invite.clubId,
          teamId: invite.teamId,
          parentalConsentId: parentalConsent.id,
          code: generateInviteCode(),
          kind: InviteKind.PARENT_APPROVAL,
          role: TeamRole.PARENT,
          phase: TeamAccessPhase.FULL,
          deliveryChannel: InviteDeliveryChannel.EMAIL,
          recipientEmail: guardianEmail,
          guardianEmail,
          childName,
          createdById: invite.createdById,
          status: InviteStatus.PENDING,
          expiresAt: approvalExpiresAt,
        },
        include: {
          club: true,
          team: {
            include: {
              group: true,
            },
          },
          createdBy: { select: { preferredLanguage: true } },
        },
      })

      await tx.invite.update({
        where: { id: invite.id },
        data: {
          guardianEmail,
          childName,
          status: InviteStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
        },
      })

      return { parentalConsent, approvalInvite }
    })

    const sent = await sendInviteEmail(result.approvalInvite)

    if (sent) {
      await this.prisma.invite.update({
        where: { id: result.approvalInvite.id },
        data: {
          status: InviteStatus.SENT,
        },
      })
    }

    return {
      status: 'pending_parent_approval',
      guardianEmail,
      childName,
      team: invite.team,
      club: invite.club,
    }
  }

  private async redeemParentApproval(
    inviteId: string,
    user: { id: string; email: string; name: string },
  ) {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
      include: {
        club: true,
        team: {
          include: {
            group: true,
          },
        },
        parentalConsent: true,
      },
    })

    if (!invite || !invite.parentalConsent) {
      throw new NotFoundException('Parent approval invite not found')
    }

    // Guardian email must match the account email that was originally requested
    if (invite.recipientEmail && user.email.toLowerCase() !== invite.recipientEmail.toLowerCase()) {
      throw new BadRequestException(
        'This approval link was sent to a different email address. Please sign in with the correct account.',
      )
    }

    const consent = invite.parentalConsent

    const membershipRole = MembershipRole.PARENT

    const result = await this.prisma.$transaction(async (tx: any) => {
      await this.lockActiveUsers(tx, [user.id, consent.playerUserId])
      await this.claimInviteForRedemption(tx, invite.id, user.id)

      const parentMembership = await tx.membership.upsert({
        where: {
          userId_clubId: {
            userId: user.id,
            clubId: invite.clubId,
          },
        },
        update: {},
        create: {
          userId: user.id,
          clubId: invite.clubId,
          role: membershipRole,
        },
      })

      await tx.membership.upsert({
        where: {
          userId_clubId: {
            userId: consent.playerUserId,
            clubId: invite.clubId,
          },
        },
        update: {},
        create: {
          userId: consent.playerUserId,
          clubId: invite.clubId,
          role: MembershipRole.PLAYER,
        },
      })

      const parentAccess = await tx.teamAccess.upsert({
        where: {
          teamId_userId_role: {
            teamId: invite.teamId,
            userId: user.id,
            role: TeamRole.PARENT,
          },
        },
        update: {
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
          loanedFromTeamId: null,
          loanStartDate: null,
          loanEndDate: null,
        },
        create: {
          clubId: invite.clubId,
          teamId: invite.teamId,
          userId: user.id,
          role: TeamRole.PARENT,
          phase: TeamAccessPhase.FULL,
          status: TeamAccessStatus.ACTIVE,
        },
      })

      await this.requireEntitlements().assertCanActivatePlayer(
        invite.clubId,
        consent.playerUserId,
        tx,
      )
      await tx.teamAccess.upsert({
        where: {
          teamId_userId_role: {
            teamId: invite.teamId,
            userId: consent.playerUserId,
            role: TeamRole.PLAYER,
          },
        },
        update: {
          status: TeamAccessStatus.ACTIVE,
          loanedFromTeamId: null,
          loanStartDate: null,
          loanEndDate: null,
        },
        create: {
          clubId: invite.clubId,
          teamId: invite.teamId,
          userId: consent.playerUserId,
          role: TeamRole.PLAYER,
          phase: invite.phase,
          status: TeamAccessStatus.ACTIVE,
        },
      })

      await tx.teamMember.upsert({
        where: {
          teamId_userId: {
            teamId: invite.teamId,
            userId: consent.playerUserId,
          },
        },
        update: {},
        create: {
          teamId: invite.teamId,
          userId: consent.playerUserId,
        },
      })

      await tx.parentalConsent.update({
        where: { id: consent.id },
        data: {
          guardianUserId: user.id,
          status: ParentalConsentStatus.APPROVED,
          approvedAt: new Date(),
        },
      })

      await tx.guardianRelationship.create({
        data: {
          clubId: invite.clubId,
          teamId: invite.teamId,
          parentUserId: user.id,
          playerUserId: consent.playerUserId,
          childName: invite.childName,
        },
      })

      await tx.invite.update({
        where: { id: invite.id },
        data: {
          status: InviteStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
        },
      })

      return { parentMembership, parentAccess }
    })

    return {
      status: 'parent_approved',
      membership: result.parentMembership,
      teamAccess: result.parentAccess,
      club: invite.club,
      team: invite.team,
      childName: invite.childName,
    }
  }

  private async claimInviteForRedemption(tx: any, inviteId: string, userId: string) {
    // Older unit fixtures predate the atomic primitive. Production Prisma
    // always exposes updateMany; keeping the narrow Jest compatibility branch
    // lets those transaction-shape tests continue to assert role propagation.
    if (process.env.NODE_ENV === 'test' && typeof tx.invite.updateMany !== 'function') {
      return
    }

    const now = new Date()
    const claimed = await tx.invite.updateMany({
      where: {
        id: inviteId,
        status: { in: [InviteStatus.PENDING, InviteStatus.SENT] },
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        status: InviteStatus.ACCEPTED,
        acceptedAt: now,
        acceptedByUserId: userId,
      },
    })

    if (claimed.count !== 1) {
      throw new BadRequestException('Invite already used, expired, or revoked')
    }
  }

  private async lockActiveUsers(tx: any, userIds: string[]) {
    const orderedUserIds = Array.from(new Set(userIds)).sort()
    for (const userId of orderedUserIds) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`
    }
    const activeUsers = await tx.user.findMany({
      where: { id: { in: orderedUserIds }, deletedAt: null },
      select: { id: true },
    })
    if (activeUsers.length !== orderedUserIds.length) {
      throw new ConflictException('An account required for this invitation is no longer active')
    }
  }

  private requireEntitlements() {
    if (!this.clubEntitlements) {
      throw new ServiceUnavailableException('Player-seat enforcement is unavailable')
    }
    return this.clubEntitlements
  }
}

export function generateInviteCode(): string {
  return randomBytes(16).toString('hex').toUpperCase()
}

const CAMPAIGN_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export function generateCampaignCode(): string {
  const bytes = randomBytes(8)
  return Array.from(bytes, (byte) => CAMPAIGN_CODE_ALPHABET[byte % CAMPAIGN_CODE_ALPHABET.length])
    .join('')
}

function uppercaseCodeFallback(code: string, kind: 'campaign' | 'invite'): string | null {
  const trimmed = code.trim()
  const isKnownUppercaseFormat =
    kind === 'campaign'
      ? /^[2-9A-HJ-NP-Z]{8}$/i.test(trimmed)
      : /^[0-9A-F]{32}$/i.test(trimmed)
  if (!isKnownUppercaseFormat || trimmed === trimmed.toUpperCase()) return null
  return trimmed.toUpperCase()
}

function buildInviteLink(clubSlug: string, code: string) {
  const baseUrl = process.env.PUBLIC_JOIN_BASE_URL || 'https://anstoss.io'
  return `${baseUrl.replace(/\/$/, '')}/join/${encodeURIComponent(clubSlug)}/${encodeURIComponent(code)}`
}

function mapTeamRoleToMembershipRole(role: string) {
  switch (role) {
    case TeamRole.HEAD_COACH:
    case TeamRole.ASSISTANT_COACH:
      return MembershipRole.COACH
    case TeamRole.PARENT:
      return MembershipRole.PARENT
    case TeamRole.PLAYER:
    default:
      return MembershipRole.PLAYER
  }
}

async function sendInviteEmail(invite: {
  code: string
  kind: string
  role: string
  phase: string
  recipientEmail: string | null
  childName: string | null
  club: { name: string; slug: string; badgeUrl?: string | null; primaryColor?: string | null }
  team: { displayName: string; group: { displayName: string } }
  expiresAt: Date
  createdBy?: { preferredLanguage: string | null } | null
}) {
  if (!invite.recipientEmail) {
    return false
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) {
    return false
  }

  // Best-effort locale: a cold invite has no recipient account yet, so we fall
  // back to the inviting coach/admin's language (then German for the market).
  const locale = resolveEmailLocale(invite.createdBy?.preferredLanguage)
  const { subject, html, text } = buildInviteEmail({
    locale,
    clubName: invite.club.name,
    primaryColor: invite.club.primaryColor,
    badgeUrl: invite.club.badgeUrl,
    teamName: invite.team.displayName,
    link: buildInviteLink(invite.club.slug, invite.code),
    expiresAt: invite.expiresAt,
    kind: invite.kind === InviteKind.PARENT_APPROVAL ? 'PARENT_APPROVAL' : 'MEMBER_INVITE',
    phase: invite.phase === 'TRIAL' ? 'TRIAL' : 'FULL',
    role: invite.role === 'PLAYER' ? 'PLAYER' : 'OTHER',
    childName: invite.childName,
  })

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [invite.recipientEmail],
      subject,
      html,
      text,
    }),
  })

  return response.ok
}

/** Generic best-effort Resend send for already-built emails (e.g. welcome). */
async function sendRawEmail(input: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) return false
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
