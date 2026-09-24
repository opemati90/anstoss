import type {
  InjuryAvailabilityStatus,
  TeamDutyKind,
  TeamMemberAbsence,
  TeamMemberOperationalStatus,
} from '@anstoss/shared'
import { api } from '../../api/client'

/**
 * Thin wrappers over the real team endpoints the Kader surfaces call.
 * Authorization is enforced server-side; these only shape the requests.
 */

export type RosterPatch = {
  position?: string | null
  jerseyNumber?: number | null
  operationalStatus?: TeamMemberOperationalStatus
  absence?: TeamMemberAbsence
  absenceUntil?: string | null
}

export function patchRosterMember(
  clubId: string,
  teamId: string,
  userId: string,
  patch: RosterPatch,
) {
  return api(`/clubs/${clubId}/teams/${teamId}/roster/${userId}`, {
    method: 'PATCH',
    body: patch,
  })
}

export type InjuryInput = {
  userId: string
  title: string
  status: InjuryAvailabilityStatus
  expectedReturnAt?: string
}

export function reportInjury(clubId: string, teamId: string, input: InjuryInput) {
  return api(`/clubs/${clubId}/teams/${teamId}/injuries`, {
    method: 'POST',
    body: input,
  })
}

export function clearInjury(clubId: string, teamId: string, injuryId: string) {
  return api(`/clubs/${clubId}/teams/${teamId}/injuries/${injuryId}`, {
    method: 'PATCH',
    body: { cleared: true },
  })
}

export function decideTeamAccess(clubId: string, teamAccessId: string, decision: 'ACCEPT' | 'REJECT') {
  return api(`/clubs/${clubId}/team-access/${teamAccessId}/decision`, {
    method: 'POST',
    body: { decision },
  })
}

export function rotateDuty(clubId: string, teamId: string, kind: TeamDutyKind, dueDate?: string) {
  return api(`/clubs/${clubId}/teams/${teamId}/duties/rotate`, {
    method: 'POST',
    body: dueDate ? { kind, dueDate } : { kind },
  })
}

export function updateDuty(
  clubId: string,
  teamId: string,
  dutyId: string,
  status: 'COMPLETED' | 'SKIPPED',
) {
  return api(`/clubs/${clubId}/teams/${teamId}/duties/${dutyId}`, {
    method: 'PATCH',
    body: { status },
  })
}
