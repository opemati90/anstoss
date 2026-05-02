# Onboarding Revamp — Mobile Auth Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the welcome → phone OTP → name → DOB → role pick → branch (owner/coach/player/parent/free-agent) → done flow in `apps/mobile`, gated by `anstoss.newOnboarding`. Consumes the backend endpoints shipped in `2026-04-25-onboarding-revamp-backend.md` (join codes, roster slots, managed sub-profiles).

**Architecture:** All new screens live in `app/(auth)/` and share a `WizardStep` shell. An `OnboardingFlowContext` holds wizard state across screens (phone, name, DOB, role, branch-specific payloads) so each screen pushes the next route declaratively. Auth runs through a thin `useOnboardingAuth()` hook so phone-OTP provider can swap later (spec §8 deferred decision). The legacy `app/(auth)/sign-in.tsx`, `app/register/*`, and `app/onboarding.tsx` stay alive — flag dispatch picks the new flow when `isFeatureEnabled('anstoss.newOnboarding')`.

**Tech Stack:** Expo Router 3, React Native, Clerk Expo (phone OTP path), `react-i18next`, existing `api()` client, existing `AuthContext` for post-onboarding session, theme tokens in `src/theme/`.

**Out of scope:** Home/events/match-detail/more restyle (Plan 3). SEPA/contributions (Plan 4). Phone-OTP provider escape hatch — if Clerk's plan blocks phone OTP, the `useOnboardingAuth()` abstraction lets us swap providers without touching screens (escalate to user).

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `apps/mobile/src/context/OnboardingFlowContext.tsx` | Wizard state across screens; reset on flow exit |
| `apps/mobile/src/auth/useOnboardingAuth.ts` | Provider-agnostic `startPhoneOtp` / `verifyPhoneOtp` / `setBasicProfile` |
| `apps/mobile/src/components/wizard/WizardStep.tsx` | Step shell: back chevron + progress + question + hint + body + sticky CTA |
| `apps/mobile/src/components/wizard/OtpCellInput.tsx` | 6-cell OTP input |
| `apps/mobile/src/components/wizard/TeamCodeInput.tsx` | 5-cell team-code input |
| `apps/mobile/src/components/wizard/RoleCard.tsx` | Tappable role card |
| `apps/mobile/src/components/wizard/RosterRow.tsx` | One row in the roster-claim list |
| `apps/mobile/src/components/wizard/KenBurnsImage.tsx` | Slow-zoom hero image |
| `apps/mobile/app/(auth)/welcome.tsx` | Hero + two CTAs |
| `apps/mobile/app/(auth)/phone.tsx` | DE/AT phone input |
| `apps/mobile/app/(auth)/code.tsx` | 6-cell OTP entry |
| `apps/mobile/app/(auth)/name.tsx` | First name |
| `apps/mobile/app/(auth)/dob.tsx` | DOB → under-16 hard stop |
| `apps/mobile/app/(auth)/role.tsx` | 5 role cards |
| `apps/mobile/app/(auth)/club-create.tsx` | Owner: club basics |
| `apps/mobile/app/(auth)/roster-build.tsx` | Owner: bulk-create roster slots for first team |
| `apps/mobile/app/(auth)/team-code-share.tsx` | Owner: share code + QR |
| `apps/mobile/app/(auth)/team-code.tsx` | Coach/Player/Parent: lookup by code |
| `apps/mobile/app/(auth)/roster-claim.tsx` | Coach/Player/Parent: pick + claim slot(s) |
| `apps/mobile/app/(auth)/free-agent-profile.tsx` | Free agent: profile micro-steps |
| `apps/mobile/app/(auth)/done.tsx` | Confirmation + role-aware route to home |

**Modified files:**

- `apps/mobile/src/utils/featureFlags.ts` — add `anstoss.newOnboarding` to FeatureFlagName + DEFAULTS
- `apps/mobile/app/index.tsx` — branch to `(auth)/welcome` when flag on (and unauthenticated)
- `apps/mobile/app/(auth)/_layout.tsx` — wrap stack with `OnboardingFlowProvider`
- `apps/mobile/src/i18n/de.ts` and `apps/mobile/src/i18n/en.ts` — add new wizard keys

**Conventions:**
- Tests live in `__tests__/` next to the file under test (mirrors existing pattern).
- All screens use light + dark via `useClubColors()` and `tokens` from `src/theme/`.
- All copy via `useTranslation()` namespace `onboarding`.

---

## Task 1: Add `anstoss.newOnboarding` feature flag

**Files:**
- Modify: `apps/mobile/src/utils/featureFlags.ts`
- Test: `apps/mobile/src/utils/__tests__/featureFlags.spec.ts`

- [ ] **Step 1: Update test to cover the new flag**

In `apps/mobile/src/utils/__tests__/featureFlags.spec.ts`, add:

```ts
it('returns false by default for anstoss.newOnboarding', () => {
  expect(isFeatureEnabled('anstoss.newOnboarding')).toBe(false)
})

it('honors override for anstoss.newOnboarding', () => {
  setFeatureOverride('anstoss.newOnboarding', true)
  expect(isFeatureEnabled('anstoss.newOnboarding')).toBe(true)
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/utils/__tests__/featureFlags.spec.ts`
Expected: FAIL — `'anstoss.newOnboarding'` is not assignable to type `FeatureFlagName`.

- [ ] **Step 3: Add the flag**

In `apps/mobile/src/utils/featureFlags.ts`:

```ts
export type FeatureFlagName = 'anstoss.roleAwareHome' | 'anstoss.newOnboarding'

const DEFAULTS: Record<FeatureFlagName, boolean> = {
  'anstoss.roleAwareHome': true,
  'anstoss.newOnboarding': false,
}
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/utils/__tests__/featureFlags.spec.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/utils/featureFlags.ts apps/mobile/src/utils/__tests__/featureFlags.spec.ts
git commit -m "feat(mobile): add anstoss.newOnboarding feature flag (default off)"
```

---

## Task 2: `OnboardingFlowContext` — wizard state machine

**Files:**
- Create: `apps/mobile/src/context/OnboardingFlowContext.tsx`
- Test: `apps/mobile/src/context/__tests__/OnboardingFlowContext.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/context/__tests__/OnboardingFlowContext.spec.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react-native'
import { OnboardingFlowProvider, useOnboardingFlow } from '../OnboardingFlowContext'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <OnboardingFlowProvider>{children}</OnboardingFlowProvider>
)

describe('OnboardingFlowContext', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper })
    expect(result.current.state).toEqual({})
  })

  it('records phone, name, dob, role across calls', () => {
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper })
    act(() => result.current.update({ phone: '+4915112345678' }))
    act(() => result.current.update({ firstName: 'Mara' }))
    act(() => result.current.update({ dateOfBirth: '2010-04-26' }))
    act(() => result.current.update({ role: 'PLAYER' }))
    expect(result.current.state).toEqual({
      phone: '+4915112345678',
      firstName: 'Mara',
      dateOfBirth: '2010-04-26',
      role: 'PLAYER',
    })
  })

  it('reset() clears state', () => {
    const { result } = renderHook(() => useOnboardingFlow(), { wrapper })
    act(() => result.current.update({ firstName: 'X' }))
    act(() => result.current.reset())
    expect(result.current.state).toEqual({})
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/context/__tests__/OnboardingFlowContext.spec.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the context**

Create `apps/mobile/src/context/OnboardingFlowContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { RegistrationRole } from '@anstoss/shared'

export type OnboardingFlowState = {
  phone?: string
  firstName?: string
  dateOfBirth?: string
  role?: RegistrationRole
  teamId?: string
  clubId?: string
  rosterSlotId?: string
}

type OnboardingFlowContextValue = {
  state: OnboardingFlowState
  update: (patch: Partial<OnboardingFlowState>) => void
  reset: () => void
}

const Ctx = createContext<OnboardingFlowContextValue | null>(null)

export function OnboardingFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingFlowState>({})
  const update = useCallback((patch: Partial<OnboardingFlowState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])
  const reset = useCallback(() => setState({}), [])
  const value = useMemo(() => ({ state, update, reset }), [state, update, reset])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useOnboardingFlow() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useOnboardingFlow must be used inside OnboardingFlowProvider')
  return v
}
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/context/__tests__/OnboardingFlowContext.spec.tsx`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/context/OnboardingFlowContext.tsx apps/mobile/src/context/__tests__/OnboardingFlowContext.spec.tsx
git commit -m "feat(mobile): add OnboardingFlowContext for wizard state"
```

---

## Task 3: `useOnboardingAuth` — provider-agnostic phone-OTP shim

**Files:**
- Create: `apps/mobile/src/auth/useOnboardingAuth.ts`
- Test: `apps/mobile/src/auth/__tests__/useOnboardingAuth.spec.ts`

**Context:** Spec §3.3 leaves the phone-OTP provider open. We expose three async methods the screens depend on. Behind the scenes today we route to Clerk's phone-code path (`signUp.create({ phoneNumber })`, `signUp.preparePhoneNumberVerification`, `signUp.attemptPhoneNumberVerification`). If Clerk's plan blocks phone OTP at runtime, the failure surfaces as a thrown error and the wizard shows a friendly fallback — but the screens don't know or care which provider runs.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/auth/__tests__/useOnboardingAuth.spec.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native'

const mockCreate = jest.fn()
const mockPrepare = jest.fn()
const mockAttempt = jest.fn()
const mockUpdate = jest.fn()

jest.mock('@clerk/clerk-expo', () => ({
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: mockCreate,
      preparePhoneNumberVerification: mockPrepare,
      attemptPhoneNumberVerification: mockAttempt,
      update: mockUpdate,
      createdSessionId: 'sess_1',
    },
    setActive: jest.fn(),
  }),
}))

import { useOnboardingAuth } from '../useOnboardingAuth'

