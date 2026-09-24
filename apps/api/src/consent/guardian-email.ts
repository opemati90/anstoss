import { BadRequestException } from '@nestjs/common'
import { MembershipRole, TeamAccessStatus } from '@anstoss/shared'
import { tenantContext } from '../prisma/tenant.context'
import type { PrismaService } from '../prisma/prisma.service'
import { isUnderageEmailBlocked } from '../auth/underage-email-tombstone'

type Db = Pick<PrismaService, 'user' | 'membership' | 'teamAccess'> &
  Partial<Pick<PrismaService, 'authIdentityTombstone'>>

/**
 * Privacy (safeguarding review M3): a parental-consent guardian must be a
 * third party. Rejects the player's own email, the email of whoever asked
 * (coach creating the request / inviter), and any club staff email (OWNER,
 * ADMIN or COACH membership, or an active/pending team coach of this club).
 * Used by ConsentService.createConsentRequest and invite redemption.
 */
export async function assertAcceptableGuardianEmail(
  db: Db,
  clubId: string,
  guardianEmail: string,
  ctx: { playerEmail: string | null; requestedByUserId: string | null },
): Promise<void> {
  const email = guardianEmail.trim().toLowerCase()
  if (ctx.playerEmail && ctx.playerEmail.trim().toLowerCase() === email) {
    throw new BadRequestException("The guardian email cannot be the player's own email")
  }
  // Onboarding review fix (B2): nor the address of an under-16 account that
  // was removed in the last 30 days (a child re-registering as its own parent).
  if (await isUnderageEmailBlocked(db, email)) {
    throw new BadRequestException("The guardian email cannot be the player's own email")
  }
  const holders = await db.user.findMany({
    where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    select: { id: true },
  })
  if (holders.length === 0) return
  const holderIds = holders.map((h: { id: string }) => h.id)
  if (ctx.requestedByUserId && holderIds.includes(ctx.requestedByUserId)) {
    throw new BadRequestException('The person asking cannot be the consenting guardian')
  }
  const [staffMembership, coachAccess] = await Promise.all([
    db.membership.findFirst({
      where: {
        clubId,
        userId: { in: holderIds },
        role: { in: [MembershipRole.OWNER, MembershipRole.ADMIN, MembershipRole.COACH] },
      },
      select: { userId: true },
    }),
    tenantContext.run({ clubId, userId: 'system:consent' }, () =>
      db.teamAccess.findFirst({
        where: {
          clubId,
          userId: { in: holderIds },
          role: { in: ['HEAD_COACH', 'ASSISTANT_COACH'] },
          status: { in: [TeamAccessStatus.ACTIVE, TeamAccessStatus.PENDING] },
        },
        select: { userId: true },
      }),
    ),
  ])
  if (staffMembership || coachAccess) {
    throw new BadRequestException(
      'The guardian email belongs to club staff. Ask for the email of a parent or guardian.',
    )
  }
}
