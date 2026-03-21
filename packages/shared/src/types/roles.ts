/**
 * RBAC roles for club membership.
 *
 * Hierarchy: OWNER > ADMIN > COACH > PLAYER > PARENT
 *
 * OWNER: created the club, full control
 * ADMIN: manages club settings, can promote/demote
 * COACH: creates events, manages team, sends announcements
 * PLAYER: RSVPs, chats, views events
 * PARENT: limited visibility, consent management (Sprint 3)
 */
export enum MembershipRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  COACH = 'COACH',
  PLAYER = 'PLAYER',
  PARENT = 'PARENT',
}

export const ROLE_HIERARCHY: Record<MembershipRole, number> = {
  [MembershipRole.OWNER]: 50,
  [MembershipRole.ADMIN]: 40,
  [MembershipRole.COACH]: 30,
  [MembershipRole.PLAYER]: 20,
  [MembershipRole.PARENT]: 10,
}

export function hasRole(userRole: MembershipRole, requiredRole: MembershipRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}