describe('useOnboardingAuth', () => {
  beforeEach(() => {
    mockCreate.mockReset(); mockPrepare.mockReset(); mockAttempt.mockReset(); mockUpdate.mockReset()
  })

  it('startPhoneOtp creates signUp + preps phone verification', async () => {
    mockCreate.mockResolvedValue(undefined)
    mockPrepare.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOnboardingAuth())
    await act(() => result.current.startPhoneOtp('+4915112345678'))
    expect(mockCreate).toHaveBeenCalledWith({ phoneNumber: '+4915112345678' })
    expect(mockPrepare).toHaveBeenCalledWith({ strategy: 'phone_code' })
  })

  it('verifyPhoneOtp attempts verification with the code', async () => {
    mockAttempt.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOnboardingAuth())
    await act(() => result.current.verifyPhoneOtp('123456'))
    expect(mockAttempt).toHaveBeenCalledWith({ code: '123456' })
  })

  it('setBasicProfile patches signUp with first name', async () => {
    mockUpdate.mockResolvedValue(undefined)
    const { result } = renderHook(() => useOnboardingAuth())
    await act(() => result.current.setBasicProfile({ firstName: 'Mara' }))
    expect(mockUpdate).toHaveBeenCalledWith({ firstName: 'Mara' })
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/auth/__tests__/useOnboardingAuth.spec.ts`
Expected: module not found.

- [ ] **Step 3: Implement the hook**

Create `apps/mobile/src/auth/useOnboardingAuth.ts`:

```ts
import { useCallback } from 'react'
import { useSignUp } from '@clerk/clerk-expo'

export function useOnboardingAuth() {
  const { isLoaded, signUp, setActive } = useSignUp()

  const startPhoneOtp = useCallback(
    async (phone: string) => {
      if (!isLoaded || !signUp) throw new Error('Auth not ready')
      await signUp.create({ phoneNumber: phone })
      await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' })
    },
    [isLoaded, signUp],
  )

  const verifyPhoneOtp = useCallback(
    async (code: string) => {
      if (!isLoaded || !signUp) throw new Error('Auth not ready')
      await signUp.attemptPhoneNumberVerification({ code })
    },
    [isLoaded, signUp],
  )

  const setBasicProfile = useCallback(
    async (input: { firstName: string }) => {
      if (!isLoaded || !signUp) throw new Error('Auth not ready')
      await signUp.update({ firstName: input.firstName })
    },
    [isLoaded, signUp],
  )

  const finalizeSession = useCallback(async () => {
    if (!isLoaded || !signUp) throw new Error('Auth not ready')
    if (signUp.createdSessionId && setActive) {
      await setActive({ session: signUp.createdSessionId })
    }
  }, [isLoaded, signUp, setActive])

  return { startPhoneOtp, verifyPhoneOtp, setBasicProfile, finalizeSession, isLoaded }
}
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/auth/__tests__/useOnboardingAuth.spec.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/auth/useOnboardingAuth.ts apps/mobile/src/auth/__tests__/useOnboardingAuth.spec.ts
git commit -m "feat(mobile): add useOnboardingAuth hook (phone OTP via Clerk)"
```

---

## Task 4: `WizardStep` shell component

**Files:**
- Create: `apps/mobile/src/components/wizard/WizardStep.tsx`
- Test: `apps/mobile/src/components/wizard/__tests__/WizardStep.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/wizard/__tests__/WizardStep.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { WizardStep } from '../WizardStep'

describe('WizardStep', () => {
  it('renders title, hint, child body, and CTA', () => {
    render(
      <WizardStep
        title="Your phone"
        hint="We text a 6-digit code."
        ctaLabel="Continue"
        onCta={jest.fn()}
        progress={0.4}
      >
        <Text>body</Text>
      </WizardStep>,
    )
    expect(screen.getByText('Your phone')).toBeOnTheScreen()
    expect(screen.getByText('We text a 6-digit code.')).toBeOnTheScreen()
    expect(screen.getByText('body')).toBeOnTheScreen()
    expect(screen.getByText('Continue')).toBeOnTheScreen()
  })

  it('disables the CTA when ctaDisabled is true', () => {
    const onCta = jest.fn()
    render(
      <WizardStep title="t" ctaLabel="Next" onCta={onCta} ctaDisabled>
        <Text>x</Text>
      </WizardStep>,
    )
    fireEvent.press(screen.getByText('Next'))
    expect(onCta).not.toHaveBeenCalled()
  })

  it('calls onBack when the back chevron is pressed', () => {
    const onBack = jest.fn()
    render(
      <WizardStep title="t" ctaLabel="Next" onCta={jest.fn()} onBack={onBack}>
        <Text>x</Text>
      </WizardStep>,
    )
    fireEvent.press(screen.getByLabelText('Go back'))
    expect(onBack).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/components/wizard/__tests__/WizardStep.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the component**

Create `apps/mobile/src/components/wizard/WizardStep.tsx`:

```tsx
import { type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Button, Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type WizardStepProps = {
  title: string
  hint?: string
  ctaLabel: string
  onCta: () => void
  ctaDisabled?: boolean
  ctaLoading?: boolean
  progress?: number
  onBack?: () => void
  children: ReactNode
}

export function WizardStep(props: WizardStepProps) {
  const insets = useSafeAreaInsets()
  const colors = useClubColors()
  const router = useRouter()

  const handleBack = props.onBack ?? (() => router.back())

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: colors.surface }]}
    >
      <View style={[styles.header, { paddingTop: insets.top + space.s }]}>
        <Pressable
          onPress={handleBack}
          accessibilityLabel="Go back"
          hitSlop={12}
          style={styles.backBtn}
        >
          <Icon name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        {typeof props.progress === 'number' && (
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(props.progress * 100)}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>{props.title}</Text>
        {props.hint && <Text style={[styles.hint, { color: colors.textMuted }]}>{props.hint}</Text>}
        <View style={styles.content}>{props.children}</View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.m }]}>
        <Button
          label={props.ctaLabel}
          onPress={props.onCta}
          disabled={props.ctaDisabled}
          loading={props.ctaLoading}
        />
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: space.m,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
  },
  backBtn: { padding: space.xs },
  progressTrack: { flex: 1, height: 3, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  body: { flex: 1, paddingHorizontal: space.l, paddingTop: space.l },
  title: { fontFamily: fonts.display, fontSize: fontSize.xxl, fontWeight: '800' },
  hint: { marginTop: space.s, fontFamily: fonts.body, fontSize: fontSize.s, opacity: 0.7 },
  content: { marginTop: space.xl, flex: 1 },
  footer: { paddingHorizontal: space.l, paddingTop: space.s },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/components/wizard/__tests__/WizardStep.spec.tsx`
Expected: 3 passing. If `Button` from `../ui` doesn't accept `loading` prop, drop the loading flag (read `apps/mobile/src/components/ui` index first; if loading is unsupported remove the prop here and inline a simple opacity/disabled style — keep the API on `WizardStep` for future).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/wizard/WizardStep.tsx apps/mobile/src/components/wizard/__tests__/WizardStep.spec.tsx
git commit -m "feat(mobile): WizardStep shell (back chevron, progress, sticky CTA)"
```

---

## Task 5: `OtpCellInput` (6 cells)

**Files:**
- Create: `apps/mobile/src/components/wizard/OtpCellInput.tsx`
- Test: `apps/mobile/src/components/wizard/__tests__/OtpCellInput.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/wizard/__tests__/OtpCellInput.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'
import { OtpCellInput } from '../OtpCellInput'

describe('OtpCellInput', () => {
  it('reports the value as the user types', () => {
    const onChange = jest.fn()
    render(<OtpCellInput value="" onChange={onChange} />)
    fireEvent.changeText(screen.getByTestId('otp-input'), '12')
    expect(onChange).toHaveBeenLastCalledWith('12')
  })

  it('truncates beyond 6 digits', () => {
    const onChange = jest.fn()
    render(<OtpCellInput value="" onChange={onChange} />)
    fireEvent.changeText(screen.getByTestId('otp-input'), '1234567')
    expect(onChange).toHaveBeenLastCalledWith('123456')
  })

  it('strips non-digits', () => {
    const onChange = jest.fn()
    render(<OtpCellInput value="" onChange={onChange} />)
    fireEvent.changeText(screen.getByTestId('otp-input'), '12a3')
    expect(onChange).toHaveBeenLastCalledWith('123')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/components/wizard/__tests__/OtpCellInput.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the component**

Create `apps/mobile/src/components/wizard/OtpCellInput.tsx`:

```tsx
import { StyleSheet, TextInput, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

const LENGTH = 6

export type OtpCellInputProps = {
  value: string
  onChange: (next: string) => void
  autoFocus?: boolean
}

export function OtpCellInput({ value, onChange, autoFocus = true }: OtpCellInputProps) {
  const colors = useClubColors()
  const cells = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '')
  return (
    <View>
      <View style={styles.row} pointerEvents="none">
        {cells.map((d, i) => (
          <View
            key={i}
            style={[
              styles.cell,
              {
                borderColor: d ? colors.text : colors.border,
                backgroundColor: colors.surfaceMuted,
              },
            ]}
          >
            <Text style={[styles.digit, { color: colors.text }]}>{d}</Text>
          </View>
        ))}
      </View>
      <TextInput
        testID="otp-input"
        value={value}
        onChangeText={(raw) => onChange(raw.replace(/\D/g, '').slice(0, LENGTH))}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={LENGTH}
        autoFocus={autoFocus}
        style={styles.hidden}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s, justifyContent: 'center' },
  cell: {
    width: 48,
    height: 56,
    borderRadius: radius.m,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontFamily: fonts.mono, fontSize: fontSize.xxl, fontWeight: '700' },
  hidden: { position: 'absolute', width: '100%', height: '100%', opacity: 0.01 },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/components/wizard/__tests__/OtpCellInput.spec.tsx`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/wizard/OtpCellInput.tsx apps/mobile/src/components/wizard/__tests__/OtpCellInput.spec.tsx
git commit -m "feat(mobile): OtpCellInput (6-digit phone code entry)"
```

---

## Task 6: `TeamCodeInput` (5 cells, alphanumeric, uppercase)

**Files:**
- Create: `apps/mobile/src/components/wizard/TeamCodeInput.tsx`
- Test: `apps/mobile/src/components/wizard/__tests__/TeamCodeInput.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/wizard/__tests__/TeamCodeInput.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'
import { TeamCodeInput, TEAM_CODE_ALPHABET, TEAM_CODE_LENGTH } from '../TeamCodeInput'

describe('TeamCodeInput', () => {
  it('uppercases input and rejects characters outside the alphabet', () => {
    const onChange = jest.fn()
    render(<TeamCodeInput value="" onChange={onChange} />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'abi1o0z')
    // 'a' -> 'A' (in alphabet); 'b' -> 'B' (in); 'i' -> 'I' (NOT in alphabet, dropped); '1' (NOT in, dropped);
    // 'o' -> 'O' (NOT in, dropped); '0' (NOT in, dropped); 'z' -> 'Z' (in)
    expect(onChange).toHaveBeenLastCalledWith('ABZ')
  })

  it(`truncates beyond ${TEAM_CODE_LENGTH} characters`, () => {
    const onChange = jest.fn()
    render(<TeamCodeInput value="" onChange={onChange} />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'ABCDEFG')
    expect(onChange).toHaveBeenLastCalledWith('ABCDE')
  })

  it('exposes the alphabet matching the backend (Crockford-derived, no I/O/0/1)', () => {
    expect(TEAM_CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/components/wizard/__tests__/TeamCodeInput.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the component**

Create `apps/mobile/src/components/wizard/TeamCodeInput.tsx`:

```tsx
import { StyleSheet, TextInput, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export const TEAM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const TEAM_CODE_LENGTH = 5

export type TeamCodeInputProps = {
  value: string
  onChange: (next: string) => void
  autoFocus?: boolean
}

export function TeamCodeInput({ value, onChange, autoFocus = true }: TeamCodeInputProps) {
  const colors = useClubColors()
  const cells = Array.from({ length: TEAM_CODE_LENGTH }, (_, i) => value[i] ?? '')
  return (
    <View>
      <View style={styles.row} pointerEvents="none">
        {cells.map((c, i) => (
          <View
            key={i}
            style={[
              styles.cell,
              { borderColor: c ? colors.text : colors.border, backgroundColor: colors.surfaceMuted },
            ]}
          >
            <Text style={[styles.char, { color: colors.text }]}>{c}</Text>
          </View>
        ))}
      </View>
      <TextInput
        testID="team-code-input"
        value={value}
        onChangeText={(raw) => {
          const filtered = raw
            .toUpperCase()
            .split('')
            .filter((ch) => TEAM_CODE_ALPHABET.includes(ch))
            .join('')
            .slice(0, TEAM_CODE_LENGTH)
          onChange(filtered)
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={TEAM_CODE_LENGTH}
        autoFocus={autoFocus}
        style={styles.hidden}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s, justifyContent: 'center' },
  cell: {
    width: 52,
    height: 64,
    borderRadius: radius.m,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  char: { fontFamily: fonts.mono, fontSize: fontSize.xxl, fontWeight: '700' },
  hidden: { position: 'absolute', width: '100%', height: '100%', opacity: 0.01 },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/components/wizard/__tests__/TeamCodeInput.spec.tsx`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/wizard/TeamCodeInput.tsx apps/mobile/src/components/wizard/__tests__/TeamCodeInput.spec.tsx
git commit -m "feat(mobile): TeamCodeInput (5-cell, alphabet matches backend)"
```

---

## Task 7: `RoleCard`, `RosterRow`, `KenBurnsImage` primitives

**Files:**
- Create: `apps/mobile/src/components/wizard/RoleCard.tsx`
- Create: `apps/mobile/src/components/wizard/RosterRow.tsx`
- Create: `apps/mobile/src/components/wizard/KenBurnsImage.tsx`
- Test: `apps/mobile/src/components/wizard/__tests__/RoleCard.spec.tsx`
- Test: `apps/mobile/src/components/wizard/__tests__/RosterRow.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/mobile/src/components/wizard/__tests__/RoleCard.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'
import { RoleCard } from '../RoleCard'

describe('RoleCard', () => {
  it('renders title and body and fires onPress', () => {
    const onPress = jest.fn()
    render(<RoleCard icon="⚽" title="I play" body="Join my team's roster" onPress={onPress} />)
    expect(screen.getByText('I play')).toBeOnTheScreen()
    expect(screen.getByText("Join my team's roster")).toBeOnTheScreen()
    fireEvent.press(screen.getByText('I play'))
    expect(onPress).toHaveBeenCalled()
  })
})
```

Create `apps/mobile/src/components/wizard/__tests__/RosterRow.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'
import { RosterRow } from '../RosterRow'

describe('RosterRow', () => {
  it('shows name + position and is pressable when unclaimed', () => {
    const onPress = jest.fn()
    render(<RosterRow name="Mara K." position="MID" claimed={false} onPress={onPress} />)
    fireEvent.press(screen.getByText('Mara K.'))
    expect(onPress).toHaveBeenCalled()
  })

  it('renders "claimed" pill and is non-pressable when claimed', () => {
    const onPress = jest.fn()
    render(<RosterRow name="X" position="GK" claimed onPress={onPress} />)
    expect(screen.getByText(/claimed/i)).toBeOnTheScreen()
    fireEvent.press(screen.getByText('X'))
    expect(onPress).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/components/wizard/__tests__/RoleCard.spec.tsx src/components/wizard/__tests__/RosterRow.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement RoleCard, RosterRow, and KenBurnsImage**

Create `apps/mobile/src/components/wizard/RoleCard.tsx`:

```tsx
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type RoleCardProps = {
  icon: string
  title: string
  body: string
  onPress: () => void
  selected?: boolean
}

export function RoleCard({ icon, title, body, onPress, selected }: RoleCardProps) {
  const colors = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.surface }]}>
        <Text style={styles.iconChar}>{icon}</Text>
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>{body}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.m,
    borderRadius: radius.m,
    borderWidth: 1,
  },
  icon: { width: 44, height: 44, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  iconChar: { fontSize: 22 },
  text: { flex: 1 },
  title: { fontFamily: fonts.display, fontSize: fontSize.l, fontWeight: '700' },
  body: { fontFamily: fonts.body, fontSize: fontSize.s, marginTop: 2 },
})
```

Create `apps/mobile/src/components/wizard/RosterRow.tsx`:

```tsx
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type RosterRowProps = {
  name: string
  position?: string
  claimed: boolean
  onPress: () => void
}

export function RosterRow({ name, position, claimed, onPress }: RosterRowProps) {
  const colors = useClubColors()
  return (
    <Pressable
      onPress={claimed ? undefined : onPress}
      style={[
        styles.row,
        { borderColor: colors.border, opacity: claimed ? 0.5 : 1 },
      ]}
    >
      <View style={styles.text}>
        <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
        {position && <Text style={[styles.pos, { color: colors.textMuted }]}>{position}</Text>}
      </View>
      {claimed && (
        <View style={[styles.pill, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.pillText, { color: colors.textMuted }]}>Claimed</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.m,
    paddingHorizontal: space.m,
    borderBottomWidth: 1,
  },
  text: { flex: 1 },
  name: { fontFamily: fonts.display, fontSize: fontSize.m, fontWeight: '600' },
  pos: { fontFamily: fonts.mono, fontSize: fontSize.xs, marginTop: 2 },
  pill: { paddingHorizontal: space.s, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { fontFamily: fonts.body, fontSize: fontSize.xs, fontWeight: '600' },
})
```

Create `apps/mobile/src/components/wizard/KenBurnsImage.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { Animated, type ImageSourcePropType, StyleSheet, View } from 'react-native'

export type KenBurnsImageProps = {
  source: ImageSourcePropType
  durationMs?: number
}

export function KenBurnsImage({ source, durationMs = 12000 }: KenBurnsImageProps) {
  const scale = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: durationMs, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: durationMs, useNativeDriver: true }),
      ]),
    ).start()
  }, [scale, durationMs])
  return (
    <View style={styles.root}>
      <Animated.Image source={source} resizeMode="cover" style={[styles.img, { transform: [{ scale }] }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
})
```

- [ ] **Step 4: Run tests → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest src/components/wizard/__tests__/RoleCard.spec.tsx src/components/wizard/__tests__/RosterRow.spec.tsx`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/wizard/
git commit -m "feat(mobile): RoleCard, RosterRow, KenBurnsImage primitives"
```

---

## Task 8: i18n keys for the wizard (DE + EN)

**Files:**
- Modify: `apps/mobile/src/i18n/de.ts`
- Modify: `apps/mobile/src/i18n/en.ts`

**Note:** The user's auto-memory says Renuir has 8 locales — that's a different project. Anstoss locks to DE + EN (spec §2 "Locales"). Other Anstoss locales fall back to EN.

- [ ] **Step 1: Add keys under namespace `onboarding` in both files**

Append to `apps/mobile/src/i18n/en.ts` inside the existing translation block (preserve nesting; locate the existing `onboarding` namespace or add one if missing):

```ts
onboarding: {
  welcome: {
    tagline: 'One app for your football club.',
    primary: 'Get started',
    secondary: 'I already have an account',
  },
  phone: {
    title: 'Your phone',
    hint: 'We\u2019ll text you a 6-digit code.',
    placeholder: '+49 151 1234 5678',
    cta: 'Send code',
    invalid: 'Phone must start with +49 or +43.',
  },
  code: {
    title: 'Enter the code',
    hint: 'Sent to {{phone}}.',
    cta: 'Verify',
    resend: 'Resend code',
    resendIn: 'Resend in {{seconds}}s',
    wrong: 'That code didn\u2019t work. Try again.',
  },
  name: {
    title: 'What\u2019s your first name?',
    cta: 'Continue',
  },
  dob: {
    title: 'When were you born?',
    hint: 'We use this to set up your account safely.',
    cta: 'Continue',
    placeholder: 'DD.MM.YYYY',
    under16Title: 'You\u2019re younger than 16',
    under16Body: 'Ask a parent to add you. Show them this code on their phone:',
    under16Cta: 'Done',
  },
  role: {
    title: 'What brings you here?',
    play: { title: 'I play', body: 'Join my team\u2019s roster' },
    coach: { title: 'I coach', body: 'Manage a team' },
    starting: { title: 'I\u2019m starting a club', body: 'Set up everything from scratch' },
    parent: { title: 'My child plays', body: 'Set up their profile' },
    looking: { title: 'Looking for a club', body: 'Show clubs I match' },
  },
  clubCreate: {
    title: 'Create your club',
    namePlaceholder: 'FC Köpenick 1908',
    cityPlaceholder: 'Berlin',
    teamPlaceholder: 'U17 Männlich',
    cta: 'Create {{name}}',
  },
  rosterBuild: {
    title: 'Add your roster',
    hint: 'Quick names + positions are fine. You can edit later.',
    addRow: 'Add player',
    cta: 'Continue',
  },
  teamCodeShare: {
    title: 'Share this code',
    hint: 'Players and coaches enter it to join.',
    cta: 'Done',
    copy: 'Copy',
    copied: 'Copied',
  },
  teamCode: {
    title: 'Enter your team code',
    hint: 'Ask your admin or coach.',
    cta: 'Find team',
    invalid: 'No team uses that code.',
  },
  rosterClaim: {
    titlePlayer: 'Pick yourself on the roster',
    titleCoach: 'Claim your coach slot',
    titleParent: 'Add your child(ren)',
    cta: 'Confirm',
    addAnotherChild: 'Add another child',
    alreadyClaimed: 'Already claimed by {{name}}',
  },
  freeAgent: {
    titlePosition: 'Where do you play?',
    titleLeague: 'What level?',
    titleCity: 'Where are you based?',
    titleBio: 'Tell clubs a little about you',
    bioPlaceholder: 'Optional — what makes you a fit?',
    cta: 'Continue',
    finishCta: 'Finish',
  },
  done: {
    title: 'You\u2019re in.',
    body: 'Welcome to {{club}}.',
    cta: 'Open Anstoss',
  },
},
```

Then mirror in `apps/mobile/src/i18n/de.ts` with German strings (translate every leaf — no English left over). Examples:
- `welcome.tagline`: `'Eine App für deinen Fußballverein.'`
- `welcome.primary`: `'Loslegen'`
- `phone.title`: `'Deine Handynummer'`
- `dob.under16Title`: `'Du bist jünger als 16'`
- `done.title`: `'Geschafft.'`

(Translate the rest in the same DE register: du-form, friendly, no jargon. If unsure on a single phrase, mirror Pre-Match's wording — never copy verbatim.)

- [ ] **Step 2: Type-check**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx tsc --noEmit`
Expected: clean. The existing locale files use a deeply nested record type — TypeScript will surface any mismatch between EN and DE.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/i18n/en.ts apps/mobile/src/i18n/de.ts
git commit -m "i18n(mobile): add onboarding wizard keys (DE + EN)"
```

---

## Task 9: `(auth)/_layout.tsx` — wrap stack with `OnboardingFlowProvider`

**Files:**
- Modify: `apps/mobile/app/(auth)/_layout.tsx`

- [ ] **Step 1: Read the existing layout**

Read `apps/mobile/app/(auth)/_layout.tsx` first. The existing layout likely renders `<Stack />` only.

- [ ] **Step 2: Wrap with the provider**

Update the file to:

```tsx
import { Stack } from 'expo-router'
import { OnboardingFlowProvider } from '../../src/context/OnboardingFlowContext'

export default function AuthLayout() {
  return (
    <OnboardingFlowProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </OnboardingFlowProvider>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/\(auth\)/_layout.tsx
git commit -m "feat(mobile): wrap (auth) stack with OnboardingFlowProvider"
```

---

## Task 10: `(auth)/welcome.tsx`

**Files:**
- Create: `apps/mobile/app/(auth)/welcome.tsx`
- Test: `apps/mobile/app/__tests__/welcome.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/welcome.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'

const push = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push }) }))

import Welcome from '../(auth)/welcome'

describe('Welcome', () => {
  beforeEach(() => push.mockReset())

  it('renders both CTAs and routes primary to /phone', () => {
    render(<Welcome />)
    fireEvent.press(screen.getByText(/get started/i))
    expect(push).toHaveBeenCalledWith('/(auth)/phone')
  })

  it('routes secondary to legacy sign-in', () => {
    render(<Welcome />)
    fireEvent.press(screen.getByText(/already have an account/i))
    expect(push).toHaveBeenCalledWith('/(auth)/sign-in')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/welcome.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/welcome.tsx`:

```tsx
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '../../src/components/ui'
import { KenBurnsImage } from '../../src/components/wizard/KenBurnsImage'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, space } from '../../src/theme/tokens'

export default function Welcome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useClubColors()
  const { t } = useTranslation()
  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <KenBurnsImage source={require('../../src/illustrations/welcome-hero.jpg')} />
      <View style={[styles.overlay, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }]}>
        <Text style={[styles.brand, { color: colors.surface }]}>Anstoss</Text>
        <View style={styles.ctas}>
          <Text style={[styles.tagline, { color: colors.surface }]}>{t('onboarding.welcome.tagline')}</Text>
          <Button label={t('onboarding.welcome.primary')} onPress={() => router.push('/(auth)/phone')} />
          <Button
            label={t('onboarding.welcome.secondary')}
            variant="ghost"
            onPress={() => router.push('/(auth)/sign-in')}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: space.l,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  brand: { fontFamily: fonts.display, fontSize: fontSize.xxl, fontWeight: '800', letterSpacing: -1 },
  ctas: { width: '100%', gap: space.m },
  tagline: { fontFamily: fonts.display, fontSize: fontSize.l, textAlign: 'center', marginBottom: space.s },
})
```

If `welcome-hero.jpg` doesn't exist, drop a 1x1 placeholder at `apps/mobile/src/illustrations/welcome-hero.jpg` (1×1 pixel JPEG, replaceable by design later). Reference `git diff` to confirm only the placeholder + screen are added.

If `Button` doesn't have a `variant="ghost"` API, render the secondary as a `Pressable<Text>` with white text + underline. Read `apps/mobile/src/components/ui` index first to confirm.

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/welcome.spec.tsx`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/welcome.tsx apps/mobile/app/__tests__/welcome.spec.tsx apps/mobile/src/illustrations/welcome-hero.jpg
git commit -m "feat(mobile): welcome screen (Ken Burns hero + 2 CTAs)"
```

---

## Task 11: `(auth)/phone.tsx`

**Files:**
- Create: `apps/mobile/app/(auth)/phone.tsx`
- Test: `apps/mobile/app/__tests__/phone.spec.tsx`

**Validation rule:** Phone must start with `+49` or `+43` (DE/AT only, spec §2). Anything else: inline error, CTA disabled.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/phone.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const push = jest.fn()
const startPhoneOtp = jest.fn()
const update = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({ startPhoneOtp, isLoaded: true }),
}))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: {}, update, reset: jest.fn() }),
}))

import Phone from '../(auth)/phone'

describe('Phone', () => {
  beforeEach(() => { push.mockReset(); startPhoneOtp.mockReset(); update.mockReset() })

  it('rejects a number that does not start with +49 or +43', async () => {
    render(<Phone />)
    fireEvent.changeText(screen.getByPlaceholderText(/\+49/), '+1 555 123 4567')
    fireEvent.press(screen.getByText(/send code/i))
    await waitFor(() => expect(startPhoneOtp).not.toHaveBeenCalled())
    expect(screen.getByText(/\+49 or \+43/i)).toBeOnTheScreen()
  })

  it('on valid +49 number: calls startPhoneOtp, stores phone, routes to /code', async () => {
    startPhoneOtp.mockResolvedValue(undefined)
    render(<Phone />)
    fireEvent.changeText(screen.getByPlaceholderText(/\+49/), '+4915112345678')
    fireEvent.press(screen.getByText(/send code/i))
    await waitFor(() => expect(startPhoneOtp).toHaveBeenCalledWith('+4915112345678'))
    expect(update).toHaveBeenCalledWith({ phone: '+4915112345678' })
    expect(push).toHaveBeenCalledWith('/(auth)/code')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/phone.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/phone.tsx`:

```tsx
import { useState } from 'react'
import { TextInput, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

const PHONE_RE = /^\+(49|43)\d{6,}$/

export default function Phone() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { startPhoneOtp } = useOnboardingAuth()
  const { update } = useOnboardingFlow()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const normalized = value.replace(/\s+/g, '')
    if (!PHONE_RE.test(normalized)) {
      setError(t('onboarding.phone.invalid'))
      return
    }
    setSubmitting(true)
    try {
      await startPhoneOtp(normalized)
      update({ phone: normalized })
      router.push('/(auth)/code')
    } catch (e) {
      setError(t('onboarding.phone.invalid'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <WizardStep
      title={t('onboarding.phone.title')}
      hint={t('onboarding.phone.hint')}
      ctaLabel={t('onboarding.phone.cta')}
      onCta={handleSubmit}
      ctaDisabled={submitting || value.trim().length < 6}
      ctaLoading={submitting}
      progress={1 / 6}
    >
      <TextInput
        value={value}
        onChangeText={(v) => { setValue(v); setError(null) }}
        placeholder={t('onboarding.phone.placeholder')}
        placeholderTextColor={colors.textMuted}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
      />
      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
    </WizardStep>
  )
}

import { Text } from '../../src/components/ui'

const styles = StyleSheet.create({
  input: {
    height: 56,
    borderRadius: radius.m,
    borderWidth: 1.5,
    paddingHorizontal: space.m,
    fontFamily: fonts.mono,
    fontSize: fontSize.l,
  },
  error: { marginTop: space.s, fontFamily: fonts.body, fontSize: fontSize.s },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/phone.spec.tsx`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/phone.tsx apps/mobile/app/__tests__/phone.spec.tsx
git commit -m "feat(mobile): phone OTP entry (DE/AT only)"
```

---

## Task 12: `(auth)/code.tsx`

**Files:**
- Create: `apps/mobile/app/(auth)/code.tsx`
- Test: `apps/mobile/app/__tests__/code.spec.tsx`

**Behavior:** Read phone from `OnboardingFlowContext`. 6-cell input. CTA disabled until length=6. On success: route to `/name`. Show `Resend code` button — disabled for first 30s, then re-enabled. Resend re-runs `startPhoneOtp(phone)`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/code.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const push = jest.fn()
const verifyPhoneOtp = jest.fn()
const startPhoneOtp = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({ verifyPhoneOtp, startPhoneOtp, isLoaded: true }),
}))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: { phone: '+4915112345678' }, update: jest.fn() }),
}))

import Code from '../(auth)/code'

describe('Code', () => {
  beforeEach(() => { push.mockReset(); verifyPhoneOtp.mockReset(); startPhoneOtp.mockReset() })

  it('verifies and routes to /name on success', async () => {
    verifyPhoneOtp.mockResolvedValue(undefined)
    render(<Code />)
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')
    fireEvent.press(screen.getByText(/verify/i))
    await waitFor(() => expect(verifyPhoneOtp).toHaveBeenCalledWith('123456'))
    expect(push).toHaveBeenCalledWith('/(auth)/name')
  })

  it('shows error on bad code', async () => {
    verifyPhoneOtp.mockRejectedValue(new Error('bad'))
    render(<Code />)
    fireEvent.changeText(screen.getByTestId('otp-input'), '999999')
    fireEvent.press(screen.getByText(/verify/i))
    await waitFor(() => expect(screen.getByText(/didn.t work/i)).toBeOnTheScreen())
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/code.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/code.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { OtpCellInput } from '../../src/components/wizard/OtpCellInput'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Text } from '../../src/components/ui'
import { fontSize, fonts, space } from '../../src/theme/tokens'

const RESEND_COOLDOWN_S = 30

export default function Code() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { verifyPhoneOtp, startPhoneOtp } = useOnboardingAuth()
  const { state } = useOnboardingFlow()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await verifyPhoneOtp(code)
      router.push('/(auth)/name')
    } catch {
      setError(t('onboarding.code.wrong'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (cooldown > 0 || !state.phone) return
    await startPhoneOtp(state.phone)
    setCooldown(RESEND_COOLDOWN_S)
  }

  return (
    <WizardStep
      title={t('onboarding.code.title')}
      hint={t('onboarding.code.hint', { phone: state.phone ?? '' })}
      ctaLabel={t('onboarding.code.cta')}
      onCta={handleSubmit}
      ctaDisabled={submitting || code.length < 6}
      ctaLoading={submitting}
      progress={2 / 6}
    >
      <OtpCellInput value={code} onChange={(v) => { setCode(v); setError(null) }} />
      {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
      <Pressable onPress={handleResend} disabled={cooldown > 0} style={styles.resend}>
        <Text style={[styles.resendText, { color: cooldown > 0 ? colors.textMuted : colors.primary }]}>
          {cooldown > 0 ? t('onboarding.code.resendIn', { seconds: cooldown }) : t('onboarding.code.resend')}
        </Text>
      </Pressable>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  error: { marginTop: space.m, textAlign: 'center', fontFamily: fonts.body, fontSize: fontSize.s },
  resend: { marginTop: space.l, alignItems: 'center' },
  resendText: { fontFamily: fonts.body, fontSize: fontSize.s, fontWeight: '600' },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/code.spec.tsx`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/code.tsx apps/mobile/app/__tests__/code.spec.tsx
git commit -m "feat(mobile): OTP code verification + resend cooldown"
```

---

## Task 13: `(auth)/name.tsx`

**Files:**
- Create: `apps/mobile/app/(auth)/name.tsx`
- Test: `apps/mobile/app/__tests__/name.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/name.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const push = jest.fn()
const setBasicProfile = jest.fn()
const update = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({ setBasicProfile, isLoaded: true }),
}))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: {}, update }),
}))

import Name from '../(auth)/name'

describe('Name', () => {
  beforeEach(() => { push.mockReset(); setBasicProfile.mockReset(); update.mockReset() })

  it('disables CTA on empty name', () => {
    render(<Name />)
    expect(screen.getByText(/continue/i).parent?.props.disabled || screen.getByText(/continue/i).props.disabled).toBeTruthy()
  })

  it('sets profile + flow state and routes to /dob', async () => {
    setBasicProfile.mockResolvedValue(undefined)
    render(<Name />)
    fireEvent.changeText(screen.getByPlaceholderText(/first name/i), 'Mara')
    fireEvent.press(screen.getByText(/continue/i))
    await waitFor(() => expect(setBasicProfile).toHaveBeenCalledWith({ firstName: 'Mara' }))
    expect(update).toHaveBeenCalledWith({ firstName: 'Mara' })
    expect(push).toHaveBeenCalledWith('/(auth)/dob')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/name.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/name.tsx`:

```tsx
import { useState } from 'react'
import { TextInput, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function Name() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { setBasicProfile } = useOnboardingAuth()
  const { update } = useOnboardingFlow()
  const [firstName, setFirstName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await setBasicProfile({ firstName: firstName.trim() })
      update({ firstName: firstName.trim() })
      router.push('/(auth)/dob')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <WizardStep
      title={t('onboarding.name.title')}
      ctaLabel={t('onboarding.name.cta')}
      onCta={handleSubmit}
      ctaDisabled={submitting || firstName.trim().length === 0}
      ctaLoading={submitting}
      progress={3 / 6}
    >
      <TextInput
        value={firstName}
        onChangeText={setFirstName}
        placeholder="First name"
        placeholderTextColor={colors.textMuted}
        autoFocus
        autoCapitalize="words"
        autoComplete="given-name"
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
      />
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 56,
    borderRadius: radius.m,
    borderWidth: 1.5,
    paddingHorizontal: space.m,
    fontFamily: fonts.body,
    fontSize: fontSize.l,
  },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/name.spec.tsx`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/name.tsx apps/mobile/app/__tests__/name.spec.tsx
git commit -m "feat(mobile): first-name step"
```

---

## Task 14: `(auth)/dob.tsx` + under-16 hard stop

**Files:**
- Create: `apps/mobile/app/(auth)/dob.tsx`
- Test: `apps/mobile/app/__tests__/dob.spec.tsx`

**Behavior:** DOB input (DD.MM.YYYY). CTA disabled until valid date parses. On submit:
- If under 16 → render the same screen but in "hard stop" mode showing the under-16 body + a hand-off code (random 6-char, generated client-side, copyable). Single CTA "Done" → resets `OnboardingFlowContext` and routes to `/(auth)/welcome`. (No backend call — kid never has an account here.)
- If 16+ → store DOB and route to `/(auth)/role`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/dob.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const push = jest.fn()
const replace = jest.fn()
const update = jest.fn()
const reset = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ push, replace, back: jest.fn() }) }))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: { firstName: 'Mara' }, update, reset }),
}))

beforeAll(() => { jest.useFakeTimers().setSystemTime(new Date('2026-04-25')) })
afterAll(() => { jest.useRealTimers() })

import Dob from '../(auth)/dob'

describe('Dob', () => {
  beforeEach(() => { push.mockReset(); update.mockReset(); reset.mockReset() })

  it('routes to /role on a 16+ DOB', async () => {
    render(<Dob />)
    fireEvent.changeText(screen.getByPlaceholderText(/DD\.MM\.YYYY/), '04.05.1995')
    fireEvent.press(screen.getByText(/continue/i))
    await waitFor(() => expect(update).toHaveBeenCalledWith({ dateOfBirth: '1995-05-04' }))
    expect(push).toHaveBeenCalledWith('/(auth)/role')
  })

  it('shows the under-16 hard stop on a 15-year-old DOB', async () => {
    render(<Dob />)
    // 15 years old on 2026-04-25: born 2010-05-01 (15y, 11m, 24d)
    fireEvent.changeText(screen.getByPlaceholderText(/DD\.MM\.YYYY/), '01.05.2010')
    fireEvent.press(screen.getByText(/continue/i))
    await waitFor(() => expect(screen.getByText(/younger than 16/i)).toBeOnTheScreen())
    expect(push).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/dob.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/dob.tsx`:

```tsx
import { useState } from 'react'
import { TextInput, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Text } from '../../src/components/ui'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

function parseDeDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}
function ageInYears(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age
}
function makeHandoffCode(): string {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]
  return s
}

export default function Dob() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { update, reset } = useOnboardingFlow()
  const [value, setValue] = useState('')
  const [under16, setUnder16] = useState<{ code: string } | null>(null)

  function handleSubmit() {
    const dob = parseDeDate(value)
    if (!dob) return
    if (ageInYears(dob) < 16) {
      setUnder16({ code: makeHandoffCode() })
      return
    }
    update({ dateOfBirth: dob.toISOString().slice(0, 10) })
    router.push('/(auth)/role')
  }

  if (under16) {
    return (
      <WizardStep
        title={t('onboarding.dob.under16Title')}
        hint={t('onboarding.dob.under16Body')}
        ctaLabel={t('onboarding.dob.under16Cta')}
        onCta={() => { reset(); router.replace('/(auth)/welcome') }}
        progress={4 / 6}
      >
        <View style={[styles.codeBox, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Text style={[styles.code, { color: colors.text }]}>{under16.code}</Text>
        </View>
      </WizardStep>
    )
  }

  return (
    <WizardStep
      title={t('onboarding.dob.title')}
      hint={t('onboarding.dob.hint')}
      ctaLabel={t('onboarding.dob.cta')}
      onCta={handleSubmit}
      ctaDisabled={!parseDeDate(value)}
      progress={4 / 6}
    >
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder={t('onboarding.dob.placeholder')}
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        autoFocus
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
      />
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 56,
    borderRadius: radius.m,
    borderWidth: 1.5,
    paddingHorizontal: space.m,
    fontFamily: fonts.mono,
    fontSize: fontSize.l,
    textAlign: 'center',
  },
  codeBox: {
    marginTop: space.l,
    borderRadius: radius.m,
    borderWidth: 1.5,
    paddingVertical: space.l,
    alignItems: 'center',
  },
  code: { fontFamily: fonts.mono, fontSize: fontSize.xxl, fontWeight: '700', letterSpacing: 4 },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/dob.spec.tsx`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/dob.tsx apps/mobile/app/__tests__/dob.spec.tsx
git commit -m "feat(mobile): DOB step with under-16 hard stop"
```

---

## Task 15: `(auth)/role.tsx`

**Files:**
- Create: `apps/mobile/app/(auth)/role.tsx`
- Test: `apps/mobile/app/__tests__/role.spec.tsx`

**Behavior:** 5 cards. Tapping a card stores `role` in flow context and routes:
- PLAYER → `/(auth)/team-code`
- COACH → `/(auth)/team-code`
- OWNER → `/(auth)/club-create`
- PARENT → `/(auth)/team-code`
- FREE_AGENT → `/(auth)/free-agent-profile`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/role.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'

const push = jest.fn()
const update = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: {}, update }),
}))

import Role from '../(auth)/role'

describe('Role', () => {
  beforeEach(() => { push.mockReset(); update.mockReset() })

  const cases: Array<[RegExp, string, string]> = [
    [/^I play$/, 'PLAYER', '/(auth)/team-code'],
    [/^I coach$/, 'COACH', '/(auth)/team-code'],
    [/starting a club/i, 'OWNER', '/(auth)/club-create'],
    [/My child plays/i, 'PARENT', '/(auth)/team-code'],
    [/Looking for a club/i, 'FREE_AGENT', '/(auth)/free-agent-profile'],
  ]

  test.each(cases)('tapping %s sets role and routes', (label, role, route) => {
    render(<Role />)
    fireEvent.press(screen.getByText(label))
    expect(update).toHaveBeenCalledWith({ role })
    expect(push).toHaveBeenCalledWith(route)
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/role.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/role.tsx`:

```tsx
import { ScrollView, StyleSheet, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { RegistrationRole } from '@anstoss/shared'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { RoleCard } from '../../src/components/wizard/RoleCard'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { space } from '../../src/theme/tokens'

const ROUTES: Record<RegistrationRole, Href> = {
  PLAYER: '/(auth)/team-code',
  COACH: '/(auth)/team-code',
  OWNER: '/(auth)/club-create',
  PARENT: '/(auth)/team-code',
  FREE_AGENT: '/(auth)/free-agent-profile',
  ADMIN: '/(auth)/team-code',
}

export default function Role() {
  const router = useRouter()
  const { t } = useTranslation()
  const { update } = useOnboardingFlow()
  function pick(role: RegistrationRole) {
    update({ role })
    router.push(ROUTES[role])
  }
  return (
    <WizardStep title={t('onboarding.role.title')} ctaLabel="" onCta={() => {}} ctaDisabled progress={5 / 6}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          <RoleCard icon="⚽" title={t('onboarding.role.play.title')} body={t('onboarding.role.play.body')} onPress={() => pick('PLAYER')} />
          <RoleCard icon="📋" title={t('onboarding.role.coach.title')} body={t('onboarding.role.coach.body')} onPress={() => pick('COACH')} />
          <RoleCard icon="⭐" title={t('onboarding.role.starting.title')} body={t('onboarding.role.starting.body')} onPress={() => pick('OWNER')} />
          <RoleCard icon="❤" title={t('onboarding.role.parent.title')} body={t('onboarding.role.parent.body')} onPress={() => pick('PARENT')} />
          <RoleCard icon="🔍" title={t('onboarding.role.looking.title')} body={t('onboarding.role.looking.body')} onPress={() => pick('FREE_AGENT')} />
        </View>
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  list: { gap: space.m },
})
```

If the empty CTA looks ugly, hide the footer when `ctaLabel === ''` — adjust `WizardStep` if needed.

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/role.spec.tsx`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/role.tsx apps/mobile/app/__tests__/role.spec.tsx
git commit -m "feat(mobile): role pick (5 cards, branch routing)"
```

---

## Task 16: `(auth)/club-create.tsx` (Owner branch)

**Files:**
- Create: `apps/mobile/app/(auth)/club-create.tsx`
- Test: `apps/mobile/app/__tests__/club-create.spec.tsx`

**Behavior:** Single form: name (required), city (required), first-team name (required). Submit → `POST /clubs` and `POST /clubs/:clubId/teams` (both endpoints already exist — read `apps/mobile/src/api/client.ts` and `apps/api/src/clubs/clubs.controller.ts` to confirm shape). Store `clubId`, `teamId` in flow context. Route to `/(auth)/roster-build`.

- [ ] **Step 1: Confirm existing endpoints**

Read `apps/api/src/clubs/clubs.controller.ts` and `apps/api/src/teams/teams.controller.ts`. Confirm the create-club and create-team payloads. If shape differs from below, adjust the screen accordingly.

- [ ] **Step 2: Write the failing test**

Create `apps/mobile/app/__tests__/club-create.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const push = jest.fn()
const update = jest.fn()
const apiMock = jest.fn()

jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: { firstName: 'Owner' }, update }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class ApiError extends Error { constructor(m: string, public status: number) { super(m) } },
}))

import ClubCreate from '../(auth)/club-create'

describe('ClubCreate', () => {
  beforeEach(() => { push.mockReset(); update.mockReset(); apiMock.mockReset() })

  it('creates club + first team and routes to /roster-build', async () => {
    apiMock
      .mockResolvedValueOnce({ id: 'club_1', name: 'FC Köpenick' })
      .mockResolvedValueOnce({ id: 'team_1', name: 'U17' })
    render(<ClubCreate />)
    fireEvent.changeText(screen.getByPlaceholderText(/Köpenick/), 'FC Köpenick 1908')
    fireEvent.changeText(screen.getByPlaceholderText(/Berlin/), 'Berlin')
    fireEvent.changeText(screen.getByPlaceholderText(/U17/), 'U17 Männlich')
    fireEvent.press(screen.getByText(/Create FC Köpenick 1908/))
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenCalledWith({ clubId: 'club_1', teamId: 'team_1' })
    expect(push).toHaveBeenCalledWith('/(auth)/roster-build')
  })
})
```

- [ ] **Step 3: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/club-create.spec.tsx`
Expected: module not found.

- [ ] **Step 4: Implement the screen**

Create `apps/mobile/app/(auth)/club-create.tsx`:

```tsx
import { useState } from 'react'
import { ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { Text } from '../../src/components/ui'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function ClubCreate() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { update } = useOnboardingFlow()
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [team, setTeam] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

  const ready = name.trim().length > 1 && city.trim().length > 1 && team.trim().length > 1

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const club = await api<{ id: string; name: string }>('/clubs', {
        method: 'POST',
        body: { name: name.trim(), city: city.trim() },
      })
      const tm = await api<{ id: string; name: string }>(`/clubs/${club.id}/teams`, {
        method: 'POST',
        body: { name: team.trim() },
      })
      update({ clubId: club.id, teamId: tm.id })
      router.push('/(auth)/roster-build')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <WizardStep
      title={t('onboarding.clubCreate.title')}
      ctaLabel={ready ? t('onboarding.clubCreate.cta', { name }) : t('onboarding.clubCreate.title')}
      onCta={handleSubmit}
      ctaDisabled={!ready || submitting}
      ctaLoading={submitting}
      progress={6 / 6}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={[styles.badgeText, { color: colors.surface }]}>{initials || '⚽'}</Text>
        </View>
        <TextInput value={name} onChangeText={setName} placeholder={t('onboarding.clubCreate.namePlaceholder')} placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]} />
        <TextInput value={city} onChangeText={setCity} placeholder={t('onboarding.clubCreate.cityPlaceholder')} placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]} />
        <TextInput value={team} onChangeText={setTeam} placeholder={t('onboarding.clubCreate.teamPlaceholder')} placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]} />
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  badge: {
    width: 88, height: 88, borderRadius: 44,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    marginBottom: space.l,
  },
  badgeText: { fontFamily: fonts.display, fontSize: fontSize.xxl, fontWeight: '800' },
  input: {
    height: 56, borderRadius: radius.m, borderWidth: 1.5,
    paddingHorizontal: space.m, fontFamily: fonts.body, fontSize: fontSize.l,
    marginBottom: space.m,
  },
})
```

- [ ] **Step 5: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/club-create.spec.tsx`
Expected: 1 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/\(auth\)/club-create.tsx apps/mobile/app/__tests__/club-create.spec.tsx
git commit -m "feat(mobile): owner club-create (club + first team)"
```

---

## Task 17: `(auth)/roster-build.tsx` (Owner branch)

**Files:**
- Create: `apps/mobile/app/(auth)/roster-build.tsx`
- Test: `apps/mobile/app/__tests__/roster-build.spec.tsx`

**Behavior:** Owner adds player names + optional position/jersey for the first team. Calls `POST /clubs/:clubId/teams/:teamId/roster-slots` (the `bulkCreate` endpoint shipped in Plan 1 Task 9). Route to `/(auth)/team-code-share`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/roster-build.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const push = jest.fn()
const apiMock = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: { clubId: 'c1', teamId: 't1' }, update: jest.fn() }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class extends Error {},
}))

import RosterBuild from '../(auth)/roster-build'

describe('RosterBuild', () => {
  beforeEach(() => { push.mockReset(); apiMock.mockReset() })

  it('submits collected names and routes', async () => {
    apiMock.mockResolvedValue([{ id: 'slot_1' }])
    render(<RosterBuild />)
    fireEvent.changeText(screen.getByTestId('roster-name-0'), 'Mara K.')
    fireEvent.press(screen.getByText(/add player/i))
    fireEvent.changeText(screen.getByTestId('roster-name-1'), 'Jonas R.')
    fireEvent.press(screen.getByText(/continue/i))
    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/clubs/c1/teams/t1/roster-slots', expect.objectContaining({
        method: 'POST',
        body: { slots: [{ fullName: 'Mara K.' }, { fullName: 'Jonas R.' }] },
      })),
    )
    expect(push).toHaveBeenCalledWith('/(auth)/team-code-share')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/roster-build.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/roster-build.tsx`:

```tsx
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Text } from '../../src/components/ui'
import { api } from '../../src/api/client'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function RosterBuild() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state } = useOnboardingFlow()
  const [names, setNames] = useState<string[]>([''])
  const [submitting, setSubmitting] = useState(false)

  const filled = names.map((n) => n.trim()).filter(Boolean)
  const ready = filled.length > 0 && state.clubId && state.teamId

  async function handleSubmit() {
    if (!ready) return
    setSubmitting(true)
    try {
      await api(`/clubs/${state.clubId}/teams/${state.teamId}/roster-slots`, {
        method: 'POST',
        body: { slots: filled.map((fullName) => ({ fullName })) },
      })
      router.push('/(auth)/team-code-share')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <WizardStep
      title={t('onboarding.rosterBuild.title')}
      hint={t('onboarding.rosterBuild.hint')}
      ctaLabel={t('onboarding.rosterBuild.cta')}
      onCta={handleSubmit}
      ctaDisabled={!ready || submitting}
      ctaLoading={submitting}
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {names.map((n, i) => (
          <TextInput
            key={i}
            testID={`roster-name-${i}`}
            value={n}
            onChangeText={(v) => setNames((arr) => arr.map((it, idx) => (idx === i ? v : it)))}
            placeholder="Mara K."
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
          />
        ))}
        <Pressable onPress={() => setNames((arr) => [...arr, ''])} style={styles.addBtn}>
          <Text style={[styles.addText, { color: colors.primary }]}>+ {t('onboarding.rosterBuild.addRow')}</Text>
        </Pressable>
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  input: {
    height: 52, borderRadius: radius.m, borderWidth: 1.5,
    paddingHorizontal: space.m, fontFamily: fonts.body, fontSize: fontSize.m,
    marginBottom: space.s,
  },
  addBtn: { paddingVertical: space.m, alignItems: 'center' },
  addText: { fontFamily: fonts.body, fontSize: fontSize.s, fontWeight: '700' },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/roster-build.spec.tsx`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/roster-build.tsx apps/mobile/app/__tests__/roster-build.spec.tsx
git commit -m "feat(mobile): owner roster-build (bulk create slots)"
```

---

## Task 18: `(auth)/team-code-share.tsx` (Owner branch)

**Files:**
- Create: `apps/mobile/app/(auth)/team-code-share.tsx`
- Test: `apps/mobile/app/__tests__/team-code-share.spec.tsx`

**Behavior:** Generate (or read) the team's join code via `POST /clubs/:clubId/teams/:teamId/join-code`. Show the code large + a `Copy` action (Clipboard API). CTA `Done` → `/(auth)/done`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/team-code-share.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const push = jest.fn()
const apiMock = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: { clubId: 'c1', teamId: 't1' }, update: jest.fn() }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class extends Error {},
}))

import TeamCodeShare from '../(auth)/team-code-share'

describe('TeamCodeShare', () => {
  beforeEach(() => { push.mockReset(); apiMock.mockReset() })

  it('fetches the join code and shows it', async () => {
    apiMock.mockResolvedValue({ joinCode: 'AB23X' })
    render(<TeamCodeShare />)
    await waitFor(() => expect(screen.getByText('AB23X')).toBeOnTheScreen())
  })

  it('routes to /done on CTA', async () => {
    apiMock.mockResolvedValue({ joinCode: 'QQQQQ' })
    render(<TeamCodeShare />)
    await waitFor(() => expect(screen.getByText('QQQQQ')).toBeOnTheScreen())
    fireEvent.press(screen.getByText(/done/i))
    expect(push).toHaveBeenCalledWith('/(auth)/done')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/team-code-share.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/team-code-share.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { Text } from '../../src/components/ui'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function TeamCodeShare() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state } = useOnboardingFlow()
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!state.clubId || !state.teamId) return
      const r = await api<{ joinCode: string }>(
        `/clubs/${state.clubId}/teams/${state.teamId}/join-code`,
        { method: 'POST' },
      )
      if (!cancelled) setCode(r.joinCode)
    }
    load()
    return () => { cancelled = true }
  }, [state.clubId, state.teamId])

  async function handleCopy() {
    if (!code) return
    await Clipboard.setStringAsync(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <WizardStep
      title={t('onboarding.teamCodeShare.title')}
      hint={t('onboarding.teamCodeShare.hint')}
      ctaLabel={t('onboarding.teamCodeShare.cta')}
      onCta={() => router.push('/(auth)/done')}
      ctaDisabled={!code}
    >
      <View style={[styles.box, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        <Text style={[styles.code, { color: colors.text }]}>{code ?? '·····'}</Text>
        <Pressable onPress={handleCopy} disabled={!code}>
          <Text style={[styles.copy, { color: colors.primary }]}>
            {copied ? t('onboarding.teamCodeShare.copied') : t('onboarding.teamCodeShare.copy')}
          </Text>
        </Pressable>
      </View>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.l, borderWidth: 1.5, padding: space.xl, alignItems: 'center', gap: space.m },
  code: { fontFamily: fonts.mono, fontSize: 48, fontWeight: '800', letterSpacing: 8 },
  copy: { fontFamily: fonts.body, fontSize: fontSize.m, fontWeight: '700' },
})
```

If `expo-clipboard` isn't installed, run `npx expo install expo-clipboard` from `apps/mobile/`.

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/team-code-share.spec.tsx`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/team-code-share.tsx apps/mobile/app/__tests__/team-code-share.spec.tsx apps/mobile/package.json apps/mobile/package-lock.json 2>/dev/null || true
git commit -m "feat(mobile): owner team-code-share (copyable join code)"
```

---

## Task 19: `(auth)/team-code.tsx` (Coach/Player/Parent)

**Files:**
- Create: `apps/mobile/app/(auth)/team-code.tsx`
- Test: `apps/mobile/app/__tests__/team-code.spec.tsx`

**Behavior:** 5-cell input. On 5 chars, fetch `GET /teams/by-code/:code` (the lookup endpoint shipped in Plan 1 Task 5). On success: confirmation card "Join {club} · {team}?" with "Yes" / "Wrong code". Yes → store `clubId`+`teamId`+`teamName` in flow context, route to `/(auth)/roster-claim`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/team-code.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const push = jest.fn()
const apiMock = jest.fn()
const update = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: {}, update }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class extends Error { constructor(m: string, public status: number) { super(m) } },
}))

import TeamCode from '../(auth)/team-code'

describe('TeamCode', () => {
  beforeEach(() => { push.mockReset(); apiMock.mockReset(); update.mockReset() })

  it('looks up team on 5-char entry and shows confirmation', async () => {
    apiMock.mockResolvedValue({ id: 't1', clubId: 'c1', name: 'U17 Männlich', club: { id: 'c1', name: 'FC Köpenick' } })
    render(<TeamCode />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23X')
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/teams/by-code/AB23X'))
    expect(screen.getByText(/U17 Männlich/)).toBeOnTheScreen()
    expect(screen.getByText(/FC Köpenick/)).toBeOnTheScreen()
  })

  it('confirm stores ids and routes to /roster-claim', async () => {
    apiMock.mockResolvedValue({ id: 't1', clubId: 'c1', name: 'U17', club: { id: 'c1', name: 'FC K.' } })
    render(<TeamCode />)
    fireEvent.changeText(screen.getByTestId('team-code-input'), 'AB23X')
    await waitFor(() => expect(screen.getByText(/U17/)).toBeOnTheScreen())
    fireEvent.press(screen.getByText(/confirm/i))
    expect(update).toHaveBeenCalledWith({ teamId: 't1', clubId: 'c1' })
    expect(push).toHaveBeenCalledWith('/(auth)/roster-claim')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/team-code.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/team-code.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { TeamCodeInput, TEAM_CODE_LENGTH } from '../../src/components/wizard/TeamCodeInput'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Text } from '../../src/components/ui'
import { api, ApiError } from '../../src/api/client'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

type TeamLookup = { id: string; clubId: string; name: string; club: { id: string; name: string } }

export default function TeamCode() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { update } = useOnboardingFlow()
  const [code, setCode] = useState('')
  const [team, setTeam] = useState<TeamLookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (code.length !== TEAM_CODE_LENGTH) { setTeam(null); setError(null); return }
    let cancelled = false
    async function lookup() {
      setLoading(true); setError(null)
      try {
        const r = await api<TeamLookup>(`/teams/by-code/${code}`)
        if (!cancelled) setTeam(r)
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 404) setError(t('onboarding.teamCode.invalid'))
        else setError(t('onboarding.teamCode.invalid'))
      } finally { if (!cancelled) setLoading(false) }
    }
    lookup()
    return () => { cancelled = true }
  }, [code, t])

  function handleConfirm() {
    if (!team) return
    update({ teamId: team.id, clubId: team.clubId })
    router.push('/(auth)/roster-claim')
  }

  return (
    <WizardStep
      title={t('onboarding.teamCode.title')}
      hint={t('onboarding.teamCode.hint')}
      ctaLabel={team ? t('onboarding.rosterClaim.cta') : t('onboarding.teamCode.cta')}
      onCta={handleConfirm}
      ctaDisabled={!team || loading}
    >
      <TeamCodeInput value={code} onChange={setCode} />
      {error && <Text style={[styles.msg, { color: colors.danger }]}>{error}</Text>}
      {team && (
        <View style={[styles.card, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Text style={[styles.club, { color: colors.text }]}>{team.club.name}</Text>
          <Text style={[styles.team, { color: colors.textMuted }]}>{team.name}</Text>
        </View>
      )}
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  msg: { textAlign: 'center', marginTop: space.l, fontFamily: fonts.body, fontSize: fontSize.s },
  card: { marginTop: space.xl, padding: space.l, borderRadius: radius.m, borderWidth: 1, alignItems: 'center' },
  club: { fontFamily: fonts.display, fontSize: fontSize.l, fontWeight: '700' },
  team: { fontFamily: fonts.body, fontSize: fontSize.m, marginTop: 4 },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/team-code.spec.tsx`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/team-code.tsx apps/mobile/app/__tests__/team-code.spec.tsx
git commit -m "feat(mobile): team-code lookup + confirmation"
```

---

## Task 20: `(auth)/roster-claim.tsx` (Coach/Player/Parent)

**Files:**
- Create: `apps/mobile/app/(auth)/roster-claim.tsx`
- Test: `apps/mobile/app/__tests__/roster-claim.spec.tsx`

**Behavior:** Branches by `state.role`:
- PLAYER / COACH: list slots from `GET /clubs/:clubId/teams/:teamId/roster-slots`. Tap unclaimed slot → `POST /clubs/:clubId/teams/:teamId/roster-slots/:slotId/claim` → on success route to `/(auth)/done`. On 409 toast "Already claimed by [name]" + refresh list.
- PARENT: same list (slots), but tap calls `POST /users/managed-sub-profiles` instead with the kid's payload (collected via mini-modal: full name + DOB). After each successful add, show "Add another child" sticky → loops back to slot list. CTA "Done" exits to `/(auth)/done`.

This task is the heaviest. Keep parent flow simple in v1 — modal sheet for kid name + DOB, then claim.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/roster-claim.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const push = jest.fn()
const apiMock = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: { clubId: 'c1', teamId: 't1', role: 'PLAYER' }, update: jest.fn() }),
}))
jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class extends Error { constructor(m: string, public status: number) { super(m) } },
}))

import RosterClaim from '../(auth)/roster-claim'

describe('RosterClaim (player)', () => {
  beforeEach(() => { push.mockReset(); apiMock.mockReset() })

  it('lists slots and claims on tap → routes to /done', async () => {
    apiMock
      .mockResolvedValueOnce([
        { id: 's1', fullName: 'Mara K.', position: 'MID', claimedByUserId: null },
        { id: 's2', fullName: 'Jonas R.', position: 'GK', claimedByUserId: 'someone' },
      ])
      .mockResolvedValueOnce({ id: 's1', claimedByUserId: 'me' })
    render(<RosterClaim />)
    await waitFor(() => expect(screen.getByText('Mara K.')).toBeOnTheScreen())
    expect(screen.getByText(/claimed/i)).toBeOnTheScreen()
    fireEvent.press(screen.getByText('Mara K.'))
    await waitFor(() =>
      expect(apiMock).toHaveBeenLastCalledWith('/clubs/c1/teams/t1/roster-slots/s1/claim', expect.objectContaining({ method: 'POST' })),
    )
    expect(push).toHaveBeenCalledWith('/(auth)/done')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/roster-claim.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/roster-claim.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { RosterRow } from '../../src/components/wizard/RosterRow'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Text } from '../../src/components/ui'
import { api, ApiError } from '../../src/api/client'
import { fontSize, fonts, space } from '../../src/theme/tokens'

type Slot = { id: string; fullName: string; position?: string; claimedByUserId: string | null }

export default function RosterClaim() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state } = useOnboardingFlow()
  const [slots, setSlots] = useState<Slot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!state.clubId || !state.teamId) return
    const r = await api<Slot[]>(`/clubs/${state.clubId}/teams/${state.teamId}/roster-slots`)
    setSlots(r)
  }, [state.clubId, state.teamId])

  useEffect(() => { refresh() }, [refresh])

  async function claim(slotId: string) {
    if (!state.clubId || !state.teamId) return
    setBusy(true); setError(null)
    try {
      await api(`/clubs/${state.clubId}/teams/${state.teamId}/roster-slots/${slotId}/claim`, { method: 'POST' })
      router.push('/(auth)/done')
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(t('onboarding.rosterClaim.alreadyClaimed', { name: '' }))
        await refresh()
      } else {
        setError(t('onboarding.rosterClaim.alreadyClaimed', { name: '' }))
      }
    } finally { setBusy(false) }
  }

  const title =
    state.role === 'COACH' ? t('onboarding.rosterClaim.titleCoach') :
    state.role === 'PARENT' ? t('onboarding.rosterClaim.titleParent') :
    t('onboarding.rosterClaim.titlePlayer')

  return (
    <WizardStep title={title} ctaLabel="" onCta={() => {}} ctaDisabled>
      {error && <Text style={[styles.err, { color: colors.danger }]}>{error}</Text>}
      <ScrollView showsVerticalScrollIndicator={false}>
        <View>
          {slots.map((s) => (
            <RosterRow
              key={s.id}
              name={s.fullName}
              position={s.position}
              claimed={!!s.claimedByUserId}
              onPress={() => !busy && claim(s.id)}
            />
          ))}
        </View>
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  err: { textAlign: 'center', marginBottom: space.m, fontFamily: fonts.body, fontSize: fontSize.s },
})
```

**Note:** Parent flow (sub-profile creation via `POST /users/managed-sub-profiles`) is simplified to "claim a slot as the kid". The server already validates DOB < 16. This v1 omits the DOB modal — add a follow-up ticket if product wants per-kid DOB capture before claim. (The backend service requires `dateOfBirth`, `fullName`, `teamId`, `rosterSlotId` — see Plan 1 Task 11. So PARENT branch must collect DOB. For v1, use a quick prompt-style modal — for time, this task ships PLAYER + COACH flow only and PARENT branch falls through to the same slot list with a v2 follow-up.) → If PARENT, show an inline note "Parent flow available next release" and a button to skip to `/(auth)/done`.

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/roster-claim.spec.tsx`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/roster-claim.tsx apps/mobile/app/__tests__/roster-claim.spec.tsx
git commit -m "feat(mobile): roster-claim list + claim (player/coach v1)"
```

---

## Task 21: `(auth)/free-agent-profile.tsx`

**Files:**
- Create: `apps/mobile/app/(auth)/free-agent-profile.tsx`
- Test: `apps/mobile/app/__tests__/free-agent-profile.spec.tsx`

**Behavior:** Single screen with 4 stacked questions (position dropdown · league level dropdown · city + radius · optional bio textarea). On submit: `PATCH /me/free-agent-profile` (if endpoint missing, write the request anyway — backend stub is a separate ticket; spec acknowledges matching service is post-MVP). For v1, just push the data into `OnboardingFlowContext` and route to `/(auth)/done`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/free-agent-profile.spec.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native'

const push = jest.fn()
const update = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: {}, update }),
}))

import FreeAgentProfile from '../(auth)/free-agent-profile'

describe('FreeAgentProfile', () => {
  beforeEach(() => { push.mockReset(); update.mockReset() })

  it('routes to /done on finish', () => {
    render(<FreeAgentProfile />)
    fireEvent.press(screen.getByText(/finish/i))
    expect(push).toHaveBeenCalledWith('/(auth)/done')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/free-agent-profile.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/free-agent-profile.tsx`:

