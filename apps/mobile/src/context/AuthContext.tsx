import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import * as SecureStore from 'expo-secure-store'
import { api } from '../api/client'

type User = {
  id: string
  clerkId: string
  email: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
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
  activeClub: Membership | null
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
  const [activeClub, setActiveClub] = useState<Membership | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchUser = useCallback(async () => {
    try {
      const data = await api<{ user: User; memberships: Membership[] }>('/me')
      setUser(data.user)
      setMemberships(data.memberships)
      if (data.memberships.length > 0 && !activeClub) {
        setActiveClub(data.memberships[0])
      }
    } catch {
      // Token expired or invalid
      await signOut()
    }
  }, [activeClub])

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
    setActiveClub(null)
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
        activeClub,
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
