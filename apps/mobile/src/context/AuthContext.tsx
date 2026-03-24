import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth as useClerkAuth } from '@clerk/clerk-expo'
import { api } from '../api/client'
import { waitForSessionToken } from '../utils/clerkSession'

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
  signOut: () => Promise<void>
  setActiveClub: (membership: Membership) => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    isLoaded: isClerkLoaded,
    isSignedIn: isClerkSignedIn,
    signOut: clerkSignOut,
  } = useClerkAuth()
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

  const clearAuthState = useCallback(() => {
    setToken(null)
    setUser(null)
    setMemberships([])
    setTeamMembers([])
    setActiveClubState(null)
    setActiveTeamId(null)
  }, [])

  const signOut = useCallback(async () => {
    try {
      if (isClerkSignedIn) {
        await clerkSignOut()
      }
    } catch {
      // Ignore Clerk sign-out errors and always clear local state.
    } finally {
      clearAuthState()
    }
  }, [clearAuthState, clerkSignOut, isClerkSignedIn])

  const setActiveClub = useCallback(
    (membership: Membership) => {
      setActiveClubState(membership)
      setActiveTeamId(deriveActiveTeam(membership.club.id, teamMembers))
    },
    [teamMembers, deriveActiveTeam],
  )

  const fetchUser = useCallback(async () => {
    try {
      const freshToken = await waitForSessionToken()
      if (!freshToken) {
        await signOut()
        return
      }

      setToken(freshToken)
      const data = await api<{
        id: string
        clerkId: string
        email: string
        name: string
        avatarUrl: string | null
        memberships: Membership[]
        teamMembers: TeamMember[]
      }>('/me', {
        headers: {
          Authorization: `Bearer ${freshToken}`,
        },
      })
      setUser({
        id: data.id,
        clerkId: data.clerkId,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl,
      })
      setMemberships(data.memberships)
      setTeamMembers(data.teamMembers || [])
      setActiveClubState((current) => {
        if (current || data.memberships.length === 0) {
          return current
        }

        return data.memberships[0]
      })
      setActiveTeamId((current) => {
        if (current || data.memberships.length === 0) {
          return current
        }

        const first = data.memberships[0]
        return deriveActiveTeam(first.club.id, data.teamMembers || [])
      })
    } catch {
      // Token expired or invalid
      await signOut()
    }
  }, [deriveActiveTeam, signOut])

  const refreshUser = useCallback(async () => {
    if (!isClerkLoaded) return
    await fetchUser()
  }, [fetchUser, isClerkLoaded])

  useEffect(() => {
    if (!isClerkLoaded) return

    let isCancelled = false

    ;(async () => {
      try {
        setIsLoading(true)

        if (isClerkSignedIn) {
          await fetchUser()
        } else {
          clearAuthState()
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [clearAuthState, fetchUser, isClerkLoaded, isClerkSignedIn])

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
