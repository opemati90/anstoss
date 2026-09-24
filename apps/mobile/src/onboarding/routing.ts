/**
 * Where a signed-in user belongs right now. Pure so it can be unit tested and
 * shared by index.tsx and screens that finish a step.
 */
export type RoutingUser = {
  email?: string | null
  name?: string | null
  registrationRole?: string | null
  dateOfBirth?: string | null
  /** Legacy 16+ declaration; new accounts give a date of birth instead. */
  adultConfirmedAt?: string | null
}

export type RoutingSnapshot = {
  user: RoutingUser | null
  memberships: readonly unknown[]
  ageGate: { status: string } | null
  pendingJoinRequest: unknown | null
  pendingClubClaim: unknown | null
  /** Invite code saved before sign-in (deep link opened while signed out). */
  pendingInviteCode?: string | null
  /** Whitelisted local draft step (only club setup), see resume.ts. */
  resumeTarget?: string | null
  /** Intent picked before sign-in (welcome: free agent, or a parent's setup code). */
  intent?: 'free-agent' | 'parent-handoff' | null
}

/**
 * The account was created from the email address alone: the server names new
 * users after the part before the "@". Until they choose a name we ask for it
 * once. (A returning user who picked exactly that name is asked again, with
 * the field pre-filled: one tap.)
 */
export function needsDisplayName(user: RoutingUser | null | undefined): boolean {
  if (!user) return false
  const name = (user.name ?? '').trim()
  if (name.length < 2) return true
  const localPart = (user.email ?? '').split('@')[0]?.trim().toLowerCase()
  return !!localPart && name.toLowerCase() === localPart
}

/**
 * Every self-registering user gives a date of birth, on the name screen.
 * Only legacy accounts that made the old 16+ declaration are exempt.
 */
export function needsDateOfBirth(user: RoutingUser | null | undefined): boolean {
  if (!user) return false
  return !user.dateOfBirth && !user.adultConfirmedAt
}

/** "Wie heißt du?" (name + date of birth) is still open. */
export function needsProfile(user: RoutingUser | null | undefined): boolean {
  return needsDisplayName(user) || needsDateOfBirth(user)
}

export function resolveSignedInRoute(snapshot: RoutingSnapshot): string {
  const { user, memberships, ageGate } = snapshot

  if (ageGate?.status === 'BLOCKED') return '/access-blocked'
  if (ageGate?.status === 'PENDING_PARENT_APPROVAL') return '/pending-approval'

  // An invite in flight wins, also for members: a player invited to a second
  // team or club lands on the invite instead of silently on home. The join
  // screen clears the stored code once it is redeemed or declined.
  if (snapshot.pendingInviteCode) return `/join/${snapshot.pendingInviteCode}`

  if (memberships.length > 0) {
    // Legacy members from before the DOB step who never gave one.
    if (ageGate?.status === 'DOB_REQUIRED') return '/enter-dob'
    return '/(tabs)'
  }

  // Server-side work in flight wins over everything else: a club admin's
  // claim lands on home, which shows "Dein Verein wird geprüft"; a coach's
  // staff request and a join request wait on the pending screen.
  if (snapshot.pendingClubClaim) {
    return user?.registrationRole === 'CLUB_ADMIN' ? '/(tabs)' : '/(auth)/request-pending'
  }
  // Wechselbörse: free agents live in their own tab bar (Entdecken,
  // Probetrainings, Profil), also while an Aufnahmeantrag is pending.
  if (user?.registrationRole === 'FREE_AGENT') return '/(tabs)'
  if (snapshot.pendingJoinRequest) return '/(auth)/request-pending'

  if (needsProfile(user)) return '/(auth)/name'
  if (snapshot.intent === 'free-agent') return '/(auth)/free-agent-profile'
  if (snapshot.intent === 'parent-handoff') return '/(auth)/parent-handoff'
  if (snapshot.resumeTarget) return snapshot.resumeTarget
  return '/(auth)/club-search'
}
