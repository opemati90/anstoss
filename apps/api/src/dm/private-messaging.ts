/**
 * Safeguarding rule for private (1:1) messages, as a pure function so the
 * send path (DmService.assertPrivateMessagingAllowed) and the contact picker
 * (DmService.listContacts) cannot drift apart.
 *
 * - Both users must have a verified date of birth.
 * - Adult↔adult is allowed.
 * - Under-16s are group-only: they never DM privately, not even another
 *   minor. The single exception is guardian↔own child: the minor's managing
 *   account holder, or a guardian link / approved parental consent in the
 *   club — which the caller resolves (it needs the database).
 */
export type PrivateMessagingUser = {
  id: string
  dateOfBirth: Date | null
  managedById: string | null
}

export type PrivateMessagingDecision =
  | { kind: 'ALLOWED' }
  | { kind: 'AGE_UNVERIFIED' }
  /** Minor↔minor: never allowed (no guardian relationship is possible). */
  | { kind: 'MINOR_BLOCKED' }
  /** Adult↔minor: allowed only if the adult is the minor's linked guardian. */
  | { kind: 'NEEDS_GUARDIAN_LINK'; adultId: string; minorId: string }

export function classifyPrivateMessaging(
  a: PrivateMessagingUser,
  b: PrivateMessagingUser,
  now = new Date(),
): PrivateMessagingDecision {
  if (!a.dateOfBirth || !b.dateOfBirth) return { kind: 'AGE_UNVERIFIED' }
  const aMinor = isUnder16(a.dateOfBirth, now)
  const bMinor = isUnder16(b.dateOfBirth, now)
  if (!aMinor && !bMinor) return { kind: 'ALLOWED' }
  if (aMinor && bMinor) return { kind: 'MINOR_BLOCKED' }
  const minor = aMinor ? a : b
  const adult = aMinor ? b : a
  if (minor.managedById === adult.id) return { kind: 'ALLOWED' }
  return { kind: 'NEEDS_GUARDIAN_LINK', adultId: adult.id, minorId: minor.id }
}

export function isUnder16(dateOfBirth: Date, now = new Date()) {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear()
  const monthDelta = now.getUTCMonth() - dateOfBirth.getUTCMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1
  }
  return age < 16
}
