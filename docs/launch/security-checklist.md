# Launch Security Checklist

This maps the common "vibe-coder launch" checklist to Anstoss as of the current
`develop` branch.

## Current Status

- Privacy/GDPR: Privacy policy, legal copy, account export, account deletion,
  and public deletion instructions exist. Store-console privacy labels and
  Google Play Data Safety still need manual completion.
- Tenant isolation: Anstoss does not expose Supabase directly to clients. The
  database is server-only through Prisma, with auth guards, role guards, Prisma
  tenant middleware, and schema drift tests. This is not database-native RLS;
  fail-open read warnings still need route-by-route review before treating a
  flow as RLS-equivalent.
- Auth failure paths: Email OTP request/verify, refresh, expired token, bad
  token, and deleted-user paths have tests.
- Security headers: API uses Helmet and disables Express fingerprinting. Static
  web nginx sets CSP, clickjacking, nosniff, referrer, and permissions headers.
- OWASP basics: CORS is allowlisted in production, Swagger/OpenAPI is disabled
  in production, chat raw SQL uses Prisma tagged parameters, and production
  secrets fail fast when missing.
- Client validation: API controllers/services validate sensitive inputs with
  shared schemas or service-level checks; client validation is not trusted as
  the only boundary.
- Data leaks: Store-facing copy no longer exposes external subscription price
  IDs. Backend `.env` files are untracked; tracked mobile env only contains
  public Expo values.
- Frontend API keys: No backend secrets are shipped in mobile/web bundles.
  `EXPO_PUBLIC_*` values are treated as public.
- Rate limits: Global API guard is enabled. Mutating HTTP methods infer write
  limits by default, even if a route forgets `@RateLimit('write')`. The scraper
  sidecar also has an authenticated fixed-window limiter.
- Public forms: OTP endpoints are rate-limited and enumeration-safe. CAPTCHA is
  not implemented; add Cloudflare Turnstile or equivalent if OTP abuse appears
  in production telemetry.
- Error leakage: Unknown server errors return a generic message with requestId.
  Operational app errors return curated user-safe messages.

## Residual Launch Checks

- Verify runtime headers on deployed web/API with `curl -I`.
- Verify Railway/host environment variables are set and no placeholder secrets
  are accepted.
- Verify scraper sidecar has `API_KEY=$(openssl rand -hex 32)`, production
  `RATE_LIMIT_*` values, and no public OpenAPI docs in production.
- Review Prisma tenant fail-open read warnings in logs after staging traffic.
  Those reads rely on service-level authorization and should be promoted to
  fail-closed route by route where feasible.
- Triage `npm audit --omit=dev` before launch. Current remediation requires
  planned major upgrades across Nest/Express and Expo/React Native dependency
  trees, not a blind `npm audit fix --force`.
- Run App Store privacy labels and Google Play Data Safety review against the
  current privacy manifest and policy copy before submission.
