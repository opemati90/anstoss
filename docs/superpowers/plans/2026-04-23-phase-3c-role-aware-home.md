# Phase 3c — Role-aware Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic `app/(tabs)/index.tsx` with a thin branching shell that renders a role-appropriate home layout (OWNER/CLUB_ADMIN, COACH, PLAYER, PARENT, FREE_AGENT) per spec §4.3, behind a feature flag with a safe fallback to the current screen.

**Architecture:** A feature-flagged `HomeScreen` at `app/(tabs)/index.tsx` that — when the flag is on — renders `HomeHeader` (club badge, name, notification bell, role chip) plus one of five role layouts from `apps/mobile/src/components/home/<Role>Home.tsx`. An `HomeErrorBoundary` around the new branch falls back to a `LegacyHomeScreen` (the pre-3c implementation, preserved verbatim in `apps/mobile/src/components/home/LegacyHomeScreen.tsx`) if anything throws. Each role layout fetches only the data it needs via the existing `api` client and renders shared UI primitives from `apps/mobile/src/components/ui/`.

**Tech Stack:** Expo Router, React (hooks + Context), existing `api` client, `@anstoss/shared` `MembershipRole` + `RegistrationRole` enums, existing UI primitives (`Text`, `Icon`, `Card`, `Banner`, `StatusPill`, `Screen`, `PressableScale`), `useSafeAreaInsets` wrapped via `SafeAreaProvider` in tests.

---

## File Structure

**New files (all under `apps/mobile/`):**

- `src/utils/featureFlags.ts` — Tiny feature-flag registry. Exports `isFeatureEnabled(name)` and a typed `FeatureFlagName` union.
- `src/components/home/HomeHeader.tsx` — Shared chrome: club badge + name + notification bell (with badge) + role chip.
- `src/components/home/HomeRoleChip.tsx` — Uppercase caption chip used by `HomeHeader`.
- `src/components/home/HomeErrorBoundary.tsx` — Scoped error boundary that invokes a `fallback` render prop when the new branch throws.
- `src/components/home/LegacyHomeScreen.tsx` — Verbatim copy of the current `app/(tabs)/index.tsx` default export, used as the flag-off and fallback path.
- `src/components/home/AdminHome.tsx` — OWNER / ADMIN layout: dashboard snapshot, activity feed, quick actions.
- `src/components/home/CoachHome.tsx` — COACH layout: next match hero (Geist Mono kick-off time), this-week events, roster snapshot.
- `src/components/home/PlayerHome.tsx` — PLAYER layout: next-event RSVP hero, latest chat, announcements.
- `src/components/home/ParentHome.tsx` — PARENT layout: child's next event, child's team announcements. Child-switcher deferred (see note).
- `src/components/home/FreeAgentHome.tsx` — FREE_AGENT layout: profile completeness % card + empty states for trial invites and nearby clubs.
- `src/components/home/resolveHomeRole.ts` — Pure helper that reduces `activeClub?.role` (string) and `user?.registrationRole` (string) to a single `HomeRole` discriminator.
- `app/__tests__/home-admin.spec.tsx` — AdminHome rendering.
- `app/__tests__/home-coach.spec.tsx` — CoachHome rendering.
- `app/__tests__/home-player.spec.tsx` — PlayerHome rendering.
- `app/__tests__/home-parent.spec.tsx` — ParentHome rendering.
- `app/__tests__/home-free-agent.spec.tsx` — FreeAgentHome rendering.
- `app/__tests__/home-branching.spec.tsx` — Top-level branching + flag + fallback behavior.
- `src/utils/__tests__/featureFlags.spec.ts` — Feature flag registry unit test.
- `src/components/home/__tests__/resolveHomeRole.spec.ts` — Pure-fn unit test for the role discriminator.

**Modified files:**

- `app/(tabs)/index.tsx` — Becomes a thin shell: read flag, render `HomeErrorBoundary` wrapping `RoleAwareHome` (new) with `LegacyHomeScreen` as fallback; when flag off, render `LegacyHomeScreen` directly.

**Deferred (tracked as follow-up tickets, NOT done in this plan):**

1. Remove the feature flag after one production release (delete `anstoss.roleAwareHome` from `featureFlags.ts`, inline `RoleAwareHome` into the tabs screen, drop `LegacyHomeScreen.tsx`).
2. PARENT multi-child switcher — blocked on a backend `children` list endpoint; single-child path ships now.
3. FREE_AGENT "Nearby clubs searching for your position" block — blocked on backend endpoint; empty state ships now with TODO.
4. FREE_AGENT "Recent trial invites" block — blocked on backend endpoint; empty state ships now with TODO.

---

## HomeRole discriminator shape

The same discriminator is reused across every task:

```ts
// src/components/home/resolveHomeRole.ts
export type HomeRole = 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT' | 'FREE_AGENT'
```

Precedence (first match wins):

1. `activeClub.role === 'OWNER' || activeClub.role === 'ADMIN'` -> `ADMIN`
2. `activeClub.role === 'COACH'` -> `COACH`
3. `activeClub.role === 'PARENT'` -> `PARENT`
4. `activeClub.role === 'PLAYER'` -> `PLAYER`
5. No active club and `user.registrationRole === 'FREE_AGENT'` -> `FREE_AGENT`
6. Otherwise -> `PLAYER` (safest default, same content as PLAYER with empty data)

---

## Task 0: Baseline

**Files:**
- Read only.

- [ ] **Step 1: Capture current mobile test baseline**

Run: `cd apps/mobile && npm test -- --watch=false 2>&1 | tail -60`

Expected: existing pre-existing failures include `home-role-behavior.spec.tsx` and `home-stats-layout.spec.tsx` (SafeAreaProvider wrapping) plus any failures listed in the Phase 3a plan's Task 9 note (`more-tab`, `admin-dashboard`). Record the failing suite names into a local scratch note — **do not fix** pre-existing failures in this plan.

- [ ] **Step 2: Capture current mobile typecheck baseline**

Run: `cd apps/mobile && npx tsc --noEmit`

Expected: clean. If not, stop and raise the failure — Phase 3c assumes a clean baseline.

- [ ] **Step 3: Capture shared typecheck baseline**

Run: `cd packages/shared && npx tsc --noEmit`

Expected: clean.

- [ ] **Step 4: Record baseline in a comment**

No file change — just note the exact list of pre-existing failing suites so later tasks can assert "no regressions" without confusing them for new failures.

---

## Task 1: Feature flag registry

**Files:**
- Create: `apps/mobile/src/utils/featureFlags.ts`
- Test: `apps/mobile/src/utils/__tests__/featureFlags.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/mobile/src/utils/__tests__/featureFlags.spec.ts
import { isFeatureEnabled, setFeatureOverride, clearFeatureOverrides } from '../featureFlags'

describe('featureFlags', () => {
  afterEach(() => clearFeatureOverrides())

  it('returns the default value for a known flag', () => {
    expect(isFeatureEnabled('anstoss.roleAwareHome')).toBe(true)
  })

  it('respects test-only overrides', () => {
    setFeatureOverride('anstoss.roleAwareHome', false)
    expect(isFeatureEnabled('anstoss.roleAwareHome')).toBe(false)
    setFeatureOverride('anstoss.roleAwareHome', true)
    expect(isFeatureEnabled('anstoss.roleAwareHome')).toBe(true)
  })

  it('clearFeatureOverrides restores defaults', () => {
    setFeatureOverride('anstoss.roleAwareHome', false)
    clearFeatureOverrides()
    expect(isFeatureEnabled('anstoss.roleAwareHome')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest --watch=false src/utils/__tests__/featureFlags.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `featureFlags.ts`**

```ts
// apps/mobile/src/utils/featureFlags.ts
// Minimal feature-flag registry. Defaults ship in code; overrides exist only
// for tests and future remote-config wiring. Remove `anstoss.roleAwareHome`
// one release after Phase 3c ships (tracked as a deferred follow-up).

