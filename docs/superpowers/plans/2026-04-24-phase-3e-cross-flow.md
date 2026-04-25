# Phase 3e — Cross-Flow Concerns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Phase 3 Section 4.5 cross-flow primitives: a `FormScreen` wrapper with keyboard handling, an `apiErrorKey` mapper that turns `ApiError` into canonical user-message keys, step-aware back in `club-setup.tsx`, plus one representative adoption for each primitive.

**Architecture:** Additive, composable primitives on top of existing `Screen` + `ApiError` + `states.ts`. No existing screens break: FormScreen composes Screen; apiErrorKey returns an i18n key that callers resolve with `t()`. Step-aware back is a targeted local change in one screen.

**Tech Stack:** React Native, Expo Router, `react-i18next`, Jest + React Native Testing Library, existing `@anstoss/shared` error classes, existing `src/i18n/states.ts` copy library.

**Out of scope:**
- Sentence case sweep (Phase 4 polish).
- FormScreen adoption beyond the smoke-test screen — the primitive exists, fleet adoption is Phase 4.
- apiErrorKey adoption beyond the smoke-test screen — same reasoning.
- Step-aware back on every step-based flow — register/ is already routed per step; create-event has no internal wizard. club-setup is the one real case today.

---

## File Structure

Files created or modified:

- **Create:** `apps/mobile/src/components/FormScreen.tsx` — wraps `Screen` with `KeyboardAvoidingView` (iOS only) and a keyboard-dismiss `Pressable` backdrop. One focused responsibility.
- **Create:** `apps/mobile/src/components/FormScreen.spec.tsx` — adoption tests (renders children, dismisses keyboard on backdrop tap).
- **Create:** `apps/mobile/src/lib/apiErrorKey.ts` — pure function `apiErrorKey(err: unknown): string` returning one of the canonical `errors.api.*` keys.
- **Create:** `apps/mobile/src/lib/__tests__/apiErrorKey.spec.ts` — covers ApiError by code, ApiError by status, non-ApiError Error, `null`/`undefined`.
- **Modify:** `apps/mobile/src/i18n/states.ts` — add `errors.api` namespace with stable message keys.
- **Modify:** `apps/mobile/src/i18n/states.de.ts` — German parity for `errors.api`.
- **Modify:** `apps/mobile/src/i18n/__tests__/states.spec.ts` — extend DE parity walker to include the new namespace (no change to the walker itself — already recursive — but add an explicit assertion for `errors.api` keys).
- **Modify:** `apps/mobile/app/join-code.tsx` — adopt `FormScreen` in place of bare `Screen`.
- **Create:** `apps/mobile/app/__tests__/join-code-form-screen.spec.tsx` — verifies the keyboard backdrop is rendered.
- **Modify:** `apps/mobile/app/club/[slug].tsx:65-75` — call `Alert.alert(t('errors.api.title'), t(apiErrorKey(e)))` instead of reading `e.message` raw.
- **Create:** `apps/mobile/app/__tests__/club-slug-error-mapping.spec.tsx` — verifies the rejected join request surfaces the mapped i18n key.
- **Modify:** `apps/mobile/app/club-setup.tsx:53,173,329` — step-aware back: when `step === 2`, pressing back returns to `step === 1`; when `step === 1`, the current `router.replace('/')` behavior stands.
- **Create:** `apps/mobile/app/__tests__/club-setup-step-back.spec.tsx` — verifies pressing back on step 2 returns to step 1 and does not navigate.

---

## Task 0: Baseline

- [ ] **Step 1: Capture pre-change lint + test counts**

```bash
cd apps/mobile && npm run lint 2>&1 | tail -5
cd apps/mobile && npx jest --watch=false 2>&1 | tail -5
```

Record the pre-existing failing suites. On main at time of writing: `home-role-behavior`, `more-tab`, `home-stats-layout`, `admin-dashboard`, `auth-gates-signout`. Pre-existing lint errors: `app/register/index.tsx` (unused `radius`), `src/components/ui/StatCard.tsx` (unused `hairline`).

**Do not fix these — they are out of scope.** Tasks 1–7 must not introduce new failures above this baseline.

- [ ] **Step 2: Confirm branch**

```bash
git rev-parse --abbrev-ref HEAD
```

Expected: `feat/revamp-join` (same branch that carries phases 3b/c/d). If different, stop and ask.

---

## Task 1: Add `errors.api.*` copy to states library

