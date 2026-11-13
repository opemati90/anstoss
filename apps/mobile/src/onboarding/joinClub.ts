import { RegistrationRole } from '@anstoss/shared'
import { api, ApiError } from '../api/client'

/** ADMIN = "Vorstand": a staff-access request for the board role. */
export type JoinRole = 'PLAYER' | 'PARENT' | 'COACH' | 'ADMIN'

/** Board order on "Was machst du bei …?"; the first ticked one is primary. */
export const JOIN_ROLE_ORDER: readonly JoinRole[] = ['PLAYER', 'COACH', 'PARENT', 'ADMIN']

/** Primary role (the request the server handles today) and the rest. */
export function splitJoinRoles(roles: readonly JoinRole[]): {
  primary: JoinRole | null
  additional: JoinRole[]
} {
  const ordered = JOIN_ROLE_ORDER.filter((role) => roles.includes(role))
  return { primary: ordered[0] ?? null, additional: ordered.slice(1) }
}

/** M4: a coach says which role they have in the team. */
export type CoachTeamRole = 'HEAD_COACH' | 'ASSISTANT_COACH'

export type JoinTarget = {
  clubId: string
  teamId?: string | null
  /** Team code typed on Verein finden (players and coaches join through it). */
  joinCode?: string | null
  /** Coaches only; defaults to Co-Trainer. */
  coachRole?: CoachTeamRole
  /** "Ich bin …, Nr. 9": the roster slot claimed while joining (contract only). */
  rosterSlotId?: string | null
  /** The other roles ticked besides the primary one (contract only). */
  additionalRoles?: JoinRole[]
}

const REGISTRATION_ROLE: Record<JoinRole, RegistrationRole | null> = {
  PLAYER: RegistrationRole.PLAYER,
  PARENT: RegistrationRole.PARENT,
  COACH: RegistrationRole.COACH,
  // The board role is granted with the staff request, not self-declared.
  ADMIN: null,
}

/**
 * The only profile write before a club request: the registration role, when
 * it differs. The date of birth was given on "Wie heißt du?" (every account
 * has one, so there is no "I am 16+" declaration any more), and the server
 * allows the role to change while the account has no club and no pending
 * claim.
 */
export function buildJoinProfilePatch(
  role: JoinRole,
  currentRegistrationRole: string | null | undefined,
): { registrationRole?: RegistrationRole } {
  const next = REGISTRATION_ROLE[role]
  return !next || currentRegistrationRole === next ? {} : { registrationRole: next }
}

/** The one server call that turns a choice on Verein finden into a request. */
export async function sendJoinRequest(role: JoinRole, target: JoinTarget): Promise<void> {
  const coachRole: CoachTeamRole = target.coachRole ?? 'ASSISTANT_COACH'
  // Contract keys (BACKEND_GAPS): servers without them strip them quietly.
  const extras = {
    ...(target.rosterSlotId ? { rosterSlotId: target.rosterSlotId } : {}),
    ...(target.additionalRoles && target.additionalRoles.length > 0
      ? { additionalRoles: target.additionalRoles }
      : {}),
  }
  if (target.joinCode && (role === 'PLAYER' || role === 'COACH')) {
    await api('/onboarding/join-team', {
      method: 'POST',
      body: {
        joinCode: target.joinCode,
        role,
        ...(role === 'COACH' ? { teamRole: coachRole } : {}),
        ...extras,
      },
    })
    return
  }
  const clubPath = `/clubs/${encodeURIComponent(target.clubId)}`
  if (role === 'COACH') {
    if (!target.teamId) throw new Error('team-required')
    await api(`${clubPath}/staff-access-requests`, {
      method: 'POST',
      body: {
        desiredRole: 'COACH',
        requestedTeamIds: [target.teamId],
        teamRoles: [coachRole],
        ...extras,
      },
    })
    return
  }
  if (role === 'ADMIN') {
    await api(`${clubPath}/staff-access-requests`, {
      method: 'POST',
      body: { desiredRole: 'ADMIN', requestedTeamIds: [], teamRoles: [], ...extras },
    })
    return
  }
  await api(`${clubPath}/join-requests`, {
    method: 'POST',
    body: { role, ...(target.teamId ? { teamId: target.teamId } : {}), ...extras },
  })
}

export async function submitJoin(
  role: JoinRole,
  target: JoinTarget,
  currentRegistrationRole: string | null | undefined,
): Promise<void> {
  const patch = buildJoinProfilePatch(role, currentRegistrationRole)
  if (Object.keys(patch).length > 0) {
    await api('/me', { method: 'PATCH', body: patch })
  }
  await sendJoinRequest(role, target)
}

/** i18n key for a failed request, specific where the server tells us why. */
export function joinErrorKey(error: unknown): string {
  if (error instanceof ApiError && error.code === 'ROLE_LOCKED') return 'onboardingFlow.club.roleLocked'
  if (error instanceof ApiError && error.status === 409) return 'onboardingFlow.club.alreadyRequested'
  if (error instanceof ApiError && error.status === 404) return 'onboardingFlow.club.codeNotFound'
  if (error instanceof ApiError && error.status === 429) return 'onboardingFlow.welcome.rateLimited'
  if (error instanceof Error && error.message === 'team-required') return 'onboardingFlow.club.pickTeam'
  if (error instanceof ApiError && error.status !== 0) return 'onboardingFlow.club.requestFailed'
  return 'onboardingFlow.common.networkError'
}
