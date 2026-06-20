# Seamless Onboarding Rebuild — Design

_2026-06-20. Approved scope: full seamless rebuild. Branch: develop._

## Goal

Collapse the two-screen, choose-your-path, account-only-at-the-end onboarding
into a single seamless flow where the account is real the instant the OTP is
verified, and everything else is deferred, optional, and resumable.

## Clerk reality (verified via FAPI `precious-hawk-48.clerk.accounts.dev`)

`auth_config`: `first_name:"on"` (optional, NOT required), `email_address`/
`phone_number` enabled as identifiers, code-based first factors
(`email_code`/`phone_code`). So a verified identifier is enough for Clerk to
complete the signup — we do NOT need a dashboard change. The current code's bug
is that it **defers `setActive` to `done.tsx`** instead of activating as soon as
the signUp reaches `complete`.

## Architecture

### 1. Durability engine (`useOnboardingAuth`)
Add `completeSignUpIfReady()`: after `verifyOtp`, read `signUp.status`.
- `complete` → `setActive({ session: createdSessionId })` → **user durable now**.
- `missing_requirements` → return `signUp.missingFields` so the caller can
  collect only what Clerk genuinely needs (at most first name here), then
  `signUp.update()` + `setActive`.
Keep `finalizeSession()` as the idempotent backstop. No silent no-op that strands
a verified user.

### 2. Unified `AuthGate` screen (`app/(auth)/sign-in.tsx` becomes the single entry)
- One identifier field (phone OR email) → "Continue".
- Inline OTP (auto-submit, already built).
- After verify: `completeSignUpIfReady()`. If a new signUp needs first name, reveal
  one inline field and finish. If returning user, `setActive` the signIn session.
- Detect new-vs-returning from Clerk's response, not a user toggle. The "No
  account → tap Create account" dead-end disappears (a not-found identifier just
  starts a signup with the same code step).
- Consent line under the CTA ("By continuing you agree to Terms & Privacy"),
  replacing the welcome checkbox. Keep `welcome.tsx`'s hero as the unauthenticated
  landing that routes into this single screen (no separate sign-in vs sign-up).

### 3. Deferred, resumable profile
The Clerk user + session exist after step 2, so `index.tsx` routing already
governs the rest. No-membership users route to a "finish setup" surface that
reuses `role.tsx` + club screens as **optional cards**, not a hard gate. Because
the user is authenticated, backgrounding/relaunch resumes correctly — no lost
accounts, no re-entry of identifier.

### 4. Keep, don't delete
Reuse `role.tsx`, `club-create.tsx`, `club-identity.tsx`, `about.tsx` as the
post-auth setup steps. Delete the dead `name.tsx`/`dob.tsx` only after the new
flow is verified. `welcome.tsx` stays as the hero landing.

## Slices (each verified: tsc + lint + targeted test before next)
1. Durability engine in `useOnboardingAuth` + unit test.
2. AuthGate screen: post-OTP completion + inline-name-if-needed + consent line.
3. Routing: signed-in-no-membership → finish-setup surface (reuse role/club).
4. Remove the dual-path / welcome checkbox friction.
5. Update Maestro e2e (signup + signin + resume-after-background) on both sims.
6. Audit: codex + adversarial.

## Out of scope (separate pass)
Passkeys; invite-link deep links (`anstoss://join/<code>`). Noted in the
remediation plan.
