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

export enum TeamGroupType {
  SENIOR = 'SENIOR',
  YOUTH = 'YOUTH',
  MINI = 'MINI',
  CUSTOM = 'CUSTOM',
}

export enum TeamRole {
  HEAD_COACH = 'HEAD_COACH',
  ASSISTANT_COACH = 'ASSISTANT_COACH',
  PLAYER = 'PLAYER',
  PARENT = 'PARENT',
}

export enum TeamAccessPhase {
  FULL = 'FULL',
  TRIAL = 'TRIAL',
}

export enum TeamAccessStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  REVOKED = 'REVOKED',
}

export enum InviteKind {
  MEMBER_INVITE = 'MEMBER_INVITE',
  PARENT_APPROVAL = 'PARENT_APPROVAL',
}

export enum InviteDeliveryChannel {
  EMAIL = 'EMAIL',
  LINK = 'LINK',
}

export enum InviteStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

export enum ParentalConsentStatus {
  REQUIRED = 'REQUIRED',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum JoinRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

export const ROLE_HIERARCHY: Record<MembershipRole, number> = {
  [MembershipRole.OWNER]: 50,
  [MembershipRole.ADMIN]: 40,
  [MembershipRole.COACH]: 30,
  [MembershipRole.PLAYER]: 20,
  [MembershipRole.PARENT]: 10,
}

export const TEAM_ROLE_HIERARCHY: Record<TeamRole, number> = {
  [TeamRole.HEAD_COACH]: 40,
  [TeamRole.ASSISTANT_COACH]: 30,
  [TeamRole.PLAYER]: 20,
  [TeamRole.PARENT]: 10,
}

export function hasRole(userRole: MembershipRole, requiredRole: MembershipRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

export function hasTeamRole(userRole: TeamRole, requiredRole: TeamRole): boolean {
  return TEAM_ROLE_HIERARCHY[userRole] >= TEAM_ROLE_HIERARCHY[requiredRole]
}
