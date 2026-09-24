export type HomeRole = 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT' | 'FREE_AGENT'

export type ResolveHomeRoleInput = {
  clubRole: string | null | undefined
  registrationRole: string | null | undefined
  teamRole?: string | null | undefined
}

export function resolveHomeRole({
  clubRole,
  registrationRole,
  teamRole,
}: ResolveHomeRoleInput): HomeRole {
  if (clubRole === 'OWNER' || clubRole === 'ADMIN') return 'ADMIN'
  if (
    clubRole === 'COACH' ||
    teamRole === 'HEAD_COACH' ||
    teamRole === 'ASSISTANT_COACH'
  ) {
    return 'COACH'
  }
  if (teamRole === 'PLAYER') return 'PLAYER'
  if (clubRole === 'PARENT') return 'PARENT'
  if (clubRole === 'PLAYER') return 'PLAYER'
  if (!clubRole && registrationRole === 'FREE_AGENT') return 'FREE_AGENT'
  return 'PLAYER'
}

/**
 * The role the app is being used as right now: the explicitly chosen role
 * mode when there is one, otherwise the same derivation as resolveHomeRole
 * (club role, then the active team's role, then registration). The tab
 * header (app/(tabs)/_layout.tsx) and the home screen both call this, so the
 * header's "Team · Rolle" pill and the home below it can never disagree.
 */
export function resolveRoleMode({
  activeRoleMode,
  clubRole,
  registrationRole,
  teamRole,
}: ResolveHomeRoleInput & { activeRoleMode: HomeRole | null | undefined }): HomeRole {
  return activeRoleMode ?? resolveHomeRole({ clubRole, registrationRole, teamRole })
}
