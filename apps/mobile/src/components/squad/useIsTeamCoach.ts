import { useAuth } from '../../context/AuthContext'

/**
 * Kader fix M1: decide "does this user manage the active team?" from what is
 * actually known, never guessed from a club role alone.
 *
 * - A non-manager role mode (player, parent, free agent) always means the
 *   member view, so a club admin browsing as a player sees what players see.
 * - A HEAD_COACH / ASSISTANT_COACH access on the active team → manager.
 * - A club OWNER / ADMIN → manager of every team in the club.
 * - Anything else (a club "COACH" membership without a coach access on this
 *   team, missing data while auth loads) → hide manager actions. The server
 *   still enforces the real permission on every write.
 */
export function resolveIsTeamCoach(input: {
  roleMode: string | null | undefined
  clubRole: string | null | undefined
  teamRole: string | null | undefined
}): boolean {
  const { roleMode, clubRole, teamRole } = input
  if (roleMode && roleMode !== 'COACH' && roleMode !== 'ADMIN') return false
  if (teamRole === 'HEAD_COACH' || teamRole === 'ASSISTANT_COACH') return true
  return clubRole === 'OWNER' || clubRole === 'ADMIN'
}

export function useIsTeamCoach(): boolean {
  const { activeClub, activeTeamAccess, activeRoleMode } = useAuth()
  return resolveIsTeamCoach({
    roleMode: activeRoleMode,
    clubRole: activeClub?.role,
    teamRole: activeTeamAccess?.role,
  })
}
