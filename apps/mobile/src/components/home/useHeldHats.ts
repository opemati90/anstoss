import { useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useViewAs } from '../../features/acting/store'

/** One role a person holds at the same time as others ("hats, not modes"). */
export type Hat = 'PLAYER' | 'CAPTAIN' | 'COACH' | 'BOARD'

/**
 * Every role the signed-in person holds in the active club, in the order the
 * combined home lists them (board 28: "Spieler · Kapitän · Trainer ·
 * Vorstand"). `combined` is true when at least two of player, coach and
 * Vorstand are held and no Vorschau/Vertretung is running: then one home
 * shows each role's section instead of a role switch (REVAMP_HANDOFF.md,
 * "Roles: hats, not modes").
 */
export function useHeldHats(): { hats: Hat[]; combined: boolean } {
  const { activeClub, teamMembers } = useAuth()
  const viewAs = useViewAs()
  return useMemo(() => {
    const held = new Set<Hat>()
    if (activeClub) {
      const clubId = activeClub.club.id
      for (const access of teamMembers ?? []) {
        if (access.team.clubId !== clubId || (access.status != null && access.status !== 'ACTIVE')) continue
        if (access.role === 'PLAYER') held.add('PLAYER')
        if (access.role === 'HEAD_COACH' || access.role === 'ASSISTANT_COACH') held.add('COACH')
      }
      if (activeClub.role === 'COACH') held.add('COACH')
      if (activeClub.role === 'PLAYER') held.add('PLAYER')
      if ((activeClub.operationalRoles ?? []).includes('CAPTAIN')) held.add('CAPTAIN')
      if (activeClub.role === 'OWNER' || activeClub.role === 'ADMIN') held.add('BOARD')
    }
    const order: Hat[] = ['PLAYER', 'CAPTAIN', 'COACH', 'BOARD']
    const hats = order.filter((hat) => held.has(hat))
    const primary = hats.filter((hat) => hat !== 'CAPTAIN').length
    const viewing = Boolean(viewAs.preview || viewAs.acting)
    return { hats, combined: primary >= 2 && !viewing }
  }, [activeClub, teamMembers, viewAs.acting, viewAs.preview])
}
