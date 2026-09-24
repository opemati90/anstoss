import type {
  ClubTrialActionInput,
  CreatePlayerSearchInput,
  CreateTrialInviteInput,
  FreeAgentListResponse,
  FreeAgentProfile,
  PlayerSearch,
  PlayerSearchListResponse,
  TrialInvite,
  TrialJoinRequestSummary,
  UpdateJoinRequestWechselInput,
  UpdatePlayerSearchInput,
} from '@anstoss/shared'
import { api } from '../../api/client'

/** API paths used by the Wechselbörse screens (also the query-cache keys). */
export const paths = {
  clubTrials: (clubId: string) => `/clubs/${clubId}/trial-invites`,
  clubSearches: (clubId: string) => `/clubs/${clubId}/player-searches`,
  teamGroups: (clubId: string) => `/clubs/${clubId}/team-groups`,
  teamTrainings: (clubId: string, teamId: string) =>
    `/clubs/${clubId}/events?teamId=${encodeURIComponent(teamId)}&type=TRAINING&limit=20`,
  freeAgents: (query: string) => `/free-agents${query ? `?${query}` : ''}`,
  freeAgent: (id: string) => `/free-agents/${id}`,
  openSearches: (query: string) => `/player-searches${query ? `?${query}` : ''}`,
  myTrials: '/me/trial-invites',
  myProfile: '/me/free-agent-profile',
  trial: (id: string) => `/trial-invites/${id}`,
}

export type TeamOption = {
  id: string
  displayName: string
  leagueName: string | null
}

export type TrainingOption = {
  id: string
  title: string
  date: string
  location?: string | null
  type: string
  cancelledAt?: string | null
}

export type TeamGroupResponse = Array<{
  id: string
  displayName: string
  teams: Array<{ id: string; displayName: string; leagueName?: string | null }>
}>

export function buildQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    search.set(key, String(value))
  }
  return search.toString()
}

export const wechselApi = {
  createSearch: (clubId: string, body: CreatePlayerSearchInput) =>
    api<PlayerSearch>(paths.clubSearches(clubId), { method: 'POST', body }),
  updateSearch: (clubId: string, id: string, body: UpdatePlayerSearchInput) =>
    api<PlayerSearch>(`${paths.clubSearches(clubId)}/${id}`, { method: 'PATCH', body }),
  createInvite: (clubId: string, body: CreateTrialInviteInput) =>
    api<TrialInvite>(paths.clubTrials(clubId), { method: 'POST', body }),
  clubAction: (clubId: string, inviteId: string, body: ClubTrialActionInput) =>
    api<TrialInvite>(`${paths.clubTrials(clubId)}/${inviteId}`, { method: 'PATCH', body }),
  playerAction: (
    inviteId: string,
    status: 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'ACCEPT_OFFER',
  ) => api<TrialInvite>(paths.trial(inviteId), { method: 'PATCH', body: { status } }),
  requestTrial: (searchId: string, message?: string) =>
    api<TrialInvite>(`/player-searches/${searchId}/trial-requests`, {
      method: 'POST',
      body: message ? { message } : {},
    }),
  updateWechsel: (clubId: string, joinRequestId: string, body: UpdateJoinRequestWechselInput) =>
    api<TrialJoinRequestSummary>(`/clubs/${clubId}/join-requests/${joinRequestId}/wechsel`, {
      method: 'PATCH',
      body,
    }),
  submitAufnahmeantrag: (clubId: string, body: Record<string, unknown>) =>
    api<{ id: string }>(`/clubs/${clubId}/join-requests`, { method: 'POST', body }),
  saveProfile: (exists: boolean, body: Record<string, unknown>) =>
    api<FreeAgentProfile>(paths.myProfile, { method: exists ? 'PATCH' : 'POST', body }),
  deleteProfile: () => api<{ success: boolean }>(paths.myProfile, { method: 'DELETE' }),
}

export type { FreeAgentListResponse, PlayerSearchListResponse }
