import type { MembershipRole } from './roles'

export enum RegistrationRole {
  PLAYER = 'PLAYER',
  PARENT = 'PARENT',
  COACH = 'COACH',
  CLUB_ADMIN = 'CLUB_ADMIN',
  FREE_AGENT = 'FREE_AGENT',
}

export enum ClubOperationalRole {
  SECRETARY = 'SECRETARY',
  TREASURER = 'TREASURER',
  CAPTAIN = 'CAPTAIN',
  TEAM_COORDINATOR = 'TEAM_COORDINATOR',
  BOARD_MEMBER = 'BOARD_MEMBER',
  SUPPORT_STAFF = 'SUPPORT_STAFF',
}

export enum ClubCapability {
  INVITES = 'INVITES',
  BILLING = 'BILLING',
  ROSTER = 'ROSTER',
  EVENTS = 'EVENTS',
  PUBLIC_PROFILE = 'PUBLIC_PROFILE',
  COMMUNICATIONS = 'COMMUNICATIONS',
}

export type ClubPermissionMap = Record<ClubCapability, boolean>

const EMPTY_CAPABILITIES: ClubPermissionMap = {
  [ClubCapability.INVITES]: false,
  [ClubCapability.BILLING]: false,
  [ClubCapability.ROSTER]: false,
  [ClubCapability.EVENTS]: false,
  [ClubCapability.PUBLIC_PROFILE]: false,
  [ClubCapability.COMMUNICATIONS]: false,
}

export const MEMBERSHIP_ROLE_CAPABILITIES: Record<
  MembershipRole,
  ClubCapability[]
> = {
  OWNER: [
    ClubCapability.INVITES,
    ClubCapability.BILLING,
    ClubCapability.ROSTER,
    ClubCapability.EVENTS,
    ClubCapability.PUBLIC_PROFILE,
    ClubCapability.COMMUNICATIONS,
  ],
  ADMIN: [
    ClubCapability.INVITES,
    ClubCapability.ROSTER,
    ClubCapability.EVENTS,
    ClubCapability.PUBLIC_PROFILE,
    ClubCapability.COMMUNICATIONS,
  ],
  COACH: [
    ClubCapability.INVITES,
    ClubCapability.ROSTER,
    ClubCapability.EVENTS,
    ClubCapability.COMMUNICATIONS,
  ],
  PLAYER: [],
  PARENT: [],
}

export const OPERATIONAL_ROLE_CAPABILITIES: Record<
  ClubOperationalRole,
  ClubCapability[]
> = {
  [ClubOperationalRole.SECRETARY]: [
    ClubCapability.INVITES,
    ClubCapability.PUBLIC_PROFILE,
    ClubCapability.COMMUNICATIONS,
  ],
  [ClubOperationalRole.TREASURER]: [ClubCapability.BILLING],
  [ClubOperationalRole.CAPTAIN]: [
    ClubCapability.EVENTS,
    ClubCapability.COMMUNICATIONS,
  ],
  [ClubOperationalRole.TEAM_COORDINATOR]: [
    ClubCapability.INVITES,
    ClubCapability.ROSTER,
    ClubCapability.EVENTS,
    ClubCapability.COMMUNICATIONS,
  ],
  [ClubOperationalRole.BOARD_MEMBER]: [
    ClubCapability.PUBLIC_PROFILE,
    ClubCapability.COMMUNICATIONS,
  ],
  [ClubOperationalRole.SUPPORT_STAFF]: [
    ClubCapability.ROSTER,
    ClubCapability.EVENTS,
  ],
}

export type RolePlaybook = {
  summary: string
  onboarding: string[]
  offboarding: string[]
}

export const OPERATIONAL_ROLE_PLAYBOOKS: Record<
  ClubOperationalRole,
  RolePlaybook
> = {
  [ClubOperationalRole.SECRETARY]: {
    summary: 'Coordinates club administration, member communication, and join flows.',
    onboarding: [
      'Confirm the club mailbox and standard reply templates.',
      'Review invite, join-request, and public profile responsibilities.',
      'Check who owns matchday and member communication coverage.',
    ],
    offboarding: [
      'Transfer the club mailbox and public profile ownership.',
      'Reassign open join requests and pending invites.',
      'Clear any saved club communication credentials.',
    ],
  },
  [ClubOperationalRole.TREASURER]: {
    summary: 'Owns dues, billing follow-up, and finance operations.',
    onboarding: [
      'Verify payout account, billing contact email, and dues cadence.',
      'Review failed-payment and reminder workflows.',
      'Confirm who can approve billing changes at club level.',
    ],
    offboarding: [
      'Reassign billing ownership before access is removed.',
      'Rotate any finance-facing credentials and exports.',
      'Confirm overdue follow-up ownership is handed over.',
    ],
  },
  [ClubOperationalRole.CAPTAIN]: {
    summary: 'Supports squad communication and event readiness on the player side.',
    onboarding: [
      'Review team communication standards and attendance expectations.',
      'Confirm who posts matchday reminders and trial follow-ups.',
      'Align with coaching staff on escalation boundaries.',
    ],
    offboarding: [
      'Hand over matchday communication duties.',
      'Remove any squad-only shortcuts or saved announcements.',
      'Confirm captaincy replacement with the coaching staff.',
    ],
  },
  [ClubOperationalRole.TEAM_COORDINATOR]: {
    summary: 'Keeps rosters, events, and logistics aligned across squads.',
    onboarding: [
      'Review roster ownership, event templates, and fixture imports.',
      'Confirm who can invite trials and update team logistics.',
      'Check notification defaults for staff and families.',
    ],
    offboarding: [
      'Reassign active logistics and event ownership.',
      'Confirm roster changes are handed over before demotion.',
      'Remove access to any shared logistics documents.',
    ],
  },
  [ClubOperationalRole.BOARD_MEMBER]: {
    summary: 'Represents club leadership without day-to-day operator access by default.',
    onboarding: [
      'Review public profile, communications, and approval boundaries.',
      'Confirm which club admins own daily operations.',
      'Check escalation routes for billing or disciplinary topics.',
    ],
    offboarding: [
      'Remove access to leadership-only communication surfaces.',
      'Confirm board-level approvals are reassigned.',
      'Archive any related club governance notes outside the app.',
    ],
  },
  [ClubOperationalRole.SUPPORT_STAFF]: {
    summary: 'Helps with operational support without broad admin power.',
    onboarding: [
      'Review the exact tasks this support role owns.',
      'Confirm who approves roster or event changes.',
      'Check the notification channels required for matchday support.',
    ],
    offboarding: [
      'Remove support access from active team operations.',
      'Confirm replacement coverage for matchday support tasks.',
      'Delete or rotate any shared support credentials.',
    ],
  },
}

export const CRITICAL_OPERATIONAL_ROLES = new Set<ClubOperationalRole>([
  ClubOperationalRole.SECRETARY,
  ClubOperationalRole.TREASURER,
])

export function buildClubPermissionMap(input: {
  membershipRole: MembershipRole
  operationalRoles?: ClubOperationalRole[]
}): ClubPermissionMap {
  const result: ClubPermissionMap = { ...EMPTY_CAPABILITIES }

  MEMBERSHIP_ROLE_CAPABILITIES[input.membershipRole].forEach((capability) => {
    result[capability] = true
  })

  ;(input.operationalRoles || []).forEach((role) => {
    OPERATIONAL_ROLE_CAPABILITIES[role].forEach((capability) => {
      result[capability] = true
    })
  })

  return result
}
