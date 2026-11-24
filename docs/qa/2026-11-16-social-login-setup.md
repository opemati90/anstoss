# Social sign-in setup — 16 November 2026

## Approved scope

- iOS: Google, Apple and existing email-code sign-in.
- Android: Google and existing email-code sign-in; no unfinished Apple button.
- No EAS/store builds, OTA updates, uploads or submissions until verification.
- Anstoss only. Do not alter Renuir app IDs, keys, products or shared-account settings.
- Railway remains the backend host. No paid Google Cloud resources or billing upgrades authorized.

## Completed configuration (not an end-to-end login pass)

- Firebase project `anstoss-b268f`: Google provider enabled; Android Play signing
  SHA-1 registered in the preceding setup; Android and iOS client config downloaded.
- Apple Developer: enabled Sign in with Apple on Anstoss
  `com.renuirug.anstoss` (identifier resource `PRZLQ4BL2G`) as its own primary
  App ID, not grouped with Renuir. Saved through Apple's capability confirmation.
- Created a separate key named **Anstoss Sign in with Apple**, key ID
  `N6NX88GASU`, scoped to that Anstoss primary App ID only. No APNs service added.
  Existing Renuir sign-in key and push keys were not changed.
- Downloaded the one-time private key and moved it outside this repository to
  `/Users/yemi/.config/anstoss/secrets/AuthKey_N6NX88GASU.p8` with mode 0600;
  enclosing secrets directory mode 0700. Never include its contents in logs,
  screenshots, patches, chat, or mobile builds. User should retain a secure backup.
- Added packages `jose` (API), `expo-apple-authentication` (Expo SDK 57), and
  `@react-native-google-signin/google-signin` (mobile). Local iOS pods installed,
  including Google SDK privacy manifests. No production deployment.
- npm reported dependency vulnerabilities; investigate before release. No
  blanket audit-fix/major dependency rewrite was performed.

## Implementation and checks in this continuation

- Implemented signed provider-token verification with fixed Anstoss audiences,
  explicit email-OTP proof before attaching to an existing account, server-issued
  one-use Apple nonces, encrypted Apple refresh tokens and deletion revocation.
- New users retain the normal DOB/adult-confirmation onboarding gate; provider
  claims never grant platform or club roles. Deleted/managed accounts are rejected.
- Implemented native SDK adapters, availability gating, native Apple button,
  existing-account link flow and localized notices. Only validated Anstoss
  session responses are saved in SecureStore, never raw provider credentials.
- Cleanup continues when login is disabled. Expired unlinked Apple grants are
  revoked before deletion; failures remain retryable. Do not revoke a grant if
  another linking attempt already attached that Apple identity.
- Updated native runtime marker to `57.0.1-billing1-auth1` in Expo, Android and
  iOS configuration to prevent accidental OTA delivery to older native binaries.
  This is configuration only: no OTA was published.
- API targeted checks: **65 passed**, covering provider signatures, account
  ownership, retention, age gate and sensitive-field log redaction.
- Mobile targeted checks: **70 passed**, covering provider availability, Google
  and Apple SDK adapters with mocks, cancellation, state mismatch, session
  validation and existing onboarding-screen/path regressions.
- Real PostgreSQL integration: **3 passed** on the isolated local
  `anstoss_mvp_sim_test` database. Simultaneous first logins create one user;
  simultaneous link submissions consume a ticket once; deleted users cannot
  sign in. Provider/OTP network calls are mocked in these database tests.
- The database tests found and fixed a real issue: Prisma cannot deserialize
  the PostgreSQL advisory-lock function's `void` return. Cast that return to
  text in both login/linking and cleanup queries. Mock tests alone missed it.
- Applied the additive social-login SQL migration only to the local simulator
  test database. No existing fixture rows were replaced; per-run test users
  were removed. Railway schema and feature flags remain unchanged.
- API/mobile TypeScript checks and `git diff --check` passed before the final
  SDK-adapter test additions; rerun after all native work before deployment.

## Still required before production enablement

1. Finish local native compilation and interactive iOS/Android provider tests.
   SDK mocks and database tests are not real-provider or device passes.
2. Deploy the migration and configure server secrets securely on Railway only
   after verification. `ANSTOSS_SOCIAL_LOGIN_ENABLED` and
   `ANSTOSS_APPLE_SIGN_IN_ENABLED` remain off by default. Keep the encryption
   key and Apple signing key available for revocation even if login is disabled.
3. Register Anstoss email sources for Hide My Email delivery; verify provider
   revocation/consent-change lifecycle and interrupted Apple exchanges.
4. Regenerate Anstoss provisioning profiles for a future signed build after the
   capability change. Apple warns that capability changes invalidate profiles
   containing that App ID. No new build was started.
5. Google local/debug signing fingerprints, branded support email
   `support@anstoss.io`, and correct OAuth/native configuration.
6. Real provider/device tests including cancellation, repeat login, existing
   account linking, private email and deletion, without weakening production
   verification or adding a test-code bypass.

Apple sign-in credentials above are separate from App Store billing API credentials.
The Google service account named `anstoss-billing`, which the user is preparing,
is also separate from Google end-user sign-in. Creating a key does not establish
Play Console permissions or prove purchase verification works.

## Adversarial review and local build follow-up

- Fixed serialized OAuth/OTP request bodies leaking through telemetry object
  sanitization: auth request data/body/rawBody are now redacted, including strings.
- Still unresolved before enabling sign-in: Apple external grant revocation does not
  invalidate an existing Anstoss session; failed database work after a successful
  Apple exchange needs durable unpersisted-grant cleanup; expired link tickets need
  an explicit restart path instead of a wrong-code loop. Feature flags remain off.
- Android arm64 local debug compile and QA emulator install passed. iOS arm64 local
  debug compile failed at React Native C++ symbol linking. Neither establishes a real
  Google/Apple-provider login test pass. No store/EAS build or upload was performed.
