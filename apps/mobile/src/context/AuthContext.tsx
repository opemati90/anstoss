import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-expo'
import { api, setTokenGetter } from '../api/client'

type User = {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
}

type TeamMember = {
  id: string
  team: {
    id: string
    name: string
    clubId: string
    ageGroup: string | null
  }
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
  isLoading: boolean
  isSignedIn: boolean
  signOut: () => Promise<void>
  setActiveClub: (membership: Membership) => void
  refreshUser: () => Promise<void>
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
  const [isLoading, setIsLoading] = useState(true)

  // Wire Clerk's getToken into the API client
  useEffect(() => {
    setTokenGetter(getToken)
  }, [getToken])

  const deriveActiveTeam = useCallback(
    (clubId: string | undefined, teams: TeamMember[]) => {
      if (!clubId) return null
      const match = teams.find((tm) => tm.team.clubId === clubId)
      return match?.team.id || null
    },
    [],
  )

  const setActiveClub = useCallback(
    (membership: Membership) => {
      setActiveClubState(membership)
      setActiveTeamId(deriveActiveTeam(membership.club.id, teamMembers))
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
      }>('/me')
      setUser({
        id: data.id,
        clerkId: data.clerkId,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl,
      })
      setMemberships(data.memberships)
      setTeamMembers(data.teamMembers || [])
      if (data.memberships.length > 0 && !activeClub) {
        const first = data.memberships[0]
        setActiveClubState(first)
        setActiveTeamId(
          deriveActiveTeam(first.club.id, data.teamMembers || []),
        )
      }
    } catch {
      // Token expired or invalid — Clerk handles refresh automatically
      setUser(null)
    }
  }, [activeClub, deriveActiveTeam])

  const signOut = useCallback(async () => {
    await clerkSignOut()
    setUser(null)
    setMemberships([])
    setTeamMembers([])
    setActiveClubState(null)
    setActiveTeamId(null)
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
        activeTeamId,
        isLoading,
        isSignedIn: !!user,
        signOut,
        setActiveClub,
        refreshUser,
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