**Files:**
- Modify: `apps/mobile/src/i18n/states.ts`
- Modify: `apps/mobile/src/i18n/states.de.ts`
- Modify: `apps/mobile/src/i18n/__tests__/states.spec.ts`

- [ ] **Step 1: Write failing assertion for the new namespace**

Append to the end of `describe(...)` in `apps/mobile/src/i18n/__tests__/states.spec.ts`:

```ts
it('exposes errors.api keys with matching EN and DE shapes', () => {
  const enKeys = Object.keys(statesEn.errors.api).sort()
  const deKeys = Object.keys(statesDe.errors.api).sort()
  expect(enKeys).toEqual(deKeys)
  expect(enKeys).toEqual(
    ['generic', 'network', 'offline', 'permission', 'rateLimit', 'session', 'timeout', 'title', 'unavailable'].sort(),
  )
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/mobile && npx jest --watch=false src/i18n/__tests__/states.spec.ts
```

Expected: FAIL — `Cannot read properties of undefined (reading 'api')` because `statesEn.errors` does not exist.

- [ ] **Step 3: Add `errors.api` to `statesEn`**

Edit `apps/mobile/src/i18n/states.ts`. Insert this block immediately before the closing `}` of `statesEn` and immediately before the `} as const` line:

```ts
  errors: {
    api: {
      title: 'Something went wrong',
      network: 'Check your connection and try again.',
      offline: "You're offline. Reconnect and try again.",
      timeout: 'The request took too long. Try again.',
      rateLimit: 'Too many requests. Wait a moment and try again.',
      session: 'Your session expired. Please sign in again.',
      permission: "You don't have access to do that.",
      unavailable: 'Service temporarily unavailable. Try again shortly.',
      generic: 'Something went wrong. Try again.',
    },
  },
```

- [ ] **Step 4: Add `errors.api` to `statesDe`**

Edit `apps/mobile/src/i18n/states.de.ts`. Insert this block in the same position (before the closing brace / `as const`):

```ts
  errors: {
    api: {
      title: 'Etwas ist schiefgelaufen',
      network: 'Verbindung prüfen und erneut versuchen.',
      offline: 'Du bist offline. Stelle die Verbindung wieder her und versuche es erneut.',
      timeout: 'Die Anfrage hat zu lange gedauert. Bitte erneut versuchen.',
      rateLimit: 'Zu viele Anfragen. Bitte kurz warten und erneut versuchen.',
      session: 'Deine Sitzung ist abgelaufen. Bitte erneut anmelden.',
      permission: 'Du hast keine Berechtigung dafür.',
      unavailable: 'Dienst vorübergehend nicht verfügbar. Bitte gleich erneut versuchen.',
      generic: 'Etwas ist schiefgelaufen. Bitte erneut versuchen.',
    },
  },
```

- [ ] **Step 5: Run test — verify it passes**

```bash
cd apps/mobile && npx jest --watch=false src/i18n/__tests__/states.spec.ts
```

Expected: PASS (all suite tests green, including the new one).

- [ ] **Step 6: Typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: clean. The `StatesCopy` Widen<…> type derives from the literal shape, so DE conforms automatically.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/i18n/states.ts apps/mobile/src/i18n/states.de.ts apps/mobile/src/i18n/__tests__/states.spec.ts
git commit -m "feat(mobile): add errors.api namespace with EN/DE parity"
```

---

## Task 2: `apiErrorKey` mapper

**Files:**
- Create: `apps/mobile/src/lib/apiErrorKey.ts`
- Create: `apps/mobile/src/lib/__tests__/apiErrorKey.spec.ts`

- [ ] **Step 1: Write failing test**

```ts
// apps/mobile/src/lib/__tests__/apiErrorKey.spec.ts
import { apiErrorKey } from '../apiErrorKey'
import { ApiError } from '../../api/client'

