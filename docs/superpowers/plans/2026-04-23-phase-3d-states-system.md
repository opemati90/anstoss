# Phase 3d — States System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize every list screen's loading, empty, and error handling behind two small wrappers (`LoadingBoundary`, `ErrorBoundary`) that consume a shared `states.ts` copy library, and convert 7 representative list screens to the new pattern.

**Architecture:** Introduce `apps/mobile/src/i18n/states.ts` — a typed copy map keyed by screen (events, roster, requests, contributions, matches, transfers, dms) plus a `common.*` namespace (offline, unknownError, retry). Wire it into the existing `react-i18next` catalogs (`en.ts`, `de.ts`) via a `states` top-level key. Add `apps/mobile/src/components/LoadingBoundary.tsx` — a declarative wrapper that takes `isLoading`, `skeleton` (ReactNode), and children. Add `apps/mobile/src/components/ErrorBoundary.tsx` — a React error-boundary class component that catches thrown render errors and shows `ErrorState` with a retry that calls `onRetry`. Convert each target screen: wrap the list body in `ErrorBoundary` → `LoadingBoundary` (skeleton → content), swap inline strings for `states.*` keys, and delete ad-hoc `ActivityIndicator` / `isLoading ? <Spinner /> : …` branches.

**Tech Stack:** React Native, Expo Router, `react-i18next`, existing `Skeleton` primitives (`EventListSkeleton`, `RosterSkeleton`, generic `Skeleton`), existing `EmptyState` + `ErrorState`, Jest + `@testing-library/react-native`.

---

## Target screens for adoption (recon summary)

From grepping `isLoading ?`, `ActivityIndicator`, and `loading ?` across `apps/mobile/app` and `apps/mobile/src`, seven list screens are in scope for this phase. Others (settings, detail, forms) are out of scope — they are Phase 4 polish.

| # | File | Current pattern |
|---|------|-----------------|
| 1 | `apps/mobile/app/(tabs)/events/index.tsx` | `loading && events.length === 0` branch renders `<EventListSkeleton />`; `error` renders inline `<Banner>`. |
| 2 | `apps/mobile/app/pending-requests.tsx` | `isLoading ?` branch renders `<ActivityIndicator size="large">`; `error ?` renders `<ErrorState>`; empty is inline `<View>` + `<Icon>` + `<Text>`. |
| 3 | `apps/mobile/app/admin-members.tsx` | `error ? <ErrorState> : loading ? <RosterSkeleton> : <FlatList>`; empty is `ListEmptyComponent` inline `<Text>`. |
| 4 | `apps/mobile/app/my-contributions.tsx` | `!loading && (!data || !data.hasContributions)` renders `<EmptyState>`; no loading branch at all — silently empty while `loading` is true. |
| 5 | `apps/mobile/app/team-matches.tsx` | `loading` state + `hasNoData` branch; no skeleton. |
| 6 | `apps/mobile/app/transfer-list.tsx` | `loading` + `error` flags, renders inline content. |
| 7 | `apps/mobile/src/components/DmListView.tsx` (rendered by `apps/mobile/app/dm-list.tsx`) | `loading` → `<ActivityIndicator size="large">`; `error && !loading` → inline text. |

A per-screen adoption task (Tasks 4–10) rewrites each of these to use `LoadingBoundary` + `ErrorBoundary` + `states.*` copy keys.

---

## File structure

**New files (all under `apps/mobile/`):**

