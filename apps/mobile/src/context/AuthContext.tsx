import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth as useClerkAuth } from '@clerk/clerk-expo'
import type {
  AgeGateState,
  Club,
  GuardianRelationship,
  Membership,
  ParentalConsent,
  Team,
  TeamAccess,
  TeamGroup,
} from '@anstoss/shared'
import { api } from '../api/client'
import { waitForSessionToken } from '../utils/clerkSession'

type AuthUser = {
  id: string
  clerkId: string
  email: string
  name: string
  avatarUrl: string | null
  dateOfBirth: string
}

type MembershipWithClub = Membership & {
  club: Club
}

type TeamAccessWithTeam = TeamAccess & {
  team: Team & {
    group: TeamGroup
  }
}

type AuthState = {
  user: AuthUser | null
  memberships: MembershipWithClub[]
  teamAccess: TeamAccessWithTeam[]
  guardianRelationships: GuardianRelationship[]
  parentalConsents: ParentalConsent[]
  ageGate: AgeGateState | null
  activeClub: MembershipWithClub | null
  activeTeamId: string | null
  activeTeamAccess: TeamAccessWithTeam | null
  availableTeams: TeamAccessWithTeam[]
  token: string | null
  isLoading: boolean
  isSignedIn: boolean
  signOut: () => Promise<void>
  setActiveClub: (membership: MembershipWithClub) => void
  setActiveTeamId: (teamId: string | null) => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function deriveActiveTeam(clubId: string | undefined, access: TeamAccessWithTeam[]) {
  if (!clubId) return null
  const match = access.find((entry) => entry.team.clubId === clubId)
  return match?.team.id || null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    isLoaded: isClerkLoaded,
    isSignedIn: isClerkSignedIn,
    signOut: clerkSignOut,
  } = useClerkAuth()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [memberships, setMemberships] = useState<MembershipWithClub[]>([])
  const [teamAccess, setTeamAccess] = useState<TeamAccessWithTeam[]>([])
  const [guardianRelationships, setGuardianRelationships] = useState<GuardianRelationship[]>([])
  const [parentalConsents, setParentalConsents] = useState<ParentalConsent[]>([])
  const [ageGate, setAgeGate] = useState<AgeGateState | null>(null)
  const [activeClub, setActiveClubState] = useState<MembershipWithClub | null>(null)
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const clearAuthState = useCallback(() => {
    setToken(null)
    setUser(null)
    setMemberships([])
    setTeamAccess([])
    setGuardianRelationships([])
    setParentalConsents([])
    setAgeGate(null)
    setActiveClubState(null)
    setActiveTeamIdState(null)
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

  const setActiveClub = useCallback((membership: MembershipWithClub) => {
    setActiveClubState(membership)
    setActiveTeamIdState(deriveActiveTeam(membership.club.id, teamAccess))
  }, [teamAccess])

  const setActiveTeamId = useCallback((teamId: string | null) => {
    setActiveTeamIdState(teamId)
  }, [])

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
        dateOfBirth: string
        memberships: MembershipWithClub[]
        teamAccess: TeamAccessWithTeam[]
        guardianRelationshipsAsParent: GuardianRelationship[]
        parentalConsentsAsPlayer: ParentalConsent[]
        ageGate: AgeGateState
      }>('/me', {
        headers: {
          Authorization: `Bearer ${freshToken}`,
        },
      })

      const nextUser: AuthUser = {
        id: data.id,
        clerkId: data.clerkId,
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl,
        dateOfBirth: data.dateOfBirth,
      }

      const nextMemberships = data.memberships || []
      const nextTeamAccess = (data.teamAccess || []).filter(
        (entry) => entry.status === 'ACTIVE',
      )
      const nextActiveClub =
        activeClub && nextMemberships.some((membership) => membership.id === activeClub.id)
          ? activeClub
          : nextMemberships[0] || null

      setUser(nextUser)
      setMemberships(nextMemberships)
      setTeamAccess(nextTeamAccess)
      setGuardianRelationships(data.guardianRelationshipsAsParent || [])
      setParentalConsents(data.parentalConsentsAsPlayer || [])
      setAgeGate(data.ageGate)
      setActiveClubState(nextActiveClub)
      setActiveTeamIdState((current) => {
        if (current && nextTeamAccess.some((entry) => entry.team.id === current)) {
          return current
        }

        return deriveActiveTeam(nextActiveClub?.club.id, nextTeamAccess)
      })
    } catch {
      await signOut()
    }
  }, [activeClub, signOut])

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

  const availableTeams = activeClub
    ? teamAccess.filter((entry) => entry.team.clubId === activeClub.club.id)
    : []

  const activeTeamAccess =
    availableTeams.find((entry) => entry.team.id === activeTeamId) || null

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        teamAccess,
        guardianRelationships,
        parentalConsents,
        ageGate,
        activeClub,
        activeTeamId,
        activeTeamAccess,
        availableTeams,
        token,
        isLoading,
        isSignedIn: !!user,
        signOut,
        setActiveClub,
        setActiveTeamId,
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
