import type {
  ActingCandidateDto,
  ActingCandidatesResponse,
  ActingSessionDto,
  CurrentActingSessionResponse,
} from '@anstoss/shared'
import { api, ApiError } from '../../api/client'
import { getViewAsState, minutesLeft, setActingSession } from './store'

/**
 * Acting-session API calls. Reads degrade quietly (a server without the
 * endpoint yet simply means "no session" / "no candidates").
 */
export async function loadActingSession(): Promise<ActingSessionDto | null> {
  try {
    const res = await api<CurrentActingSessionResponse>('/me/acting-session')
    const session = res?.session && minutesLeft(res.session.expiresAt) > 0 ? res.session : null
    setActingSession(session)
    return session
  } catch (error) {
    if (error instanceof ApiError) {
      setActingSession(null)
      return null
    }
    throw error
  }
}

export async function fetchActingCandidates(clubId: string): Promise<ActingCandidateDto[]> {
  try {
    const res = await api<ActingCandidatesResponse>(`/clubs/${clubId}/acting-sessions/candidates`)
    return res?.items ?? []
  } catch (error) {
    if (error instanceof ApiError) return []
    throw error
  }
}

export async function startActingSession(
  clubId: string,
  input: { teamId: string; minutes: number; reason?: string },
): Promise<ActingSessionDto> {
  const session = await api<ActingSessionDto>(`/clubs/${clubId}/acting-sessions`, {
    method: 'POST',
    body: input,
  })
  setActingSession(session)
  return session
}

/** Ends the running session; the local state clears even if the server already expired it. */
export async function endActingSession(): Promise<void> {
  const current = getViewAsState().acting
  setActingSession(null)
  if (!current) return
  try {
    await api(`/clubs/${current.clubId}/acting-sessions/current`, { method: 'DELETE' })
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
  }
}