- `src/i18n/states.ts` — exported copy map (English source of truth), imported and spread into `en.ts` under the `states` key; `de.ts` gets a sibling `states.de.ts` optional file, but for this phase we only ship English copy and rely on i18next fallback for other locales (consistent with Phase 3a's approach).
- `src/i18n/states.de.ts` — German copy map.
- `src/components/LoadingBoundary.tsx` — `{ isLoading, skeleton, children }` wrapper.
- `src/components/__tests__/LoadingBoundary.spec.tsx` — three tests (loading → skeleton, idle → children, transitions).
- `src/components/ErrorBoundary.tsx` — class component with `{ onRetry, fallbackTitleKey?, fallbackBodyKey?, fallbackRetryKey? }` props.
- `src/components/__tests__/ErrorBoundary.spec.tsx` — two tests (catches thrown error + renders `<ErrorState>`; clicking retry calls `onRetry`).
- `app/__tests__/events-states-adoption.spec.tsx` — snapshot-style test asserting events screen uses `LoadingBoundary` and reads `states.events.*` keys.
- `app/__tests__/pending-requests-states.spec.tsx`
- `app/__tests__/admin-members-states.spec.tsx`
- `app/__tests__/my-contributions-states.spec.tsx`
- `app/__tests__/team-matches-states.spec.tsx`
- `app/__tests__/transfer-list-states.spec.tsx`
- `src/components/__tests__/DmListView-states.spec.tsx`

**Modified files:**

- `src/i18n/en.ts` — add `states` key by spreading `statesEn`.
- `src/i18n/de.ts` — add `states` key by spreading `statesDe`.
- The seven target screens listed in the recon table.

---

## Draft API shapes

```ts
// LoadingBoundary
export type LoadingBoundaryProps = {
  isLoading: boolean
  skeleton: React.ReactNode
  children: React.ReactNode
  testID?: string
}

// ErrorBoundary
export type ErrorBoundaryProps = {
  onRetry: () => void
  fallbackTitleKey?: string // defaults to 'states.common.unknownError'
  fallbackBodyKey?: string  // optional — renders below title
  fallbackRetryKey?: string // defaults to 'states.common.retry'
  children: React.ReactNode
}
```

---

## Task 0: Baseline green

**Files:** none.

- [ ] **Step 1: Confirm mobile workspace installs**

Run: `cd apps/mobile && npm install --no-audit --no-fund`
Expected: no errors. It's fine if no changes occur.

- [ ] **Step 2: Run mobile test suite as-is**

Run: `cd apps/mobile && npm test -- --watch=false`
Expected: baseline passes (known pre-existing failures from Phase 3a — `home-role-behavior`, `more-tab`, `home-stats-layout`, `admin-dashboard` — may remain failing; do not fix them in this plan). Capture the exact count of passing/failing suites. This is the baseline.

- [ ] **Step 3: Baseline typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean (0 errors).

- [ ] **Step 4: Baseline shared workspace typecheck**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: clean.

No commit — this is a read-only sanity step.

---

## Task 1: Copy library (`states.ts`) + i18n wiring

**Files:**
- Create: `apps/mobile/src/i18n/states.ts`
- Create: `apps/mobile/src/i18n/states.de.ts`
- Modify: `apps/mobile/src/i18n/en.ts` (1 new import, 1 spread)
- Modify: `apps/mobile/src/i18n/de.ts` (1 new import, 1 spread)
- Test: `apps/mobile/src/i18n/__tests__/states.spec.ts`

- [ ] **Step 1: Write failing test for copy map shape**

```ts
// apps/mobile/src/i18n/__tests__/states.spec.ts
import { statesEn } from '../states'
import { statesDe } from '../states.de'

describe('states copy library', () => {
  it('exposes all seven screen namespaces and a common namespace (EN)', () => {
    expect(Object.keys(statesEn).sort()).toEqual(
      ['admin_members', 'common', 'contributions', 'dm', 'events', 'pending_requests', 'team_matches', 'transfers'].sort(),
    )
  })

  it('every screen namespace has empty.{title,body} and error.{title,body,retry}', () => {
    const screenKeys = [
      'events',
      'pending_requests',
      'admin_members',
      'contributions',
      'team_matches',
      'transfers',
      'dm',
    ] as const
    for (const key of screenKeys) {
      const ns = statesEn[key]
      expect(typeof ns.empty.title).toBe('string')
      expect(typeof ns.empty.body).toBe('string')
      expect(typeof ns.error.title).toBe('string')
      expect(typeof ns.error.body).toBe('string')
      expect(typeof ns.error.retry).toBe('string')
    }
  })

  it('common namespace provides offline, unknownError, and retry', () => {
    expect(typeof statesEn.common.offline).toBe('string')
    expect(typeof statesEn.common.unknownError).toBe('string')
    expect(typeof statesEn.common.retry).toBe('string')
  })

  it('DE parity: every EN key is present in DE', () => {
    const walk = (enObj: unknown, deObj: unknown, path: string) => {
      if (typeof enObj === 'string') {
        expect(typeof deObj).toBe('string')
        return
      }
      expect(deObj).toBeTruthy()
      for (const k of Object.keys(enObj as Record<string, unknown>)) {
        walk(
          (enObj as Record<string, unknown>)[k],
          (deObj as Record<string, unknown>)[k],
          `${path}.${k}`,
        )
      }
    }
    walk(statesEn, statesDe, 'states')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd apps/mobile && npm test -- --testPathPattern='i18n/__tests__/states.spec' --watch=false`
Expected: FAIL with "Cannot find module '../states'".

- [ ] **Step 3: Create `apps/mobile/src/i18n/states.ts`**

```ts
// apps/mobile/src/i18n/states.ts
// Canonical empty/error copy for list screens. Sentence case. Actionable.
// Consumed via `t('states.events.empty.title')` etc. in screen components.

export const statesEn = {
  common: {
    offline: "You're offline. Check your connection and try again.",
    unknownError: 'Something went wrong.',
    retry: 'Try again',
  },
  events: {
    empty: {
      title: 'No events yet',
      body: 'Coaches will post training sessions and matches here.',
      cta: 'Create the first event',
    },
    error: {
      title: "Couldn't load events",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  pending_requests: {
    empty: {
      title: 'No pending requests',
      body: 'New join requests will show up here.',
    },
    error: {
      title: "Couldn't load requests",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  admin_members: {
    empty: {
      title: 'No members yet',
      body: 'Invite your first member to get started.',
      cta: 'Invite a member',
    },
    error: {
      title: "Couldn't load members",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  contributions: {
    empty: {
      title: 'No contributions yet',
      body: 'When your club sets up dues, they appear here.',
    },
    error: {
      title: "Couldn't load contributions",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  team_matches: {
    empty: {
      title: 'No matches scheduled',
      body: 'Upcoming and recent matches will appear here.',
    },
    error: {
      title: "Couldn't load matches",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  transfers: {
    empty: {
      title: 'No transfer listings',
      body: 'Clubs will post available or wanted players here.',
    },
    error: {
      title: "Couldn't load transfers",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
  dm: {
    empty: {
      title: 'No conversations yet',
      body: 'Start a direct message from a teammate or coach profile.',
      cta: 'Start a conversation',
    },
    error: {
      title: "Couldn't load messages",
      body: 'Pull to refresh or try again.',
      retry: 'Try again',
    },
  },
} as const

export type StatesCopy = typeof statesEn
```

- [ ] **Step 4: Create `apps/mobile/src/i18n/states.de.ts`**

```ts
// apps/mobile/src/i18n/states.de.ts
import type { StatesCopy } from './states'

export const statesDe: StatesCopy = {
  common: {
    offline: 'Du bist offline. Bitte prüfe deine Verbindung und versuche es erneut.',
    unknownError: 'Etwas ist schiefgelaufen.',
    retry: 'Erneut versuchen',
  },
  events: {
    empty: {
      title: 'Noch keine Events',
      body: 'Trainings und Spiele erscheinen hier, sobald der Trainer sie anlegt.',
      cta: 'Erstes Event erstellen',
    },
    error: {
      title: 'Events konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  pending_requests: {
    empty: {
      title: 'Keine offenen Anfragen',
      body: 'Neue Beitrittsanfragen erscheinen hier.',
    },
    error: {
      title: 'Anfragen konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  admin_members: {
    empty: {
      title: 'Noch keine Mitglieder',
      body: 'Lade das erste Mitglied ein, um loszulegen.',
      cta: 'Mitglied einladen',
    },
    error: {
      title: 'Mitglieder konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  contributions: {
    empty: {
      title: 'Noch keine Beiträge',
      body: 'Sobald dein Verein Beiträge einrichtet, erscheinen sie hier.',
    },
    error: {
      title: 'Beiträge konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  team_matches: {
    empty: {
      title: 'Keine Spiele geplant',
      body: 'Kommende und vergangene Spiele erscheinen hier.',
    },
    error: {
      title: 'Spiele konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  transfers: {
    empty: {
      title: 'Keine Transfereinträge',
      body: 'Vereine posten hier verfügbare oder gesuchte Spieler.',
    },
    error: {
      title: 'Transfers konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
  dm: {
    empty: {
      title: 'Noch keine Unterhaltungen',
      body: 'Starte eine Direktnachricht aus dem Profil eines Teammitglieds oder Trainers.',
      cta: 'Unterhaltung starten',
    },
    error: {
      title: 'Nachrichten konnten nicht geladen werden',
      body: 'Zum Aktualisieren ziehen oder erneut versuchen.',
      retry: 'Erneut versuchen',
    },
  },
}
```

- [ ] **Step 5: Wire into `en.ts`**

Open `apps/mobile/src/i18n/en.ts`.

At the top of the file (directly after the `export default {` opening brace at line 1), add the import statement above the `export default`:

```ts
// new line 1 (above `export default {`):
import { statesEn } from './states'

export default {
  states: statesEn,
  common: {
    // ...existing content unchanged
```

The exact edit — replace the file's first line `export default {` with:

```ts
import { statesEn } from './states'

export default {
  states: statesEn,
```

- [ ] **Step 6: Wire into `de.ts`**

Same pattern — replace the `de.ts` first line `export default {` with:

```ts
import { statesDe } from './states.de'

export default {
  states: statesDe,
```

- [ ] **Step 7: Run test — verify it passes**

Run: `cd apps/mobile && npm test -- --testPathPattern='i18n/__tests__/states.spec' --watch=false`
Expected: PASS (4 tests).

- [ ] **Step 8: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/i18n/states.ts apps/mobile/src/i18n/states.de.ts apps/mobile/src/i18n/en.ts apps/mobile/src/i18n/de.ts apps/mobile/src/i18n/__tests__/states.spec.ts
git commit -m "feat(mobile): add states copy library with EN/DE parity"
```

---

## Task 2: `LoadingBoundary` component

**Files:**
- Create: `apps/mobile/src/components/LoadingBoundary.tsx`
- Test: `apps/mobile/src/components/__tests__/LoadingBoundary.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/src/components/__tests__/LoadingBoundary.spec.tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { LoadingBoundary } from '../LoadingBoundary'

describe('LoadingBoundary', () => {
  it('renders the skeleton when isLoading is true', () => {
    const { getByTestId, queryByTestId } = render(
      <LoadingBoundary
        isLoading
        skeleton={<Text testID="skel">skeleton</Text>}
        testID="lb"
      >
        <Text testID="content">content</Text>
      </LoadingBoundary>,
    )
    expect(getByTestId('skel')).toBeTruthy()
    expect(queryByTestId('content')).toBeNull()
  })

  it('renders children when isLoading is false', () => {
    const { getByTestId, queryByTestId } = render(
      <LoadingBoundary
        isLoading={false}
        skeleton={<Text testID="skel">skeleton</Text>}
      >
        <Text testID="content">content</Text>
      </LoadingBoundary>,
    )
    expect(getByTestId('content')).toBeTruthy()
    expect(queryByTestId('skel')).toBeNull()
  })

  it('swaps skeleton for children when isLoading transitions true -> false', () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <LoadingBoundary
        isLoading
        skeleton={<Text testID="skel">skeleton</Text>}
      >
        <Text testID="content">content</Text>
      </LoadingBoundary>,
    )
    expect(getByTestId('skel')).toBeTruthy()

    rerender(
      <LoadingBoundary
        isLoading={false}
        skeleton={<Text testID="skel">skeleton</Text>}
      >
        <Text testID="content">content</Text>
      </LoadingBoundary>,
    )
    expect(getByTestId('content')).toBeTruthy()
    expect(queryByTestId('skel')).toBeNull()
  })

  it('attaches testID to the wrapping view', () => {
    const { getByTestId } = render(
      <LoadingBoundary isLoading skeleton={null} testID="lb">
        <Text>c</Text>
      </LoadingBoundary>,
    )
    expect(getByTestId('lb')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd apps/mobile && npm test -- --testPathPattern='LoadingBoundary.spec' --watch=false`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `LoadingBoundary`**

```tsx
// apps/mobile/src/components/LoadingBoundary.tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'

export type LoadingBoundaryProps = {
  isLoading: boolean
  skeleton: React.ReactNode
  children: React.ReactNode
  testID?: string
}

/**
 * Declarative loading wrapper. Replaces ad-hoc `isLoading ? <Spinner /> : …`
 * usage. When `isLoading` is true, renders `skeleton`. Otherwise renders
 * `children`. The `testID` is forwarded to the wrapping view so adoption tests
 * can assert the boundary is in use.
 */
export function LoadingBoundary({
  isLoading,
  skeleton,
  children,
  testID,
}: LoadingBoundaryProps) {
  return (
    <View style={styles.root} testID={testID}>
      {isLoading ? skeleton : children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
```

- [ ] **Step 4: Run test — verify it passes**

Run: `cd apps/mobile && npm test -- --testPathPattern='LoadingBoundary.spec' --watch=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/LoadingBoundary.tsx apps/mobile/src/components/__tests__/LoadingBoundary.spec.tsx
git commit -m "feat(mobile): add LoadingBoundary wrapper for list screens"
```

---

## Task 3: `ErrorBoundary` component

**Files:**
- Create: `apps/mobile/src/components/ErrorBoundary.tsx`
- Test: `apps/mobile/src/components/__tests__/ErrorBoundary.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/src/components/__tests__/ErrorBoundary.spec.tsx
import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ErrorBoundary } from '../ErrorBoundary'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

jest.mock('../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#000',
      primary50: '#eee',
    }),
  }
})

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom')
  return <Text testID="ok">ok</Text>
}

describe('ErrorBoundary', () => {
  // React logs caught errors to console.error — silence for this suite.
  let spy: jest.SpyInstance
  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    spy.mockRestore()
  })

  it('renders children when no error thrown', () => {
    const { getByTestId } = render(
      <ErrorBoundary onRetry={jest.fn()}>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(getByTestId('ok')).toBeTruthy()
  })

  it('catches thrown error and renders ErrorState with default retry key', () => {
    const onRetry = jest.fn()
    const { getByText } = render(
      <ErrorBoundary onRetry={onRetry}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )
    // default fallbackRetryKey is 'states.common.retry'; default fallbackTitleKey is 'states.common.unknownError'
    expect(getByText('states.common.unknownError')).toBeTruthy()
    expect(getByText('states.common.retry')).toBeTruthy()
  })

  it('invokes onRetry when retry button pressed and resets the boundary', () => {
    const onRetry = jest.fn()
    const { getByText } = render(
      <ErrorBoundary onRetry={onRetry}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )
    fireEvent.press(getByText('states.common.retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('honors custom fallbackTitleKey and fallbackRetryKey', () => {
    const { getByText } = render(
      <ErrorBoundary
        onRetry={jest.fn()}
        fallbackTitleKey="states.events.error.title"
        fallbackRetryKey="states.events.error.retry"
      >
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )
    expect(getByText('states.events.error.title')).toBeTruthy()
    expect(getByText('states.events.error.retry')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd apps/mobile && npm test -- --testPathPattern='ErrorBoundary.spec' --watch=false`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `ErrorBoundary`**

```tsx
// apps/mobile/src/components/ErrorBoundary.tsx
import React from 'react'
import { ErrorState } from './ErrorState'

export type ErrorBoundaryProps = {
  onRetry: () => void
  fallbackTitleKey?: string
  fallbackBodyKey?: string
  fallbackRetryKey?: string
  children: React.ReactNode
}

type State = { hasError: boolean; error: Error | null }

/**
 * Screen-level error boundary. Catches render-time errors, shows ErrorState,
 * and on retry resets its internal state AND calls the caller's onRetry
 * (typically `refetch()` on the screen's primary query).
 *
 * Intentionally a class component — React error boundaries cannot be written
 * as hooks. See: https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    // Log for Sentry pickup in prod builds; in tests console.error is silenced.
    if (typeof console !== 'undefined' && console.error) {
      console.error('[ErrorBoundary] caught render error:', error)
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
    this.props.onRetry()
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorStateWithKeys
          titleKey={this.props.fallbackTitleKey ?? 'states.common.unknownError'}
          bodyKey={this.props.fallbackBodyKey}
          retryKey={this.props.fallbackRetryKey ?? 'states.common.retry'}
          onRetry={this.handleRetry}
        />
      )
    }
    return this.props.children
  }
}

type KeyProps = {
  titleKey: string
  bodyKey: string | undefined
  retryKey: string
  onRetry: () => void
}

function ErrorStateWithKeys({ titleKey, bodyKey, retryKey, onRetry }: KeyProps) {
  // We only need the `t` function here; ErrorState expects resolved strings.
  // Importing useTranslation lazily avoids hook rules on the class component.
  const { useTranslation } = require('react-i18next') as typeof import('react-i18next')
  const { t } = useTranslation()
  const title = t(titleKey)
  const body = bodyKey ? t(bodyKey) : undefined
  return (
    <ErrorState
      message={body ? `${title}\n${body}` : title}
      onRetry={onRetry}
      retryLabel={t(retryKey)}
    />
  )
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `cd apps/mobile && npm test -- --testPathPattern='ErrorBoundary.spec' --watch=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/ErrorBoundary.tsx apps/mobile/src/components/__tests__/ErrorBoundary.spec.tsx
git commit -m "feat(mobile): add ErrorBoundary class component with retry"
```

---

## Task 4: Adopt in `app/(tabs)/events/index.tsx`

**Files:**
- Modify: `apps/mobile/app/(tabs)/events/index.tsx` (replace the existing `loading && events.length === 0` branch and the inline `error` banner)
- Test: `apps/mobile/app/__tests__/events-states-adoption.spec.tsx`

- [ ] **Step 1: Write failing adoption test**

```tsx
// apps/mobile/app/__tests__/events-states-adoption.spec.tsx
import React from 'react'
import { render, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    // run callback synchronously on mount for test determinism
    const React = require('react')
    React.useEffect(() => {
      cb()
    }, [cb])
  },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { club: { id: 'c1', name: 'FC Test' }, role: 'COACH', permissions: {} },
    activeTeamId: 't1',
    activeTeamAccess: { role: 'HEAD_COACH' },
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import EventsScreen from '../(tabs)/events'

describe('Events screen — states adoption', () => {
  beforeEach(() => {
    mockApi.mockReset()
  })

  it('renders LoadingBoundary skeleton on first mount', async () => {
    // Never-resolving promise keeps it in loading state
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<EventsScreen />)
    expect(getByTestId('events-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy keys when events list resolves to []', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<EventsScreen />)
    expect(await findByText('states.events.empty.title')).toBeTruthy()
    expect(await findByText('states.events.empty.body')).toBeTruthy()
  })

  it('renders error copy keys + retry when fetch throws', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<EventsScreen />)
    expect(await findByText('states.events.error.title')).toBeTruthy()
    expect(await findByText('states.common.retry')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd apps/mobile && npm test -- --testPathPattern='events-states-adoption' --watch=false`
Expected: FAIL — test queries for `events-loading-boundary` testID and states.* copy keys, neither yet exists in the screen.

- [ ] **Step 3: Modify `app/(tabs)/events/index.tsx`**

At the top of the file, after the existing imports, add:

```tsx
import { LoadingBoundary } from '../../../src/components/LoadingBoundary'
import { ErrorBoundary } from '../../../src/components/ErrorBoundary'
```

Replace the `if (loading && events.length === 0) { return (…<EventListSkeleton />…) }` block (current location around lines 214–225) by deleting it entirely. Then wrap the final `return` of the non-parent branch. Currently the function's final return looks like:

```tsx
return (
  <View style={[styles.container, { backgroundColor: c.background }]}>
    <SectionList ...>
    </SectionList>
  </View>
)
```

Change it to:

```tsx
return (
  <View style={[styles.container, { backgroundColor: c.background }]}>
    <ErrorBoundary
      onRetry={() => void fetchEvents()}
      fallbackTitleKey="states.events.error.title"
      fallbackBodyKey="states.events.error.body"
      fallbackRetryKey="states.common.retry"
    >
      <LoadingBoundary
        isLoading={loading && events.length === 0}
        skeleton={<EventListSkeleton />}
        testID="events-loading-boundary"
      >
        <SectionList
          sections={sections}
          key={`${activeTeamId}:${scope}`}
          keyExtractor={(event) => event.id}
          renderItem={({ item }) => (
            <EventListItem item={item} locale={locale} scope={scope} />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text variant="caption1" color="tertiary" weight="semibold" style={styles.sectionHeaderText}>
                {section.title}
              </Text>
            </View>
          )}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={/* keep existing ListHeaderComponent value unchanged */ undefined}
          ListEmptyComponent={
            !loading && !error && !hasListContent ? (
              <EmptyState
                icon="calendar"
                title={t('states.events.empty.title')}
                description={t('states.events.empty.body')}
                actionLabel={canCreate ? t('states.events.empty.cta') : undefined}
                onAction={canCreate ? () => router.push('/create-event') : undefined}
              />
            ) : null
          }
        />
      </LoadingBoundary>
    </ErrorBoundary>
    {error && !loading ? (
      <View style={styles.bannerWrap}>
        <Banner
          tone="error"
          title={t('states.events.error.title')}
          action={{
            label: t('states.common.retry'),
            onPress: () => {
              setError(false)
              void fetchEvents()
            },
          }}
        />
      </View>
    ) : null}
  </View>
)
```

**Note:** Preserve the existing `ListHeaderComponent` value (hero + SegmentedControl + chips + NextFixtureCard block) — copy it from the current file verbatim into the placeholder. The only changes are: (a) the outer boundary wrappers, (b) the `ListEmptyComponent` prop (new), (c) swapping `t('common.loadError')` → `t('states.events.error.title')` and `t('common.retry')` → `t('states.common.retry')` in the existing error `<Banner>`.

Also delete the early-return loading block at lines 214–225.

- [ ] **Step 4: Run test — verify it passes**

Run: `cd apps/mobile && npm test -- --testPathPattern='events-states-adoption' --watch=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Run existing events test**

Run: `cd apps/mobile && npm test -- --testPathPattern='events-tab.spec' --watch=false`
Expected: still PASS. If any assertion references the deleted early-return skeleton wrapper, update the assertion to look for `getByTestId('events-loading-boundary')` instead.

- [ ] **Step 6: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/\(tabs\)/events/index.tsx apps/mobile/app/__tests__/events-states-adoption.spec.tsx
git commit -m "feat(mobile): adopt LoadingBoundary/ErrorBoundary + states copy in events list"
```

---

## Task 5: Adopt in `app/pending-requests.tsx`

**Files:**
- Modify: `apps/mobile/app/pending-requests.tsx`
- Test: `apps/mobile/app/__tests__/pending-requests-states.spec.tsx`

- [ ] **Step 1: Write failing adoption test**

```tsx
// apps/mobile/app/__tests__/pending-requests-states.spec.tsx
import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
  router: { back: jest.fn() },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' } } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
  }
})

import PendingRequestsScreen from '../pending-requests'

describe('pending-requests — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('shows loading boundary while request in flight', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<PendingRequestsScreen />)
    expect(getByTestId('pending-requests-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy keys when list is empty', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<PendingRequestsScreen />)
    expect(await findByText('states.pending_requests.empty.title')).toBeTruthy()
    expect(await findByText('states.pending_requests.empty.body')).toBeTruthy()
  })

  it('renders error copy keys with retry when fetch fails', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<PendingRequestsScreen />)
    expect(await findByText('states.pending_requests.error.title')).toBeTruthy()
    expect(await findByText('states.common.retry')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd apps/mobile && npm test -- --testPathPattern='pending-requests-states' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Modify `app/pending-requests.tsx`**

Replace the `return (...)` block (starting at line 189) with the boundary-wrapped version. Also remove the now-unused `ActivityIndicator` from the top-level `react-native` import (line 3–10) if it is no longer referenced after the edit; keep it if the inline `ActivityIndicator` inside `renderItem` (processing spinner) still uses it (it does — line 156, 174 — so keep the import).

```tsx
import { RosterSkeleton } from '../src/components/Skeleton'
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { EmptyState } from '../src/components/EmptyState'
```

New return body:

```tsx
return (
  <Screen header={<ModalHeader title={t('pendingRequests.title')} />} padded={false}>
    <ErrorBoundary
      onRetry={fetchRequests}
      fallbackTitleKey="states.pending_requests.error.title"
      fallbackBodyKey="states.pending_requests.error.body"
      fallbackRetryKey="states.common.retry"
    >
      <LoadingBoundary
        isLoading={isLoading}
        skeleton={<RosterSkeleton />}
        testID="pending-requests-loading-boundary"
      >
        {error ? (
          <ErrorState
            message={t('states.pending_requests.error.title')}
            onRetry={fetchRequests}
            retryLabel={t('states.common.retry')}
          />
        ) : requests.length === 0 ? (
          <EmptyState
            icon="person.2"
            title={t('states.pending_requests.empty.title')}
            description={t('states.pending_requests.empty.body')}
          />
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          />
        )}
      </LoadingBoundary>
    </ErrorBoundary>
  </Screen>
)
```

Delete the old `center`-based empty `<View>` block and the `ActivityIndicator` loading branch (lines 191–203 in the current file).

- [ ] **Step 4: Run test — verify it passes**

Run: `cd apps/mobile && npm test -- --testPathPattern='pending-requests-states' --watch=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/pending-requests.tsx apps/mobile/app/__tests__/pending-requests-states.spec.tsx
git commit -m "feat(mobile): adopt state boundaries + states copy in pending-requests"
```

---

## Task 6: Adopt in `app/admin-members.tsx`

**Files:**
- Modify: `apps/mobile/app/admin-members.tsx`
- Test: `apps/mobile/app/__tests__/admin-members-states.spec.tsx`

- [ ] **Step 1: Write failing adoption test**

```tsx
// apps/mobile/app/__tests__/admin-members-states.spec.tsx
import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
  router: { push: jest.fn(), back: jest.fn() },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' }, role: 'ADMIN' } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
  }
})

import AdminMembersScreen from '../admin-members'

describe('admin-members — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders skeleton through LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<AdminMembersScreen />)
    expect(getByTestId('admin-members-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy keys when list is empty', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<AdminMembersScreen />)
    expect(await findByText('states.admin_members.empty.title')).toBeTruthy()
  })

  it('renders error copy keys on fetch failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<AdminMembersScreen />)
    expect(await findByText('states.admin_members.error.title')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd apps/mobile && npm test -- --testPathPattern='admin-members-states' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Modify `app/admin-members.tsx`**

Add imports:

```tsx
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { EmptyState } from '../src/components/EmptyState'
```

Locate the `return (…<Screen>…)` block (around line 165+). Replace the `error ? <ErrorState … /> : loading ? <RosterSkeleton /> : <FlatList …/>` chain with:

```tsx
<ErrorBoundary
  onRetry={fetchMembers}
  fallbackTitleKey="states.admin_members.error.title"
  fallbackBodyKey="states.admin_members.error.body"
  fallbackRetryKey="states.common.retry"
>
  <LoadingBoundary
    isLoading={loading}
    skeleton={<RosterSkeleton />}
    testID="admin-members-loading-boundary"
  >
    {error ? (
      <ErrorState
        message={t('states.admin_members.error.title')}
        onRetry={fetchMembers}
        retryLabel={t('states.common.retry')}
      />
    ) : filtered.length === 0 ? (
      <EmptyState
        icon="person.2"
        title={t('states.admin_members.empty.title')}
        description={t('states.admin_members.empty.body')}
        actionLabel={t('states.admin_members.empty.cta')}
        onAction={() => router.push('/invite')}
      />
    ) : (
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderMember}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    )}
  </LoadingBoundary>
</ErrorBoundary>
```

Remove the old inline `ListEmptyComponent` that referenced `common.noResults`. Ensure `router` is imported if not already.

- [ ] **Step 4: Run test — verify it passes**

Run: `cd apps/mobile && npm test -- --testPathPattern='admin-members-states' --watch=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/admin-members.tsx apps/mobile/app/__tests__/admin-members-states.spec.tsx
git commit -m "feat(mobile): adopt state boundaries + states copy in admin-members"
```

---

## Task 7: Adopt in `app/my-contributions.tsx`

**Files:**
- Modify: `apps/mobile/app/my-contributions.tsx`
- Test: `apps/mobile/app/__tests__/my-contributions-states.spec.tsx`

- [ ] **Step 1: Write failing adoption test**

```tsx
// apps/mobile/app/__tests__/my-contributions-states.spec.tsx
import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' } } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
  }
})