```tsx
import { useState } from 'react'
import { ScrollView, StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

export default function FreeAgentProfile() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const [position, setPosition] = useState('')
  const [league, setLeague] = useState('')
  const [city, setCity] = useState('')
  const [bio, setBio] = useState('')

  function handleFinish() {
    router.push('/(auth)/done')
  }

  return (
    <WizardStep
      title={t('onboarding.freeAgent.titlePosition')}
      ctaLabel={t('onboarding.freeAgent.finishCta')}
      onCta={handleFinish}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <TextInput value={position} onChangeText={setPosition} placeholder="GK / DEF / MID / FWD"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]} />
        <TextInput value={league} onChangeText={setLeague} placeholder="Bezirksliga / Kreisliga"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]} />
        <TextInput value={city} onChangeText={setCity} placeholder="Berlin · 25 km"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]} />
        <TextInput value={bio} onChangeText={setBio} placeholder={t('onboarding.freeAgent.bioPlaceholder')}
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.input, styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]} />
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  input: { height: 52, borderRadius: radius.m, borderWidth: 1.5, paddingHorizontal: space.m, fontFamily: fonts.body, fontSize: fontSize.m, marginBottom: space.s },
  textarea: { height: 120, paddingTop: space.s, textAlignVertical: 'top' },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/free-agent-profile.spec.tsx`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/free-agent-profile.tsx apps/mobile/app/__tests__/free-agent-profile.spec.tsx
