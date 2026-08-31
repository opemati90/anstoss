# Anstoss Release Readiness — 2026-08-31 (working state)

## Decision

**Code and local validation are green.**
This branch is ready for submission activities once the external store and deployment gates are executed.

## Verified in-repo checks

- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
  - API: 51 suites / 514 tests.
  - Mobile: 126 suites / 610 passed + 1 skipped.
  - Shared: 7 suites / 117 tests.
  - Admin: static smoke test passed.
- `npm run build` passed.
- `npm run audit:store` passed.

## Current deployment/packaging blockers (external or operational)

1. App Store Connect/TestFlight access and release-step confirmation must be performed with the current Apple credentials.
2. Google Play internal testing needs a release artifact generated from a fresh Android `production` build and uploaded to the configured Play track.
3. Play/App Links must reflect the final Play signing certificate in `/.well-known/assetlinks.json` for the final submission certificate.
4. Admin production URL access must be validated from browser with a real platform-admin session after the DNS + hosting path is active in your environment.

## What is already implemented

- Play submission uses manual upload flow (no service-account requirement).
- Admin console is light, motion-free, and scoped to needed sections.
- OTP operator sign-in UI is in place; fallback `ADMIN_API_KEY` is supported.
- Android preview and production artifact workflow is documented in `docs/launch/store-submission.md` and `docs/launch/beta-testing-distribution-2026-08-31.md`.

## Next status update

After you confirm Apple/Google submission checks and production admin access from the console, mark the above blockers as closed and we can call this release fully submission-ready.