describe('apiErrorKey', () => {
  it('maps ApiError code "timeout" to errors.api.timeout', () => {
    expect(apiErrorKey(new ApiError('t', 504, 'timeout'))).toBe('errors.api.timeout')
  })

  it('maps ApiError code "network_error" to errors.api.network', () => {
    expect(apiErrorKey(new ApiError('n', 0, 'network_error'))).toBe('errors.api.network')
  })

  it('maps ApiError code "CLERK_TOKEN_EXPIRED" to errors.api.session', () => {
    expect(apiErrorKey(new ApiError('s', 401, 'CLERK_TOKEN_EXPIRED'))).toBe('errors.api.session')
  })

  it('maps ApiError status 401 (no code) to errors.api.session', () => {
    expect(apiErrorKey(new ApiError('s', 401))).toBe('errors.api.session')
  })

  it('maps ApiError status 403 to errors.api.permission', () => {
    expect(apiErrorKey(new ApiError('f', 403))).toBe('errors.api.permission')
  })

  it('maps ApiError status 429 to errors.api.rateLimit', () => {
    expect(apiErrorKey(new ApiError('r', 429))).toBe('errors.api.rateLimit')
  })

  it('maps ApiError status 503 to errors.api.unavailable', () => {
    expect(apiErrorKey(new ApiError('u', 503))).toBe('errors.api.unavailable')
  })

  it('maps ApiError status 504 to errors.api.timeout', () => {
    expect(apiErrorKey(new ApiError('t', 504))).toBe('errors.api.timeout')
  })

  it('maps plain Error to errors.api.generic', () => {
    expect(apiErrorKey(new Error('boom'))).toBe('errors.api.generic')
  })

  it('maps null/undefined to errors.api.generic', () => {
    expect(apiErrorKey(null)).toBe('errors.api.generic')
    expect(apiErrorKey(undefined)).toBe('errors.api.generic')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/mobile && npx jest --watch=false src/lib/__tests__/apiErrorKey.spec.ts
```

Expected: FAIL — `Cannot find module '../apiErrorKey'`.

- [ ] **Step 3: Implement `apiErrorKey`**

```ts
// apps/mobile/src/lib/apiErrorKey.ts
import { ApiError } from '../api/client'

export type ApiErrorKey =
  | 'errors.api.network'
  | 'errors.api.offline'
  | 'errors.api.timeout'
  | 'errors.api.rateLimit'
  | 'errors.api.session'
  | 'errors.api.permission'
  | 'errors.api.unavailable'
  | 'errors.api.generic'

const CODE_MAP: Record<string, ApiErrorKey> = {
  timeout: 'errors.api.timeout',
  network_error: 'errors.api.network',
  CLERK_TOKEN_EXPIRED: 'errors.api.session',
  RATE_LIMIT_EXCEEDED: 'errors.api.rateLimit',
  TENANT_SCOPE_VIOLATION: 'errors.api.permission',
  TEAM_ACCESS_DENIED: 'errors.api.permission',
  NEON_CONNECTION_ERROR: 'errors.api.unavailable',
}

function keyForStatus(status: number): ApiErrorKey {
  if (status === 0) return 'errors.api.network'
  if (status === 401) return 'errors.api.session'
  if (status === 403) return 'errors.api.permission'
  if (status === 408 || status === 504) return 'errors.api.timeout'
  if (status === 429) return 'errors.api.rateLimit'
  if (status >= 500) return 'errors.api.unavailable'
  return 'errors.api.generic'
}

export function apiErrorKey(err: unknown): ApiErrorKey {
  if (err instanceof ApiError) {
    if (err.code && CODE_MAP[err.code]) return CODE_MAP[err.code]
    return keyForStatus(err.status)
  }
  return 'errors.api.generic'
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/mobile && npx jest --watch=false src/lib/__tests__/apiErrorKey.spec.ts
```

Expected: PASS (10 tests).

- [ ] **Step 5: Typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/lib/apiErrorKey.ts apps/mobile/src/lib/__tests__/apiErrorKey.spec.ts
git commit -m "feat(mobile): add apiErrorKey helper mapping ApiError to i18n key"
```

---

## Task 3: `FormScreen` primitive

**Files:**
- Create: `apps/mobile/src/components/FormScreen.tsx`
- Create: `apps/mobile/src/components/FormScreen.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/src/components/FormScreen.spec.tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { Keyboard, Text } from 'react-native'

jest.mock('../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import { FormScreen } from './FormScreen'

describe('FormScreen', () => {
  it('renders children', () => {
    const { getByText } = render(
      <FormScreen>
        <Text>hello</Text>
      </FormScreen>,
    )
    expect(getByText('hello')).toBeTruthy()
  })

  it('dismisses the keyboard when the backdrop is pressed', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {})
    const { getByTestId } = render(
      <FormScreen>
        <Text>content</Text>
      </FormScreen>,
    )
    fireEvent.press(getByTestId('form-screen-backdrop'))
    expect(dismiss).toHaveBeenCalled()
    dismiss.mockRestore()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/mobile && npx jest --watch=false src/components/FormScreen.spec.tsx
```

Expected: FAIL — `Cannot find module './FormScreen'`.

- [ ] **Step 3: Implement `FormScreen`**

```tsx
// apps/mobile/src/components/FormScreen.tsx
import React from 'react'
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native'
import { Screen, type ScreenProps } from './ui/Screen'

export type FormScreenProps = ScreenProps

export function FormScreen({ children, ...screenProps }: FormScreenProps) {
  return (
    <Screen {...screenProps}>
      <Pressable
        accessible={false}
        onPress={Keyboard.dismiss}
        style={styles.backdrop}
        testID="form-screen-backdrop"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoider}
        >
          {children}
        </KeyboardAvoidingView>
      </Pressable>
    </Screen>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  avoider: { flex: 1 },
})
```

- [ ] **Step 4: Export `FormScreen`**

No barrel export change required — screens import directly from `../src/components/FormScreen` (no `src/components/index.ts` barrel exists for ad-hoc components like `ErrorState`, `EmptyState`, `LoadingBoundary`).

- [ ] **Step 5: Run test — verify it passes**

```bash
cd apps/mobile && npx jest --watch=false src/components/FormScreen.spec.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 6: Typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: clean. Note: `ScreenProps` is re-exported from `./ui/Screen`; confirm this import path resolves before committing.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/FormScreen.tsx apps/mobile/src/components/FormScreen.spec.tsx
git commit -m "feat(mobile): add FormScreen wrapper with keyboard dismiss backdrop"
```

---

## Task 4: Adopt `FormScreen` on `join-code`

**Files:**
- Modify: `apps/mobile/app/join-code.tsx`
- Create: `apps/mobile/app/__tests__/join-code-form-screen.spec.tsx`

- [ ] **Step 1: Write failing adoption test**

```tsx
// apps/mobile/app/__tests__/join-code-form-screen.spec.tsx
import React from 'react'
import { render } from '@testing-library/react-native'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import JoinCodeScreen from '../join-code'

describe('join-code — FormScreen adoption', () => {
  it('renders the FormScreen backdrop', () => {
    const { getByTestId } = render(<JoinCodeScreen />)
    expect(getByTestId('form-screen-backdrop')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/mobile && npx jest --watch=false app/__tests__/join-code-form-screen.spec.tsx
```

Expected: FAIL — backdrop testID not found.

- [ ] **Step 3: Replace `Screen` with `FormScreen`**

Edit `apps/mobile/app/join-code.tsx`:

- At the imports, replace:
  ```tsx
  import { Screen, Card, Button, Text } from '../src/components/ui'
  ```
  with:
  ```tsx
  import { Card, Button, Text } from '../src/components/ui'
  import { FormScreen } from '../src/components/FormScreen'
  ```
- In the JSX, replace the `<Screen …>` / `</Screen>` tags with `<FormScreen …>` / `</FormScreen>`. Props stay identical (`header`, `padded={false}`, `scroll`).

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/mobile && npx jest --watch=false app/__tests__/join-code-form-screen.spec.tsx
```

Expected: PASS.

- [ ] **Step 5: Run existing join-code suite to confirm no regression**

```bash
cd apps/mobile && npx jest --watch=false app/__tests__/join-code.spec.tsx
```

Expected: same PASS count as before (all pre-existing tests still green).

- [ ] **Step 6: Typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/join-code.tsx apps/mobile/app/__tests__/join-code-form-screen.spec.tsx
git commit -m "feat(mobile): adopt FormScreen in join-code"
```

---

## Task 5: Adopt `apiErrorKey` on `club/[slug]`

**Files:**
- Modify: `apps/mobile/app/club/[slug].tsx`
- Create: `apps/mobile/app/__tests__/club-slug-error-mapping.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/club-slug-error-mapping.spec.tsx
import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert } from 'react-native'

const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ slug: 'fc-anstoss' }),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => {
  class ApiError extends Error {
    constructor(msg: string, public status: number, public code?: string) {
      super(msg)
      this.name = 'ApiError'
    }
  }
  return {
    api: (...args: unknown[]) => mockApi(...args),
    ApiError,
  }
})
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ memberships: [] }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import ClubPreview from '../club/[slug]'
import { ApiError } from '../../src/api/client'

describe('club/[slug] — apiErrorKey adoption', () => {
  beforeEach(() => mockApi.mockReset())

  it('surfaces errors.api.rateLimit when the request is rate-limited', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    mockApi
      .mockResolvedValueOnce({
        id: 'c1',
        name: 'FC',
        slug: 'fc-anstoss',
        badgeUrl: null,
        primaryColor: '#000',
        city: null,
        memberCount: 1,
        teamCount: 1,
      })
      .mockRejectedValueOnce(new ApiError('rl', 429, 'RATE_LIMIT_EXCEEDED'))

    const { findByText } = render(<ClubPreview />)
    const submit = await findByText('clubPreview.requestToJoin')
    await act(async () => {
      fireEvent.press(submit)
    })

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('errors.api.title', 'errors.api.rateLimit')
    })
    alertSpy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/mobile && npx jest --watch=false app/__tests__/club-slug-error-mapping.spec.tsx
```

Expected: FAIL — current implementation calls `Alert.alert(t('common.error'), msg)` where `msg` is the raw error message `'rl'`, not a mapped key.

- [ ] **Step 3: Wire `apiErrorKey` into `club/[slug]`**

Edit `apps/mobile/app/club/[slug].tsx`:

- Add import under the existing imports:
  ```tsx
  import { apiErrorKey } from '../../src/lib/apiErrorKey'
  ```
- Replace lines 70–72 (the `catch (e)` → `Alert.alert(t('common.error'), msg)` block):
  ```tsx
    } catch (e) {
      Alert.alert(t('errors.api.title'), t(apiErrorKey(e)))
    } finally {
  ```
  (remove the local `const msg = ...` line — it's no longer needed.)

- [ ] **Step 4: Run the new test — verify it passes**

```bash
cd apps/mobile && npx jest --watch=false app/__tests__/club-slug-error-mapping.spec.tsx
```

Expected: PASS (1 test).

- [ ] **Step 5: Run any pre-existing club/[slug] tests**

```bash
cd apps/mobile && npx jest --watch=false app/__tests__/club-slug-preview.spec.tsx
```

Expected: same PASS count as before. If this suite did not exist previously, skip.

- [ ] **Step 6: Typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/club/[slug].tsx apps/mobile/app/__tests__/club-slug-error-mapping.spec.tsx
git commit -m "feat(mobile): map api errors in club preview via apiErrorKey"
```

---

## Task 6: Step-aware back in `club-setup.tsx`

**Files:**
- Modify: `apps/mobile/app/club-setup.tsx`
- Create: `apps/mobile/app/__tests__/club-setup-step-back.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// apps/mobile/app/__tests__/club-setup-step-back.spec.tsx
import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'

const mockReplace = jest.fn()
const mockApi = jest.fn()

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args) },
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
  ApiError: class ApiError extends Error {},
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ refreshUser: jest.fn() }),
}))
jest.mock('../../src/context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../src/theme/club-theme')
  return {
    useClubColors: () => ({ ...FALLBACK_THEME, primary: '#000', primary50: '#eee' }),
    useIsDark: () => false,
  }
})