export type FeatureFlagName = 'anstoss.roleAwareHome'

const DEFAULTS: Record<FeatureFlagName, boolean> = {
  'anstoss.roleAwareHome': true,
}

const overrides: Partial<Record<FeatureFlagName, boolean>> = {}

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  if (name in overrides) {
    return overrides[name] as boolean
  }
  return DEFAULTS[name]
}

export function setFeatureOverride(name: FeatureFlagName, value: boolean): void {
  overrides[name] = value
}

export function clearFeatureOverrides(): void {
  for (const key of Object.keys(overrides) as FeatureFlagName[]) {
    delete overrides[key]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest --watch=false src/utils/__tests__/featureFlags.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

```bash
git add apps/mobile/src/utils/featureFlags.ts apps/mobile/src/utils/__tests__/featureFlags.spec.ts
git commit -m "feat(mobile): add feature-flag registry for role-aware home rollout"
```

---

## Task 2: `resolveHomeRole` discriminator

**Files:**
- Create: `apps/mobile/src/components/home/resolveHomeRole.ts`
- Test: `apps/mobile/src/components/home/__tests__/resolveHomeRole.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/mobile/src/components/home/__tests__/resolveHomeRole.spec.ts
import { resolveHomeRole } from '../resolveHomeRole'

describe('resolveHomeRole', () => {
  it('maps OWNER -> ADMIN', () => {
    expect(resolveHomeRole({ clubRole: 'OWNER', registrationRole: null })).toBe('ADMIN')
  })
  it('maps ADMIN -> ADMIN', () => {
    expect(resolveHomeRole({ clubRole: 'ADMIN', registrationRole: null })).toBe('ADMIN')
  })
  it('maps COACH -> COACH', () => {
    expect(resolveHomeRole({ clubRole: 'COACH', registrationRole: null })).toBe('COACH')
  })
  it('maps PARENT -> PARENT', () => {
    expect(resolveHomeRole({ clubRole: 'PARENT', registrationRole: null })).toBe('PARENT')
  })
  it('maps PLAYER -> PLAYER', () => {
    expect(resolveHomeRole({ clubRole: 'PLAYER', registrationRole: null })).toBe('PLAYER')
  })
  it('no club + FREE_AGENT registrationRole -> FREE_AGENT', () => {
    expect(resolveHomeRole({ clubRole: null, registrationRole: 'FREE_AGENT' })).toBe('FREE_AGENT')
  })
  it('no club + PLAYER registrationRole -> PLAYER default', () => {
    expect(resolveHomeRole({ clubRole: null, registrationRole: 'PLAYER' })).toBe('PLAYER')
  })
  it('unknown club role falls back to PLAYER', () => {
    expect(resolveHomeRole({ clubRole: 'GHOST', registrationRole: null })).toBe('PLAYER')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest --watch=false src/components/home/__tests__/resolveHomeRole.spec.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/components/home/resolveHomeRole.ts
export type HomeRole = 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT' | 'FREE_AGENT'

export type ResolveHomeRoleInput = {
  clubRole: string | null | undefined
  registrationRole: string | null | undefined
}

export function resolveHomeRole({ clubRole, registrationRole }: ResolveHomeRoleInput): HomeRole {
  if (clubRole === 'OWNER' || clubRole === 'ADMIN') return 'ADMIN'
  if (clubRole === 'COACH') return 'COACH'
  if (clubRole === 'PARENT') return 'PARENT'
  if (clubRole === 'PLAYER') return 'PLAYER'
  if (!clubRole && registrationRole === 'FREE_AGENT') return 'FREE_AGENT'
  return 'PLAYER'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest --watch=false src/components/home/__tests__/resolveHomeRole.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/home/resolveHomeRole.ts apps/mobile/src/components/home/__tests__/resolveHomeRole.spec.ts
git commit -m "feat(mobile): resolveHomeRole discriminator for role-aware home"
```

---

## Task 3: Shared chrome — `HomeRoleChip` and `HomeHeader`

**Files:**
- Create: `apps/mobile/src/components/home/HomeRoleChip.tsx`
- Create: `apps/mobile/src/components/home/HomeHeader.tsx`
- Test: `apps/mobile/src/components/home/__tests__/HomeHeader.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/src/components/home/__tests__/HomeHeader.spec.tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { HomeHeader } from '../HomeHeader'

jest.mock('../../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../../theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#1E3A5F',
      primary50: '#DDE7F1',
    }),
    useIsDark: () => false,
  }
})

describe('HomeHeader', () => {
  it('renders club name, role chip, and notification bell', () => {
    const onBellPress = jest.fn()
    const { getByText, getByLabelText } = render(
      <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 375, height: 812 } }}>
        <HomeHeader
          clubName="FC QA"
          clubBadgeUrl={null}
          roleLabel="ADMIN"
          notificationCount={3}
          onNotificationsPress={onBellPress}
        />
      </SafeAreaProvider>,
    )

    expect(getByText('FC QA')).toBeTruthy()
    expect(getByText('ADMIN')).toBeTruthy()
    const bell = getByLabelText('Notifications, 3 unread')
    fireEvent.press(bell)
    expect(onBellPress).toHaveBeenCalled()
  })

  it('hides the unread badge when count is zero', () => {
    const { queryByLabelText, getByLabelText } = render(
      <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 375, height: 812 } }}>
        <HomeHeader
          clubName="FC QA"
          clubBadgeUrl={null}
          roleLabel="PLAYER"
          notificationCount={0}
          onNotificationsPress={() => {}}
        />
      </SafeAreaProvider>,
    )
    expect(getByLabelText('Notifications')).toBeTruthy()
    expect(queryByLabelText('Notifications, 3 unread')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest --watch=false src/components/home/__tests__/HomeHeader.spec.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `HomeRoleChip.tsx`**

```tsx
// apps/mobile/src/components/home/HomeRoleChip.tsx
import { StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'

export type HomeRoleChipProps = {
  label: string
}

export function HomeRoleChip({ label }: HomeRoleChipProps) {
  const c = useClubColors()
  return (
    <View style={[styles.chip, { backgroundColor: c.surfaceSunken ?? c.surface }]}>
      <Text variant="caption2" weight="semibold" color="secondary" style={styles.label}>
        {label.toUpperCase()}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  label: {
    letterSpacing: 0.6,
  },
})
```

- [ ] **Step 4: Implement `HomeHeader.tsx`**

```tsx
// apps/mobile/src/components/home/HomeHeader.tsx
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Icon, Text } from '../ui'
import { HomeRoleChip } from './HomeRoleChip'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'

export type HomeHeaderProps = {
  clubName: string
  clubBadgeUrl: string | null
  roleLabel: string
  notificationCount: number
  onNotificationsPress: () => void
}

export function HomeHeader({
  clubName,
  clubBadgeUrl,
  roleLabel,
  notificationCount,
  onNotificationsPress,
}: HomeHeaderProps) {
  const c = useClubColors()
  const hasUnread = notificationCount > 0
  const accessibilityLabel = hasUnread
    ? `Notifications, ${notificationCount} unread`
    : 'Notifications'

  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <View style={[styles.badgeWrap, { backgroundColor: c.surfaceSunken ?? c.surface }]}>
          {clubBadgeUrl ? (
            <Image source={{ uri: clubBadgeUrl }} style={styles.badgeImg} />
          ) : (
            <Icon name="shield.fill" size={18} color="tertiary" />
          )}
        </View>
        <View style={styles.textCol}>
          <Text variant="headline" weight="semibold" color="primary" numberOfLines={1}>
            {clubName}
          </Text>
          <HomeRoleChip label={roleLabel} />
        </View>
      </View>
      <Pressable
        onPress={onNotificationsPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.bell,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
          pressed && { opacity: 0.9 },
        ]}
      >
        <Icon name="bell.fill" size={18} color="primary" />
        {hasUnread ? (
          <View style={[styles.dot, { backgroundColor: c.error }]}>
            <Text variant="caption2" weight="bold" color="inverse" tabular>
              {notificationCount > 9 ? '9+' : notificationCount}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
  },
  badgeWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badgeImg: {
    width: 40,
    height: 40,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && npx jest --watch=false src/components/home/__tests__/HomeHeader.spec.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/home/HomeHeader.tsx apps/mobile/src/components/home/HomeRoleChip.tsx apps/mobile/src/components/home/__tests__/HomeHeader.spec.tsx
git commit -m "feat(mobile): HomeHeader chrome with badge, role chip, and notification bell"
```

---

## Task 4: `HomeErrorBoundary` + `LegacyHomeScreen` preservation

**Files:**
- Create: `apps/mobile/src/components/home/LegacyHomeScreen.tsx`
- Create: `apps/mobile/src/components/home/HomeErrorBoundary.tsx`
- Test: `apps/mobile/src/components/home/__tests__/HomeErrorBoundary.spec.tsx`

- [ ] **Step 1: Copy current `app/(tabs)/index.tsx` body into `LegacyHomeScreen.tsx`**

Read `apps/mobile/app/(tabs)/index.tsx`. Copy the full file content (lines 1–1094) into `apps/mobile/src/components/home/LegacyHomeScreen.tsx` with these mechanical changes:

1. Rename the default export from `HomeScreen` to `LegacyHomeScreen` and make it a named export:
   - Change `export default function HomeScreen()` to `export function LegacyHomeScreen()`.
2. Update relative import paths by prefixing each `'../../src/'` segment with one more `../`:
   - `'../../src/components/TeamSwitcher'` -> `'../TeamSwitcher'`
   - `'../../src/components/ui'` -> `'../ui'`
   - `'../../src/components/ui/StatusPill'` -> `'../ui/StatusPill'`
   - `'../../src/context/AuthContext'` -> `'../../context/AuthContext'`
   - `'../../src/context/ClubThemeContext'` -> `'../../context/ClubThemeContext'`
   - `'../../src/i18n'` -> `'../../i18n'`
   - `'../../src/utils/haptics'` -> `'../../utils/haptics'`
   - `'../../src/theme/tokens'` -> `'../../theme/tokens'`
   - `'../../src/api/client'` -> `'../../api/client'`

Do not change any logic. Keep all styles, inner helper components (`SectionTitle`, `StatTile`, `ActionTile`, `EmptyNextEvent`, `EventFocusCard`, `ParentFocusCard`, `ContributionNudge`, `hexWithAlpha`, `formatDate`, `contributionStatusTone`, `formatCurrency`) intact.

- [ ] **Step 2: Write failing test for `HomeErrorBoundary`**

```tsx
// apps/mobile/src/components/home/__tests__/HomeErrorBoundary.spec.tsx
import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'
import { HomeErrorBoundary } from '../HomeErrorBoundary'

function Boom(): JSX.Element {
  throw new Error('kaboom')
}

describe('HomeErrorBoundary', () => {
  it('renders children when no error', () => {
    const { getByText } = render(
      <HomeErrorBoundary fallback={() => <Text>fallback</Text>}>
        <Text>ok</Text>
      </HomeErrorBoundary>,
    )
    expect(getByText('ok')).toBeTruthy()
  })

  it('renders fallback when a child throws', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { getByText } = render(
      <HomeErrorBoundary fallback={() => <Text>fallback</Text>}>
        <Boom />
      </HomeErrorBoundary>,
    )
    expect(getByText('fallback')).toBeTruthy()
    spy.mockRestore()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/mobile && npx jest --watch=false src/components/home/__tests__/HomeErrorBoundary.spec.tsx`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `HomeErrorBoundary.tsx`**

```tsx
// apps/mobile/src/components/home/HomeErrorBoundary.tsx
import { Component, type ReactNode } from 'react'
import * as Sentry from '@sentry/react-native'

type Props = {
  children: ReactNode
  fallback: (error: Error) => ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
}

export class HomeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, {
      tags: { feature: 'role-aware-home' },
      contexts: { react: { componentStack: info.componentStack ?? undefined } },
    })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback(this.state.error)
    }
    return this.props.children
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/mobile && npx jest --watch=false src/components/home/__tests__/HomeErrorBoundary.spec.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean. If `LegacyHomeScreen.tsx` has path errors, fix the relative imports per Step 1.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/home/LegacyHomeScreen.tsx apps/mobile/src/components/home/HomeErrorBoundary.tsx apps/mobile/src/components/home/__tests__/HomeErrorBoundary.spec.tsx
git commit -m "feat(mobile): preserve legacy home and add scoped error boundary"
```

---

## Task 5: `AdminHome` (OWNER / CLUB_ADMIN)

**Files:**
- Create: `apps/mobile/src/components/home/AdminHome.tsx`
- Test: `apps/mobile/app/__tests__/home-admin.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/home-admin.spec.tsx
import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AdminHome } from '../../src/components/home/AdminHome'

const mockPush = jest.fn()

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#1E3A5F', primary50: '#DDE7F1' }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('/stats')) {
      return Promise.resolve({ memberCount: 42, teamCount: 5, upcomingEventCount: 9, overallRsvpRate: 91, pendingJoinRequests: 3, duesOutstanding: 1250 })
    }
    if (path.includes('/activity')) {
      return Promise.resolve([
        { id: 'a1', kind: 'MEMBER_JOINED', title: 'Anna joined U12', occurredAt: '2026-04-22T10:00:00Z' },
        { id: 'a2', kind: 'EVENT_CREATED', title: 'Match vs FC Nord', occurredAt: '2026-04-21T08:00:00Z' },
      ])
    }
    return Promise.resolve([])
  }),
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 375, height: 812 } }}>
    {ui}
  </SafeAreaProvider>
)