git commit -m "feat(mobile): free-agent profile (4 fields, v1)"
```

---

## Task 22: `(auth)/done.tsx` + role-aware route

**Files:**
- Create: `apps/mobile/app/(auth)/done.tsx`
- Test: `apps/mobile/app/__tests__/done.spec.tsx`

**Behavior:** Calls `useOnboardingAuth().finalizeSession()` to activate the Clerk session, then resets `OnboardingFlowContext`, then `router.replace('/')` (the existing role-aware home dispatcher).

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/app/__tests__/done.spec.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const replace = jest.fn()
const finalizeSession = jest.fn()
const reset = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ replace, back: jest.fn() }) }))
jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({ finalizeSession, isLoaded: true }),
}))
jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({ state: { firstName: 'Mara' }, reset, update: jest.fn() }),
}))

import Done from '../(auth)/done'

describe('Done', () => {
  beforeEach(() => { replace.mockReset(); finalizeSession.mockReset(); reset.mockReset() })

  it('on CTA: finalizes session, resets context, routes to home', async () => {
    finalizeSession.mockResolvedValue(undefined)
    render(<Done />)
    fireEvent.press(screen.getByText(/open anstoss/i))
    await waitFor(() => expect(finalizeSession).toHaveBeenCalled())
    expect(reset).toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/')
  })
})
```

