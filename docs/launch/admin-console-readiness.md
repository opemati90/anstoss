# Internal Admin Console Readiness

Status as of the current `develop` branch.

## Launch-Ready Controls

- Authentication: `/admin/*` accepts the app session JWT for users with
  `platformRole=PLATFORM_ADMIN` and `X-Admin-Key` for break-glass/internal
  operations. The static admin console can request/verify email OTP and prefers
  the per-operator session token before falling back to the shared key.
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
  `/healthz` check. The container requires `ADMIN_BASIC_AUTH_USERNAME` and
  `ADMIN_BASIC_AUTH_PASSWORD`, then proxies same-origin `/admin/*` and
  `/auth/*` calls to `API_UPSTREAM` so browser CORS does not block the console.

## Follow-Up Before Scaling Ops

- Create the `apps/admin` Railway service, set the required Basic Auth env vars,
  and attach an internal/custom domain such as `admin.anstoss.app`. Basic Auth
  is enforced in the container; VPN/SSO remains recommended if the hosting plan
  supports it.
- Rotate `ADMIN_API_KEY` on operator changes and use OTP operator sign-in for
  normal work so audit rows identify a human admin.
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