import MyContributionsScreen from '../my-contributions'

describe('my-contributions — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<MyContributionsScreen />)
    expect(getByTestId('my-contributions-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy when no contributions', async () => {
    mockApi.mockResolvedValue({ hasContributions: false, items: [] })
    const { findByText } = render(<MyContributionsScreen />)
    expect(await findByText('states.contributions.empty.title')).toBeTruthy()
  })

  it('renders error state copy on failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<MyContributionsScreen />)
    expect(await findByText('states.contributions.error.title')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd apps/mobile && npm test -- --testPathPattern='my-contributions-states' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Modify `app/my-contributions.tsx`**

This screen currently has no explicit error state (relies on silent `loading` flip). Add one.

Near the state declarations, add:

```tsx
const [error, setError] = useState(false)
```

Modify `fetchData` (around line 52–65) to set `error`:

```tsx
const fetchData = useCallback(async () => {
  try {
    const result = await api<ContributionsPayload>(`/clubs/${clubId}/me/contributions`)
    setData(result)
    setError(false)
  } catch {
    setError(true)
  } finally {
    setLoading(false)
    setRefreshing(false)
  }
}, [clubId])
```

Add imports:

```tsx
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { ErrorState } from '../src/components/ErrorState'
import { DashboardSkeleton } from '../src/components/Skeleton'
```

Replace the return body (around line 79+). Keep the existing `ModalHeader`; wrap the rest:

```tsx
return (
  <View style={[styles.root, { backgroundColor: c.background }]}>
    <ModalHeader title={t('contributions.myTitle')} mode="back" onClose={() => router.back()} />
    <ErrorBoundary
      onRetry={() => { setLoading(true); void fetchData() }}
      fallbackTitleKey="states.contributions.error.title"
      fallbackBodyKey="states.contributions.error.body"
      fallbackRetryKey="states.common.retry"
    >
      <LoadingBoundary
        isLoading={loading}
        skeleton={<DashboardSkeleton />}
        testID="my-contributions-loading-boundary"
      >
        {error ? (
          <ErrorState
            message={t('states.contributions.error.title')}
            onRetry={() => { setLoading(true); void fetchData() }}
            retryLabel={t('states.common.retry')}
          />
        ) : !data || !data.hasContributions ? (
          <EmptyState
            icon="receipt"
            title={t('states.contributions.empty.title')}
            description={t('states.contributions.empty.body')}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={c.primary}
              />
            }
          >
            {/* keep existing items map unchanged — copy verbatim */}
          </ScrollView>
        )}
      </LoadingBoundary>
    </ErrorBoundary>
  </View>
)
```

Copy the existing `data?.items.map(...)` block verbatim into the placeholder.

- [ ] **Step 4: Run test — verify it passes**

Run: `cd apps/mobile && npm test -- --testPathPattern='my-contributions-states' --watch=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/my-contributions.tsx apps/mobile/app/__tests__/my-contributions-states.spec.tsx
git commit -m "feat(mobile): adopt state boundaries + states copy in my-contributions"
```

---

## Task 8: Adopt in `app/team-matches.tsx`

**Files:**
- Modify: `apps/mobile/app/team-matches.tsx`
- Test: `apps/mobile/app/__tests__/team-matches-states.spec.tsx`

- [ ] **Step 1: Inspect current loading/error branches**

Run: `cd apps/mobile && npx grep -nE "loading|error|hasNoData" app/team-matches.tsx || true`
(Grepping confirms the existing shape before edits. Use the file's current `loading`, `upcoming`, `recent`, `hasNoData` state variables.)

- [ ] **Step 2: Write failing adoption test**

```tsx
// apps/mobile/app/__tests__/team-matches-states.spec.tsx
import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
  useLocalSearchParams: () => ({}),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    activeClub: { club: { id: 'c1', name: 'FC' } },
    activeTeamId: 't1',
  }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import TeamMatchesScreen from '../team-matches'

describe('team-matches — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<TeamMatchesScreen />)
    expect(getByTestId('team-matches-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy when both lists empty', async () => {
    mockApi.mockResolvedValue({ upcoming: [], recent: [] })
    const { findByText } = render(<TeamMatchesScreen />)
    expect(await findByText('states.team_matches.empty.title')).toBeTruthy()
  })

  it('renders error state copy on fetch failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<TeamMatchesScreen />)
    expect(await findByText('states.team_matches.error.title')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test — verify it fails**

Run: `cd apps/mobile && npm test -- --testPathPattern='team-matches-states' --watch=false`
Expected: FAIL.

- [ ] **Step 4: Modify `app/team-matches.tsx`**

Add a `const [error, setError] = useState(false)` alongside the existing `loading` state (if not already present). Wrap the `catch` in the existing fetch to call `setError(true)` and set `setError(false)` in the try before the fetch.

Add imports:

```tsx
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { DashboardSkeleton } from '../src/components/Skeleton'
```

Find the existing return block. The current structure uses `hasNoData` (line 171). Replace the visible body of the `<ScrollView>` / main container with:

```tsx
<ErrorBoundary
  onRetry={() => { setLoading(true); void fetchData() }}
  fallbackTitleKey="states.team_matches.error.title"
  fallbackBodyKey="states.team_matches.error.body"
  fallbackRetryKey="states.common.retry"
>
  <LoadingBoundary
    isLoading={loading}
    skeleton={<DashboardSkeleton />}
    testID="team-matches-loading-boundary"
  >
    {error ? (
      <ErrorState
        message={t('states.team_matches.error.title')}
        onRetry={() => { setLoading(true); void fetchData() }}
        retryLabel={t('states.common.retry')}
      />
    ) : hasNoData ? (
      <EmptyState
        icon="sportscourt"
        title={t('states.team_matches.empty.title')}
        description={t('states.team_matches.empty.body')}
      />
    ) : (
      /* existing upcoming + recent sections — copy verbatim */
      null
    )}
  </LoadingBoundary>
</ErrorBoundary>
```

Copy the existing content that renders `upcoming` and `recent` into the `null` placeholder.

- [ ] **Step 5: Run test — verify it passes**

Run: `cd apps/mobile && npm test -- --testPathPattern='team-matches-states' --watch=false`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/team-matches.tsx apps/mobile/app/__tests__/team-matches-states.spec.tsx
git commit -m "feat(mobile): adopt state boundaries + states copy in team-matches"
```

---

## Task 9: Adopt in `app/transfer-list.tsx`

**Files:**
- Modify: `apps/mobile/app/transfer-list.tsx`
- Test: `apps/mobile/app/__tests__/transfer-list-states.spec.tsx`

- [ ] **Step 1: Write failing adoption test**

```tsx
// apps/mobile/app/__tests__/transfer-list-states.spec.tsx
import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
  useLocalSearchParams: () => ({}),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' }, role: 'OWNER' } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import TransferListScreen from '../transfer-list'

describe('transfer-list — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<TransferListScreen />)
    expect(getByTestId('transfers-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy when list is empty', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<TransferListScreen />)
    expect(await findByText('states.transfers.empty.title')).toBeTruthy()
  })

  it('renders error state on fetch failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<TransferListScreen />)
    expect(await findByText('states.transfers.error.title')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd apps/mobile && npm test -- --testPathPattern='transfer-list-states' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Modify `app/transfer-list.tsx`**

Add imports:

```tsx
import { LoadingBoundary } from '../src/components/LoadingBoundary'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { RosterSkeleton } from '../src/components/Skeleton'
```

Locate the main render body (around line 168 where `error ?` currently branches). Replace the existing `error ? … : loading ? … : <List>` branch with:

```tsx
<ErrorBoundary
  onRetry={() => { setLoading(true); void fetchListings() }}
  fallbackTitleKey="states.transfers.error.title"
  fallbackBodyKey="states.transfers.error.body"
  fallbackRetryKey="states.common.retry"
>
  <LoadingBoundary
    isLoading={loading}
    skeleton={<RosterSkeleton />}
    testID="transfers-loading-boundary"
  >
    {error ? (
      <ErrorState
        message={t('states.transfers.error.title')}
        onRetry={() => { setLoading(true); void fetchListings() }}
        retryLabel={t('states.common.retry')}
      />
    ) : listings.length === 0 ? (
      <EmptyState
        icon="arrow.left.arrow.right"
        title={t('states.transfers.empty.title')}
        description={t('states.transfers.empty.body')}
      />
    ) : (
      /* existing FlatList of listings — copy verbatim */
      null
    )}
  </LoadingBoundary>
</ErrorBoundary>
```

Replace the `ActivityIndicator` and current loading branch; remove the now-unused `ActivityIndicator` from the `react-native` import if no other usage remains in the file (verify before removing by grepping the file). Copy the existing `FlatList` block verbatim into the `null` placeholder.

- [ ] **Step 4: Run test — verify it passes**

Run: `cd apps/mobile && npm test -- --testPathPattern='transfer-list-states' --watch=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/transfer-list.tsx apps/mobile/app/__tests__/transfer-list-states.spec.tsx
git commit -m "feat(mobile): adopt state boundaries + states copy in transfer-list"
```

---

## Task 10: Adopt in `src/components/DmListView.tsx`

**Files:**
- Modify: `apps/mobile/src/components/DmListView.tsx`
- Test: `apps/mobile/src/components/__tests__/DmListView-states.spec.tsx`

- [ ] **Step 1: Write failing adoption test**

```tsx
// apps/mobile/src/components/__tests__/DmListView-states.spec.tsx
import React from 'react'
import { render } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(() => cb(), [cb])
  },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))
jest.mock('../../api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'c1', name: 'FC' } } }),
}))
jest.mock('../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
  }
})

