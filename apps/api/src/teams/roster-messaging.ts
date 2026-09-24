import type { RosterMessageBlockReason } from '@anstoss/shared'
import { classifyPrivateMessaging, type PrivateMessagingUser } from '../dm/private-messaging'

/**
 * Kader fix H2: whether the viewer may open a private chat with each roster
 * member, decided with the same rule the DM API enforces
 * (DmService.assertPrivateMessagingAllowed): the pure classifier from
 * dm/private-messaging, the guardian link / approved parental consent for an
 * adult↔minor pair, and blocks in either direction. Batched: at most four
 * queries for the whole roster.
 */
export type RosterMessaging = { canMessage: boolean; reason: RosterMessageBlockReason | null }

type MessagingClient = {
  user: { findMany: (args: any) => Promise<any[]> }
  userBlock: { findMany: (args: any) => Promise<any[]> }
  guardianRelationship: { findMany: (args: any) => Promise<any[]> }
  parentalConsent: { findMany: (args: any) => Promise<any[]> }
}

export async function resolveRosterMessaging(
  prisma: MessagingClient,
  input: { viewerId: string; clubId: string; memberIds: string[]; now?: Date },
): Promise<Map<string, RosterMessaging>> {
  const { viewerId, clubId } = input
  const now = input.now ?? new Date()
  const result = new Map<string, RosterMessaging>()
  result.set(viewerId, { canMessage: false, reason: 'SELF' })
  const others = Array.from(new Set(input.memberIds.filter((id) => id && id !== viewerId)))
  if (others.length === 0) return result

  const [users, blocks] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [viewerId, ...others] }, deletedAt: null },
      select: { id: true, dateOfBirth: true, managedById: true },
    }),
    prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerUserId: viewerId, blockedUserId: { in: others } },
          { blockedUserId: viewerId, blockerUserId: { in: others } },
        ],
      },
      select: { blockerUserId: true, blockedUserId: true },
    }),
  ])
  const userById = new Map<string, PrivateMessagingUser>(
    (users ?? []).map((user: PrivateMessagingUser) => [user.id, user]),
  )
  const blocked = new Set<string>()
  for (const block of blocks ?? []) {
    blocked.add(block.blockerUserId === viewerId ? block.blockedUserId : block.blockerUserId)
  }

  const viewer = userById.get(viewerId)
  // Adult↔minor pairs that need a guardian link: [adultId, minorId].
  const needsLink = new Map<string, { adultId: string; minorId: string }>()
  for (const memberId of others) {
    const member = userById.get(memberId)
    if (!viewer || !member) {
      result.set(memberId, { canMessage: false, reason: 'AGE_UNVERIFIED' })
      continue
    }
    const decision = classifyPrivateMessaging(viewer, member, now)
    if (decision.kind === 'NEEDS_GUARDIAN_LINK') {
      needsLink.set(memberId, { adultId: decision.adultId, minorId: decision.minorId })
      continue
    }
    result.set(
      memberId,
      decision.kind === 'ALLOWED'
        ? { canMessage: true, reason: null }
        : { canMessage: false, reason: decision.kind },
    )
  }

  if (needsLink.size > 0) {
    const pairs = Array.from(needsLink.values())
    const [links, consents] = await Promise.all([
      prisma.guardianRelationship.findMany({
        where: {
          clubId,
          OR: pairs.map((pair) => ({ parentUserId: pair.adultId, playerUserId: pair.minorId })),
        },
        select: { parentUserId: true, playerUserId: true },
      }),
      prisma.parentalConsent.findMany({
        where: {
          clubId,
          status: 'APPROVED',
          OR: pairs.map((pair) => ({ guardianUserId: pair.adultId, playerUserId: pair.minorId })),
        },
        select: { guardianUserId: true, playerUserId: true },
      }),
    ])
    const linked = new Set<string>([
      ...(links ?? []).map((row: any) => `${row.parentUserId}:${row.playerUserId}`),
      ...(consents ?? []).map((row: any) => `${row.guardianUserId}:${row.playerUserId}`),
    ])
    for (const [memberId, pair] of needsLink) {
      result.set(
        memberId,
        linked.has(`${pair.adultId}:${pair.minorId}`)
          ? { canMessage: true, reason: null }
          : { canMessage: false, reason: 'NEEDS_GUARDIAN_LINK' },
      )
    }
  }

  // A block wins over everything else, as in the DM send path.
  for (const memberId of blocked) {
    if (result.get(memberId)?.canMessage) result.set(memberId, { canMessage: false, reason: 'BLOCKED' })
  }
  return result
}
