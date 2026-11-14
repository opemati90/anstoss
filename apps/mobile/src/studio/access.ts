/**
 * Who may use Matchday Studio (REVAMP_HANDOFF "Matchday Studio" → Who):
 * Vorstand, Teammanager (TEAM_COORDINATOR until the per-team role lands),
 * Kapitän and the Medienwart (MEDIA_MANAGER). Navigation entry points do not
 * grant permission; coaches need one of the explicitly permitted offices.
 */
type MembershipLike =
  { role?: string | null; operationalRoles?: readonly string[] | null } | null | undefined
type TeamAccessLike = { role?: string | null } | null | undefined

const BOARD_ROLES = new Set(['OWNER', 'ADMIN'])
const STUDIO_OFFICES = new Set(['BOARD_MEMBER', 'TEAM_COORDINATOR', 'CAPTAIN', 'MEDIA_MANAGER'])
const STUDIO_TEAM_ROLES = new Set(['CAPTAIN', 'TEAM_MANAGER'])
/** Vorstand, Kassenwart and Medienwart buy credit packs. */
const BUYER_OFFICES = new Set(['BOARD_MEMBER', 'TREASURER', 'MEDIA_MANAGER'])

export function canUseStudio(membership: MembershipLike, teamAccess?: TeamAccessLike): boolean {
  if (!membership) return false
  if (membership.role && BOARD_ROLES.has(membership.role)) return true
  if ((membership.operationalRoles ?? []).some((office) => STUDIO_OFFICES.has(office))) return true
  return Boolean(teamAccess?.role && STUDIO_TEAM_ROLES.has(teamAccess.role))
}

export function canBuyStudioCredits(membership: MembershipLike): boolean {
  if (!membership) return false
  if (membership.role && BOARD_ROLES.has(membership.role)) return true
  return (membership.operationalRoles ?? []).some((office) => BUYER_OFFICES.has(office))
}

/** Club-wide identity changes are not delegated to a team's captain/manager. */
export function canManageStudioBrandKit(membership: MembershipLike): boolean {
  if (!membership) return false
  if (membership.role && BOARD_ROLES.has(membership.role)) return true
  return (membership.operationalRoles ?? []).some(
    (office) => office === 'BOARD_MEMBER' || office === 'MEDIA_MANAGER',
  )
}
