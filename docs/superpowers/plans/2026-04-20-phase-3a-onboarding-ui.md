# Phase 3a — Onboarding UI Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scattered post-signup routes (`/club-setup`, `/free-agent/profile`, `/account-next-step`, `/enter-dob`) with a single 3-step role-aware onboarding flow that collects the full `completeOnboardingSchema` payload and submits once to `POST /me/onboarding` (built in Phase 2).

**Architecture:** New route tree at `app/register/`: `_layout.tsx` (Stack + top progress bar), `index.tsx` (Step 1 role selection), `club.tsx` / `join.tsx` / `free-agent.tsx` / `parent.tsx` (Step 2 branches), `finalize.tsx` (Step 3 profile + submit). Draft state lives in a new `OnboardingContext` provider scoped under `_layout.tsx`. Entry is rewired in `app/index.tsx`: when `memberships.length === 0` and no partial-onboarding marker, redirect to `/register`. Existing `/club-setup`, `/free-agent/profile`, `/account-next-step`, `/enter-dob` remain in the tree (they still serve other code paths: existing-user DOB gate, deep links, the club-setup flow called from inside an existing club) but are no longer the onboarding entry.

**Tech Stack:** Expo Router (file-based), React Context for draft state, Zod `completeOnboardingSchema` from `@anstoss/shared`, existing UI primitives in `apps/mobile/src/components/ui/`, existing `BadgeUploadPicker` component, existing `formatDateOfBirthInput` / `parseDateOfBirthInput` utils, `api` client for `POST /me/onboarding`. i18n via `react-i18next` (`en.ts`, `de.ts`, `fr.ts`, `it.ts`, `pt.ts`).

---

## File Structure

**New files (all under `apps/mobile/`):**

- `app/register/_layout.tsx` — Stack with header-less top progress bar (1/3 · 2/3 · 3/3), wraps children in `OnboardingProvider`. Handles step-aware back button.
- `app/register/index.tsx` — Step 1: role selection, 5 full-width cards.
- `app/register/club.tsx` — Step 2 branch for `CLUB_ADMIN`. Collects club name, primary color, badge, welcome text, first team name.
- `app/register/join.tsx` — Step 2 branch for `PLAYER` and `COACH`. Invite code input (no club search UI in this phase — search is Phase 3b per spec § 4.2).
- `app/register/free-agent.tsx` — Step 2 branch for `FREE_AGENT`. Position multiselect, experience years, location, availability toggle, bio.
- `app/register/parent.tsx` — Step 2 branch for `PARENT`. Approval invite code input (child-email approval-request path deferred to Phase 3b — matches backend NotImplementedException).
- `app/register/finalize.tsx` — Step 3: display name, DOB, optional photo. On submit, assembles full discriminated-union payload and calls `POST /me/onboarding`.
- `src/context/OnboardingContext.tsx` — React Context for draft state across the three steps.
- `src/components/RegisterProgressBar.tsx` — Thin progress bar primitive (1/3 · 2/3 · 3/3).
- `app/__tests__/register-role-select.spec.tsx` — Step 1 selection persistence.
- `app/__tests__/register-club-branch.spec.tsx` — Step 2 CLUB_ADMIN validation.
- `app/__tests__/register-join-branch.spec.tsx` — Step 2 join validation.
- `app/__tests__/register-free-agent-branch.spec.tsx` — Step 2 FREE_AGENT validation.
- `app/__tests__/register-parent-branch.spec.tsx` — Step 2 PARENT validation.
- `app/__tests__/register-finalize.spec.tsx` — Step 3 submit happy path + schema error path.

**Modified files:**

- `app/index.tsx` — Add `/register` redirect for users with `memberships.length === 0` who haven't completed onboarding. Keep role-specific fallbacks (`/club-setup`, `/free-agent/profile`, `/account-next-step`) for legacy users whose `registrationRole` is already set but no memberships (backward compat for existing accounts).
- `app/__tests__/index-routing.spec.tsx` — Add test: new users (no memberships, no `registrationRole` via a `needsRegistration` flag) route to `/register`.
- `src/context/AuthContext.tsx` — Expose a `needsRegistration` derived flag (true when signed in + user exists + `memberships.length === 0` + user has no non-null `displayName` or similar "fresh" signal). Approach: add a `hasCompletedOnboarding` state that flips true after `POST /me/onboarding` succeeds; `needsRegistration = isSignedIn && user && memberships.length === 0 && !hasCompletedOnboarding`.
- `src/api/client.ts` — No changes; existing `api()` handles the new endpoint.
- `src/i18n/en.ts`, `src/i18n/de.ts` — Add copy for register flow (role cards, step titles, CTAs, errors). Mirror the pattern; other locales get the English fallback via i18next defaults (we do not translate the full flow in this phase — DE parity is in Phase 4 copy pass).

**Note on `/club-setup`, `/free-agent/profile`, `/account-next-step`:** Keep them. They remain reachable from inside an established club (e.g., "create another team" calls `/club-setup` from admin dashboard). We only rewire the no-memberships entry point in `app/index.tsx`.

---

## Draft State Shape

```typescript
// src/context/OnboardingContext.tsx
import { RegistrationRole } from '@anstoss/shared'

export type OnboardingDraft = {
  registrationRole: RegistrationRole | null
  profile: {
    displayName: string
    dateOfBirth: string // YYYY-MM-DD
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
```

The context is mounted at `app/register/_layout.tsx` so draft state lives only while user is inside the flow, and resets on exit.

---

## Task 1: OnboardingContext + `_layout.tsx` + ProgressBar

**Files:**
- Create: `apps/mobile/src/context/OnboardingContext.tsx`
- Create: `apps/mobile/src/components/RegisterProgressBar.tsx`
- Create: `apps/mobile/app/register/_layout.tsx`
- Test: `apps/mobile/src/context/__tests__/OnboardingContext.spec.tsx`

- [ ] **Step 1: Write failing test for OnboardingContext**

