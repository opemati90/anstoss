# Anstoss billing verification — 16 November 2026

## Consolidation qualification

The subsequent `codex/consolidate-anstoss-20261116` review branch excludes
unfinished auth changes at the user's request. Its native runtime is
`57.0.1-billing2`; the earlier build 26/device evidence below used the shared
checkout with runtime `57.0.1-billing1-auth1`. Do not treat that binary as a build
of the isolated review branch or reuse its native-build approval. The final
combined auth/billing candidate needs new native verification before promotion.
Neither `develop` nor `prod` may be advanced by the payment session.

## Scope and release gate

Anstoss only (`com.renuirug.anstoss`). Do not change Renuir, shared account
permissions, subscriptions or credentials. User authorized existing production
configuration, but requires rigorous local testing before activation and has not
authorized app review submission/public release. No paid purchases, EAS builds,
new paid services, Cloud billing upgrades or Pub/Sub resources were created.

Billing is **not yet approved for launch**. Local checks and store authentication
are distinct from a real store sandbox purchase. Device purchase, restore,
renewal, cancellation and refund tests remain required.

## Credential setup

- Apple In-App Purchase key: **Anstoss Billing**, Key ID `D3376YG83Y`, issuer
  `d5689838-3db3-4985-bf21-bf2d74fa79e4`. Apple keys are account-level; backend
  verification pins Anstoss's bundle ID, Apple app ID, group and six product IDs.
- Google project `anstoss-b268f`; service account
  `anstoss-billing@anstoss-b268f.iam.gserviceaccount.com`. Android Publisher API
  enabled. No Cloud IAM roles granted. Play access is Anstoss-only, with app
  information/quality read access (required prerequisite), financial data and
  orders/subscriptions permissions. Zero account-wide permissions.
- Keys and local env are outside git in
  `/Users/yemi/anstoss-backups/billing-credentials/` (directory 0700, secrets 0600).
  Never print or commit those contents. `google-services.json` is separate public
  client configuration; Firebase push and social-login keys are separate.
- Production can load explicit base64 credentials; local testing can use files.
  Both at once, malformed material, foreign Google projects/accounts, invalid
  Apple key types/IDs/roots and ambient credential fallback are rejected.

## Evidence

- **108 API/tenant tests passed** across eight suites, including **11 real
  PostgreSQL tests**. All **90 migrations** applied to a fresh disposable local
  PostgreSQL 18 database. No existing or production database was used.
- **31 mobile tests passed** across five billing suites, including direct hook
  tests. API/mobile type checks, targeted lint and `git diff --check` passed.
- Real key parsing and encryption checks passed; forged Apple signatures and
  wrong-key decryption were rejected. Disabled billing remains disabled.
- Read-only Apple sandbox notification-history authentication succeeded.
  Production returned 401. App Store Connect shows version 1.0 **Prepare for
  Submission**. An Apple commerce engineer documents the first-release
  prerequisite: https://developer.apple.com/forums/thread/806452 . This is
  consistent with the observed result; do not publish merely to remove a 401.
- **15 real localhost HTTP checks passed**, backed by isolated PostgreSQL:
  authentication, wrong OTP, manager access, stable payer binding on retry,
  cross-club denial, schema validation (HTTP 422), forged Apple notification
  rejection, unconfigured Google notification rejection (503), and no paid
  entitlement or store subscription written. This does not prove Google OIDC
  notification delivery; that configuration remains a launch gate.
- The dedicated Android emulator logged in using a local-only review account.
  The local API recorded successful OTP verification, `/me` and the fixture
  club's `/plan/store?store=GOOGLE` requests. This verifies the actual device
  used the isolated API, beyond merely setting a build environment variable.
- Store catalogue and release-build checks are recorded below.

## Android build and store drafts

The locally built, signed Android AAB is version **26 (1.0.2)**, package
`com.renuirug.anstoss`. Its release signature matches the existing Anstoss
upload certificate, Billing permission is present, `debuggable=false`, and
private billing keys are absent. AAB SHA-256:
`1c83de7d28d66b6537794899f55f51ad62daa6f2076da513caa360e5aa09920a`.
Artifact: `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`.
The APK also built and started successfully on the dedicated emulator. No paid
cloud build was used. EAS Android version readback now confirms **26**.

Google accepted the AAB into the saved **unpublished internal-test draft**
`1.0.2 (26) - Billing verification`. No rollout or review submission occurred.

All six Google subscriptions now exist with monthly/yearly base plans, each
**DRAFT**, English (UK/US) and German listings, exactly 31 selected European
regions, and no automatic future-region availability. Read-only API verification
passed for all six, including approved prices throughout the EUR regions:

| Package | Monthly | Yearly | Limits |
| --- | ---: | ---: | --- |
| Team | €12.99 | €129 | 1 team, 30 players |
| Club | €29.99 | €299 | 3 teams, 90 players |
| Club Unlimited | €39.99 | €399 | Teams and players within one club |

Non-EUR prices were generated by the stores and still need storefront review
and cross-store comparison. In particular, Team Monthly was initially converted
using a different tax input from the other Google plans; EUR prices were
explicitly corrected, but non-EUR conversion consistency is still unresolved.

Apple group `22583128` contains the six expected products plus two retired Club
6 drafts, which the backend rejects. Missing prices/availability/localizations
were completed and the old Unlimited Monthly price corrected. All six have
English/German descriptions, 31-region availability and the EUR prices above;
they remain **Prepare for Submission**. Monthly/yearly pairs share a service
level: Unlimited 1, retired Club 6 2, Club 3 3, Team 4. Retired products retain no
price or availability. Multi-seat purchases are disabled. Subscription-group
display-name localization and review assets still need final checking.

