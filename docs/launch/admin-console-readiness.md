# Internal Admin Console Readiness

## MVP update — 7 November 2026

Production console: https://admin.anstoss.io. Primary navigation is now
Applications, Clubs, People, Safety and Operations, with Settings separate.
Analytics, broadcast and SQL tools are no longer accepted console routes.
Existing backend capabilities/data were not deleted. The application queue
defaults to pending decisions; historical applications have a separate filter.

### Approval policy

Personal email providers (Gmail, Yahoo and others) are accepted. A club-owned
email domain is not required. These are deterministic checks, **not an AI
authority classifier**; no paid AI decision provider is configured.

An authenticated platform operator can verify a contact from independent club
confirmation or a reliable public contact source, recording the source and
basis. A known email address or public team URL alone is not authority proof.
“Verify contact” stores an exact email/team/club match for 30 days and runs the
transactional activation path. A worker checks matching pending applications
every minute and removes expired verification records.

Activation rechecks account status, adult eligibility, reviewer authority,
claim expiry, current club activation, and duplicate/competing team claims.
Conflicts remain reviewable. The claim kill switch and migration-maintenance
mode pause background activation. Verification requires a dedicated admin
session, not an ordinary mobile token or the break-glass API key.

URL recognition does not claim that the remote page was fetched or verified.
There is no automatic extraction of trusted contact details from FUSSBALL.DE.
Manual operator decisions remain available and audited.

### Recovery and pilot

The existing platform admin password was reset, previous sessions revoked by
incrementing its stored session version, and password rotation required. The
temporary credential is stored privately outside Git, never in this document.
Both the stored username and linked account email now resolve the same account;
its database password and disabled state take precedence over bootstrap values.

The operator's exact FC Treptow III application was manually approved for an
isolated MVP pilot at their request. This is not independently verified official
club representation. The applicant's Yahoo address was not added to the
verified-contact registry; no existing club members or data were transferred.

### Checks

- API: 179 suites / 2,112 tests passed; lint, typecheck and compilation passed.
- Admin: static smoke checks and syntax checks passed.
- Production-backed login and application queue exercised in a local browser
  preview at desktop and narrow mobile widths.
- Opt-in live test: `apps/api/scripts/verify-admin-activation.cjs`. It checks
  email-alias login, unauthorised/mismatched verification rejection, activation,
  owner/coach access and duplicate protection using isolated fictional records.
  It removes only its own synthetic records, retaining audit evidence.

### Production verification completed

Source deployed: `bd060f22` (including implementation commit `108fcbf7`).

- API deployment `65e353c6-8726-454f-a557-c7d9e3a44096`: SUCCESS.
- Admin deployment `f1065cc1-fde0-41ee-aefb-2534c4789c9d`: SUCCESS.
- API health: `status=ok`, `db=ok`; admin `/healthz`: `ok`.
- Live browser sign-in and desktop/mobile application queue: passed.
- Live synthetic run `admin-qa-684c5685-a955-4a38-aa58-81c9a2a8ec37`:
  email-alias login, unverified assessment, rejection of ordinary app tokens,
  mismatched-email rejection, verified activation, owner/coach access and
  duplicate-team protection all passed. Synthetic records were removed;
  operator audit evidence remains. No real club was used for this test.

The contact endpoint and worker share the tested transactional activation path;
this production test did not measure the background worker's polling interval.
No new Expo build was triggered or needed for this API/admin update.

To rerun the opt-in script, first compile its local JWT prerequisite with
`npx tsc -p apps/api/tsconfig.build.json --incremental false`. Supply the private
credential-file path as the argument after `--production-synthetic-only`.

## Historical baseline (superseded where noted above)

The following notes describe the earlier console, not outstanding provisioning
work. The Railway admin service and browser-level checks now exist.

## Launch-Ready Controls

- Authentication: `/admin/*` accepts the app session JWT for users with
  `platformRole=PLATFORM_ADMIN` and `X-Admin-Key` for break-glass/internal
  operations. The static admin console opens on an in-app username/password
  login page and prefers the scoped admin session before falling back to the
  shared key.
- Overview/health: platform counts, deleted-user count, subscription count, and
  revenue estimate load from the API.
- Clubs/users/subscriptions: searchable read-only platform inventory.
- Audit log: platform feed includes support notes, feature overrides, release
  setting changes, moderation resolutions, and broadcast send attempts when
  broadcasts are explicitly enabled.
- Support: records audited `SUPPORT_NOTE` entries only. No state-changing
  support action is presented until implemented end to end.
- Feature flags: only known entitlement slugs can be granted/revoked, and every
  change is audited.
- Releases/settings: only known runtime settings can be changed; version gates
  require semver and text fields are length-limited.
- Broadcasts: send controls are disabled for launch. Backend also rejects sends
  unless `ENABLE_ADMIN_BROADCASTS=true`.
- Moderation: reports and blocks are visible; resolving a report writes an
  audit event.
- Deployment packaging: `apps/admin` has its own Railway/nginx static service
  descriptors with security headers, noindex headers, no-store caching, and a
  `/healthz` check. The container proxies same-origin `/admin/*` and `/auth/*`
  calls to `API_UPSTREAM` so browser CORS does not block the console. The API
  service must define `ADMIN_CONSOLE_USERNAME` and
  `ADMIN_CONSOLE_PASSWORD_HASH` (`scrypt$<hex-salt>$<hex-hash>`), plus
  optional `ADMIN_CONSOLE_EMAIL` and `ADMIN_CONSOLE_NAME`.

## Follow-Up Before Scaling Ops

- Create the `apps/admin` Railway service, set the API's
  `ADMIN_CONSOLE_USERNAME` and `ADMIN_CONSOLE_PASSWORD_HASH`, and attach an
  internal/custom domain such as `admin.anstoss.app`.
- Rotate `ADMIN_API_KEY` on operator changes and use the scoped admin login for
  normal work so audit rows identify the current operator session.
- Add FUSSBALL.DE admin operations: retry a failed sync run, force-refresh a
  stale link, disable/reactivate a bad link, and show full error payloads.
- Add deeper moderation actions: hide/restore/delete message, warn user, and
  escalate to club suspension with explicit retention policy.
- Add an admin operator model beyond `PLATFORM_ADMIN` if support agents should
  see less than founders.
- Add browser-level admin smoke tests once the admin service has a stable
  internal deployment URL.

## Launch Constraints

- Treat dependency advisories as a separate upgrade slice. `npm audit
--omit=dev` still requires major Nest/Express and Expo/React Native upgrades.
- Keep broadcast sending disabled until push opt-in segmentation, rate limits,
  approval confirmation, and store privacy copy are all in place.
- Continue reviewing Prisma tenant fail-open read warnings after staging
  traffic; the admin console does not replace route-level tenant checks.