```tsx
// apps/mobile/src/context/__tests__/OnboardingContext.spec.tsx
import { render } from '@testing-library/react-native'
import { act } from 'react-test-renderer'
import { Text, Pressable } from 'react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../OnboardingContext'

function Probe() {
  const { draft, setRole, setProfile } = useOnboardingDraft()
  return (
    <>
      <Text testID="role">{draft.registrationRole ?? 'NONE'}</Text>
      <Text testID="name">{draft.profile.displayName}</Text>
      <Pressable
        testID="set-role"
        onPress={() => setRole(RegistrationRole.CLUB_ADMIN)}
      >
        <Text>set</Text>
      </Pressable>
      <Pressable
        testID="set-profile"
        onPress={() =>
          setProfile({ displayName: 'Max', dateOfBirth: '1999-01-01', photoUrl: null })
        }
      >
        <Text>profile</Text>
      </Pressable>
    </>
  )
}

describe('OnboardingContext', () => {
  it('persists role and profile updates across renders', () => {
    const { getByTestId } = render(
      <OnboardingProvider>
        <Probe />
      </OnboardingProvider>,
    )

    expect(getByTestId('role').props.children).toBe('NONE')
    act(() => {
      getByTestId('set-role').props.onPress()
    })
    expect(getByTestId('role').props.children).toBe(RegistrationRole.CLUB_ADMIN)

    act(() => {
      getByTestId('set-profile').props.onPress()
    })
    expect(getByTestId('name').props.children).toBe('Max')
  })

  it('throws if used outside provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    function OrphanProbe() {
      useOnboardingDraft()
      return null
    }
    expect(() => render(<OrphanProbe />)).toThrow(
      /OnboardingProvider/,
    )
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern='OnboardingContext.spec' --watch=false`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement OnboardingContext**

```tsx
// apps/mobile/src/context/OnboardingContext.tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern='OnboardingContext.spec' --watch=false`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement RegisterProgressBar**

```tsx
// apps/mobile/src/components/RegisterProgressBar.tsx
import { StyleSheet, View } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { hairline, radius, space } from '../theme/tokens'

export type RegisterProgressBarProps = {
  step: 1 | 2 | 3
  totalSteps?: number
}

export function RegisterProgressBar({ step, totalSteps = 3 }: RegisterProgressBarProps) {
  const c = useClubColors()
  const ratio = Math.min(step / totalSteps, 1)

  return (
    <View style={[styles.track, { backgroundColor: c.surfaceSunken }]}>
      <View
        style={[
          styles.fill,
          { width: `${ratio * 100}%`, backgroundColor: c.primary },
        ]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: totalSteps, now: step }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: radius.sm,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    marginBottom: space.md,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.sm,
  },
})
```

- [ ] **Step 6: Implement `app/register/_layout.tsx`**

```tsx
// apps/mobile/app/register/_layout.tsx
import { Stack, useSegments } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StyleSheet, View } from 'react-native'
import { OnboardingProvider } from '../../src/context/OnboardingContext'
import { RegisterProgressBar } from '../../src/components/RegisterProgressBar'
import { useClubColors } from '../../src/context/ClubThemeContext'

function stepForSegments(segments: string[]): 1 | 2 | 3 {
  // segments after 'register': e.g. [], ['club'], ['finalize']
  const leaf = segments[segments.length - 1]
  if (leaf === 'finalize') return 3
  if (leaf === 'club' || leaf === 'join' || leaf === 'free-agent' || leaf === 'parent') return 2
  return 1
}

export default function RegisterLayout() {
  const segments = useSegments()
  const c = useClubColors()
  const step = stepForSegments(segments)

  return (
    <OnboardingProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
        <RegisterProgressBar step={step} />
        <View style={styles.body}>
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
        </View>
      </SafeAreaView>
    </OnboardingProvider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
})
```

- [ ] **Step 7: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

```bash
git add apps/mobile/src/context/OnboardingContext.tsx apps/mobile/src/context/__tests__/OnboardingContext.spec.tsx apps/mobile/src/components/RegisterProgressBar.tsx apps/mobile/app/register/_layout.tsx
git commit -m "feat(mobile): scaffold register flow layout, progress bar, and draft context"
```

---

## Task 2: Step 1 — role selection (`app/register/index.tsx`)

**Files:**
- Create: `apps/mobile/app/register/index.tsx`
- Test: `apps/mobile/app/__tests__/register-role-select.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/register-role-select.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import RoleSelect from '../register/index'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

function DraftProbe() {
  const { draft } = useOnboardingDraft()
  const React = require('react')
  const { Text } = require('react-native')
  return React.createElement(Text, { testID: 'draft-role' }, draft.registrationRole ?? 'NONE')
}

describe('register/index (Step 1: role selection)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('lists all five role cards', () => {
    const { getByText } = render(
      <OnboardingProvider>
        <RoleSelect />
      </OnboardingProvider>,
    )
    expect(getByText(/starting a club/i)).toBeTruthy()
    expect(getByText(/joining a club/i)).toBeTruthy()
    expect(getByText(/coaching/i)).toBeTruthy()
    expect(getByText(/looking for a club/i)).toBeTruthy()
    expect(getByText(/my child plays/i)).toBeTruthy()
  })

  it('selecting CLUB_ADMIN and continuing routes to /register/club', () => {
    const { getByText, getByTestId } = render(
      <OnboardingProvider>
        <RoleSelect />
        <DraftProbe />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/starting a club/i))
    expect(getByTestId('draft-role').props.children).toBe('CLUB_ADMIN')

    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/club')
  })

  it('selecting FREE_AGENT routes to /register/free-agent', () => {
    const { getByText } = render(
      <OnboardingProvider>
        <RoleSelect />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/looking for a club/i))
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/free-agent')
  })

  it('continue is disabled when no role selected', () => {
    const { getByText } = render(
      <OnboardingProvider>
        <RoleSelect />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern='register-role-select.spec' --watch=false`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `app/register/index.tsx`**

