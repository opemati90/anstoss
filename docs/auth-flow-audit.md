# Anstoss — Auth & Onboarding Flow (per user type)

_Last audited 2026-06-21. Source of truth: `apps/mobile/app/(auth)/*`, `app/index.tsx`,
`apps/api/src/clubs|teams`._

## One sentence

There is **one** sign-in screen for everybody. It tries to sign you in; if no account
exists it transparently turns into a sign-up using the same 6-digit code — so no user
ever picks "sign in vs. create account". The Clerk session becomes durable **at the OTP
step**, so everything after it is resumable on a signed-in account.

## Entry points (all user types)

| Situation | Lands on |
|-----------|----------|
| Cold launch, signed out | `index.tsx` → `/(auth)/sign-in` (unified entry) |
| After sign-out | `/(auth)/welcome` (hero) → both buttons → `/(auth)/sign-in` |
| Invite deep link | `/join/<code>` → `sign-in` (carries `inviteCode`) → redeem after auth |

`sign-in.tsx`: single field accepts phone (`+…`) or email (`…@…`). **Send code** →
Clerk sign-in; on `form_identifier_not_found` it silently restarts as sign-up with the
same OTP. Verify code → `completeSignUpIfReady()` activates the session.
- **Returning** (mode=signin) → `index.tsx` routes by membership/role.
- **New** (mode=signup) → `/(auth)/about`.
- If Clerk still needs a first name, an inline name stage collects it (no dead-end).

## New-user wizard (after OTP)

1. **about.tsx** — first name + date of birth.
   - **Under 16** → `signOut()` immediately (GDPR Art. 8 / Germany 16) + parent-handoff code → welcome.
   - **Invite present** → `PATCH /me` + redeem invite (role + club come from the invite; skips role/club).
   - else → `/(auth)/role`.
2. **role.tsx** — 4 cards. Parent has **no** card (invite-only; guardian↔child linking not built).

| Role | Path after role |
|------|-----------------|
| Player | `team-code` → `roster-claim` → `done` |
| Coach | `team-code` → `done` (no roster claim) |
| Club admin | `club-create` → `club-identity` → `done` |
| Free agent | `done` (fills profile later in its own tab) |
| Parent (invite only) | `team-code` → `done` |

3. **done.tsx** — finalizes the session, `refreshUser()`, PATCHes the profile, routes into the app.

## Returning user / post-auth routing (`index.tsx`)

- Age gate: `DOB_REQUIRED`→`/enter-dob`, `PENDING_PARENT_APPROVAL`→`/pending-approval`, `BLOCKED`→`/access-blocked`.
- **No memberships yet:** Free agent → `/free-agent/profile`; Club admin → `/(tabs)` (soft "finish setup" CTA on home); Player/Coach/Parent → `/account-next-step` (join-club CTA).
- **Has membership** → `/(tabs)`.

## Are the per-type flows synced & working?

Yes — one Clerk session, one entry, one set of routers. Two production-affecting bugs were
found and fixed in this pass:

- **P1 — Player/Coach/Parent could not join a club in prod.** `team-code.tsx` read the
  `GET /teams/by-code/:code` response as a flat object, but the API returns
  `{ team: {...}, club: {...} }`. In prod this produced a blank confirmation card and an
  `undefined` `clubId`/`teamId`. Dev masked it (the dev fallback synthesized fake ids).
  → Fixed: typed `TeamByCodeResponse`, reads the nested shape.
- **P1 — stale routing / duplicate club after the durable-session change.** Because the
  session now activates at OTP, the `AuthProvider` fetch effect doesn't re-fire on
  `done.tsx`. `done.tsx` now calls `refreshUser()` before routing.
- **Defense-in-depth (idempotency).** Setup is the only club-creation path (no
  multi-club-create UI exists), so a user owns at most one club. `createClubWithTeam` now
  detects an existing OWNER membership and **returns that club** instead of minting a
  duplicate — a double-tapped "finish setup" becomes a no-op success that routes straight
  into the app, rather than an error.

## Known gaps (not blocking)

- **Two signed-out landing screens.** Cold launch → bare `sign-in`; sign-out → marketing
  `welcome`. Intentional but inconsistent; a new cold-start user skips the hero.
- **Under-16 handoff code is cosmetic.** `about.tsx` generates + shares a code, but no
  server endpoint / `anstoss.io/parent` page consumes it yet.
- **Parent self-serve is invite-only** by design until guardian↔child linking ships.