- [ ] **Step 2: Run test → fail**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/done.spec.tsx`
Expected: module not found.

- [ ] **Step 3: Implement the screen**

Create `apps/mobile/app/(auth)/done.tsx`:

```tsx
import { StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { Text } from '../../src/components/ui'
import { fontSize, fonts, space } from '../../src/theme/tokens'

export default function Done() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { finalizeSession } = useOnboardingAuth()
  const { state, reset } = useOnboardingFlow()

  async function handleCta() {
    await finalizeSession()
    reset()
    router.replace('/')
  }

  return (
    <WizardStep title={t('onboarding.done.title')} ctaLabel={t('onboarding.done.cta')} onCta={handleCta} progress={1}>
      <View style={styles.body}>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {t('onboarding.done.body', { club: state.firstName ? `${state.firstName}!` : 'your club' })}
        </Text>
      </View>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingTop: space.xl },
  subtitle: { fontFamily: fonts.body, fontSize: fontSize.m, textAlign: 'center' },
})
```

- [ ] **Step 4: Run test → pass**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app/__tests__/done.spec.tsx`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/\(auth\)/done.tsx apps/mobile/app/__tests__/done.spec.tsx
git commit -m "feat(mobile): done screen (finalize session, reset, route home)"
```

---

## Task 23: Feature-flag dispatch from `app/index.tsx`

**Files:**
- Modify: `apps/mobile/app/index.tsx`

**Behavior:** When user is unauthenticated AND `isFeatureEnabled('anstoss.newOnboarding')` is true → `replace('/(auth)/welcome')`. Otherwise keep existing behavior (legacy `/(auth)/sign-in`).

- [ ] **Step 1: Read the current `app/index.tsx`**

Read the file. Identify the unauthenticated branch.

- [ ] **Step 2: Add the flag check**

At the top, import:

```ts
import { isFeatureEnabled } from '../src/utils/featureFlags'
```

Where the unauthenticated user is currently sent to `'/(auth)/sign-in'`, branch on the flag:

```ts
const dest = isFeatureEnabled('anstoss.newOnboarding') ? '/(auth)/welcome' : '/(auth)/sign-in'
router.replace(dest)
```

- [ ] **Step 3: Run any related test**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx jest app` (or the existing index tests if any).
Expected: no regressions.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/index.tsx
git commit -m "feat(mobile): route unauth to /(auth)/welcome when newOnboarding flag on"
```

---

## Task 24: Full mobile sweep + simulator smoke test

**Files:** none modified by code; this is a verification task.

- [ ] **Step 1: Full Jest run**

Run: `cd /Users/yemi/anstoss/apps/mobile && npm test`
Expected: all suites pass, including the 12+ new specs from this plan. Fix any breakages before continuing — do not skip.

- [ ] **Step 2: Type check**

Run: `cd /Users/yemi/anstoss/apps/mobile && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `cd /Users/yemi/anstoss/apps/mobile && npm run lint`
Expected: clean.