```tsx
// apps/mobile/app/register/index.tsx
import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { RegistrationRole } from '@anstoss/shared'
import { Screen, Card, Button, Text, Icon, type IconName } from '../../src/components/ui'
import { PressableScale } from '../../src/components/ui/PressableScale'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

type RoleCard = {
  role: RegistrationRole
  title: string
  body: string
  icon: IconName
  nextRoute: '/register/club' | '/register/join' | '/register/free-agent' | '/register/parent'
}

const ROLE_CARDS: RoleCard[] = [
  {
    role: RegistrationRole.CLUB_ADMIN,
    title: "I'm starting a club",
    body: 'Create a new club, pick a badge and colors, invite a first team.',
    icon: 'star.fill',
    nextRoute: '/register/club',
  },
  {
    role: RegistrationRole.PLAYER,
    title: "I'm joining a club",
    body: 'Use an invite code from a coach or club admin.',
    icon: 'person.2.fill',
    nextRoute: '/register/join',
  },
  {
    role: RegistrationRole.COACH,
    title: "I'm coaching",
    body: 'Join a club as head or assistant coach via invite.',
    icon: 'figure.stand',
    nextRoute: '/register/join',
  },
  {
    role: RegistrationRole.FREE_AGENT,
    title: "I'm looking for a club",
    body: 'Build a free-agent profile so clubs can find you.',
    icon: 'magnifyingglass',
    nextRoute: '/register/free-agent',
  },
  {
    role: RegistrationRole.PARENT,
    title: 'My child plays',
    body: 'Link to your child with an approval code.',
    icon: 'heart.fill',
    nextRoute: '/register/parent',
  },
]

export default function RoleSelectScreen() {
  const { draft, setRole } = useOnboardingDraft()
  const c = useClubColors()
  const [selectedRoute, setSelectedRoute] = useState<RoleCard['nextRoute'] | null>(null)

  const handleSelect = (card: RoleCard) => {
    setRole(card.role)
    setSelectedRoute(card.nextRoute)
  }

  const canContinue = draft.registrationRole !== null && selectedRoute !== null

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>How will you use Anstoss?</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Pick the option that fits best. You can change it later.
        </Text>

        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {ROLE_CARDS.map((card) => {
            const isSelected = draft.registrationRole === card.role
            return (
              <PressableScale key={card.role} onPress={() => handleSelect(card)}>
                <Card
                  padding="card"
                  style={{
                    borderWidth: hairline,
                    borderColor: isSelected ? c.primary : c.border,
                    gap: space.sm,
                  }}
                >
                  <View style={styles.cardHeader}>
                    <Icon name={card.icon} size="lg" color={isSelected ? 'primary' : 'textPrimary'} />
                    <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{card.title}</Text>
                  </View>
                  <Text style={[styles.cardBody, { color: c.textSecondary }]}>{card.body}</Text>
                </Card>
              </PressableScale>
            )
          })}
        </View>

        <View style={styles.actions}>
          <Button
            label="Continue"
            variant="filled"
            size="lg"
            fullWidth
            disabled={!canContinue}
            onPress={() => {
              if (canContinue) router.replace(selectedRoute)
            }}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingBottom: space.xl },
  title: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  subtitle: { fontSize: fontSize.md, fontFamily: fonts.body, marginTop: space.xs },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { fontSize: fontSize.lg, fontFamily: fonts.heading },
  cardBody: { fontSize: fontSize.sm, fontFamily: fonts.body },
  actions: { marginTop: space.xl },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern='register-role-select.spec' --watch=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/register/index.tsx apps/mobile/app/__tests__/register-role-select.spec.tsx
git commit -m "feat(mobile): role selection screen for register flow"
```

---

## Task 3: Step 2 — CLUB_ADMIN branch (`app/register/club.tsx`)

**Files:**
- Create: `apps/mobile/app/register/club.tsx`
- Test: `apps/mobile/app/__tests__/register-club-branch.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/register-club-branch.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import ClubBranch from '../register/club'
import { useEffect } from 'react'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

jest.mock('../../src/components/BadgeUploadPicker', () => {
  const { Pressable, Text } = require('react-native')
  return {
    BadgeUploadPicker: ({ onChange }: { onChange: (url: string | null) => void }) => (
      <Pressable testID="badge-picker" onPress={() => onChange('https://cdn/badge.png')}>
        <Text>pick</Text>
      </Pressable>
    ),
  }
})

function SetRole({ role }: { role: RegistrationRole }) {
  const { setRole } = useOnboardingDraft()
  useEffect(() => { setRole(role) }, [role, setRole])
  return null
}

function DraftProbe() {
  const { draft } = useOnboardingDraft()
  const { Text } = require('react-native')
  return (
    <>
      <Text testID="club-name">{draft.clubCreate?.name ?? ''}</Text>
      <Text testID="team-name">{draft.clubCreate?.firstTeamName ?? ''}</Text>
      <Text testID="primary">{draft.clubCreate?.primaryColor ?? ''}</Text>
    </>
  )
}

describe('register/club (Step 2 CLUB_ADMIN)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires club name and first-team name before continue', () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingProvider>
        <SetRole role={RegistrationRole.CLUB_ADMIN} />
        <ClubBranch />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(getByPlaceholderText(/club name/i), 'FC Musterstadt')
    fireEvent.changeText(getByPlaceholderText(/first team/i), 'Herren')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/finalize')
  })

  it('persists draft entries and routes forward', () => {
    const { getByText, getByPlaceholderText, getByTestId } = render(
      <OnboardingProvider>
        <SetRole role={RegistrationRole.CLUB_ADMIN} />
        <ClubBranch />
        <DraftProbe />
      </OnboardingProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(/club name/i), 'SC Sample')
    fireEvent.changeText(getByPlaceholderText(/first team/i), 'Herren 1')
    fireEvent.press(getByText(/continue/i))

    expect(getByTestId('club-name').props.children).toBe('SC Sample')
    expect(getByTestId('team-name').props.children).toBe('Herren 1')
    expect(getByTestId('primary').props.children).toMatch(/^#[0-9A-F]{6}$/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern='register-club-branch.spec' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implement `app/register/club.tsx`**

```tsx
// apps/mobile/app/register/club.tsx
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { Screen, Card, Button, Text } from '../../src/components/ui'
import { BadgeUploadPicker } from '../../src/components/BadgeUploadPicker'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

const PRESET_COLORS = [
  '#1E3A5F', '#C4372C', '#2D7A3A', '#1A1A18', '#B8860B',
  '#6B3FA0', '#E85D04', '#0077B6', '#800020', '#2F4F4F',
]

