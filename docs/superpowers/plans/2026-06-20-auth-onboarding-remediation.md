# Auth & Onboarding Remediation Spec

_Created 2026-06-20. Source: end-to-end auth review + live iOS test._

## Context

Anstoss auth is **passwordless** (Clerk email/phone + 6-digit OTP). There is no
password and therefore no "forgot password" by design. The onboarding wizard is:

`welcome → phone (identifier + OTP) → about (name + DOB) → role → [club-create →
club-identity | team-code | free-agent-profile] → done`.

## Shipped in this pass (low-risk, verified: tsc + lint + tests green)

1. **Step counter consistency** — `src/onboarding/steps.ts` is now the single
   source of truth (`phone 1 → about 2 → role 3 → club-create 4 → club-identity
   5`, total 5). Previously each screen hard-coded contradictory totals
   (1/4, 3/5, 4/6, 4/5, 5/6, 6/6) and the indicator visibly lied.
2. **Identifier-aware signup copy** — the signup screen said "Your phone" /
   "We'll text you a 6-digit code" even when the user typed an email. Now
   neutral ("Phone or email" / "We'll send you a 6-digit code…") in all 5
   locales (en, de, fr, pt, it).
3. **OTP auto-submit** — `OtpCellInput` already had `autoComplete="sms-otp"` +
   `textContentType="oneTimeCode"` (autofill). Added an `onComplete` callback
   that auto-verifies on the 6th digit; wired into signup `phone.tsx` and
   `sign-in.tsx`. Removes a tap and defeats the focus-race that let OTP digits
   land in the identifier field. Hardened post-audit: `onComplete` fires only on
   the `<6 → 6` transition (no autofill-repeat / edit-after-complete re-fire),
   and `handleVerify` is guarded by a synchronous `verifyingRef` so a CTA tap
   racing the auto-submit in the same tick can't double-verify.

### Audit (codex + adversarial agent)

Both reviewers: **no P1 behavioral bugs**; tsc + eslint clean; jest green
(i18n parity 18 tests pass). The only cross-flagged item — the non-atomic
`submitting` guard — is now closed with `verifyingRef` + transition-only
`onComplete`. Agreed P2 cleanup: orphan `app/(auth)/name.tsx` + `dob.tsx` are
**dead code** (nothing routes to them; `about.tsx` replaced them) and still
carry stale `Step x of 6` values. Harmless (unreachable) but should be deleted
or migrated to `onboardingStep` in a follow-up cleanup.

## Finding #1 — the can't-sign-in-after-signup gap (NOT yet fixed; needs Clerk + device)

### Root cause (code-confirmed)

`finalizeSession()` (`src/auth/useOnboardingAuth.ts:144`) deliberately **no-ops**
while the Clerk signUp is in `missing_requirements` status:

```
// createdSessionId is null when Clerk requires additional fields (e.g. firstName)
// before completing signup. In that case the session is finalized later in
// done.tsx after the wizard collects the required fields. Silently return here.
if (!signUp?.createdSessionId || !setActive) return
```

Clerk only persists a **User** when the SignUp reaches `complete`. That only
happens at the very end of onboarding (`done.tsx:239`). **Consequence:** a user
who verifies their OTP but abandons before `done.tsx` is never persisted — their
email/phone "doesn't exist," so they cannot sign in later and are dead-ended on
the sign-in screen ("No account uses that number").

Reproduced live: created an account through to the role screen with a clean
email, abandoned, then signing in with that exact email returned "No account."

### Why it's not a blind fix

The correct fix changes *when* the Clerk User becomes durable, which depends on
the **Clerk instance configuration** (which fields are required to complete a
SignUp) — a dashboard setting not in this repo — and must be verified on a real
device against the real Clerk instance (test emails like `+clerk_test` behave
specially and can't fully confirm the path headlessly).

### Proposed fix (decouple account creation from onboarding completion)

1. **Minimize Clerk SignUp requirements** (Clerk dashboard): require only the
   identifier (email OR phone). Make name/DOB *app* profile data, not Clerk
   completion requirements.
2. With (1), `signUp.create({email|phone})` + OTP verify yields a `complete`
   signUp immediately → call `setActive` right after OTP in `phone.tsx`. The
   Clerk **User is now durable the moment the code is verified.**
3. Onboarding (name, DOB, role, club) becomes pure profile collection on an
   already-authenticated user → fully **resumable**: if the user backgrounds the
   app mid-wizard and returns, `index.tsx` already routes by membership/role to
   the right "finish setup" surface. No lost accounts.
4. Persist name/DOB/role via `PATCH /me` (already done in `done.tsx`) — keep, but
   it no longer gates account existence.
5. Add a regression test: verify OTP → background → relaunch → user can sign in.

### Acceptance

- Verify OTP, force-quit before finishing → relaunch → app resumes onboarding as
  the signed-in user; signing in later with the same identifier works.
- No "No account" dead-end for any identifier that has completed OTP.

## Design overhaul (recommended, larger scope — separate pass)

1. **One unified auth screen**, not two (`welcome` + `sign-in`). Single hero +
   one identifier field + "Continue." Detect new-vs-returning *after* OTP (Clerk
   tells you), so the user never chooses "sign in vs sign up." This also removes
   the "No account → Create account" bounce entirely.
2. **Drop the manual policy checkbox** on welcome; use implicit-consent line
   under the CTA ("By continuing you agree to Terms & Privacy") — confirm with
   legal for GDPR/Germany. Removes a tap + a disabled-button dead state.
3. **Passkeys first** (Clerk supports them) — Face ID returning sign-in, OTP
   fallback. Biggest "feels current" upgrade.
4. **Defer profile fields past first value** — collect only identifier + OTP to
   get in; ask name/DOB/role contextually (DOB only at an age-gated action; role
   pre-set from invite deep links).
5. **Invite-link deep links** (`anstoss://join/<code>`) pre-fill club + role and
   collapse onboarding to identifier + OTP + name.
