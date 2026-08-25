import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  clearSessionToken,
  getSessionToken,
  getSessionTokenSync,
  hydrateSessionToken,
  setSessionToken,
  subscribeSessionToken,
} from '../auth/sessionToken'
// This module mints a fresh token ONLY via the proactive refresh path below
// (POST /auth/session/refresh) — otherwise tokens come from useOnboardingAuth
// (OTP verify). It does not set tokens on any other path.
import {
  api,
  setTokenGetter,
  setSignOutHandler,
  setAuthExpiryHandlingSuspended,
  API_URL,
} from '../api/client'
import { prefetchTeamData, clearMemoryCache } from '../utils/cache'
import { unregisterPushToken } from '../hooks/usePushNotifications'
import {
  clearE2ESession,
  getE2ESession,
  hydrateStoredE2ESession,
  isE2ESupported,
  subscribeToE2ESession,
  type E2ESessionSnapshot,
} from '../e2e/session'
import { ONBOARDING_FLOW_STORAGE_KEY } from './OnboardingFlowContext'

const TEAM_PREF_PREFIX = 'anstoss:team-pref:'
const ROLE_MODE_PREF_PREFIX = 'anstoss:role-mode-pref:'
const ONBOARDING_KEY_PREFIX = 'anstoss:onboarding-complete:'

type User = {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  registrationRole: string
  dateOfBirth: string | null
}

type TeamMember = {
  id: string
  role: string
  phase?: 'FULL' | 'TRIAL'
  status?: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED'
  team: {
    id: string
    name: string
    displayName: string | null
    clubId: string
    ageGroup: string | null
  }
}

type AgeGate = {
  isUnder16: boolean
  status: 'CLEARED' | 'PENDING_PARENT_APPROVAL' | 'BLOCKED' | 'DOB_REQUIRED'
  guardianEmail: string | null
}

type Membership = {
  id: string
  role: string
  operationalRoles: string[]
  permissions?: Record<string, boolean>
  club: {
    id: string
    name: string
    slug: string
    badgeUrl: string | null
    primaryColor: string
  }
}

export type RoleMode = 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT' | 'FREE_AGENT'

