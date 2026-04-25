import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { RegistrationRole } from '@anstoss/shared'

export type OnboardingDraft = {
  registrationRole: RegistrationRole | null
  profile: {
    displayName: string
    dateOfBirth: string
    photoUrl: string | null
  }
  clubCreate?: {
    name: string
    primaryColor: string
    badgeUrl?: string
    welcomeText?: string
    firstTeamName: string
  }
  join?: {
    inviteCode?: string
    clubId?: string
  }
  parentLink?: {
    approvalInviteCode?: string
    childEmail?: string
  }
  freeAgent?: {
    position: string[]
    experienceYears: number
    location: string
    availableForTrials: boolean
    bio: string
  }
}

export type OnboardingContextValue = {
  draft: OnboardingDraft
  setRole: (role: RegistrationRole) => void
  setProfile: (profile: OnboardingDraft['profile']) => void
  setClubCreate: (data: NonNullable<OnboardingDraft['clubCreate']>) => void
  setJoin: (data: NonNullable<OnboardingDraft['join']>) => void
  setParentLink: (data: NonNullable<OnboardingDraft['parentLink']>) => void
  setFreeAgent: (data: NonNullable<OnboardingDraft['freeAgent']>) => void
  reset: () => void
}

const EMPTY_DRAFT: OnboardingDraft = {
  registrationRole: null,
  profile: { displayName: '', dateOfBirth: '', photoUrl: null },
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT)

  const setRole = useCallback((role: RegistrationRole) => {
    setDraft((d) => ({ ...d, registrationRole: role }))
  }, [])

  const setProfile = useCallback((profile: OnboardingDraft['profile']) => {
    setDraft((d) => ({ ...d, profile }))
  }, [])

  const setClubCreate = useCallback(
    (data: NonNullable<OnboardingDraft['clubCreate']>) => {
      setDraft((d) => ({ ...d, clubCreate: data }))
    },
    [],
  )

  const setJoin = useCallback((data: NonNullable<OnboardingDraft['join']>) => {
    setDraft((d) => ({ ...d, join: data }))
  }, [])

  const setParentLink = useCallback(
    (data: NonNullable<OnboardingDraft['parentLink']>) => {
      setDraft((d) => ({ ...d, parentLink: data }))
    },
    [],
  )

  const setFreeAgent = useCallback(
    (data: NonNullable<OnboardingDraft['freeAgent']>) => {
      setDraft((d) => ({ ...d, freeAgent: data }))
    },
    [],
  )

  const reset = useCallback(() => {
    setDraft(EMPTY_DRAFT)
  }, [])

  const value = useMemo<OnboardingContextValue>(
    () => ({
      draft,
      setRole,
      setProfile,
      setClubCreate,
      setJoin,
      setParentLink,
      setFreeAgent,
      reset,
    }),
    [draft, setRole, setProfile, setClubCreate, setJoin, setParentLink, setFreeAgent, reset],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboardingDraft(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext)
  if (!ctx) {
    throw new Error('useOnboardingDraft must be used inside OnboardingProvider')
  }
  return ctx
}