export default function ClubBranchScreen() {
  const { draft, setClubCreate } = useOnboardingDraft()
  const c = useClubColors()

  const [name, setName] = useState(draft.clubCreate?.name ?? '')
  const [primaryColor, setPrimaryColor] = useState(draft.clubCreate?.primaryColor ?? PRESET_COLORS[0])
  const [badgeUrl, setBadgeUrl] = useState<string | null>(draft.clubCreate?.badgeUrl ?? null)
  const [welcomeText, setWelcomeText] = useState(draft.clubCreate?.welcomeText ?? '')
  const [firstTeamName, setFirstTeamName] = useState(draft.clubCreate?.firstTeamName ?? '')

  const canContinue = useMemo(
    () => name.trim().length >= 2 && firstTeamName.trim().length >= 1,
    [name, firstTeamName],
  )

  const handleContinue = () => {
    if (!canContinue) return
    setClubCreate({
      name: name.trim(),
      primaryColor,
      badgeUrl: badgeUrl ?? undefined,
      welcomeText: welcomeText.trim() || undefined,
      firstTeamName: firstTeamName.trim(),
    })
    router.replace('/register/finalize')
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Tell us about your club</Text>

        <Card padding="card" style={{ marginTop: space.md, gap: space.md }}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Club name</Text>
            <TextInput
              placeholder="Club name"
              value={name}
              onChangeText={setName}
              style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textMuted}
              maxLength={80}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Badge</Text>
            <BadgeUploadPicker value={badgeUrl} onChange={setBadgeUrl} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Primary color</Text>
            <View style={styles.colorRow}>
              {PRESET_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => setPrimaryColor(color)}
                  accessibilityRole="button"
                  accessibilityLabel={`Pick color ${color}`}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: color,
                      borderWidth: primaryColor === color ? 3 : hairline,
                      borderColor: primaryColor === color ? c.primary : c.border,
                    },
                  ]}
                />
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Welcome text (optional)</Text>
            <TextInput
              placeholder="Short welcome message shown on the club home."
              value={welcomeText}
              onChangeText={setWelcomeText}
              multiline
              maxLength={500}
              style={[styles.textarea, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textMuted}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>First team name</Text>
            <TextInput
              placeholder="First team (e.g. Herren 1)"
              value={firstTeamName}
              onChangeText={setFirstTeamName}
              style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textMuted}
              maxLength={80}
            />
          </View>
        </Card>

        <View style={styles.actions}>
          <Button
            label="Continue"
            variant="filled"
            size="lg"
            fullWidth
            disabled={!canContinue}
            onPress={handleContinue}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingBottom: space.xl },
  title: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  field: { gap: space.xs },
  label: { fontSize: fontSize.sm, fontFamily: fonts.body },
  input: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  textarea: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 32, height: 32, borderRadius: radius.full },
  actions: { marginTop: space.xl },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern='register-club-branch.spec' --watch=false`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/register/club.tsx apps/mobile/app/__tests__/register-club-branch.spec.tsx
git commit -m "feat(mobile): CLUB_ADMIN branch for register flow"
```

---

## Task 4: Step 2 — PLAYER/COACH join branch (`app/register/join.tsx`)

**Files:**
- Create: `apps/mobile/app/register/join.tsx`
- Test: `apps/mobile/app/__tests__/register-join-branch.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/register-join-branch.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import JoinBranch from '../register/join'
import { useEffect } from 'react'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

function SetRole({ role }: { role: RegistrationRole }) {
  const { setRole } = useOnboardingDraft()
  useEffect(() => { setRole(role) }, [role, setRole])
  return null
}

function DraftProbe() {
  const { draft } = useOnboardingDraft()
  const { Text } = require('react-native')
  return <Text testID="invite">{draft.join?.inviteCode ?? ''}</Text>
}

describe('register/join (Step 2 PLAYER/COACH)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires an invite code of at least 4 characters', () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingProvider>
        <SetRole role={RegistrationRole.PLAYER} />
        <JoinBranch />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(getByPlaceholderText(/invite code/i), 'abc')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(getByPlaceholderText(/invite code/i), 'ABCD1234')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/finalize')
  })

  it('persists invite code to draft', () => {
    const { getByText, getByPlaceholderText, getByTestId } = render(
      <OnboardingProvider>
        <SetRole role={RegistrationRole.COACH} />
        <JoinBranch />
        <DraftProbe />
      </OnboardingProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(/invite code/i), 'COACH99')
    fireEvent.press(getByText(/continue/i))
    expect(getByTestId('invite').props.children).toBe('COACH99')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern='register-join-branch.spec' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implement `app/register/join.tsx`**

```tsx
// apps/mobile/app/register/join.tsx
import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { Screen, Card, Button, Text } from '../../src/components/ui'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