import ClubSetupScreen from '../club-setup'

describe('club-setup — step-aware back', () => {
  beforeEach(() => {
    mockReplace.mockReset()
    mockApi.mockReset()
  })

  it('pressing back on step 2 returns to step 1 and does not navigate away', async () => {
    const { getByText, getByLabelText } = render(<ClubSetupScreen />)

    // Advance to step 2 by filling the club name and pressing Next.
    // Relies on t() returning the raw key — so the Next button is labelled 'club.setupWizard.nextStep'.
    // The happy path: step 1 has a single primary button bound to `handleNext`.
    const nextBtn = getByText('club.setupWizard.nextStep')
    // Populate the club name input before pressing Next.
    const clubNameInput = getByLabelText('club.setupWizard.clubNameLabel')
    fireEvent.changeText(clubNameInput, 'FC Anstoss')
    await act(async () => fireEvent.press(nextBtn))

    // We should now be on step 2 — the teamName input is rendered.
    expect(getByLabelText('club.setupWizard.teamNameLabel')).toBeTruthy()

    // Press the modal header back button.
    const backBtn = getByLabelText('Go back')
    await act(async () => fireEvent.press(backBtn))

    // Expectation: back returned to step 1 (club name input is visible again),
    // and router.replace was NOT called.
    expect(getByLabelText('club.setupWizard.clubNameLabel')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/mobile && npx jest --watch=false app/__tests__/club-setup-step-back.spec.tsx
```

Expected: FAIL — pressing back on step 2 calls `router.replace('/')` (which is now the `mockReplace` spy), so `mockReplace` is called at least once.

If the test fails instead because the test cannot locate inputs (labels differ from expectation), first run `cd apps/mobile && grep -n "accessibilityLabel\|aria-label" apps/mobile/app/club-setup.tsx` to confirm the rendered labels, then adjust `getByLabelText(…)` calls to match. Do not change production labels to satisfy the test.

- [ ] **Step 3: Make the back button step-aware**

Edit `apps/mobile/app/club-setup.tsx` at the `<ModalHeader … />` render site (around line 173). Replace:

```tsx
<ModalHeader mode="back" onClose={() => router.replace('/')} />
```

with:

```tsx
<ModalHeader
  mode="back"
  onClose={() => {
    if (step === 2) {
      setStep(1)
      return
    }
    router.replace('/')
  }}
/>
```

No other changes are needed — the rest of the wizard already uses `setStep(1)` / `setStep(2)` transitions.

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/mobile && npx jest --watch=false app/__tests__/club-setup-step-back.spec.tsx
```

Expected: PASS (1 test).

- [ ] **Step 5: Typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/club-setup.tsx apps/mobile/app/__tests__/club-setup-step-back.spec.tsx
git commit -m "feat(mobile): step-aware back in club setup wizard"
```

---

## Task 7: Full-suite verification + push + PR update

- [ ] **Step 1: Mobile full jest run**

```bash
cd apps/mobile && npx jest --watch=false
```

Expected: the 6 new / updated suites (`states`, `apiErrorKey`, `FormScreen`, `join-code-form-screen`, `club-slug-error-mapping`, `club-setup-step-back`) all PASS. Pre-existing failing suites from Task 0 baseline may remain failing — net new failures: 0.

- [ ] **Step 2: Mobile typecheck**

```bash
cd apps/mobile && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Shared typecheck**

```bash
cd packages/shared && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: API typecheck**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Mobile lint**

```bash
cd apps/mobile && npm run lint
```

Expected: same 2 pre-existing errors as the Task 0 baseline (`register/index.tsx` unused `radius`, `StatCard.tsx` unused `hairline`). No new lint errors.

- [ ] **Step 6: Push**

```bash
git push origin feat/revamp-join
```

- [ ] **Step 7: Update PR #4 description**

```bash
gh pr edit 4 --body "$(gh pr view 4 --json body -q .body)$(cat <<'EOF'


## Phase 3e — Cross-flow concerns

- Added `errors.api.*` copy namespace (EN + DE) in `src/i18n/states.ts` for canonical error messaging.
- Added `src/lib/apiErrorKey.ts` — maps `ApiError` (by code, then status) to a canonical `errors.api.*` i18n key. Covers network, timeout, rate-limit, session, permission, service-unavailable, and generic fallbacks.
- Added `src/components/FormScreen.tsx` — `Screen` with `KeyboardAvoidingView` (iOS) + tap-to-dismiss backdrop. Adopted on `join-code`.
- Step-aware back in `club-setup.tsx`: pressing back on step 2 returns to step 1 instead of exiting the wizard.
- Smoke-tested apiErrorKey on `club/[slug]` (the club-preview join-request flow) — the fleet-wide adoption sweep is Phase 4.
EOF
)"
```

---

## Self-review checklist

- Every task has a failing test before implementation (TDD).
- Every task ends with a commit step.
- No "TBD" / "similar to above" / "etc" in the step contents.
- Primitive API stability: `FormScreen` accepts the full `ScreenProps`; `apiErrorKey` returns a fixed union of 8 keys; the `errors.api` i18n namespace lists those 8 keys plus `title`.
- Smoke adoption covers both new primitives: `join-code` for FormScreen, `club/[slug]` for apiErrorKey. Full fleet adoption is deferred to Phase 4.
- Copy library continues to ship EN + DE parity (Task 1 extends the existing `states.spec.ts` walker).
- No changes to pre-existing failing suites (Phase 3a `home-role-behavior`, `more-tab`, `home-stats-layout`, `admin-dashboard`, `auth-gates-signout`) — baseline captured in Task 0 and re-verified in Task 7.