describe('AdminHome', () => {
  beforeEach(() => mockPush.mockClear())

  it('renders the dashboard snapshot with member/pending/dues numbers', async () => {
    const { getByText } = render(wrap(<AdminHome clubId="club-1" />))
    await waitFor(() => {
      expect(getByText('42')).toBeTruthy()
      expect(getByText('3')).toBeTruthy()
    })
    expect(getByText(/Members/i)).toBeTruthy()
    expect(getByText(/Pending/i)).toBeTruthy()
    expect(getByText(/Dues outstanding/i)).toBeTruthy()
  })

  it('renders recent activity feed items', async () => {
    const { findByText } = render(wrap(<AdminHome clubId="club-1" />))
    expect(await findByText('Anna joined U12')).toBeTruthy()
    expect(await findByText('Match vs FC Nord')).toBeTruthy()
  })

  it('renders quick actions for invite and create event', async () => {
    const { getByText } = render(wrap(<AdminHome clubId="club-1" />))
    fireEvent.press(getByText(/Create event/i))
    expect(mockPush).toHaveBeenCalledWith('/create-event')
    fireEvent.press(getByText(/Invite/i))
    expect(mockPush).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-admin.spec.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `AdminHome.tsx`**

```tsx
// apps/mobile/src/components/home/AdminHome.tsx
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../api/client'
import { Icon, Text, type IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'

type AdminStats = {
  memberCount: number
  teamCount: number
  upcomingEventCount: number
  overallRsvpRate: number
  pendingJoinRequests?: number
  duesOutstanding?: number
}

type ActivityItem = {
  id: string
  kind: string
  title: string
  occurredAt: string
}

export type AdminHomeProps = {
  clubId: string
}

export function AdminHome({ clubId }: AdminHomeProps) {
  const c = useClubColors()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        api<AdminStats>(`/clubs/${clubId}/stats`).catch(() => null),
        api<ActivityItem[]>(`/clubs/${clubId}/activity?limit=5`).catch(() => []),
      ])
      if (s) setStats(s)
      setActivity(a ?? [])
    } catch {
      // Empty state handles missing data.
    }
  }, [clubId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View style={styles.root}>
      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Dashboard
      </Text>
      <View style={styles.statsRow}>
        <StatTile label="Members" value={stats?.memberCount ?? 0} />
        <StatTile label="Pending" value={stats?.pendingJoinRequests ?? 0} />
        <StatTile label="Dues outstanding" value={stats?.duesOutstanding ?? 0} />
      </View>

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Recent activity
      </Text>
      {activity.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">No recent activity yet.</Text>
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {activity.map((item) => (
            <View
              key={item.id}
              style={[styles.activityRow, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
            >
              <View style={[styles.dot, { backgroundColor: c.primary }]} />
              <Text variant="callout" color="primary" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                {item.title}
              </Text>
              <Text variant="caption2" color="secondary" tabular>
                {formatRelative(item.occurredAt)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Quick actions
      </Text>
      <View style={styles.actionRow}>
        <ActionTile icon="plus.circle.fill" label="Create event" onPress={() => router.push('/create-event')} />
        <ActionTile icon="person.circle.fill" label="Invite" onPress={() => router.push({ pathname: '/invite', params: { returnTo: '/(tabs)' } } as never)} />
      </View>
    </View>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  const c = useClubColors()
  return (
    <View style={[styles.statTile, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <Text variant="dataLarge" color="primary" tabular>{value}</Text>
      <Text variant="footnote" color="secondary" numberOfLines={2}>{label}</Text>
    </View>
  )
}

function ActionTile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.92 },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: c.primary50 }]}>
        <Icon name={icon} size={20} color="tint" />
      </View>
      <Text variant="footnote" color="primary" weight="semibold">{label}</Text>
    </Pressable>
  )
}

function formatRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  const hours = Math.round(delta / 3600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  section: { marginTop: space.lg },
  statsRow: { flexDirection: 'row', gap: space.sm },
  statTile: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: space.xs,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actionRow: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 64,
  },
  actionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-admin.spec.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/home/AdminHome.tsx apps/mobile/app/__tests__/home-admin.spec.tsx
git commit -m "feat(mobile): AdminHome dashboard snapshot, activity feed, quick actions"
```

---

## Task 6: `CoachHome` (COACH)

**Files:**
- Create: `apps/mobile/src/components/home/CoachHome.tsx`
- Test: `apps/mobile/app/__tests__/home-coach.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/home-coach.spec.tsx
import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { CoachHome } from '../../src/components/home/CoachHome'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#1E3A5F', primary50: '#DDE7F1' }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('scope=nextMatch')) {
      return Promise.resolve([{ id: 'm1', type: 'MATCH', title: 'vs FC Nord', date: '2026-05-04T15:30:00Z', location: 'Stadion' }])
    }
    if (path.includes('scope=thisWeek')) {
      return Promise.resolve([
        { id: 'e1', type: 'TRAINING', title: 'Tuesday training', date: '2026-04-23T18:00:00Z' },
        { id: 'e2', type: 'TRAINING', title: 'Thursday training', date: '2026-04-25T18:00:00Z' },
      ])
    }
    if (path.includes('/roster')) {
      return Promise.resolve({ active: 18, trial: 2 })
    }
    return Promise.resolve([])
  }),
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 375, height: 812 } }}>
    {ui}
  </SafeAreaProvider>
)

describe('CoachHome', () => {
  it('renders next match with large kick-off time', async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('vs FC Nord')).toBeTruthy()
    expect(await findByText('15:30')).toBeTruthy()
  })

  it("renders this week's events", async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('Tuesday training')).toBeTruthy()
    expect(await findByText('Thursday training')).toBeTruthy()
  })

  it('renders roster snapshot counts', async () => {
    const { findByText } = render(wrap(<CoachHome clubId="club-1" teamId="team-1" />))
    await waitFor(() => {
      expect(findByText('18')).toBeTruthy()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-coach.spec.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `CoachHome.tsx`**

```tsx
// apps/mobile/src/components/home/CoachHome.tsx
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, radius, space } from '../../theme/tokens'

type EventItem = {
  id: string
  type: string
  title: string
  date: string
  location?: string | null
}

type RosterSnapshot = { active: number; trial: number }

export type CoachHomeProps = {
  clubId: string
  teamId: string | null
}

export function CoachHome({ clubId, teamId }: CoachHomeProps) {
  const c = useClubColors()
  const [nextMatch, setNextMatch] = useState<EventItem | null>(null)
  const [thisWeek, setThisWeek] = useState<EventItem[]>([])
  const [roster, setRoster] = useState<RosterSnapshot | null>(null)

  const load = useCallback(async () => {
    if (!teamId) return
    const base = `/clubs/${clubId}/events?teamId=${teamId}`
    const [match, week, r] = await Promise.all([
      api<EventItem[]>(`${base}&scope=nextMatch`).catch(() => []),
      api<EventItem[]>(`${base}&scope=thisWeek`).catch(() => []),
      api<RosterSnapshot>(`/clubs/${clubId}/teams/${teamId}/roster/snapshot`).catch(() => null),
    ])
    setNextMatch(match?.[0] ?? null)
    setThisWeek(week ?? [])
    setRoster(r)
  }, [clubId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View style={styles.root}>
      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Next match
      </Text>
      {nextMatch ? (
        <Pressable
          onPress={() => router.push({ pathname: '/event-detail', params: { eventId: nextMatch.id } } as never)}
          accessibilityRole="button"
          accessibilityLabel={nextMatch.title}
          style={({ pressed }) => [
            styles.matchCard,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.95 },
          ]}
        >
          <Text variant="title1" color="primary" weight="semibold">
            {nextMatch.title}
          </Text>
          <Text style={[styles.kickoff, { color: c.textPrimary }]} tabular>
            {formatKickoff(nextMatch.date)}
          </Text>
          {nextMatch.location ? (
            <View style={styles.metaRow}>
              <Icon name="mappin.circle.fill" size="sm" color="tertiary" />
              <Text variant="footnote" color="secondary">{nextMatch.location}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <EmptyCard message="No match scheduled this week." />
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        This week
      </Text>
      {thisWeek.length === 0 ? (
        <EmptyCard message="Nothing scheduled yet." />
      ) : (
        <View style={{ gap: space.sm }}>
          {thisWeek.map((ev) => (
            <View key={ev.id} style={[styles.weekRow, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              <Icon name="calendar.fill" size={16} color="tertiary" />
              <Text variant="callout" color="primary" numberOfLines={1} style={{ flex: 1 }}>{ev.title}</Text>
              <Text variant="caption2" color="secondary" tabular>{formatDay(ev.date)}</Text>
            </View>
          ))}
        </View>
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Roster
      </Text>
      <View style={styles.rosterRow}>
        <RosterTile label="Active" value={roster?.active ?? 0} />
        <RosterTile label="Trial" value={roster?.trial ?? 0} />
      </View>
    </View>
  )
}

function RosterTile({ label, value }: { label: string; value: number }) {
  const c = useClubColors()
  return (
    <View style={[styles.rosterTile, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <Text variant="dataLarge" color="primary" tabular>{value}</Text>
      <Text variant="footnote" color="secondary">{label}</Text>
    </View>
  )
}

function EmptyCard({ message }: { message: string }) {
  const c = useClubColors()
  return (
    <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <Text variant="footnote" color="secondary">{message}</Text>
    </View>
  )
}

function formatKickoff(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' })
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  section: { marginTop: space.lg },
  matchCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.sm,
  },
  kickoff: {
    fontFamily: fonts.mono,
    fontSize: 44,
    lineHeight: 48,
    marginTop: space.xs,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  rosterRow: { flexDirection: 'row', gap: space.sm },
  rosterTile: { flex: 1, padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: space.xs },
  empty: { padding: space.md, borderRadius: radius.lg, borderWidth: 1 },
})
```

Note: `fonts.mono` must exist in `src/theme/tokens.ts`. If it does not, use `'Geist Mono'` as a string literal in the `fontFamily` slot.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-coach.spec.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/home/CoachHome.tsx apps/mobile/app/__tests__/home-coach.spec.tsx
git commit -m "feat(mobile): CoachHome with next match hero, this week events, roster snapshot"
```

---

## Task 7: `PlayerHome` (PLAYER)

**Files:**
- Create: `apps/mobile/src/components/home/PlayerHome.tsx`
- Test: `apps/mobile/app/__tests__/home-player.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/home-player.spec.tsx
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { PlayerHome } from '../../src/components/home/PlayerHome'

const mockApi = jest.fn()

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#1E3A5F', primary50: '#DDE7F1' }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({ api: (...a: unknown[]) => mockApi(...a) }))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 375, height: 812 } }}>
    {ui}
  </SafeAreaProvider>
)

describe('PlayerHome', () => {
  beforeEach(() => {
    mockApi.mockImplementation((path: string) => {
      if (path.includes('/events?') && path.includes('scope=upcoming')) {
        return Promise.resolve([
          { id: 'e1', type: 'TRAINING', title: 'Monday training', date: '2026-04-28T18:00:00Z', myRsvp: null, yesCount: 0, maybeCount: 0, noCount: 0 },
        ])
      }
      if (path.includes('/chat/latest')) {
        return Promise.resolve({ preview: 'See you tomorrow!', author: 'Coach Max' })
      }
      if (path.includes('/announcements')) {
        return Promise.resolve([{ id: 'an1', title: 'Club BBQ', body: 'Saturday' }])
      }
      return Promise.resolve(null)
    })
  })

  it('renders the next-event RSVP hero', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('Monday training')).toBeTruthy()
    expect(await findByText('Yes')).toBeTruthy()
    expect(await findByText('Maybe')).toBeTruthy()
    expect(await findByText('No')).toBeTruthy()
  })

  it('RSVP Yes fires an API PUT', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    const yes = await findByText('Yes')
    fireEvent.press(yes)
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith(
        expect.stringMatching(/\/events\/e1\/rsvp$/),
        expect.objectContaining({ method: 'PUT', body: { status: 'YES' } }),
      )
    })
  })

  it('renders chat preview', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await findByText(/See you tomorrow/)).toBeTruthy()
  })

  it('renders announcement titles', async () => {
    const { findByText } = render(wrap(<PlayerHome clubId="club-1" teamId="team-1" />))
    expect(await findByText('Club BBQ')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-player.spec.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `PlayerHome.tsx`**

```tsx
// apps/mobile/src/components/home/PlayerHome.tsx
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'

type EventItem = {
  id: string
  type: string
  title: string
  date: string
  location?: string | null
  myRsvp: 'YES' | 'MAYBE' | 'NO' | null
  yesCount: number
  maybeCount: number
  noCount: number
}

type ChatPreview = { preview: string; author: string }
type Announcement = { id: string; title: string; body: string }

export type PlayerHomeProps = {
  clubId: string
  teamId: string | null
}

export function PlayerHome({ clubId, teamId }: PlayerHomeProps) {
  const c = useClubColors()
  const [event, setEvent] = useState<EventItem | null>(null)
  const [chat, setChat] = useState<ChatPreview | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  const load = useCallback(async () => {
    if (!teamId) return
    const [evs, chatPreview, anns] = await Promise.all([
      api<EventItem[]>(`/clubs/${clubId}/events?teamId=${teamId}&scope=upcoming`).catch(() => []),
      api<ChatPreview | null>(`/clubs/${clubId}/teams/${teamId}/chat/latest`).catch(() => null),
      api<Announcement[]>(`/clubs/${clubId}/announcements?limit=3`).catch(() => []),
    ])
    setEvent(evs?.[0] ?? null)
    setChat(chatPreview ?? null)
    setAnnouncements(anns ?? [])
  }, [clubId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  const onRsvp = useCallback(
    async (status: 'YES' | 'MAYBE' | 'NO') => {
      if (!event) return
      setEvent({ ...event, myRsvp: status })
      try {
        await api(`/clubs/${clubId}/events/${event.id}/rsvp`, { method: 'PUT', body: { status } })
      } catch {
        // Optimistic update already applied; a full refetch happens on next focus.
      }
    },
    [clubId, event],
  )

  return (
    <View style={styles.root}>
      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Next event
      </Text>
      {event ? (
        <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="title1" color="primary" weight="semibold">{event.title}</Text>
          <Text variant="footnote" color="secondary">{new Date(event.date).toLocaleString()}</Text>
          {event.location ? (
            <View style={styles.metaRow}>
              <Icon name="mappin.circle.fill" size="sm" color="tertiary" />
              <Text variant="footnote" color="secondary">{event.location}</Text>
            </View>
          ) : null}
          <View style={styles.rsvpRow}>
            {(['YES', 'MAYBE', 'NO'] as const).map((status) => {
              const active = event.myRsvp === status
              const tone = status === 'YES' ? c.success : status === 'MAYBE' ? c.warning : c.error
              return (
                <Pressable
                  key={status}
                  onPress={() => onRsvp(status)}
                  accessibilityRole="button"
                  accessibilityLabel={rsvpLabel(status)}
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.rsvpButton,
                    { backgroundColor: active ? tone : c.surfaceSunken ?? c.surface },
                  ]}
                >
                  <Text variant="footnote" weight="semibold" color={active ? 'inverse' : 'primary'}>
                    {rsvpLabel(status)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">No upcoming events.</Text>
        </View>
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Team chat
      </Text>
      {chat ? (
        <Pressable
          onPress={() => router.push('/(tabs)/chat' as never)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.chatRow,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.92 },
          ]}
        >
          <Icon name="bubble.left.fill" size={18} color="tertiary" />
          <View style={{ flex: 1 }}>
            <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>{chat.author}</Text>
            <Text variant="footnote" color="secondary" numberOfLines={2}>{chat.preview}</Text>
          </View>
        </Pressable>
      ) : (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">No messages yet.</Text>
        </View>
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Announcements
      </Text>
      {announcements.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">No announcements.</Text>
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {announcements.map((a) => (
            <View key={a.id} style={[styles.annRow, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>{a.title}</Text>
              <Text variant="footnote" color="secondary" numberOfLines={2}>{a.body}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function rsvpLabel(status: 'YES' | 'MAYBE' | 'NO'): string {
  if (status === 'YES') return 'Yes'
  if (status === 'MAYBE') return 'Maybe'
  return 'No'
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  section: { marginTop: space.lg },
  hero: { padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: space.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rsvpRow: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  rsvpButton: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  annRow: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 4,
  },
  empty: { padding: space.md, borderRadius: radius.lg, borderWidth: 1 },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-player.spec.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/home/PlayerHome.tsx apps/mobile/app/__tests__/home-player.spec.tsx
git commit -m "feat(mobile): PlayerHome with RSVP hero, chat preview, announcements"
```

---

## Task 8: `ParentHome` (PARENT)

**Files:**
- Create: `apps/mobile/src/components/home/ParentHome.tsx`
- Test: `apps/mobile/app/__tests__/home-parent.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/home-parent.spec.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ParentHome } from '../../src/components/home/ParentHome'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#1E3A5F', primary50: '#DDE7F1' }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('/me/children-events')) {
      return Promise.resolve([{ id: 'c1', title: 'U12 match', date: '2026-04-28T10:00:00Z', location: 'Pitch 2', teamName: 'U12', teamDisplayName: 'U12 Youth' }])
    }
    if (path.includes('/me/children-announcements')) {
      return Promise.resolve([{ id: 'an1', title: 'Team photo day', body: 'Next Saturday' }])
    }
    return Promise.resolve([])
  }),
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 375, height: 812 } }}>
    {ui}
  </SafeAreaProvider>
)

describe('ParentHome', () => {
  it("renders the child's next event", async () => {
    const { findByText } = render(wrap(<ParentHome />))
    expect(await findByText('U12 match')).toBeTruthy()
    expect(await findByText(/U12 Youth/)).toBeTruthy()
  })

  it("renders the child's team announcements", async () => {
    const { findByText } = render(wrap(<ParentHome />))
    expect(await findByText('Team photo day')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-parent.spec.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ParentHome.tsx`**

```tsx
// apps/mobile/src/components/home/ParentHome.tsx
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'

// TODO(phase-3c-followup): Add multi-child switcher once backend exposes
// GET /me/children. Single-child view is correct until then.

type ChildEvent = {
  id: string
  title: string
  date: string
  location?: string | null
  teamName: string
  teamDisplayName: string | null
}

type ChildAnnouncement = { id: string; title: string; body: string }

export function ParentHome() {
  const c = useClubColors()
  const [event, setEvent] = useState<ChildEvent | null>(null)
  const [announcements, setAnnouncements] = useState<ChildAnnouncement[]>([])

  const load = useCallback(async () => {
    const [evs, anns] = await Promise.all([
      api<ChildEvent[]>('/me/children-events?limit=1').catch(() => []),
      api<ChildAnnouncement[]>('/me/children-announcements?limit=3').catch(() => []),
    ])
    setEvent(evs?.[0] ?? null)
    setAnnouncements(anns ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <View style={styles.root}>
      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Next event
      </Text>
      {event ? (
        <Pressable
          onPress={() => router.push('/(tabs)/events' as never)}
          accessibilityRole="button"
          accessibilityLabel={event.title}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.95 },
          ]}
        >
          <View style={[styles.teamBadge, { backgroundColor: c.primary50 }]}>
            <Text variant="caption2" weight="semibold" color="tint">
              {event.teamDisplayName || event.teamName}
            </Text>
          </View>
          <Text variant="title2" color="primary" weight="semibold">{event.title}</Text>
          <Text variant="footnote" color="secondary">{new Date(event.date).toLocaleString()}</Text>
          {event.location ? (
            <View style={styles.metaRow}>
              <Icon name="mappin.circle.fill" size="sm" color="tertiary" />
              <Text variant="footnote" color="secondary">{event.location}</Text>
            </View>
          ) : null}
        </Pressable>
      ) : (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">No events for your child right now.</Text>
        </View>
      )}

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Announcements
      </Text>
      {announcements.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="footnote" color="secondary">No announcements.</Text>
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          {announcements.map((a) => (
            <View key={a.id} style={[styles.annRow, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>{a.title}</Text>
              <Text variant="footnote" color="secondary" numberOfLines={2}>{a.body}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  section: { marginTop: space.lg },
  card: { padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: space.sm },
  teamBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  annRow: { padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: 4 },
  empty: { padding: space.md, borderRadius: radius.lg, borderWidth: 1 },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-parent.spec.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/home/ParentHome.tsx apps/mobile/app/__tests__/home-parent.spec.tsx
git commit -m "feat(mobile): ParentHome with child's next event and announcements"
```

---

## Task 9: `FreeAgentHome` (FREE_AGENT)

**Files:**
- Create: `apps/mobile/src/components/home/FreeAgentHome.tsx`
- Test: `apps/mobile/app/__tests__/home-free-agent.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/home-free-agent.spec.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { FreeAgentHome } from '../../src/components/home/FreeAgentHome'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#1E3A5F', primary50: '#DDE7F1' }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn((path: string) => {
    if (path.includes('/me/free-agent-profile')) {
      return Promise.resolve({
        displayName: 'Lea',
        position: ['ST'],
        experienceYears: 3,
        location: 'Berlin',
        availableForTrials: true,
        bio: '',
      })
    }
    return Promise.resolve(null)
  }),
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 375, height: 812 } }}>
    {ui}
  </SafeAreaProvider>
)

describe('FreeAgentHome', () => {
  it('renders the profile completeness card', async () => {
    const { findByText } = render(wrap(<FreeAgentHome />))
    expect(await findByText(/Profile/i)).toBeTruthy()
    expect(await findByText(/%$/)).toBeTruthy()
  })

  it('renders the trial invites empty state', async () => {
    const { findByText } = render(wrap(<FreeAgentHome />))
    expect(await findByText(/No trial invites yet/i)).toBeTruthy()
  })

  it('renders the nearby clubs empty state', async () => {
    const { findByText } = render(wrap(<FreeAgentHome />))
    expect(await findByText(/Nearby clubs/i)).toBeTruthy()
    expect(await findByText(/We'll surface clubs/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-free-agent.spec.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `FreeAgentHome.tsx`**

```tsx
// apps/mobile/src/components/home/FreeAgentHome.tsx
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { api } from '../../api/client'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'

// TODO(phase-3c-followup): Replace trial-invite and nearby-clubs empty states
// with real data once the backend endpoints ship
// (GET /me/free-agent/trial-invites, GET /free-agents/:id/nearby-clubs).

type FreeAgentProfile = {
  displayName: string
  position: string[]
  experienceYears: number
  location: string
  availableForTrials: boolean
  bio: string
}

const REQUIRED_FIELDS: Array<keyof FreeAgentProfile> = [
  'displayName',
  'position',
  'experienceYears',
  'location',
  'bio',
]

function computeCompleteness(profile: FreeAgentProfile | null): number {
  if (!profile) return 0
  let filled = 0
  for (const field of REQUIRED_FIELDS) {
    const val = profile[field]
    if (Array.isArray(val) ? val.length > 0 : Boolean(val)) filled += 1
  }
  return Math.round((filled / REQUIRED_FIELDS.length) * 100)
}

export function FreeAgentHome() {
  const c = useClubColors()
  const [profile, setProfile] = useState<FreeAgentProfile | null>(null)

  const load = useCallback(async () => {
    const p = await api<FreeAgentProfile>('/me/free-agent-profile').catch(() => null)
    setProfile(p)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pct = computeCompleteness(profile)

  return (
    <View style={styles.root}>
      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Profile
      </Text>
      <Pressable
        onPress={() => router.push('/free-agent/profile' as never)}
        accessibilityRole="button"
        accessibilityLabel={`Profile ${pct}% complete`}
        style={({ pressed }) => [
          styles.hero,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
          pressed && { opacity: 0.95 },
        ]}
      >
        <Text variant="dataLarge" color="primary" tabular>{pct}%</Text>
        <Text variant="footnote" color="secondary">
          Profile complete. Finish it so clubs can find you.
        </Text>
        <View style={[styles.track, { backgroundColor: c.surfaceSunken ?? c.surface }]}>
          <View style={[styles.fill, { width: `${pct}%`, backgroundColor: c.primary }]} />
        </View>
      </Pressable>

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Trial invites
      </Text>
      <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <Icon name="envelope.fill" size={20} color="tertiary" />
        <Text variant="callout" color="primary" weight="semibold">No trial invites yet</Text>
        <Text variant="footnote" color="secondary">
          Clubs that view your profile can invite you to a trial. You'll see invites here.
        </Text>
      </View>

      <Text variant="headline" color="primary" weight="semibold" style={styles.section}>
        Nearby clubs
      </Text>
      <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <Icon name="magnifyingglass" size={20} color="tertiary" />
        <Text variant="callout" color="primary" weight="semibold">Nearby clubs</Text>
        <Text variant="footnote" color="secondary">
          We'll surface clubs searching for your position once discovery launches.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  section: { marginTop: space.lg },
  hero: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.sm,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  empty: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.xs,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-free-agent.spec.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/home/FreeAgentHome.tsx apps/mobile/app/__tests__/home-free-agent.spec.tsx
git commit -m "feat(mobile): FreeAgentHome with profile completeness and polished empty states"
```

---

## Task 10: Branching shell in `app/(tabs)/index.tsx`

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx` (full rewrite — old body is already preserved in `LegacyHomeScreen.tsx`).
- Test: `apps/mobile/app/__tests__/home-branching.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/home-branching.spec.tsx
import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import HomeScreen from '../(tabs)/index'
import {
  setFeatureOverride,
  clearFeatureOverrides,
} from '../../src/utils/featureFlags'

const authState: any = {
  user: { name: 'QA', registrationRole: 'PLAYER' },
  activeClub: null,
  activeTeamId: null,
  activeTeamAccess: null,
  teamsForActiveClub: [],
}

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => { cb() }, [cb])
  },
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => authState,
}))

jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#1E3A5F', primary50: '#DDE7F1' }),
    useIsDark: () => false,
  }
})

jest.mock('../../src/api/client', () => ({
  api: jest.fn(() => Promise.resolve([])),
}))

jest.mock('../../src/components/TeamSwitcher', () => ({ TeamSwitcher: () => null }))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-GB',
}))

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={{ insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 375, height: 812 } }}>
    {ui}
  </SafeAreaProvider>
)

describe('HomeScreen branching', () => {
  afterEach(() => clearFeatureOverrides())

  it('falls back to LegacyHomeScreen when flag is off', () => {
    setFeatureOverride('anstoss.roleAwareHome', false)
    authState.activeClub = {
      role: 'OWNER',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    const { getByText } = render(wrap(<HomeScreen />))
    // LegacyHomeScreen shows the greeting t-key as plain text in this mock
    expect(getByText('home.greetingMorning,')).toBeTruthy()
  })

  it('renders AdminHome branch for OWNER when flag is on', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'OWNER',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText(/Dashboard/i)).toBeTruthy()
    expect(await findByText('FC QA')).toBeTruthy()
  })

  it('renders CoachHome branch for COACH', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'COACH',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = 'team-1'
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText(/Next match/i)).toBeTruthy()
  })

  it('renders PlayerHome branch for PLAYER', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'PLAYER',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = 'team-1'
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText(/Next event/i)).toBeTruthy()
  })

  it('renders ParentHome branch for PARENT', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = {
      role: 'PARENT',
      club: { id: 'c1', name: 'FC QA', badgeUrl: null, primaryColor: '#000' },
    }
    authState.activeTeamId = null
    const { findByText } = render(wrap(<HomeScreen />))
    await waitFor(() => expect(findByText(/Next event/i)).toBeTruthy())
  })

  it('renders FreeAgentHome when no club and registrationRole is FREE_AGENT', async () => {
    setFeatureOverride('anstoss.roleAwareHome', true)
    authState.activeClub = null
    authState.user = { name: 'QA', registrationRole: 'FREE_AGENT' }
    const { findByText } = render(wrap(<HomeScreen />))
    expect(await findByText(/Profile/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-branching.spec.tsx`
Expected: FAIL (the current `app/(tabs)/index.tsx` is the monolithic version).

- [ ] **Step 3: Rewrite `app/(tabs)/index.tsx`**

```tsx
// apps/mobile/app/(tabs)/index.tsx
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { isFeatureEnabled } from '../../src/utils/featureFlags'
import { resolveHomeRole } from '../../src/components/home/resolveHomeRole'
import { HomeHeader } from '../../src/components/home/HomeHeader'
import { HomeErrorBoundary } from '../../src/components/home/HomeErrorBoundary'
import { LegacyHomeScreen } from '../../src/components/home/LegacyHomeScreen'
import { AdminHome } from '../../src/components/home/AdminHome'
import { CoachHome } from '../../src/components/home/CoachHome'
import { PlayerHome } from '../../src/components/home/PlayerHome'
import { ParentHome } from '../../src/components/home/ParentHome'
import { FreeAgentHome } from '../../src/components/home/FreeAgentHome'
import { TAB_BAR_CLEARANCE, space } from '../../src/theme/tokens'

export default function HomeScreen() {
  const flagOn = isFeatureEnabled('anstoss.roleAwareHome')
  if (!flagOn) {
    return <LegacyHomeScreen />
  }
  return (
    <HomeErrorBoundary fallback={() => <LegacyHomeScreen />}>
      <RoleAwareHome />
    </HomeErrorBoundary>
  )
}

function RoleAwareHome() {
  const { user, activeClub, activeTeamId } = useAuth()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const role = resolveHomeRole({
    clubRole: activeClub?.role ?? null,
    registrationRole: user?.registrationRole ?? null,
  })

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.md, paddingBottom: TAB_BAR_CLEARANCE + space.lg },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {activeClub ? (
        <HomeHeader
          clubName={activeClub.club.name}
          clubBadgeUrl={activeClub.club.badgeUrl ?? null}
          roleLabel={role}
          notificationCount={0}
          onNotificationsPress={() => router.push('/notifications' as never)}
        />
      ) : (
        <HomeHeader
          clubName="Anstoss"
          clubBadgeUrl={null}
          roleLabel={role}
          notificationCount={0}
          onNotificationsPress={() => router.push('/notifications' as never)}
        />
      )}

      <View style={styles.body}>
        {role === 'ADMIN' && activeClub ? <AdminHome clubId={activeClub.club.id} /> : null}
        {role === 'COACH' && activeClub ? <CoachHome clubId={activeClub.club.id} teamId={activeTeamId} /> : null}
        {role === 'PLAYER' && activeClub ? <PlayerHome clubId={activeClub.club.id} teamId={activeTeamId} /> : null}
        {role === 'PARENT' ? <ParentHome /> : null}
        {role === 'FREE_AGENT' ? <FreeAgentHome /> : null}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: space.lg },
  body: { marginTop: space.md },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/mobile && npx jest --watch=false app/__tests__/home-branching.spec.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/\(tabs\)/index.tsx apps/mobile/app/__tests__/home-branching.spec.tsx
git commit -m "feat(mobile): role-aware home branching shell with flag and legacy fallback"
```

---

## Task 11: Final sweep — tests, typecheck, push, PR update

- [ ] **Step 1: Mobile test suite**

Run: `cd apps/mobile && npm test -- --watch=false`

Expected: all Task 1–10 test files pass. Any pre-existing failures captured in Task 0 (e.g. `home-role-behavior.spec.tsx`, `home-stats-layout.spec.tsx` SafeAreaProvider issues, `more-tab`, `admin-dashboard`) are unchanged — do NOT alter those suites in this phase. New spec files added in this plan:
  - `src/utils/__tests__/featureFlags.spec.ts`
  - `src/components/home/__tests__/resolveHomeRole.spec.ts`
  - `src/components/home/__tests__/HomeHeader.spec.tsx`
  - `src/components/home/__tests__/HomeErrorBoundary.spec.tsx`
  - `app/__tests__/home-admin.spec.tsx`
  - `app/__tests__/home-coach.spec.tsx`
  - `app/__tests__/home-player.spec.tsx`
  - `app/__tests__/home-parent.spec.tsx`
  - `app/__tests__/home-free-agent.spec.tsx`
  - `app/__tests__/home-branching.spec.tsx`

- [ ] **Step 2: Mobile typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Shared typecheck (should be untouched)**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: API typecheck (should be untouched)**

Run: `cd apps/api && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Lint**

Run: `cd apps/mobile && npm run lint`
Expected: clean (or no new warnings beyond the pre-existing Task 0 baseline).

- [ ] **Step 6: Push**

Assumes the Phase 3 working branch (e.g., `feat/renuir-design-revamp`) is checked out.

```bash
git push origin feat/renuir-design-revamp
```

- [ ] **Step 7: Update PR description**

Append a "Phase 3c — Role-aware Home" section to the existing revamp PR listing the 11 tasks shipped, the feature-flag name (`anstoss.roleAwareHome`), and the four deferred follow-ups (flag removal, PARENT child-switcher, FREE_AGENT trial invites, FREE_AGENT nearby clubs). Note that the legacy home remains the fallback.

- [ ] **Step 8: File deferred follow-up tickets**

Create Linear tickets (one each) for:
1. "Remove `anstoss.roleAwareHome` feature flag after one release" — acceptance: flag removed, `LegacyHomeScreen.tsx` deleted, `app/(tabs)/index.tsx` inlines `RoleAwareHome`.
2. "PARENT home: multi-child switcher" — depends on backend endpoint `GET /me/children`.
3. "FREE_AGENT home: trial invites block" — depends on `GET /me/free-agent/trial-invites`.
4. "FREE_AGENT home: nearby clubs block" — depends on `GET /free-agents/:id/nearby-clubs`.

---

## Self-review checklist

- Every spec §4.3 row has a dedicated task (Task 5 ADMIN, Task 6 COACH, Task 7 PLAYER, Task 8 PARENT, Task 9 FREE_AGENT).
- Shared chrome (club badge + name, notification bell, role chip) implemented in Task 3 (`HomeHeader` + `HomeRoleChip`); wired into the branching shell in Task 10.
- Feature flag (`anstoss.roleAwareHome`) defined in Task 1 with test-only overrides; consumed in Task 10 with a `HomeErrorBoundary` fallback to `LegacyHomeScreen`; flag removal is explicitly deferred to a follow-up ticket (Task 11 Step 8).
- Legacy home preserved verbatim in Task 4 (`LegacyHomeScreen.tsx`) — no behavior change to the flag-off path.
- Every task starts with a failing test, then implementation, then green test, then commit. TDD cadence matches Phase 3a.
- Every task is 2–5 minutes per step; no step hides multiple sub-features.
- All new home tests wrap rendered trees in `SafeAreaProvider` with `initialMetrics`, avoiding the pre-existing SafeAreaProvider issue in `home-role-behavior.spec.tsx` and `home-stats-layout.spec.tsx`.
- `HomeRole` discriminator (Task 2) is reused consistently by the branching shell (Task 10).
- FREE_AGENT trial-invites and nearby-clubs blocks ship as polished empty states with `TODO(phase-3c-followup)` comments — no fabricated data, no new backend endpoints.
- PARENT multi-child switcher deferred with an explicit inline `TODO(phase-3c-followup)` in `ParentHome.tsx` and a dedicated follow-up ticket.
- No "TBD" / "handle edge cases" / "similar to Task N" placeholders.
- `MembershipRole` string values (`OWNER`, `ADMIN`, `COACH`, `PLAYER`, `PARENT`) and `RegistrationRole` string values (`FREE_AGENT`, etc.) used consistently across every task.
- Total: 11 tasks; ~3 working days (flag + resolver + chrome = day 1; three role screens = day 2; two role screens + branching shell + sweep = day 3).
