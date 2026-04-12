import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo'
import AsyncStorage from '@react-native-async-storage/async-storage'
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

const TEAM_PREF_PREFIX = 'anstoss:team-pref:'
const ONBOARDING_KEY_PREFIX = 'anstoss:onboarding-complete:'

type User = {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  registrationRole: string
}

type TeamMember = {
  id: string
  role: string
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

type AuthState = {
  user: User | null
  memberships: Membership[]
  teamMembers: TeamMember[]
  activeClub: Membership | null
  activeTeamId: string | null
  activeTeamAccess: TeamMember | null
  teamsForActiveClub: TeamMember[]
  token: string | null
  ageGate: AgeGate | null
  isLoading: boolean
  isSignedIn: boolean
  needsOnboarding: boolean
  signOut: () => Promise<void>
  setActiveClub: (membership: Membership) => void
  setActiveTeam: (teamId: string) => void
  refreshUser: (
    tokenOverride?: string,
    options?: { preferredClubId?: string; throwOnError?: boolean },
  ) => Promise<void>
  completeOnboarding: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

type RefreshUserOptions = {
  preferredClubId?: string
  throwOnError?: boolean
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn: clerkSignedIn, signOut: clerkSignOut } = useClerkAuth()
  const { user: clerkUser } = useClerkUser()

  const [user, setUser] = useState<User | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [activeClub, setActiveClubState] = useState<Membership | null>(null)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [ageGate, setAgeGate] = useState<AgeGate | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [e2eSession, setE2ESession] = useState<E2ESessionSnapshot | null>(null)
  const [hasHydratedE2E, setHasHydratedE2E] = useState(!isE2ESupported())

  // Tracks whether refreshUser() was called explicitly (e.g. from sign-in flow).
  // When set, the clerkSignedIn effect skips its redundant fetchUser() to avoid
  // a race condition that resets isLoading mid-navigation.
  const manualFetchDoneRef = useRef(false)
  const isSigningOutRef = useRef(false)

  const resetLocalAuthState = useCallback(() => {
    clearMemoryCache()
    manualFetchDoneRef.current = false
    setUser(null)
    setMemberships([])
    setTeamMembers([])
    setActiveClubState(null)
    setActiveTeamId(null)
    setToken(null)
    setAgeGate(null)
    setNeedsOnboarding(false)
    setE2ESession(null)
    setIsLoading(false)
  }, [])

  const applyE2ESession = useCallback((session: E2ESessionSnapshot | null) => {
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
    })
    setMemberships(session.memberships)
    setTeamMembers(session.teamMembers)
    setAgeGate(session.ageGate)
    setNeedsOnboarding(session.needsOnboarding)
    setToken('e2e-session-token')

    const firstMembership = session.memberships[0] || null
    setActiveClubState(firstMembership)

    if (firstMembership) {
      const firstTeam = session.teamMembers.find(
        (teamMember) => teamMember.team.clubId === firstMembership.club.id,
      )
      setActiveTeamId(firstTeam?.team.id || null)
    } else {
      setActiveTeamId(null)
    }
  }, [resetLocalAuthState])

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

  // Wire Clerk's getToken into the API client and keep token in state
  useEffect(() => {
    setTokenGetter(async () => {
      if (isSigningOutRef.current) {
        return null
      }

      const currentE2ESession = getE2ESession()
      if (currentE2ESession) {
        return 'e2e-session-token'
      }

      return getToken()
    })
  }, [getToken])

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

        await clerkSignOut().catch((error) => {
          if (__DEV__) {
            console.warn('[auth] Clerk sign-out failed after local reset:', error)
          }
        })
      }

      void finishRemoteCleanup()
    },
    [clerkSignOut, resetLocalAuthState, token],
  )

  // Wire sign-out handler into the API client for global 401 handling
  useEffect(() => {
    setSignOutHandler(() => clearAuthSession())
    return () => setSignOutHandler(null)
  }, [clearAuthSession])

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

    if (clerkSignedIn) {
      getToken().then((t) => setToken(t))
    } else {
      setToken(null)
    }
  }, [clerkSignedIn, e2eSession, getToken, hasHydratedE2E])

  const teamsForActiveClub = useMemo(
    () =>
      activeClub
        ? teamMembers.filter((tm) => tm.team.clubId === activeClub.club.id)
        : [],
    [teamMembers, activeClub],
  )

  // ANS-203: Validate activeTeamId belongs to activeClub, auto-reset if not
  const validatedTeamId = useMemo(() => {
    if (!activeTeamId || !activeClub) return activeTeamId
    const belongsToClub = teamsForActiveClub.some(
      (tm) => tm.team.id === activeTeamId,
    )
    return belongsToClub ? activeTeamId : null
  }, [activeTeamId, activeClub, teamsForActiveClub])

  useEffect(() => {
    if (activeClub && validatedTeamId === null && teamsForActiveClub.length > 0) {
      setActiveTeamId(teamsForActiveClub[0].team.id)
    }
  }, [validatedTeamId, activeClub, teamsForActiveClub])

  const activeTeamAccess = validatedTeamId
    ? teamMembers.find((tm) => tm.team.id === validatedTeamId) || null
    : null

  const deriveActiveTeam = useCallback(
    async (clubId: string | undefined, teams: TeamMember[]): Promise<string | null> => {
      if (!clubId) return null
      const clubTeams = teams.filter((tm) => tm.team.clubId === clubId)
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
      // ANS-201: Clear L1 cache when switching clubs
      clearMemoryCache()
      setActiveClubState(membership)
      deriveActiveTeam(membership.club.id, teamMembers).then((teamId) => {
        // Only apply if this is still the latest switch request
        if (clubSwitchRef.current === switchId) {
          setActiveTeamId(teamId)
        }
      })
      // Pre-warm L1 cache for the new club's teams
      const newClubTeamIds = teamMembers
        .filter((tm) => tm.team.clubId === membership.club.id)
        .map((tm) => tm.team.id)
      if (newClubTeamIds.length > 0) {
        prefetchTeamData(membership.club.id, newClubTeamIds).catch(() => {})
      }
    },
    [teamMembers, deriveActiveTeam],
  )

  const fetchUser = useCallback(async (
    tokenOverride?: string,
    options?: RefreshUserOptions,
  ) => {
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
        memberships: Membership[]
        teamMembers: TeamMember[]
        ageGate?: AgeGate | null
      }>('/me', {
        headers: tokenOverride
          ? {
              Authorization: `Bearer ${tokenOverride}`,
            }
          : undefined,
      })
      setAgeGate(data.ageGate || null)
      isSigningOutRef.current = false
      setAuthExpiryHandlingSuspended(false)
      const realEmail = clerkUser?.primaryEmailAddress?.emailAddress
      setUser({
        id: data.id,
        clerkId: data.clerkId,
        email: realEmail || data.email,
        name: data.name,
        avatarUrl: data.avatarUrl,
        registrationRole: data.registrationRole,
      })
      setMemberships(data.memberships)
      setTeamMembers(data.teamMembers || [])

      // Check onboarding status
      if (data.memberships.length > 0) {
        const completed = await AsyncStorage.getItem(
          ONBOARDING_KEY_PREFIX + data.id,
        ).catch(() => null)
        setNeedsOnboarding(!completed)
      } else {
        setNeedsOnboarding(false)
      }

      if (data.memberships.length === 0) {
        setActiveClubState(null)
        setActiveTeamId(null)
      } else {
        const preferredMembership =
          (options?.preferredClubId
            ? data.memberships.find(
                (membership) => membership.club.id === options.preferredClubId,
              )
            : null) ||
          (activeClub
            ? data.memberships.find(
                (membership) => membership.club.id === activeClub.club.id,
              )
            : null) ||
          data.memberships[0]

        setActiveClubState(preferredMembership)

        const teamId =
          activeTeamId &&
          activeTeamId !== null &&
          data.teamMembers?.some(
            (teamMember) =>
              teamMember.team.id === activeTeamId &&
              teamMember.team.clubId === preferredMembership.club.id,
          )
            ? activeTeamId
            : await deriveActiveTeam(
                preferredMembership.club.id,
                data.teamMembers || [],
              )

        setActiveTeamId(teamId)
      }

      // Pre-warm L1 cache for all teams in all clubs
      for (const membership of data.memberships) {
        const clubTeamIds = (data.teamMembers || [])
          .filter((tm) => tm.team.clubId === membership.club.id)
          .map((tm) => tm.team.id)
        if (clubTeamIds.length > 0) {
          prefetchTeamData(membership.club.id, clubTeamIds).catch(() => {})
        }
      }
    } catch (err: any) {
      if (err?.status === 401) {
        // Token expired or invalid — clear all local auth state so routing restarts.
        resetLocalAuthState()
      } else if (__DEV__) {
        console.warn('[auth] /me fetch failed (non-auth):', err?.message || err)
      }
      if (options?.throwOnError) {
        throw err
      }
      // For network errors, keep existing user state (stale-while-revalidate)
    }
  }, [activeClub, activeTeamId, applyE2ESession, clerkUser, deriveActiveTeam, resetLocalAuthState])

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

      if (!clerkSignedIn && !tokenOverride) {
        return
      }

      // Mark that we're handling the fetch explicitly so the clerkSignedIn
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
    [applyE2ESession, clerkSignedIn, fetchUser],
  )

  // Fetch backend user whenever Clerk auth state changes
  useEffect(() => {
    if (!hasHydratedE2E) {
      return
    }

    if (e2eSession) {
      setIsLoading(false)
      return
    }

    if (isSigningOutRef.current) {
      if (clerkSignedIn === false) {
        isSigningOutRef.current = false
        resetLocalAuthState()
      } else {
        setIsLoading(false)
      }
      return
    }

    if (clerkSignedIn && clerkUser) {
      // If refreshUser() already fetched the user (e.g. sign-in flow passed an
      // explicit session token), skip the redundant fetch to prevent a race that
      // flips isLoading back to true mid-navigation.
      if (manualFetchDoneRef.current) {
        manualFetchDoneRef.current = false
        return
      }
      setIsLoading(true)
      fetchUser().finally(() => setIsLoading(false))
    } else if (clerkSignedIn === false) {
      resetLocalAuthState()
    }
    // When clerkSignedIn is undefined (SDK still loading), do nothing — keep current state
  }, [clerkSignedIn, clerkUser?.id, e2eSession, fetchUser, hasHydratedE2E, resetLocalAuthState])

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
        token,
        ageGate,
        isLoading,
        isSignedIn: !!user,
        needsOnboarding,
        signOut,
        setActiveClub,
        setActiveTeam,
        refreshUser,
        completeOnboarding,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