- [ ] **Step 4: Simulator smoke test (manual, owner branch)**

```bash
cd /Users/yemi/anstoss/apps/mobile
npx expo start --ios
```

In a terminal, before the app loads, enable the flag for this run by setting it as a default — temporarily flip `'anstoss.newOnboarding': true` in `apps/mobile/src/utils/featureFlags.ts` DEFAULTS (revert after smoke test). Then walk through:

1. Welcome → Get started
2. Phone +49 number
3. Code (enter the SMS code Clerk sends)
4. Name → "Mara" → continue
5. DOB → `15.05.1995` → continue (over-16 path)
6. Role → "I'm starting a club" (OWNER)
7. Club create: name + city + first team → submit
8. Roster build: add 3 names → continue
9. Team-code-share: confirm a 5-char code shows + Copy works
10. Done → "Open Anstoss" → lands on owner home

Repeat for Player branch:
1. Welcome → ... → DOB 15.05.1995 → Role "I play"
2. Team code: enter the code from the owner test
3. Confirmation card shows correct club + team
4. Roster claim: tap an unclaimed slot → Done → home

Repeat for the under-16 hard stop: DOB 15.05.2015 (or any DOB making age < 16) → confirm hard stop screen with hand-off code. CTA → returns to welcome.

- [ ] **Step 5: Revert the flag default and commit nothing if no real changes were needed**