export default function JoinBranchScreen() {
  const { draft, setJoin } = useOnboardingDraft()
  const c = useClubColors()
  const [inviteCode, setInviteCode] = useState(draft.join?.inviteCode ?? '')

  const trimmed = inviteCode.trim()
  const canContinue = useMemo(() => trimmed.length >= 4 && trimmed.length <= 32, [trimmed])

  const handleContinue = () => {
    if (!canContinue) return
    setJoin({ inviteCode: trimmed })
    router.replace('/register/finalize')
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Enter your invite code</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Your coach or club admin sent you a short code. Club search comes in a later update.
        </Text>

        <Card padding="card" style={{ marginTop: space.md, gap: space.sm }}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Invite code</Text>
          <TextInput
            placeholder="Invite code"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
            placeholderTextColor={c.textMuted}
            maxLength={32}
          />
        </Card>

        <View style={styles.actions}>
          <Button
            label="Continue"
            variant="filled"
            size="lg"
            fullWidth
            disabled={!canContinue}
            onPress={handleContinue}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingBottom: space.xl },
  title: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  subtitle: { fontSize: fontSize.md, fontFamily: fonts.body, marginTop: space.xs },
  label: { fontSize: fontSize.sm, fontFamily: fonts.body },
  input: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  actions: { marginTop: space.xl },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern='register-join-branch.spec' --watch=false`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/register/join.tsx apps/mobile/app/__tests__/register-join-branch.spec.tsx
git commit -m "feat(mobile): PLAYER/COACH join branch for register flow"
```

---

## Task 5: Step 2 — FREE_AGENT branch (`app/register/free-agent.tsx`)

**Files:**
- Create: `apps/mobile/app/register/free-agent.tsx`
- Test: `apps/mobile/app/__tests__/register-free-agent-branch.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/register-free-agent-branch.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import FreeAgentBranch from '../register/free-agent'
import { useEffect } from 'react'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

function SetRole() {
  const { setRole } = useOnboardingDraft()
  useEffect(() => { setRole(RegistrationRole.FREE_AGENT) }, [setRole])
  return null
}

function DraftProbe() {
  const { draft } = useOnboardingDraft()
  const { Text } = require('react-native')
  return (
    <>
      <Text testID="positions">{(draft.freeAgent?.position ?? []).join(',')}</Text>
      <Text testID="city">{draft.freeAgent?.location ?? ''}</Text>
      <Text testID="years">{String(draft.freeAgent?.experienceYears ?? '')}</Text>
    </>
  )
}

describe('register/free-agent (Step 2 FREE_AGENT)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires at least one position and location before continue', () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingProvider>
        <SetRole />
        <FreeAgentBranch />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.press(getByText(/^midfielder$/i))
    fireEvent.changeText(getByPlaceholderText(/city/i), 'Berlin')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/finalize')
  })

  it('persists chosen positions and fields', () => {
    const { getByText, getByPlaceholderText, getByTestId } = render(
      <OnboardingProvider>
        <SetRole />
        <FreeAgentBranch />
        <DraftProbe />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/^defender$/i))
    fireEvent.press(getByText(/^forward$/i))
    fireEvent.changeText(getByPlaceholderText(/city/i), 'Munich')
    fireEvent.changeText(getByPlaceholderText(/years of experience/i), '5')
    fireEvent.press(getByText(/continue/i))

    expect(getByTestId('positions').props.children).toBe('DEF,FWD')
    expect(getByTestId('city').props.children).toBe('Munich')
    expect(getByTestId('years').props.children).toBe('5')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern='register-free-agent-branch.spec' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implement `app/register/free-agent.tsx`**

```tsx
// apps/mobile/app/register/free-agent.tsx
import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { PlayerPosition } from '@anstoss/shared'
import { Screen, Card, Button, Text } from '../../src/components/ui'
import { PressableScale } from '../../src/components/ui/PressableScale'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

const POSITIONS: { value: PlayerPosition; label: string }[] = [
  { value: PlayerPosition.GK, label: 'Goalkeeper' },
  { value: PlayerPosition.DEF, label: 'Defender' },
  { value: PlayerPosition.MID, label: 'Midfielder' },
  { value: PlayerPosition.FWD, label: 'Forward' },
]

export default function FreeAgentBranchScreen() {
  const { draft, setFreeAgent } = useOnboardingDraft()
  const c = useClubColors()

  const [selectedPositions, setSelectedPositions] = useState<string[]>(draft.freeAgent?.position ?? [])
  const [location, setLocation] = useState(draft.freeAgent?.location ?? '')
  const [experienceYearsText, setExperienceYearsText] = useState(
    draft.freeAgent?.experienceYears != null ? String(draft.freeAgent.experienceYears) : '',
  )
  const [availableForTrials, setAvailableForTrials] = useState(draft.freeAgent?.availableForTrials ?? true)
  const [bio, setBio] = useState(draft.freeAgent?.bio ?? '')

  const togglePosition = (value: PlayerPosition) => {
    setSelectedPositions((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    )
  }

  const experienceYears = Number.parseInt(experienceYearsText, 10)
  const canContinue = useMemo(
    () =>
      selectedPositions.length >= 1 &&
      location.trim().length >= 1 &&
      Number.isFinite(experienceYears) &&
      experienceYears >= 0 &&
      experienceYears <= 50,
    [selectedPositions, location, experienceYears],
  )

  const handleContinue = () => {
    if (!canContinue) return
    setFreeAgent({
      position: selectedPositions,
      experienceYears,
      location: location.trim(),
      availableForTrials,
      bio: bio.trim(),
    })
    router.replace('/register/finalize')
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Your free-agent profile</Text>

        <Card padding="card" style={{ marginTop: space.md, gap: space.md }}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Positions (pick one or more)</Text>
            <View style={styles.chipRow}>
              {POSITIONS.map((opt) => {
                const selected = selectedPositions.includes(opt.value)
                return (
                  <PressableScale key={opt.value} onPress={() => togglePosition(opt.value)}>
                    <View
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? c.primary : c.border,
                          backgroundColor: selected ? c.primarySoft : c.surface,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? c.primary : c.textPrimary }}>{opt.label}</Text>
                    </View>
                  </PressableScale>
                )
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>City</Text>
            <TextInput
              placeholder="City"
              value={location}
              onChangeText={setLocation}
              style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textMuted}
              maxLength={120}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Years of experience</Text>
            <TextInput
              placeholder="Years of experience"
              value={experienceYearsText}
              onChangeText={(v) => setExperienceYearsText(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textMuted}
            />
          </View>

          <View style={[styles.field, styles.toggleRow]}>
            <Text style={[styles.label, { color: c.textPrimary }]}>Open to trials</Text>
            <Switch value={availableForTrials} onValueChange={setAvailableForTrials} />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Short bio (optional)</Text>
            <TextInput
              placeholder="A few lines about yourself."
              value={bio}
              onChangeText={setBio}
              multiline
              maxLength={500}
              style={[styles.textarea, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textMuted}
            />
          </View>
        </Card>

        <View style={styles.actions}>
          <Button
            label="Continue"
            variant="filled"
            size="lg"
            fullWidth
            disabled={!canContinue}
            onPress={handleContinue}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingBottom: space.xl },
  title: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  field: { gap: space.xs },
  label: { fontSize: fontSize.sm, fontFamily: fonts.body },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  input: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  textarea: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { marginTop: space.xl },
})
```

> **Implementer note:** `c.primarySoft` and `c.textMuted` may or may not exist on the Club colors object. If they don't, use the nearest existing token (e.g., `c.surfaceSunken` and `c.textSecondary`). Check `src/context/ClubThemeContext.tsx` before picking.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern='register-free-agent-branch.spec' --watch=false`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/register/free-agent.tsx apps/mobile/app/__tests__/register-free-agent-branch.spec.tsx
git commit -m "feat(mobile): FREE_AGENT branch for register flow"
```

---

## Task 6: Step 2 — PARENT branch (`app/register/parent.tsx`)

**Files:**
- Create: `apps/mobile/app/register/parent.tsx`
- Test: `apps/mobile/app/__tests__/register-parent-branch.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/register-parent-branch.spec.tsx
import { fireEvent, render } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import ParentBranch from '../register/parent'
import { useEffect } from 'react'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

function SetRole() {
  const { setRole } = useOnboardingDraft()
  useEffect(() => { setRole(RegistrationRole.PARENT) }, [setRole])
  return null
}

function DraftProbe() {
  const { draft } = useOnboardingDraft()
  const { Text } = require('react-native')
  return <Text testID="code">{draft.parentLink?.approvalInviteCode ?? ''}</Text>
}

describe('register/parent (Step 2 PARENT)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requires approval code of at least 4 chars', () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingProvider>
        <SetRole />
        <ParentBranch />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(getByPlaceholderText(/approval code/i), 'OK1')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).not.toHaveBeenCalled()

    fireEvent.changeText(getByPlaceholderText(/approval code/i), 'PARENT1234')
    fireEvent.press(getByText(/continue/i))
    expect(mockReplace).toHaveBeenCalledWith('/register/finalize')
  })

  it('persists code to draft', () => {
    const { getByText, getByPlaceholderText, getByTestId } = render(
      <OnboardingProvider>
        <SetRole />
        <ParentBranch />
        <DraftProbe />
      </OnboardingProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(/approval code/i), 'LINK9999')
    fireEvent.press(getByText(/continue/i))
    expect(getByTestId('code').props.children).toBe('LINK9999')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern='register-parent-branch.spec' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implement `app/register/parent.tsx`**

```tsx
// apps/mobile/app/register/parent.tsx
import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { Screen, Card, Button, Text } from '../../src/components/ui'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

export default function ParentBranchScreen() {
  const { draft, setParentLink } = useOnboardingDraft()
  const c = useClubColors()
  const [approvalCode, setApprovalCode] = useState(draft.parentLink?.approvalInviteCode ?? '')

  const trimmed = approvalCode.trim()
  const canContinue = useMemo(() => trimmed.length >= 4 && trimmed.length <= 32, [trimmed])

  const handleContinue = () => {
    if (!canContinue) return
    setParentLink({ approvalInviteCode: trimmed })
    router.replace('/register/finalize')
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Link to your child</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Ask your child's coach to send you an approval code. Linking by email comes in a later update.
        </Text>

        <Card padding="card" style={{ marginTop: space.md, gap: space.sm }}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Approval code</Text>
          <TextInput
            placeholder="Approval code"
            value={approvalCode}
            onChangeText={setApprovalCode}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
            placeholderTextColor={c.textMuted}
            maxLength={32}
          />
        </Card>

        <View style={styles.actions}>
          <Button
            label="Continue"
            variant="filled"
            size="lg"
            fullWidth
            disabled={!canContinue}
            onPress={handleContinue}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingBottom: space.xl },
  title: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  subtitle: { fontSize: fontSize.md, fontFamily: fonts.body, marginTop: space.xs },
  label: { fontSize: fontSize.sm, fontFamily: fonts.body },
  input: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  actions: { marginTop: space.xl },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern='register-parent-branch.spec' --watch=false`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/register/parent.tsx apps/mobile/app/__tests__/register-parent-branch.spec.tsx
git commit -m "feat(mobile): PARENT branch for register flow"
```

---

## Task 7: Step 3 — profile finalization + submit (`app/register/finalize.tsx`)

**Files:**
- Create: `apps/mobile/app/register/finalize.tsx`
- Test: `apps/mobile/app/__tests__/register-finalize.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/register-finalize.spec.tsx
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import { OnboardingProvider, useOnboardingDraft } from '../../src/context/OnboardingContext'
import FinalizeScreen from '../register/finalize'
import { useEffect } from 'react'

const mockReplace = jest.fn()
const mockApi = jest.fn()
const mockRefreshUser = jest.fn(() => Promise.resolve())

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}))