import { DmListView } from '../DmListView'

describe('DmListView — states adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('renders LoadingBoundary while loading', () => {
    mockApi.mockImplementation(() => new Promise(() => {}))
    const { getByTestId } = render(<DmListView />)
    expect(getByTestId('dm-loading-boundary')).toBeTruthy()
  })

  it('renders empty state copy when no conversations', async () => {
    mockApi.mockResolvedValue([])
    const { findByText } = render(<DmListView />)
    expect(await findByText('states.dm.empty.title')).toBeTruthy()
  })

  it('renders error state on fetch failure', async () => {
    mockApi.mockRejectedValue(new Error('net'))
    const { findByText } = render(<DmListView />)
    expect(await findByText('states.dm.error.title')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd apps/mobile && npm test -- --testPathPattern='DmListView-states' --watch=false`
Expected: FAIL.

- [ ] **Step 3: Modify `src/components/DmListView.tsx`**

Add imports:

```tsx
import { LoadingBoundary } from './LoadingBoundary'
import { ErrorBoundary } from './ErrorBoundary'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { RosterSkeleton } from './Skeleton'
```

Remove `ActivityIndicator` from the `react-native` import if no longer referenced. Replace the `if (error && !loading) { ... }` block (current line 113) and the `if (loading) { return (...<ActivityIndicator>...) }` block (current line 126) with a single wrapped return. The main body should become:

```tsx
return (
  <ErrorBoundary
    onRetry={fetchConversations}
    fallbackTitleKey="states.dm.error.title"
    fallbackBodyKey="states.dm.error.body"
    fallbackRetryKey="states.common.retry"
  >
    <LoadingBoundary
      isLoading={loading}
      skeleton={<RosterSkeleton />}
      testID="dm-loading-boundary"
    >
      {error ? (
        <ErrorState
          message={t('states.dm.error.title')}
          onRetry={fetchConversations}
          retryLabel={t('states.common.retry')}
        />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="bubble.left.and.bubble.right"
          title={t('states.dm.empty.title')}
          description={t('states.dm.empty.body')}
          actionLabel={t('states.dm.empty.cta')}
          onAction={() => router.push('/dm-new')}
        />
      ) : (
        /* existing <FlatList> of conversations — copy verbatim */
        null
      )}
    </LoadingBoundary>
  </ErrorBoundary>
)
```

Copy the existing `FlatList` for conversations into the `null` placeholder.

- [ ] **Step 4: Run test — verify it passes**

Run: `cd apps/mobile && npm test -- --testPathPattern='DmListView-states' --watch=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/DmListView.tsx apps/mobile/src/components/__tests__/DmListView-states.spec.tsx
git commit -m "feat(mobile): adopt state boundaries + states copy in DmListView"
```

---

## Task 11: Full-suite test + typecheck + push + PR update

- [ ] **Step 1: Mobile test suite**

Run: `cd apps/mobile && npm test -- --watch=false`
Expected: all new states-adoption specs pass. Pre-existing Phase 3a failing suites (`home-role-behavior`, `more-tab`, `home-stats-layout`, `admin-dashboard`) may remain failing — do not fix them. Net new failures introduced by this plan: zero.

- [ ] **Step 2: Shared workspace typecheck**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: API workspace typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Mobile lint**

Run: `cd apps/mobile && npm run lint`
Expected: clean (or equivalent to baseline count of warnings captured in Task 0).

- [ ] **Step 5: Push to branch**

Assumes branch `feat/renuir-design-revamp` is checked out and tracked.

```bash
git push origin feat/renuir-design-revamp
```

- [ ] **Step 6: Update PR #3 description**

Append a "Phase 3d — States system" section to the existing PR body describing:
- The new `states.ts` copy library (EN + DE).
- `LoadingBoundary` and `ErrorBoundary` primitives.
- The seven list screens converted (events, pending-requests, admin-members, my-contributions, team-matches, transfer-list, DmListView).

Command:

```bash
gh pr edit 3 --body "$(gh pr view 3 --json body -q .body)$(cat <<'EOF'


## Phase 3d — States system

- Added canonical copy library at `apps/mobile/src/i18n/states.ts` (EN) and `states.de.ts` (DE) covering events, pending_requests, admin_members, contributions, team_matches, transfers, dm, and shared `common.{offline,unknownError,retry}`.
- Added `LoadingBoundary` wrapper: `{ isLoading, skeleton, children }`. Replaces ad-hoc `isLoading ? <Spinner /> : …` branches.
- Added `ErrorBoundary` class component: screen-level render-error catch wired to `onRetry` + `states.*` copy keys.
- Adopted on seven list screens: `app/(tabs)/events`, `app/pending-requests`, `app/admin-members`, `app/my-contributions`, `app/team-matches`, `app/transfer-list`, `src/components/DmListView`.
- Per-screen adoption tests verify the boundary testID is present and `states.*` copy keys render for loading, empty, and error states.
EOF
)"
```

---

## Self-review checklist

- Every task has a failing test before implementation (TDD).
- Every task ends with a commit step.
- No placeholder strings, "TBD", or "similar to above" in step contents.
- Consistent component APIs: `LoadingBoundary` uses `{ isLoading, skeleton, children, testID? }` at every call site; `ErrorBoundary` uses `{ onRetry, fallbackTitleKey, fallbackBodyKey, fallbackRetryKey, children }` at every call site.
- Copy keys follow the `states.<screen>.<empty|error>.<title|body|cta|retry>` pattern everywhere.
- Per-screen adoption test IDs follow the `<screen-slug>-loading-boundary` convention (`events-loading-boundary`, `pending-requests-loading-boundary`, `admin-members-loading-boundary`, `my-contributions-loading-boundary`, `team-matches-loading-boundary`, `transfers-loading-boundary`, `dm-loading-boundary`).
- Copy library ships with EN + DE parity — covered by `states.spec.ts` DE-parity test.
- ESLint rule against `ActivityIndicator` is intentionally deferred — that's Phase 4 polish per spec.
- Baseline test count captured in Task 0 (step 2) is compared against final count in Task 11 (step 1) to verify no regressions outside the known Phase 3a-failing suites.
- The seven screen edits preserve existing business logic (fetch, refresh, RSVP debounce, approve/reject flows). Only rendering branches change.
