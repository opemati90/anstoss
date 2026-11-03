import { LAUNCH_FEATURES } from '@anstoss/shared'
import { classifyPrivateMessaging, isUnderAge, isUnder16 } from '../dm/private-messaging'

/**
 * Safeguarding rule for CUSTOM chat groups (chat revamp, finding B1), as a
 * pure function so create / add / remove cannot drift apart:
 *
 * - A group of exactly two people is a private chat in disguise: it must pass
 *   the private-message rule (adult↔adult, or a minor with their own
 *   guardian).
 * - Any larger group containing an under-16 needs, for each minor, either two
 *   adult staff of the group's team (head/assistant coach, Betreuer, club
 *   admin) or one adult staff member plus that minor's linked guardian (a
 *   different person).
 * - An age that cannot be established (no date of birth and no adult
 *   declaration) counts as a minor.
 */
export type GroupSafeguardUser = {
  id: string
  dateOfBirth: Date | null
  managedById: string | null
  adultConfirmedAt?: Date | null
}

export type GroupSafeguardContext = {
  users: GroupSafeguardUser[]
  /** Team staff by role; adulthood is checked here. */
  staffIds: ReadonlySet<string>
  /** `${adultId}:${minorId}` guardian links (GuardianRelationship / approved consent). */
  guardianPairs: ReadonlySet<string>
}

export type GroupSafeguardCode = 'GROUP_MINOR_NEEDS_STAFF' | 'GROUP_PRIVATE_PAIR_NOT_ALLOWED' | 'GROUP_ADULT_LAUNCH_ONLY'

export type GroupSafeguardDecision = { ok: true } | { ok: false; code: GroupSafeguardCode }

export function isKnownAdult(user: GroupSafeguardUser | undefined, now = new Date()): boolean {
  if (!user) return false
  if (!LAUNCH_FEATURES.youthParticipation) return Boolean(user.dateOfBirth && Number.isFinite(user.dateOfBirth.getTime()) && !isUnderAge(user.dateOfBirth, LAUNCH_FEATURES.minimumAccountAge, now))
  if (user.dateOfBirth) return !isUnder16(user.dateOfBirth, now)
  return !!user.adultConfirmedAt
}

export function evaluateGroupSafeguarding(
  memberIds: string[],
  ctx: GroupSafeguardContext,
  now = new Date(),
): GroupSafeguardDecision {
  const ids = Array.from(new Set(memberIds))
  const byId = new Map(ctx.users.map((u) => [u.id, u]))
  if (!LAUNCH_FEATURES.youthParticipation && ids.some((id) => !isKnownAdult(byId.get(id), now))) {
    return { ok: false, code: 'GROUP_ADULT_LAUNCH_ONLY' }
  }
  if (ids.length < 2) return { ok: true }
  const isGuardian = (adultId: string, minorId: string) =>
    isKnownAdult(byId.get(adultId), now) &&
    (ctx.guardianPairs.has(`${adultId}:${minorId}`) || byId.get(minorId)?.managedById === adultId)

  if (ids.length === 2) {
    const a = byId.get(ids[0])
    const b = byId.get(ids[1])
    if (!a || !b) return { ok: false, code: 'GROUP_PRIVATE_PAIR_NOT_ALLOWED' }
    const decision = classifyPrivateMessaging(a, b, now)
    if (decision.kind === 'ALLOWED') return { ok: true }
    if (decision.kind === 'NEEDS_GUARDIAN_LINK' && isGuardian(decision.adultId, decision.minorId)) {
      return { ok: true }
    }
    return { ok: false, code: 'GROUP_PRIVATE_PAIR_NOT_ALLOWED' }
  }

  const minors = ids.filter((id) => !isKnownAdult(byId.get(id), now))
  if (minors.length === 0) return { ok: true }
  const staff = ids.filter((id) => ctx.staffIds.has(id) && isKnownAdult(byId.get(id), now))
  for (const minorId of minors) {
    if (staff.length >= 2) continue
    const staffPlusGuardian = staff.some((staffId) =>
      ids.some((other) => other !== staffId && other !== minorId && isGuardian(other, minorId)),
    )
    if (!staffPlusGuardian) return { ok: false, code: 'GROUP_MINOR_NEEDS_STAFF' }
  }
  return { ok: true }
}