function SeedClubAdminDraft() {
  const { setRole, setClubCreate } = useOnboardingDraft()
  useEffect(() => {
    setRole(RegistrationRole.CLUB_ADMIN)
    setClubCreate({
      name: 'FC Musterstadt',
      primaryColor: '#1E3A5F',
      firstTeamName: 'Herren 1',
    })
  }, [setRole, setClubCreate])
  return null
}

describe('register/finalize (Step 3)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockApi.mockResolvedValue({ user: { id: 'u1' } })
  })

  it('submits the full discriminated-union payload on complete', async () => {
    const { getByText, getByPlaceholderText } = render(
      <OnboardingProvider>
        <SeedClubAdminDraft />
        <FinalizeScreen />
      </OnboardingProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(/display name/i), 'Max Mustermann')
    fireEvent.changeText(getByPlaceholderText(/date of birth/i), '01.01.1999')
    fireEvent.press(getByText(/finish/i))

    await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1))
    expect(mockApi).toHaveBeenCalledWith('/me/onboarding', {
      method: 'POST',
      body: {
        registrationRole: 'CLUB_ADMIN',
        profile: {
          displayName: 'Max Mustermann',
          dateOfBirth: '1999-01-01',
        },
        clubCreate: {
          name: 'FC Musterstadt',
          primaryColor: '#1E3A5F',
          firstTeamName: 'Herren 1',
        },
      },
    })
    await waitFor(() => expect(mockRefreshUser).toHaveBeenCalled())
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('blocks submit when display name or DOB missing', () => {
    const { getByText } = render(
      <OnboardingProvider>
        <SeedClubAdminDraft />
        <FinalizeScreen />
      </OnboardingProvider>,
    )
    fireEvent.press(getByText(/finish/i))
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('shows inline error when API rejects', async () => {
    const { ApiError } = jest.requireMock('../../src/api/client') as { ApiError: new (m?: string) => Error }
    mockApi.mockRejectedValueOnce(new ApiError('Invite code invalid'))

    const { getByText, getByPlaceholderText, findByText } = render(
      <OnboardingProvider>
        <SeedClubAdminDraft />
        <FinalizeScreen />
      </OnboardingProvider>,
    )
    fireEvent.changeText(getByPlaceholderText(/display name/i), 'Max')
    fireEvent.changeText(getByPlaceholderText(/date of birth/i), '01.01.1999')
    fireEvent.press(getByText(/finish/i))

    expect(await findByText(/Invite code invalid/)).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern='register-finalize.spec' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Implement `app/register/finalize.tsx`**

```tsx
// apps/mobile/app/register/finalize.tsx
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { RegistrationRole, completeOnboardingSchema } from '@anstoss/shared'
import { Screen, Card, Button, Text, Icon } from '../../src/components/ui'
import { InlineError } from '../../src/components/InlineError'
import { useOnboardingDraft } from '../../src/context/OnboardingContext'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api, ApiError } from '../../src/api/client'
import {
  formatDateOfBirthInput,
  parseDateOfBirthInput,
} from '../../src/utils/dateOfBirth'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

export default function FinalizeScreen() {
  const { draft, reset } = useOnboardingDraft()
  const { refreshUser } = useAuth()
  const c = useClubColors()

  const [displayName, setDisplayName] = useState(draft.profile.displayName)
  const [dobText, setDobText] = useState(
    draft.profile.dateOfBirth ? toDisplayDob(draft.profile.dateOfBirth) : '',
  )
  const [photoUrl, setPhotoUrl] = useState<string | null>(draft.profile.photoUrl)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedDob = useMemo(() => parseDateOfBirthInput(dobText), [dobText])
  const canSubmit = displayName.trim().length >= 1 && parsedDob !== null && !submitting

  const handleSubmit = async () => {
    setError(null)
    if (!canSubmit || !parsedDob || !draft.registrationRole) {
      setError('Fill in your display name and date of birth to continue.')
      return
    }

    const profile = {
      displayName: displayName.trim(),
      dateOfBirth: parsedDob.iso,
      ...(photoUrl ? { photoUrl } : {}),
    }

    const payload = buildPayload(draft, profile)
    if (!payload) {
      setError('Something about your details does not match what we expected. Go back and review.')
      return
    }

    const parsed = completeOnboardingSchema.safeParse(payload)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please review your details and try again.')
      return
    }

    setSubmitting(true)
    try {
      await api('/me/onboarding', { method: 'POST', body: parsed.data })
      await refreshUser()
      reset()
      router.replace('/')
    } catch (e) {
      if (e instanceof ApiError && e.message) {
        setError(e.message)
      } else {
        setError('We could not finish setup. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: c.textPrimary }]}>One last thing</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          This is how teammates and coaches will recognize you.
        </Text>

        <Card padding="card" style={{ marginTop: space.md, gap: space.md }}>
          <PhotoPicker value={photoUrl} onChange={setPhotoUrl} />

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Display name</Text>
            <TextInput
              placeholder="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textMuted}
              maxLength={80}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: c.textSecondary }]}>Date of birth</Text>
            <TextInput
              placeholder="Date of birth (DD.MM.YYYY)"
              value={dobText}
              onChangeText={(v) => setDobText(formatDateOfBirthInput(v))}
              keyboardType="number-pad"
              style={[styles.input, { color: c.textPrimary, borderColor: c.border }]}
              placeholderTextColor={c.textMuted}
              maxLength={10}
            />
          </View>

          {error ? <InlineError message={error} /> : null}
        </Card>

        <View style={styles.actions}>
          <Button
            label={submitting ? 'Finishing…' : 'Finish'}
            variant="filled"
            size="lg"
            fullWidth
            disabled={!canSubmit}
            onPress={() => void handleSubmit()}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

function PhotoPicker({
  value,
  onChange,
}: {
  value: string | null
  onChange: (url: string | null) => void
}) {
  const c = useClubColors()
  // MVP: no upload yet — keep profile photo optional per spec.
  // A real upload flow will land in Phase 4 polish via the existing avatar pipeline.
  return (
    <Pressable
      onPress={() => onChange(value ? null : 'https://placehold.co/512.png')}
      accessibilityRole="button"
      accessibilityLabel={value ? 'Remove profile photo' : 'Add profile photo'}
      style={styles.photoStub}
    >
      <View style={[styles.photoCircle, { borderColor: c.border }]}>
        <Icon name={value ? 'xmark' : 'camera.fill'} size="lg" color="textSecondary" />
      </View>
      <Text style={{ color: c.textSecondary, fontFamily: fonts.body }}>
        {value ? 'Remove photo' : 'Add photo (optional)'}
      </Text>
    </Pressable>
  )
}

function toDisplayDob(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

type SubmittedProfile = {
  displayName: string
  dateOfBirth: string
  photoUrl?: string
}

function buildPayload(
  draft: ReturnType<typeof useOnboardingDraft>['draft'],
  profile: SubmittedProfile,
): unknown {
  switch (draft.registrationRole) {
    case RegistrationRole.CLUB_ADMIN:
      if (!draft.clubCreate) return null
      return { registrationRole: 'CLUB_ADMIN', profile, clubCreate: draft.clubCreate }
    case RegistrationRole.COACH:
      if (!draft.join) return null
      return { registrationRole: 'COACH', profile, join: draft.join }
    case RegistrationRole.PLAYER:
      if (!draft.join) return null
      return { registrationRole: 'PLAYER', profile, join: draft.join }
    case RegistrationRole.PARENT:
      if (!draft.parentLink) return null
      return { registrationRole: 'PARENT', profile, parentLink: draft.parentLink }
    case RegistrationRole.FREE_AGENT:
      if (!draft.freeAgent) return null
      return { registrationRole: 'FREE_AGENT', profile, freeAgent: draft.freeAgent }
    default:
      return null
  }
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, paddingBottom: space.xl },
  title: { fontSize: fontSize.xl, fontFamily: fonts.heading },
  subtitle: { fontSize: fontSize.md, fontFamily: fonts.body, marginTop: space.xs },
  field: { gap: space.xs },
  label: { fontSize: fontSize.sm, fontFamily: fonts.body },
  input: {
    borderWidth: hairline,
    borderRadius: radius.md,
    padding: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  photoStub: { alignItems: 'center', gap: space.xs },
  photoCircle: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    borderWidth: hairline * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { marginTop: space.xl },
})
```

> **Note on photo upload:** This MVP uses a stub that toggles a placeholder URL. A real avatar upload via the existing avatar pipeline (see `app/edit-profile.tsx` / `app/free-agent/profile.tsx` for R2 presign pattern) is intentionally deferred to Phase 4. The `photoUrl` field is optional in `completeOnboardingSchema`, so omitting a real uploader does not block submission.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern='register-finalize.spec' --watch=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/register/finalize.tsx apps/mobile/app/__tests__/register-finalize.spec.tsx
git commit -m "feat(mobile): finalize step submits to POST /me/onboarding"
```

---

## Task 8: Wire entry in `app/index.tsx` + update routing tests

**Files:**
- Modify: `apps/mobile/src/context/AuthContext.tsx`
- Modify: `apps/mobile/app/index.tsx`
- Modify: `apps/mobile/app/__tests__/index-routing.spec.tsx`

- [ ] **Step 1: Add `needsRegistration` flag to AuthContext**

Read `src/context/AuthContext.tsx`. Identify where the `User` type is defined and where `memberships` / `user` are exposed on `AuthState`. Add:

```typescript
// In AuthState type:
needsRegistration: boolean

// Derivation inside AuthProvider (near isLoading / needsOnboarding derivations):
const needsRegistration = useMemo(
  () =>
    Boolean(
      !isLoading &&
        clerkSignedIn &&
        user &&
        memberships.length === 0 &&
        !user.dateOfBirth, // signal: JIT-created user who hasn't completed onboarding
    ),
  [isLoading, clerkSignedIn, user, memberships.length],
)
```

> **Implementer note:** If the current `User` type on the mobile side does NOT include `dateOfBirth`, extend it to match the `/me` API response shape. Check `src/api/client.ts` and the `GET /me` endpoint consumer in AuthContext. The signal `!user.dateOfBirth` is the strongest "fresh user" marker because DOB is only set by either (a) `/enter-dob` or (b) the new onboarding flow.
>
> If `dateOfBirth` isn't reachable there, fall back to `!user.displayName || user.displayName === user.email` — whatever field is most reliably blank on JIT-created users. Do NOT invent a new backend flag; lean on existing user shape.

Expose `needsRegistration` in the context value.

- [ ] **Step 2: Update `app/index.tsx` to route to `/register`**

```tsx
// apps/mobile/app/index.tsx
import { ActivityIndicator, View, StyleSheet } from 'react-native'
import { Redirect } from 'expo-router'
import { useAuth } from '../src/context/AuthContext'
import { neutralColors } from '../src/theme/tokens'

export default function Index() {
  const {
    isLoading,
    isSignedIn,
    memberships,
    ageGate,
    needsOnboarding,
    needsRegistration,
    user,
  } = useAuth()

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={neutralColors.textPrimary} />
      </View>
    )
  }

  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />
  }

  if (ageGate?.status === 'DOB_REQUIRED') {
    return <Redirect href="/enter-dob" />
  }

  if (ageGate?.status === 'PENDING_PARENT_APPROVAL') {
    return <Redirect href="/pending-approval" />
  }

  if (ageGate?.status === 'BLOCKED') {
    return <Redirect href="/access-blocked" />
  }

  if (needsRegistration) {
    return <Redirect href="/register" />
  }

  if (memberships.length === 0) {
    if (user?.registrationRole === 'FREE_AGENT') {
      return <Redirect href="/free-agent/profile" />
    }

    if (user?.registrationRole === 'CLUB_ADMIN') {
      return <Redirect href="/club-setup" />
    }

    return <Redirect href="/account-next-step" />
  }

  if (needsOnboarding) {
    return <Redirect href="/onboarding" />
  }

  return <Redirect href="/(tabs)" />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: neutralColors.background,
  },
})
```

- [ ] **Step 3: Add failing test to `index-routing.spec.tsx`**

Add these cases at the bottom of the existing `describe` block:

```tsx
it('routes new users (needsRegistration) to /register', () => {
  mockUseAuth.mockReturnValue({
    isLoading: false,
    isSignedIn: true,
    memberships: [],
    ageGate: null,
    needsOnboarding: false,
    needsRegistration: true,
    user: { registrationRole: null },
  })

  const { getByText } = render(<Index />)
  expect(getByText('/register')).toBeTruthy()
})

