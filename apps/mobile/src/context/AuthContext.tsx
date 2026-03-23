import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import * as SecureStore from 'expo-secure-store'
import { api } from '../api/client'

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
  token: string | null
  isLoading: boolean
  isSignedIn: boolean
  signIn: (token: string) => Promise<void>
  signOut: () => Promise<void>
  setActiveClub: (membership: Membership) => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [activeClub, setActiveClubState] = useState<Membership | null>(null)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
      // Token expired or invalid
      await signOut()
    }
  }, [activeClub, deriveActiveTeam])

  const signIn = useCallback(async (newToken: string) => {
    await SecureStore.setItemAsync('clerk_token', newToken)
    setToken(newToken)
    await fetchUser()
  }, [fetchUser])

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync('clerk_token')
    setToken(null)
    setUser(null)
    setMemberships([])
    setTeamMembers([])
    setActiveClubState(null)
    setActiveTeamId(null)
  }, [])

  const refreshUser = useCallback(async () => {
    if (token) await fetchUser()
  }, [token, fetchUser])

  // Check for existing token on mount
  useEffect(() => {
    ;(async () => {
      try {
        const stored = await SecureStore.getItemAsync('clerk_token')
        if (stored) {
          setToken(stored)
          await fetchUser()
        }
      } catch {
        // No token stored
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        teamMembers,
        activeClub,
        activeTeamId,
        token,
        isLoading,
        isSignedIn: !!user,
        signIn,
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