## Test accounts and local device scope

- Apple sandbox tester `amajimati@gmail.com` was created after the user confirmed
  the address was unused. Its password is saved only in protected local storage.
- Google `m.ajimati1598@gmail.com` was already a license tester. The existing
  shared tester list was inspected without modification; no Renuir settings
  were changed.
- The user deferred Google Play sign-in and store purchase tests. The dedicated
  `Anstoss_Billing_QA_20261116` emulator uses a local debug APK and separate Metro
  port 8132, API 3015 and disposable PostgreSQL 55483. The harness scrubs unrelated
  credentials, binds the API to loopback, pins the test database and rejects
  non-sandbox receipts before entitlement writes. No email is sent.
- With Play signed out, the plan screen rendered the approved prices without
  purchase buttons and showed purchase-recovery error feedback. This is a
  signed-out failure-path check, not successful store checkout or restoration.
  Tapping Restore produced the native `Store service is not connected` error;
  the UI displayed recovery feedback and re-enabled the button.
- Starting the card-free trial on that device returned HTTP 201 from the local
  API. The screen showed the expiry date and 1-team/30-player limits. Independent
  SQL readback confirmed exactly one ACTIVE 30-day TRIAL grant, zero paid grants
  and zero store subscriptions. Monthly/yearly toggling displayed all six
  approved EUR prices. These prices were app catalogue fallbacks while signed
  out, not prices returned by a successful store product query.

## Adversarial audit and fixes

User explicitly requested an independent adversarial agent audit. It found:

1. Replayed predecessor tokens could revive a replaced Google entitlement.
   Permanent replacement tombstones now retain every verified replacement edge,
   even when C → B → A arrives in reverse order. Foreign club/payer replacement
   attempts roll back. Tests expire C and replay older paid-period tokens; access
   stays FREE. The auditor independently reproduced the fix.
2. Restore depended on saleable products. Connection/restore readiness is now
   independent of catalogue loading; empty, failing and slow catalogue cases
   are tested. Slow catalogue responses preserve newer subscription state.
3. Google acknowledgement is server-owned after durable database commit; native
   acknowledgement is not repeated. Apple transactions finish after successful
   server verification. Direct hook tests cover failure/retry, duplicate events,
   verification ordering and account/club changes.

The independent re-audit reported no further confirmed blocker in these fixes,
and independently passed 22 mobile tests. This is not device/store approval.
The final read-only adversarial audit also found no new confirmed blocker,
independently matched the AAB hash, and checked harness isolation and credential
permissions. Its evidence limitations (Google webhook 503, draft-only catalogue
and no successful store transaction) remain explicit launch gates.

## Existing production configuration

Seven `ANSTOSS_IAP_*` variables were staged on Railway project
`fc1f6c05-d556-48ad-bc8c-a59b4e7a99b4`, environment
`c6651cfe-f78d-4c06-aefd-634f5933cc22`, API service
`373adb45-3ab1-4076-b2b9-72f1590ba1b3`, using stdin and `--skip-deploys`.
`ANSTOSS_IAP_ENABLED=false`. Readback verified exact values internally without
printing them; all unrelated variables remained unchanged. Deployment stayed
`5aee7de3-2546-48ab-89c0-3a2e028c916b`. No deployment or migration was performed.
Staged credentials require the tested code to be released later before use.

## Repeat local checks

The database suite refuses any host other than `127.0.0.1` or database other than
`anstoss_billing_test`. It cleans up only its own random fixture IDs. Store I/O is
simulated; SQL, tenant middleware, membership authorization, encryption,
entitlement resolution and worker behavior are real.

```sh
BILLING_TEST_DATABASE_URL=postgresql://yemi@127.0.0.1:55483/anstoss_billing_test \
  npm test --workspace @anstoss/api -- --runTestsByPath \
  src/billing/store-billing.database.spec.ts

npm test --workspace @anstoss/mobile -- --runTestsByPath \
  src/hooks/useStoreBilling.spec.ts app/__tests__/abo.spec.tsx \
  src/billing/__tests__/native-store.spec.ts

TS_NODE_PROJECT=apps/api/tsconfig.json node \
  --env-file=/Users/yemi/anstoss-backups/billing-credentials/anstoss-billing.local.env \
  apps/api/scripts/verify-store-credentials.cjs
```

Adding `--live` performs read-only store authentication/catalogue checks. It
does not make a purchase or send notifications. Production 401 currently makes
the live probe exit nonzero; do not treat this as a passing launch gate.

## Remaining store/device gates

- Resume the deferred tester sign-in when the user is available. Confirm test
  payment methods before any purchase; a sandbox receipt check cannot prevent
  a real charge that occurs earlier in checkout.
- Review non-EUR converted prices, Apple subscription-group localization and
  review assets. Google plans remain inactive drafts; product availability must
  be prepared for sandbox testing before claiming checkout readiness.
- Test native sandbox/license-tester purchases on a dedicated allowlisted club,
  including interrupted verification, restore, renewal, expiry, cancellation,
  refund/revocation and notification/reconciliation recovery.
- Verify webhook configuration/delivery without affecting Renuir or adding paid
  infrastructure. Do not enable production checkout until these gates pass.