it('falls back to legacy club-setup when registrationRole is CLUB_ADMIN and needsRegistration is false', () => {
  mockUseAuth.mockReturnValue({
    isLoading: false,
    isSignedIn: true,
    memberships: [],
    ageGate: null,
    needsOnboarding: false,
    needsRegistration: false,
    user: { registrationRole: 'CLUB_ADMIN' },
  })
  const { getByText } = render(<Index />)
  expect(getByText('/club-setup')).toBeTruthy()
})
```

Existing tests may need `needsRegistration: false` added to their `mockUseAuth.mockReturnValue` — update all of them to include the new field.

- [ ] **Step 4: Run tests**

Run: `npm test -- --testPathPattern='index-routing.spec' --watch=false`
Expected: PASS.

- [ ] **Step 5: Full typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/context/AuthContext.tsx apps/mobile/app/index.tsx apps/mobile/app/__tests__/index-routing.spec.tsx
git commit -m "feat(mobile): route fresh signups through /register onboarding flow"
```

---

## Task 9: Full-suite test + typecheck + PR

- [ ] **Step 1: Mobile test suite**

Run: `cd apps/mobile && npm test -- --watch=false`
Expected: All suites that existed before this plan still pass. New register suites pass. Do not attempt to fix the four pre-existing failing suites (`home-role-behavior`, `more-tab`, `home-stats-layout`, `admin-dashboard`) — they were failing before Phase 3a per the Phase 2 PR.