type AuthState = {
  user: User | null
  memberships: Membership[]
  teamMembers: TeamMember[]
  activeClub: Membership | null
  activeTeamId: string | null
  activeTeamAccess: TeamMember | null
  teamsForActiveClub: TeamMember[]
  activeRoleMode: RoleMode | null
  availableRoleModes: RoleMode[]
  token: string | null
  ageGate: AgeGate | null
  pendingJoinRequest: { id: string; clubId: string } | null
  pendingClubClaim: { id: string; status: 'SUBMITTED' | 'NEEDS_INFO' } | null
  isLoading: boolean
  isSignedIn: boolean
  needsOnboarding: boolean
  needsRegistration: boolean
  /** Returns the current session JWT (or e2e sentinel). Null when signed out. */
  getToken: () => Promise<string | null>
  signOut: () => Promise<void>
  setActiveClub: (membership: Membership) => void
  setActiveTeam: (teamId: string) => void
  setActiveRoleMode: (mode: RoleMode) => void
  refreshUser: (
    tokenOverride?: string,
    options?: { preferredClubId?: string; throwOnError?: boolean },
  ) => Promise<void>
  /** Prove control of the account email again before a sensitive action. */
  reauthenticate: (code: string) => Promise<void>
  completeOnboarding: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function isActiveTeamMember(teamMember: TeamMember): boolean {
  return teamMember.status == null || teamMember.status === 'ACTIVE'
}

function teamRolePriority(role: string | null | undefined): number {
  if (role === 'HEAD_COACH') return 40
  if (role === 'ASSISTANT_COACH') return 30
  if (role === 'PLAYER') return 20
  if (role === 'PARENT') return 10
  return 0
}

function selectPrimaryTeamAccess(teamMembers: TeamMember[]): TeamMember | null {
  return teamMembers.reduce<TeamMember | null>((best, current) => {
    if (!isActiveTeamMember(current)) return best
    if (!best) return current
    return teamRolePriority(current.role) > teamRolePriority(best.role) ? current : best
  }, null)
}

function selectPrimaryAccessPerTeam(teamMembers: TeamMember[]): TeamMember[] {
  const byTeam = new Map<string, TeamMember>()

  teamMembers.forEach((teamMember) => {
    if (!isActiveTeamMember(teamMember)) return
    const current = byTeam.get(teamMember.team.id)
    if (!current || teamRolePriority(teamMember.role) > teamRolePriority(current.role)) {
      byTeam.set(teamMember.team.id, teamMember)
    }
  })

  return Array.from(byTeam.values())
}

function teamAccessMatchesMode(teamMember: TeamMember, mode: RoleMode | null): boolean {
  if (mode === 'COACH') {
    return teamMember.role === 'HEAD_COACH' || teamMember.role === 'ASSISTANT_COACH'
  }
  if (mode === 'PLAYER') return teamMember.role === 'PLAYER'
  if (mode === 'PARENT') return teamMember.role === 'PARENT'
  return false
}

type RefreshUserOptions = {
  preferredClubId?: string
  throwOnError?: boolean
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Custom email-OTP session token (replaces Clerk). `sessionToken` is the
  // durable JWT minted by POST /auth/otp/verify and persisted in SecureStore.
  // `isSignedIn` is derived from the loaded user, but the token presence drives
  // the load. `tokenHydrated` flips true once the cold-start SecureStore read
  // completes so routing waits for a definitive signed-in/out answer.
  const [sessionToken, setSessionTokenState] = useState<string | null>(() => getSessionTokenSync())
  const [tokenHydrated, setTokenHydrated] = useState(false)
  const isSigningOutRef = useRef(false)

  // Reads the current credential for the api client. Prefers the e2e session
  // token, otherwise returns the stored JWT.
  const getToken = useCallback(async (): Promise<string | null> => {
    if (isSigningOutRef.current) return null
    if (getE2ESession()) return 'e2e-session-token'
    return getSessionToken()
  }, [])

  const [user, setUser] = useState<User | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [activeClub, setActiveClubState] = useState<Membership | null>(null)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [activeRoleMode, setActiveRoleModeState] = useState<RoleMode | null>(null)
  const activeClubRef = useRef<Membership | null>(null)
  const activeTeamIdRef = useRef<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [ageGate, setAgeGate] = useState<AgeGate | null>(null)
  const [pendingJoinRequest, setPendingJoinRequest] = useState<{
    id: string
    clubId: string
  } | null>(null)
  const [pendingClubClaim, setPendingClubClaim] = useState<{
    id: string
    status: 'SUBMITTED' | 'NEEDS_INFO'
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [e2eSession, setE2ESession] = useState<E2ESessionSnapshot | null>(null)
  const [hasHydratedE2E, setHasHydratedE2E] = useState(!isE2ESupported())

  // Tracks whether refreshUser() was called explicitly (e.g. from sign-in flow).
  // When set, the token-driven load effect skips its redundant fetchUser() to
  // avoid a race condition that resets isLoading mid-navigation.
  const manualFetchDoneRef = useRef(false)

  useEffect(() => {
    activeClubRef.current = activeClub
  }, [activeClub])

  useEffect(() => {
    activeTeamIdRef.current = activeTeamId
  }, [activeTeamId])

  const resetLocalAuthState = useCallback(() => {
    clearMemoryCache()
    AsyncStorage.removeItem(ONBOARDING_FLOW_STORAGE_KEY).catch(() => {})
    manualFetchDoneRef.current = false
    setUser(null)
    setMemberships([])
    setTeamMembers([])
    setActiveClubState(null)
    setActiveTeamId(null)
    setToken(null)
    setAgeGate(null)
    setPendingJoinRequest(null)
    setNeedsOnboarding(false)
    setE2ESession(null)
    setIsLoading(false)
  }, [])

  const applyE2ESession = useCallback(
    (session: E2ESessionSnapshot | null) => {
      if (!session) {
        resetLocalAuthState()
        return
      }

      isSigningOutRef.current = false
      setAuthExpiryHandlingSuspended(false)
      setUser({
        id: session.user.id,
        clerkId: session.user.clerkId,
        email: session.user.email,
        name: session.user.name,
        avatarUrl: session.user.avatarUrl,
        registrationRole: session.user.registrationRole,
        dateOfBirth: (session.user as { dateOfBirth?: string | null }).dateOfBirth ?? null,
      })
      setMemberships(session.memberships)
      setTeamMembers(session.teamMembers)
      setAgeGate(session.ageGate)
      setNeedsOnboarding(session.needsOnboarding)
      setToken('e2e-session-token')

      const firstMembership = session.memberships[0] || null
      setActiveClubState(firstMembership)

      if (firstMembership) {
        const firstTeam = selectPrimaryAccessPerTeam(
          session.teamMembers.filter(
            (teamMember) => teamMember.team.clubId === firstMembership.club.id,
          ),
        )[0]
        setActiveTeamId(firstTeam?.team.id || null)
      } else {
        setActiveTeamId(null)
      }
    },
    [resetLocalAuthState],
  )

  useEffect(() => {
    if (!isE2ESupported()) {
      return
    }

    let cancelled = false

    hydrateStoredE2ESession()
      .then((session) => {
        if (!cancelled) {
          setE2ESession(session)
          if (session) {
            applyE2ESession(session)
          }
          setHasHydratedE2E(true)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasHydratedE2E(true)
          setIsLoading(false)
        }
      })

    const unsubscribe = subscribeToE2ESession((session) => {
      setE2ESession(session)
      applyE2ESession(session)
      setHasHydratedE2E(true)
      setIsLoading(false)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [applyE2ESession])

  // Wire the session-token getter into the API client.
  useEffect(() => {
    setTokenGetter(getToken)
  }, [getToken])

  // Cold-start session restore: read the persisted JWT from SecureStore, then
  // keep the local `sessionToken` mirror in sync with any later set/clear
  // (e.g. OTP verify stores a token; sign-out clears it).
  useEffect(() => {
    let cancelled = false
    hydrateSessionToken()
      .then((stored) => {
        if (cancelled) return
        setSessionTokenState(stored)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTokenHydrated(true)
      })

    const unsubscribe = subscribeSessionToken((next) => {
      setSessionTokenState(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const clearAuthSession = useCallback(
    async ({ unregisterPush = false }: { unregisterPush?: boolean } = {}) => {
      // Suspend 401 handling immediately — before any state changes or async
      // work — so background API calls can't trigger the "session expired"
      // alert during the sign-out window.
      isSigningOutRef.current = true
      setAuthExpiryHandlingSuspended(true)

      const tokenToUnregister = token
      const hasE2ESession = !!getE2ESession()

      // Clear local state first so the UI redirects to sign-in instantly.
      resetLocalAuthState()

      // Remote cleanup must not block navigation. Local auth is already gone;
      // finish storage, push-token, and Clerk cleanup in the background.
      const finishRemoteCleanup = async () => {
        if (hasE2ESession) {
          await clearE2ESession().catch(() => {})
        }

        if (!hasE2ESession && unregisterPush && tokenToUnregister) {
          await unregisterPushToken(API_URL, tokenToUnregister).catch(() => {})
        }

        // Drop the persisted JWT so a cold restart lands signed-out.
        await clearSessionToken().catch((error) => {
          if (__DEV__) {
            console.warn('[auth] session-token clear failed after local reset:', error)
          }
        })
      }

      void finishRemoteCleanup()
    },
    [resetLocalAuthState, token],
  )

  // Wire sign-out handler into the API client for global 401 handling
  useEffect(() => {
    setSignOutHandler(() => clearAuthSession())
    return () => setSignOutHandler(null)
  }, [clearAuthSession])

  // Mirror the session JWT into the exposed `token` state (used by push-token
  // registration etc.). The e2e path manages its own sentinel token.
  useEffect(() => {
    if (!hasHydratedE2E) {
      return
    }

    if (e2eSession) {
      return
    }

    if (isSigningOutRef.current) {
      setToken(null)
      return
    }

    setToken(sessionToken)
  }, [sessionToken, e2eSession, hasHydratedE2E])

  const teamsForActiveClub = useMemo(
    () =>
      activeClub
        ? selectPrimaryAccessPerTeam(
            teamMembers.filter((tm) => tm.team.clubId === activeClub.club.id),
          )
        : [],
    [teamMembers, activeClub],
  )

  // True when the user is signed in but hasn't completed the /register onboarding flow.
  // The absence of both memberships AND a recorded dateOfBirth is the strongest "fresh signup" signal:
  // once POST /me/onboarding succeeds, refreshUser() will return a user with DOB set AND at least one
  // membership (for CLUB_ADMIN, PLAYER, COACH, PARENT) or an established free-agent record — either
  // way needsRegistration flips to false on the next render.
  // Legacy users who already have registrationRole set (from the old signup form) will have
  // dateOfBirth set via the legacy /enter-dob flow, so they'll have needsRegistration = false
  // and fall through to the legacy role-specific paths.
  const needsRegistration = useMemo(
    () => !!user && memberships.length === 0 && !user.dateOfBirth,
    [user, memberships],
  )

  // Keep the active team scoped to the active club after club switches.
  // If activeClub becomes null (zero memberships, mid-switch), the previous
  // activeTeamId is meaningless — drop it so downstream consumers don't
  // render stale team data.
  const validatedTeamId = useMemo(() => {
    if (!activeClub) return null
    if (!activeTeamId) return null
    const belongsToClub = teamsForActiveClub.some((tm) => tm.team.id === activeTeamId)
    return belongsToClub ? activeTeamId : null
  }, [activeTeamId, activeClub, teamsForActiveClub])

  useEffect(() => {
    if (activeClub && validatedTeamId === null && teamsForActiveClub.length > 0) {
      setActiveTeamId(teamsForActiveClub[0].team.id)
    }
  }, [validatedTeamId, activeClub, teamsForActiveClub])

  const activeTeamAccess = useMemo(() => {
    if (!validatedTeamId) return null
    const activeAccess = teamMembers.filter(
      (tm) => tm.team.id === validatedTeamId && isActiveTeamMember(tm),
    )
    return (
      activeAccess.find((teamMember) => teamAccessMatchesMode(teamMember, activeRoleMode)) ??
      selectPrimaryTeamAccess(activeAccess)
    )
  }, [activeRoleMode, teamMembers, validatedTeamId])

  const availableRoleModes = useMemo(() => {
    const modes = new Set<RoleMode>()
    if (activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN') modes.add('ADMIN')
    if (activeClub?.role === 'COACH') modes.add('COACH')
    if (activeClub?.role === 'PARENT') modes.add('PARENT')
    if (activeClub?.role === 'PLAYER') modes.add('PLAYER')
    if (activeClub) {
      for (const access of teamMembers) {
        if (access.team.clubId !== activeClub.club.id || !isActiveTeamMember(access)) continue
        if (access.role === 'HEAD_COACH' || access.role === 'ASSISTANT_COACH') modes.add('COACH')
        if (access.role === 'PLAYER') modes.add('PLAYER')
        if (access.role === 'PARENT') modes.add('PARENT')
      }
    } else if (user?.registrationRole === 'FREE_AGENT') {
      modes.add('FREE_AGENT')
    }
    return Array.from(modes)
  }, [activeClub, teamMembers, user?.registrationRole])

  useEffect(() => {
    let cancelled = false
    const scope = activeClub?.club.id ?? user?.id
    if (!scope || availableRoleModes.length === 0) {
      setActiveRoleModeState(null)
      return () => {
        cancelled = true
      }
    }
    void AsyncStorage.getItem(ROLE_MODE_PREF_PREFIX + scope)
      .catch(() => null)
      .then((saved) => {
        if (cancelled) return
        const valid = availableRoleModes.find((mode) => mode === saved)
        setActiveRoleModeState((current) =>
          current && availableRoleModes.includes(current)
            ? current
            : (valid ?? availableRoleModes[0]),
        )
      })
    return () => {
      cancelled = true
    }
  }, [activeClub?.club.id, availableRoleModes, user?.id])

  const setActiveRoleMode = useCallback(
    (mode: RoleMode) => {
      if (!availableRoleModes.includes(mode)) return
      setActiveRoleModeState(mode)
      const scope = activeClub?.club.id ?? user?.id
      if (scope) AsyncStorage.setItem(ROLE_MODE_PREF_PREFIX + scope, mode).catch(() => {})
    },
    [activeClub?.club.id, availableRoleModes, user?.id],
  )

  const deriveActiveTeam = useCallback(
    async (clubId: string | undefined, teams: TeamMember[]): Promise<string | null> => {
      if (!clubId) return null
      const clubTeams = selectPrimaryAccessPerTeam(teams.filter((tm) => tm.team.clubId === clubId))
      if (clubTeams.length === 0) return null

      // Check for a saved preference
      const saved = await AsyncStorage.getItem(TEAM_PREF_PREFIX + clubId).catch(() => null)
      if (saved && clubTeams.some((tm) => tm.team.id === saved)) {
        return saved
      }

      return clubTeams[0].team.id
    },
    [],
  )

  const setActiveTeam = useCallback(
    (teamId: string) => {
      setActiveTeamId(teamId)
      if (activeClub) {
        AsyncStorage.setItem(TEAM_PREF_PREFIX + activeClub.club.id, teamId).catch(() => {})
      }
    },
    [activeClub],
  )

  const clubSwitchRef = React.useRef(0)

  const setActiveClub = useCallback(
    (membership: Membership) => {
      const switchId = ++clubSwitchRef.current
      // Clear L1 cache so club-scoped data cannot bleed across switches.
      clearMemoryCache()
      setActiveClubState(membership)
      deriveActiveTeam(membership.club.id, teamMembers).then((teamId) => {
        // Only apply if this is still the latest switch request
        if (clubSwitchRef.current === switchId) {
          setActiveTeamId(teamId)
        }
      })
      // Pre-warm L1 cache for the new club's teams
      const newClubTeamIds = selectPrimaryAccessPerTeam(
        teamMembers.filter((tm) => tm.team.clubId === membership.club.id),
      ).map((tm) => tm.team.id)
      if (newClubTeamIds.length > 0) {
        prefetchTeamData(membership.club.id, newClubTeamIds).catch(() => {})
      }
    },
    [teamMembers, deriveActiveTeam],
  )

  const fetchUser = useCallback(
    async (tokenOverride?: string, options?: RefreshUserOptions) => {
      const currentE2ESession = getE2ESession()
      if (currentE2ESession) {
        applyE2ESession(currentE2ESession)
        return
      }

      try {
        const data = await api<{
          id: string
          clerkId: string
          email: string
          name: string
          avatarUrl: string | null
          registrationRole: string
          dateOfBirth: string | null
          memberships: Membership[]
          teamMembers: TeamMember[]
          ageGate?: AgeGate | null
          pendingJoinRequest?: { id: string; clubId: string } | null
          pendingClubClaim?: { id: string; status: 'SUBMITTED' | 'NEEDS_INFO' } | null
        }>('/me', {
          headers: tokenOverride
            ? {
                Authorization: `Bearer ${tokenOverride}`,
              }
            : undefined,
        })
        setAgeGate(data.ageGate || null)
        setPendingJoinRequest(data.pendingJoinRequest ?? null)
        setPendingClubClaim(data.pendingClubClaim ?? null)
        isSigningOutRef.current = false
        setAuthExpiryHandlingSuspended(false)
        setUser({
          id: data.id,
          clerkId: data.clerkId,
          email: data.email,
          name: data.name,
          avatarUrl: data.avatarUrl,
          registrationRole: data.registrationRole,
          dateOfBirth: data.dateOfBirth ?? null,
        })
        setMemberships(data.memberships)
        setTeamMembers(data.teamMembers || [])

        // Check onboarding status
        if (data.memberships.length > 0) {
          const completed = await AsyncStorage.getItem(ONBOARDING_KEY_PREFIX + data.id).catch(
            () => null,
          )
          setNeedsOnboarding(!completed)
        } else {
          setNeedsOnboarding(false)
        }

        if (data.memberships.length === 0) {
          setActiveClubState(null)
          setActiveTeamId(null)
        } else {
          const currentActiveClub = activeClubRef.current
          const currentActiveTeamId = activeTeamIdRef.current
          const preferredMembership =
            (options?.preferredClubId
              ? data.memberships.find(
                  (membership) => membership.club.id === options.preferredClubId,
                )
              : null) ||
            (currentActiveClub
              ? data.memberships.find(
                  (membership) => membership.club.id === currentActiveClub.club.id,
                )
              : null) ||
            data.memberships[0]

          setActiveClubState(preferredMembership)

          const teamId =
            currentActiveTeamId &&
            data.teamMembers?.some(
              (teamMember) =>
                isActiveTeamMember(teamMember) &&
                teamMember.team.id === currentActiveTeamId &&
                teamMember.team.clubId === preferredMembership.club.id,
            )
              ? currentActiveTeamId
              : await deriveActiveTeam(preferredMembership.club.id, data.teamMembers || [])

          setActiveTeamId(teamId)
        }

        // Pre-warm L1 cache for all teams in all clubs
        for (const membership of data.memberships) {
          const clubTeamIds = (data.teamMembers || [])
            .filter((tm) => tm.team.clubId === membership.club.id && isActiveTeamMember(tm))
            .map((tm) => tm.team.id)
          if (clubTeamIds.length > 0) {
            prefetchTeamData(membership.club.id, clubTeamIds).catch(() => {})
          }
        }
      } catch (err) {
        if (hasErrorStatus(err, 401)) {
          // Token expired or invalid — clear all local auth state so routing restarts.
          resetLocalAuthState()
        } else if (__DEV__) {
          console.warn('[auth] /me fetch failed (non-auth):', errorMessage(err))
        }
        if (options?.throwOnError) {
          throw err
        }
        // For network errors, keep existing user state (stale-while-revalidate)
      }
    },
    [applyE2ESession, deriveActiveTeam, resetLocalAuthState],
  )

  const completeOnboarding = useCallback(async () => {
    if (user) {
      await AsyncStorage.setItem(ONBOARDING_KEY_PREFIX + user.id, '1').catch(() => {})
    }
    setNeedsOnboarding(false)
  }, [user])

  const signOut = useCallback(async () => {
    await clearAuthSession({ unregisterPush: true })
  }, [clearAuthSession])

  const refreshUser = useCallback(
    async (tokenOverride?: string, options?: RefreshUserOptions) => {
      if (getE2ESession()) {
        setIsLoading(true)
        try {
          applyE2ESession(getE2ESession())
        } finally {
          setIsLoading(false)
        }
        return
      }

      if (!getSessionTokenSync() && !tokenOverride) {
        return
      }

      // Mark that we're handling the fetch explicitly so the token-driven load
      // effect doesn't race with a redundant fetchUser() call.
      if (tokenOverride) {
        isSigningOutRef.current = false
        manualFetchDoneRef.current = true
      }
      setIsLoading(true)
      try {
        await fetchUser(tokenOverride, options)
      } finally {
        setIsLoading(false)
      }
    },
    [applyE2ESession, fetchUser],
  )

  // Fetch backend user whenever the session token appears/disappears. This is
  // the custom-OTP replacement for the old Clerk sign-in effect: when
  // verifyOtp stores a JWT, `sessionToken` flips truthy and we load /me; when
  // sign-out clears it, we reset local state.
  useEffect(() => {
    if (!hasHydratedE2E || !tokenHydrated) {
      return
    }

    if (e2eSession) {
      setIsLoading(false)
      return
    }

    if (isSigningOutRef.current) {
      if (!sessionToken) {
        isSigningOutRef.current = false
        resetLocalAuthState()
      } else {
        setIsLoading(false)
      }
      return
    }

    if (sessionToken) {
      // If refreshUser() already fetched the user (e.g. sign-in flow), skip the
      // redundant fetch to prevent a race that flips isLoading back to true
      // mid-navigation.
      if (manualFetchDoneRef.current) {
        manualFetchDoneRef.current = false
        return
      }
      setIsLoading(true)
      fetchUser().finally(() => setIsLoading(false))
    } else {
      resetLocalAuthState()
    }
  }, [sessionToken, tokenHydrated, e2eSession, fetchUser, hasHydratedE2E, resetLocalAuthState])

  // Proactive token refresh. The session JWT lives 30 days; nothing called
  // /auth/session/refresh, so a user who closed the app for >30 days would be
  // silently signed out. On app foreground (and once on mount), if the stored
  // token is within ~7 days of expiry, re-mint it and persist the new one.
  // Guards: skip e2e sessions, sign-out windows, and missing tokens.
  useEffect(() => {
    if (!hasHydratedE2E || !tokenHydrated) return
    if (e2eSession) return

    let cancelled = false
    const refreshIfNeeded = async () => {
      if (isSigningOutRef.current) return
      if (getE2ESession()) return
      const current = getSessionTokenSync()
      if (!shouldRefreshSession(current)) return
      try {
        const { token: next } = await api<{ token: string }>('/auth/session/refresh', {
          method: 'POST',
        })
        if (!cancelled && next) {
          await setSessionToken(next)
        }
      } catch (err) {
        // A 401 is handled by the api client's global sign-out path; anything
        // else (network) is non-fatal — the existing token still works until
        // the next foreground attempt.
        if (__DEV__) {
          console.warn('[auth] proactive session refresh failed:', errorMessage(err))
        }
      }
    }

    void refreshIfNeeded()
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void refreshIfNeeded()
    })
    return () => {
      cancelled = true
      sub.remove()
    }
  }, [hasHydratedE2E, tokenHydrated, e2eSession, sessionToken])

  const reauthenticate = useCallback(async (code: string) => {
    if (e2eSession) return
    if (!user?.email) throw new Error('Your account does not have a sign-in email')
    const result = await api<{ token: string; user: { id: string } }>('/auth/otp/verify', {
      method: 'POST',
      body: { email: user.email, code },
    })
    if (!result.token || result.user.id !== user.id) {
      throw new Error('Could not verify this account')
    }
    await setSessionToken(result.token)
  }, [e2eSession, user?.email, user?.id])

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        teamMembers,
        activeClub,
        activeTeamId: validatedTeamId,
        activeTeamAccess,
        teamsForActiveClub,
        activeRoleMode,
        availableRoleModes,
        token,
        ageGate,
        pendingJoinRequest,
        pendingClubClaim,
        isLoading,
        isSignedIn: !!user,
        needsOnboarding,
        needsRegistration,
        getToken,
        signOut,
        setActiveClub,
        setActiveTeam,
        setActiveRoleMode,
        refreshUser,
        reauthenticate,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Decode the `exp` (seconds since epoch) from an HS256 JWT payload WITHOUT
 * verifying the signature — we only need the expiry to decide whether to
 * proactively refresh. Returns null on any malformed token. Uses base64url
 * decoding compatible with the backend's jwt.util encoding.
 */
function decodeJwtExpSeconds(token: string): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payloadPart = parts[1]
    const pad = payloadPart.length % 4 === 0 ? '' : '='.repeat(4 - (payloadPart.length % 4))
    const b64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/') + pad
    // global.atob exists in React Native (Hermes). Fall back to Buffer if not.
    const json =
      typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
    const claims = JSON.parse(json) as { exp?: unknown }
    return typeof claims.exp === 'number' ? claims.exp : null
  } catch {
    return null
  }
}

/** Refresh threshold: re-mint when fewer than 7 days remain on the 30-day JWT. */
export const SESSION_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Returns true when `token` is valid but within the refresh window (expires in
 * less than the threshold). False when there's plenty of life left, or when the
 * token can't be decoded (we don't want to hammer refresh on a garbage token).
 */
export function shouldRefreshSession(
  token: string | null,
  thresholdMs: number = SESSION_REFRESH_THRESHOLD_MS,
  now: number = Date.now(),
): boolean {
  if (!token) return false
  const expSeconds = decodeJwtExpSeconds(token)
  if (expSeconds == null) return false
  const msUntilExpiry = expSeconds * 1000 - now
  // Already expired → let the normal 401 path handle sign-out, don't refresh.
  if (msUntilExpiry <= 0) return false
  return msUntilExpiry < thresholdMs
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function hasErrorStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: unknown }).status === status
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
