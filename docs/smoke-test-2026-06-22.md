# Live sim smoke test — auth + role journeys (2026-06-22)

Device: iPhone 17 sim · Metro :8084 · app points at **production API** + Clerk
`precious-hawk-48`. Maestro flows in `apps/mobile/.maestro/`.

## Results

| Area | Flow | Result |
|------|------|--------|
| Signed-out entry | signup-flow | ✅ PASS — welcome ("Get started"/"Log in") → sign-in ("Welcome"/"Send code") |
| **Email sign-up** | _real-signup-email | ✅ PASS — real Clerk: email → Send code → OTP 424242 → routed to onboarding "About you" |
| **Phone sign-up** | _real-signup | ❌ **FAIL** — OTP accepted, then "We couldn't finish that" (see below) |
| Player journey | player-flow | ✅ PASS — live match, team chat, events, more/profile |
| Coach journey | coach-flow | ✅ PASS — squad, roster (trials/medic/kit), events |
| Club-admin journey | club-admin-flow | ✅ PASS — admin dashboard, manage teams |
| Parent journey | parent-flow | ✅ PASS — schedule, announcements, children's schedule |
| Free-agent journey | free-agent-flow | ⚠️ test gap — screen needs a real backend profile; the e2e scenario only seeds client state, so it shows the create/loading state |
| Sign-in screen test | auth-flow | ⚠️ test gap — doesn't deeplink signed-out first, so the persisted session fails it (screen itself verified good via signup-flow) |

## 🔴 Critical finding — phone-number sign-up cannot complete

A NEW user signing up with a **phone number** gets all the way through OTP, then
hits **"We couldn't finish that. Please try again."** and is stuck. Email signups
work end-to-end.

Root cause: the Clerk instance `auth_config` has **`email_address` required**
(GET /v1/environment shows first_name/last_name/email_address/phone_number all
`on`; password off). The app's unified sign-in collects ONE identifier
(phone OR email) + a first name, so a phone-only signup has no email to satisfy
Clerk's completion requirement → `completeSignUpIfReady()` never activates → the
error-and-stay guard fires.

This is the **same incomplete fix** from the 2026-06-20 session: password was
turned off, but the "require only one of email/phone" change was never made.

Impact: high. The target market (German amateur clubs) signs up with phone
numbers. Phone is the primary identifier the welcome copy even calls out.

**Fix (Clerk dashboard, ~2 min, no code):** make `email_address` NOT required
and require only ONE of email/phone (and make last_name optional). After that,
re-run `_real-signup.yaml` to confirm phone signup reaches "About you".

## What's verified working

- Signed-out → welcome hero → unified sign-in screen.
- Real email sign-up through OTP into the onboarding wizard.
- Returning-user post-auth journeys for player / coach / club-admin / parent.
- The copy + nav changes from this session are live on device (screenshots:
  "Just your first name and date of birth.", back chevron on About + sign-in).

## Not tested (writes to production)

- **Invite + joining** (coach/admin issues invite → player redeems / requests to
  join → admin approves). These create real club + membership + join-request rows
  on the production DB, so I held off. Needs either a controlled local/staging
  backend or explicit OK to create test data on prod.

## Test-harness fixes made (local only)

- `subflows/launch.yaml`: removed the hard "Send code" wait that failed whenever
  a Clerk session persisted; now session-agnostic (each flow deeplinks its
  scenario).
- `signup-flow.yaml`: updated stale copy assertions ("Build your profile" →
  "Get started", "Welcome back" → "Welcome").
- Added `_real-signup.yaml` / `_real-signup-email.yaml` real-auth smoke flows.
- Still stale (not fixed): `auth-flow.yaml` (needs a signed-out deeplink),
  `free-agent-flow.yaml` (needs a backend profile fixture).