- [ ] **Step 2: Shared workspace typecheck (should be untouched)**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: API workspace typecheck (should be untouched)**

Run: `cd apps/api && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Push to branch**

Assumes branch `feat/renuir-design-revamp` is checked out and tracked.

```bash
git push origin feat/renuir-design-revamp
```

- [ ] **Step 5: Update PR #3 description**

Append a "Phase 3a" section to the existing PR body describing the new `/register` route tree and the eight tasks shipped.

---

## Self-review checklist

- Every task has a failing test before implementation (TDD).
- Every task ends with a commit step.
- No placeholder strings or "TODO" markers in step contents.
- Discriminated-union payload shape in Task 7 matches `completeOnboardingSchema` in `packages/shared/src/schemas/auth.ts` exactly: `{ registrationRole, profile: { displayName, dateOfBirth, photoUrl? }, (clubCreate | join | parentLink | freeAgent) }`.
- DOB parsing reuses existing `formatDateOfBirthInput` / `parseDateOfBirthInput` utilities — no new date logic.
- `BadgeUploadPicker` is imported, not reimplemented, in the CLUB_ADMIN branch.
- `PlayerPosition` enum from `@anstoss/shared` drives the FREE_AGENT chips; no hardcoded strings.
- Tests mock `expo-router`, `api/client`, and `AuthContext` consistently; no real network calls.
- Photo upload is intentionally a stub (documented) — real upload is out of scope per the spec's "profile finalization" step which only lists photo/name/DOB as fields.
- Routing: existing legacy redirects remain for backward-compat with users who already chose `registrationRole` before this flow shipped.
- Progress bar reflects the step: `index` → 1/3, any `club/join/parent/free-agent` → 2/3, `finalize` → 3/3. Back navigation uses the Stack's native back.
