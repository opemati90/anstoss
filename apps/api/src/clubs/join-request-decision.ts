import type { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'

/**
 * Onboarding review fix (M2): what the club decided on the caller's most
 * recent join request, so the waiting screen can say "no" clearly (with the
 * club's reason when it gave one) instead of silently dropping the user on
 * Verein finden. Only decisions from the last 30 days are reported.
 */
export type JoinRequestDecision = {
  id: string
  clubId: string
  status: 'APPROVED' | 'REJECTED'
  reason: string | null
  decidedAt: string | null
  club: { id: string; name: string; badgeUrl: string | null; primaryColor: string | null } | null
}

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000

type Db = Pick<PrismaService, 'joinRequest' | 'auditLog'>

export async function findLatestJoinDecision(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<JoinRequestDecision | null> {
  // Requests are unique per (club, user) and re-used on a new request, so the
  // latest row by creation time is the one the user last sent.
  const latest = await tenantContext.exit(() =>
    db.joinRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        clubId: true,
        status: true,
        reviewedAt: true,
        club: { select: { id: true, name: true, badgeUrl: true, primaryColor: true } },
      },
    }),
  )
  if (!latest) return null
  if (latest.status !== 'APPROVED' && latest.status !== 'REJECTED') return null
  if (!latest.reviewedAt || now.getTime() - latest.reviewedAt.getTime() > WINDOW_MS) return null

  let reason: string | null = null
  if (latest.status === 'REJECTED') {
    const log = await tenantContext.run({ clubId: latest.clubId, userId: 'system:join-decision' }, () =>
      db.auditLog.findFirst({
        where: {
          clubId: latest.clubId,
          type: 'join_request.rejected',
          metadata: { path: ['requestId'], equals: latest.id },
        },
        orderBy: { createdAt: 'desc' },
        select: { metadata: true },
      }),
    )
    const raw = (log?.metadata as { reason?: unknown } | null)?.reason
    reason = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 500) : null
  }

  return {
    id: latest.id,
    clubId: latest.clubId,
    status: latest.status,
    reason,
    decidedAt: latest.reviewedAt.toISOString(),
    club: latest.club ?? null,
  }
}