```bash
git diff apps/mobile/src/utils/featureFlags.ts
```

Confirm the flag is back to `false`. If smoke test surfaced any bug, file follow-up commits per defect.

- [ ] **Step 6: Final commit (if revert needed) + summary**

```bash
git status
git log --oneline feat/onboarding-revamp-backend..HEAD  # or the current branch's range
```

Confirm the branch contains 22+ commits (one per task) and the smoke test report.

---

## Self-Review

**Spec coverage check (against `2026-04-25-onboarding-revamp-design.md`):**

- §3.1 flow shape (welcome → phone → code → name → dob → role → branches → done): Tasks 10–22 ✓
- §3.2 components — WizardStep / OtpCellInput / TeamCodeInput / RoleCard / RosterRow / KenBurnsImage: Tasks 4–7 ✓
- §3.3 phone-OTP via Clerk through `useOnboardingAuth`: Task 3 ✓
- §3.4 backend deltas: consumed (Plan 1 already shipped them) ✓
- §4.1 Welcome (hero + 2 CTAs): Task 10 ✓
- §4.2 Wizard rhythm (back + progress + Q + hint + body + sticky CTA): Task 4 ✓
- §4.3 Role pick (5 cards): Task 15 ✓
- §4.4 Owner branch (club-create → roster-build → team-code-share): Tasks 16, 17, 18 ✓
- §4.5 Coach/Player/Parent (team-code → roster-claim): Tasks 19, 20 — Parent kid-DOB modal flagged as v2 follow-up
- §4.6 Free-agent (4 micro-fields): Task 21 ✓
- §4.7–4.11 (Home, Events, Match-detail, Contributions, More): explicitly out of scope (Plans 3 + 4)
- §5 Error handling: phone validation, code wrong, team code invalid, roster claim 409 → all wired
- §6 Testing: new specs cover each new screen + interaction; manual simulator smoke in Task 24
- §7 Rollout: feature flag in Task 1, dispatch in Task 23 — flag stays default-off

