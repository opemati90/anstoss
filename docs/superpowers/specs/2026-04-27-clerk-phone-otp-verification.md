# Clerk Phone-OTP Verification — Findings

**Date:** 2026-04-27
**Branch:** `feat/onboarding-revamp-mobile-auth`
**Spec source:** `2026-04-25-onboarding-revamp-design.md` §2 (locked constraint: phone OTP for every role; email is a "linked address" later, not a primary credential).
**Plan source:** `2026-04-25-onboarding-revamp-mobile-auth.md` (defers Clerk verification to the live SDK call).

## TL;DR

Implementation is **complete** — `useOnboardingAuth` drives `signUp.create({ phoneNumber })` + `signUp.preparePhoneNumberVerification({ strategy: 'phone_code' })` and a sibling `signIn.prepareFirstFactor({ strategy: 'phone_code' })` for returning users. Both Clerk hooks are wired (`useSignUp` + `useSignIn`) and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` resolves to the dev instance `precious-hawk-48.clerk.accounts.dev`.

The dev instance **blocks** phone-only signup today because email + password are configured as required attributes. This is a **dashboard config change**, not a code change.

## Probe results

`GET https://precious-hawk-48.clerk.accounts.dev/v1/environment` (`user_settings.attributes`):

| Attribute      | enabled | required | first_factor | verifications |
|----------------|---------|----------|--------------|---------------|
| phone_number   | ✓       | ✓        | phone_code   | phone_code    |
| email_address  | ✓       | **✓**    | email_code   | email_code    |
| password       | ✓       | **✓**    | —            | —             |

Phone OTP is fully provisioned. The blocker is `email_address.required = true` and `password.required = true`. `signUp.create({ phoneNumber: '+49…' })` will reject with a `form_param_missing` error for `email_address` / `password`.

## Required dashboard changes

Owner of the Clerk app (`precious-hawk-48`) must:

1. **User & Authentication → Email, Phone, Username**
   - Email: flip from "Required" to "Optional" (or disable if it's not even optional initially).
   - Phone: leave as-is (already required, that's correct).
2. **User & Authentication → Password**
   - Flip from "Required" to "Optional" (or disable).
3. **Confirm SMS provider is funded** — the dev instance uses Clerk's pooled provider. For prod, attach a Twilio/MessageBird account or accept Clerk's per-message cost.
4. **Allowed countries** — confirm DE (+49) and AT (+43) are allowed. (Spec §2 locks the country list to DACH; broaden later.)

Once those are flipped, the existing `useOnboardingAuth` flow works without code changes.

## Verification checklist (after dashboard fix)

- [ ] On a real DE handset: enter `+49…` → tap "Code senden" → SMS arrives within 60s.
- [ ] Enter the 6-digit code → wizard advances to `/(auth)/name`.
- [ ] After `done.tsx` the session is active (Clerk `setActive` ran with `signUp.createdSessionId`).
- [ ] Repeat with the same number to test the sign-in path: `/(auth)/welcome` → "Anmelden" → enter `+49…` → SMS → code → home.
- [ ] Confirm the new account has only a phone identifier (no email, no password) in the Clerk dashboard.

## If Clerk's plan blocks phone OTP for prod

Spec §3.3 already flagged a fallback. The seam is `useOnboardingAuth`: every screen calls into that hook, never into Clerk directly, so swapping providers is contained. Concrete swaps (in priority order):

1. **Twilio Verify** behind a thin NestJS endpoint — issue + verify, then mint a Clerk JWT or our own session.
2. **AWS SNS / MessageBird** — same shape as Twilio.
3. **Email-only fallback** — keep email primary but pre-fill from phone (`<phone>@anstoss.app` shadow) so the UX stays "phone first" while the credential is technically email. Worst-case escape valve.

Pick (1) if Clerk blocks. Don't pick (3) if there's any way to avoid it — it forks the credential model.
