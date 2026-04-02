import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, setTokenGetter, setSignOutHandler, API_URL } from '../api/client'
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
  refreshUser: (tokenOverride?: string) => Promise<void>
  completeOnboarding: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

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

  const applyE2ESession = useCallback((session: E2ESessionSnapshot | null) => {
    if (!session) {
      setUser(null)
      setMemberships([])
      setTeamMembers([])
      setActiveClubState(null)
      setActiveTeamId(null)
      setToken(null)
      setAgeGate(null)
      setNeedsOnboarding(false)
      return
    }

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
  }, [])

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
      const currentE2ESession = getE2ESession()
      if (currentE2ESession) {
        return 'e2e-session-token'
      }

      return getToken()
    })
  }, [getToken])

  // Wire sign-out handler into the API client for global 401 handling
  useEffect(() => {
    setSignOutHandler(async () => {
      if (getE2ESession()) {
        await clearE2ESession()
        return
      }

      await clerkSignOut()
      clearMemoryCache()
      setUser(null)
      setMemberships([])
      setTeamMembers([])
      setActiveClubState(null)
      setActiveTeamId(null)
      setToken(null)
      setAgeGate(null)
      setNeedsOnboarding(false)
    })
    return () => setSignOutHandler(null)
  }, [clerkSignOut])

  useEffect(() => {
    if (!hasHydratedE2E) {
      return
    }

    if (e2eSession) {
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

  const fetchUser = useCallback(async (tokenOverride?: string) => {
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

      if (data.memberships.length > 0 && !activeClub) {
        const first = data.memberships[0]
        setActiveClubState(first)
        const teamId = await deriveActiveTeam(first.club.id, data.teamMembers || [])
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
        // Token expired or invalid — clear user so auth flow restarts
        setUser(null)
      } else if (__DEV__) {
        console.warn('[auth] /me fetch failed (non-auth):', err?.message || err)
      }
      // For network errors, keep existing user state (stale-while-revalidate)
    }
  }, [activeClub, applyE2ESession, clerkUser, deriveActiveTeam])

  const completeOnboarding = useCallback(async () => {
    if (user) {
      await AsyncStorage.setItem(ONBOARDING_KEY_PREFIX + user.id, '1').catch(() => {})
    }
    setNeedsOnboarding(false)
  }, [user])

  const signOut = useCallback(async () => {
    if (getE2ESession()) {
      clearMemoryCache()
      await clearE2ESession()
      return
    }

    if (token) {
      await unregisterPushToken(API_URL, token).catch(() => {})
    }
    await clerkSignOut()
    clearMemoryCache()
    setUser(null)
    setMemberships([])
    setTeamMembers([])
    setActiveClubState(null)
    setActiveTeamId(null)
    setToken(null)
    setAgeGate(null)
    setNeedsOnboarding(false)
  }, [clerkSignOut, token])

  const refreshUser = useCallback(
    async (tokenOverride?: string) => {
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

      setIsLoading(true)
      try {
        await fetchUser(tokenOverride)
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

    if (clerkSignedIn && clerkUser) {
      setIsLoading(true)
      fetchUser().finally(() => setIsLoading(false))
    } else if (clerkSignedIn === false) {
      setUser(null)
      setMemberships([])
      setTeamMembers([])
      setActiveClubState(null)
      setActiveTeamId(null)
      setIsLoading(false)
    }
    // When clerkSignedIn is undefined (SDK still loading), do nothing — keep current state
  }, [clerkSignedIn, clerkUser?.id, e2eSession, fetchUser, hasHydratedE2E])

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