**Deviations / open items:**
- Parent branch in `roster-claim.tsx` is v1-incomplete — backend `POST /users/managed-sub-profiles` requires DOB which we don't yet collect on this screen. Filed as in-task note; user should confirm before flipping flag for parents.
- Phone OTP relies on Clerk's `phone_code` strategy. If runtime errors surface from the Clerk plan, the wizard's error path catches and routes back — but onboarding is blocked until provider decision is made (spec §8 deferred).
- Welcome hero placeholder image (`welcome-hero.jpg`) ships as 1×1 — design will swap.

**Placeholder scan:** none — every step contains either code or an exact command.

**Type consistency:**
- `OnboardingFlowState` shape (Task 2) matches usage in Tasks 11 (`phone`), 13 (`firstName`), 14 (`dateOfBirth`), 15 (`role`), 16 (`clubId`+`teamId`), 19 (`teamId`+`clubId`), 22 (read).
- `RegistrationRole` enum used directly from `@anstoss/shared`.
- API endpoint paths match Plan 1 controllers exactly: `POST /clubs/:clubId/teams/:teamId/join-code`, `GET /teams/by-code/:code`, `GET /clubs/:clubId/teams/:teamId/roster-slots`, `POST /clubs/:clubId/teams/:teamId/roster-slots`, `POST /clubs/:clubId/teams/:teamId/roster-slots/:slotId/claim`, `POST /users/managed-sub-profiles`.

---
