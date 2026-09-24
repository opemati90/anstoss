import { useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { paths, type TeamGroupResponse, type TeamOption } from './api'
import { useApiQuery } from './query'

const COACH_ROLES = new Set(['HEAD_COACH', 'ASSISTANT_COACH'])

/**
 * Who may use the Wechselbörse in the active club: owners/admins for every
 * team, coaches for the teams they coach. Mirrors the API's trial scope.
 */
export function useWechselAccess() {
  const { activeClub, teamMembers } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const isAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
  const coachedTeamIds = useMemo(
    () =>
      (teamMembers ?? [])
        .filter(
          (access) =>
            access.team.clubId === clubId &&
            COACH_ROLES.has(access.role) &&
            (access.status == null || access.status === 'ACTIVE'),
        )
        .map((access) => access.team.id),
    [teamMembers, clubId],
  )
  return {
    clubId,
    clubName: activeClub?.club.name ?? null,
    isAdmin,
    coachedTeamIds,
    canManage: Boolean(clubId) && (isAdmin || coachedTeamIds.length > 0),
  }
}

/** Teams the caller can post Gesuche for and invite to. */
export function useManagedTeams() {
  const { clubId, isAdmin, coachedTeamIds, canManage } = useWechselAccess()
  const query = useApiQuery<TeamGroupResponse>(canManage && clubId ? paths.teamGroups(clubId) : null)
  const teams = useMemo<TeamOption[]>(() => {
    const all = (query.data ?? []).flatMap((group) =>
      group.teams.map((team) => ({
        id: team.id,
        displayName: team.displayName,
        leagueName: team.leagueName ?? null,
      })),
    )
    return isAdmin ? all : all.filter((team) => coachedTeamIds.includes(team.id))
  }, [query.data, isAdmin, coachedTeamIds])
  return { ...query, teams }
}
