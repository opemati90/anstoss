import { RegistrationRole } from '@anstoss/shared'
import { api, ApiError } from '../api/client'

export type JoinRole = 'PLAYER' | 'PARENT' | 'COACH'

/** M4: a coach says which role they have in the team. */
export type CoachTeamRole = 'HEAD_COACH' | 'ASSISTANT_COACH'

export type JoinTarget = {
  clubId: string
  teamId?: string | null
  /** Team code typed on Verein finden (players and coaches join through it). */
  joinCode?: string | null
  /** Coaches only; defaults to Co-Trainer. */
  coachRole?: CoachTeamRole
}

const REGISTRATION_ROLE: Record<JoinRole, RegistrationRole> = {
  PLAYER: RegistrationRole.PLAYER,
  PARENT: RegistrationRole.PARENT,
  COACH: RegistrationRole.COACH,
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
  return currentRegistrationRole === REGISTRATION_ROLE[role]
    ? {}
    : { registrationRole: REGISTRATION_ROLE[role] }
}

/** The one server call that turns a choice on Verein finden into a request. */
export async function sendJoinRequest(role: JoinRole, target: JoinTarget): Promise<void> {
  const coachRole: CoachTeamRole = target.coachRole ?? 'ASSISTANT_COACH'
  if (target.joinCode && (role === 'PLAYER' || role === 'COACH')) {
    await api('/onboarding/join-team', {
      method: 'POST',
      body: {
        joinCode: target.joinCode,
        role,
        ...(role === 'COACH' ? { teamRole: coachRole } : {}),
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
      },
    })
    return
  }
  await api(`${clubPath}/join-requests`, {
    method: 'POST',
    body: { role, ...(target.teamId ? { teamId: target.teamId } : {}) },
  })
}

export async function submitJoin(
  role: JoinRole,
  target: JoinTarget,
  currentRegistrationRole: string | null | undefined,
  preserveRegistrationRole = false,
): Promise<void> {
  const patch = preserveRegistrationRole ? {} : buildJoinProfilePatch(role, currentRegistrationRole)
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
