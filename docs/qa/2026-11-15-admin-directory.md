# Admin directory — local verification, 15 November 2026

## Scope

User approved separate Clubs, Teams, Players and All accounts. Implemented server-side search, account-state or membership filters, role filtering on All accounts, searchable club/team selectors, and 25/50/100-row pagination. Club links narrow Teams or Players; team links narrow Players. Filters survive reload and drill-down/back navigation. Platform-admin provisioning remains available in a separate disclosure below All accounts.

Existing Anstoss brand preserved under the Impeccable design workflow. Root DESIGN.md is unchanged. Dates in the new directories use dd.mm.yyyy.

## Verified

- Shared query validation: 15 passing tests (bounded page sizes/offsets, valid roles/states, search length and malformed parameters).
- Existing API admin-service/guard regression suites: 13 passing tests.
- Real HTTP + local PostgreSQL smoke: authorization rejects anonymous and normal users; invalid filters return 400; pagination has no duplicated rows across pages; club/team scopes combine; account roles, free-agent coach/player distinction, deleted users and revoked team access are handled. Team membership counts distinct people, not duplicate role grants, excluding deleted accounts.
- Synthetic dataset: 39 accounts, three clubs, three teams. Scoped creation and cleanup only in the loopback `_test` database; no production records changed.
- Browser against that real API: previous/next, search, empty results, reset, linked club/team lookup, reload persistence, team-to-player drill-down, browser Back, failed-request state and successful retry.
- Desktop (1440 px) and mobile (390 px) captures inspected. Fixed narrow-screen pagination wrapping; table scroll hint and keyboard-focusable scroll region retained. Browser capture files: `.impeccable/review/admin-directory/desktop.png` and `mobile.png` (local, not distribution assets).
- Admin static smoke, JavaScript syntax checks, API lint/typecheck/build, admin build and diff whitespace checks passed.

The browser automation initially used a decorative-arrow-sensitive locator and then selected the empty team by position; both test selectors were corrected to target the named populated team. These were test-selection failures, not hidden application passes.

## Repeat the real-API check

Build shared and API workspaces first. Use a clean environment and an existing local migrated test database:

```sh
env -i PATH="$PATH" DIRECTORY_TEST_DATABASE_URL=postgresql://yemi@127.0.0.1:5432/anstoss_mvp_sim_test node apps/api/scripts/admin-directory-http-smoke.cjs
```

Set `DIRECTORY_QA_SERVE=1` only to retain the synthetic fixtures and loopback API on port 3178 for browser inspection. SIGTERM/SIGINT cleans up the fixtures. The script refuses non-loopback/non-test database URLs and external provider configuration.

## Release boundary

This directory change is local and has not been deployed. No new iOS/Android distribution build was started for this change. The earlier push-notification OTA and API deployment are separate. Firebase resource generation passed locally; real-device notification delivery and the outstanding Android/full-role smoke gate must not be inferred from this admin result.

Design detector ran once in degraded regex mode because its parser dependencies were unavailable. Its warnings concern the inherited Inter font, which is intentional brand guidance; it did not certify computed contrast.

Independent finish review: **ship**. Screenshot approval covers the Teams view and shared directory controls at the supplied desktop/mobile widths. Clubs, Players and All accounts received source review, not separate screenshot approval. No material findings were reported within that scope.
