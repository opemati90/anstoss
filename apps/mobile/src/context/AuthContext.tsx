import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api, setTokenGetter } from '../api/client'
import { prefetchTeamData, clearMemoryCache } from '../utils/cache'

const TEAM_PREF_PREFIX = 'anstoss:team-pref:'
const ONBOARDING_KEY_PREFIX = 'anstoss:onboarding-complete:'

type User = {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
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
  refreshUser: () => Promise<void>
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

  // Wire Clerk's getToken into the API client and keep token in state
  useEffect(() => {
    setTokenGetter(getToken)
  }, [getToken])

  useEffect(() => {
    if (clerkSignedIn) {
      getToken().then((t) => setToken(t))
    } else {
      setToken(null)
    }
  }, [clerkSignedIn, getToken])

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

  const fetchUser = useCallback(async () => {
    try {
      const data = await api<{
        id: string
        clerkId: string
        email: string
        name: string
        avatarUrl: string | null
        memberships: Membership[]
        teamMembers: TeamMember[]
        ageGate?: AgeGate | null
      }>('/me')
      setAgeGate(data.ageGate || null)
      setUser({
        id: data.id,
        clerkId: data.clerkId,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl,
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
  }, [activeClub, deriveActiveTeam])

  const completeOnboarding = useCallback(async () => {
    if (user) {
      await AsyncStorage.setItem(ONBOARDING_KEY_PREFIX + user.id, '1').catch(() => {})
    }
    setNeedsOnboarding(false)
  }, [user])

  const signOut = useCallback(async () => {
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
  }, [clerkSignOut])

  const refreshUser = useCallback(async () => {
    if (clerkSignedIn) await fetchUser()
  }, [clerkSignedIn, fetchUser])

  // Fetch backend user whenever Clerk auth state changes
  useEffect(() => {
    if (clerkSignedIn && clerkUser) {
      fetchUser().finally(() => setIsLoading(false))
    } else {
      setUser(null)
      setMemberships([])
      setTeamMembers([])
      setActiveClubState(null)
      setActiveTeamId(null)
      setIsLoading(false)
    }
  }, [clerkSignedIn, clerkUser?.id])

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
