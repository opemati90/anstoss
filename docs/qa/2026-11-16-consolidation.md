# Anstoss consolidated review candidate — 16 November 2026

## Handoff and promotion boundary

- Review branch: `codex/consolidate-anstoss-20261116`.
- Isolated worktree: `/Users/yemi/anstoss-consolidation-20261116`.
- Verified code commit: `f86a92db674c25ee80294cd61a4eaeaab189d359`.
  The following commit only adds this handoff and its JSON verification record.
- **Do not push `develop` or `prod` yet.** The user explicitly reserved promotion
  for the other Anstoss session after review and combined testing. `develop`
  currently deploys the live API; `prod` can trigger production mobile builds.
- No EAS build, OTA, deployment, production migration, purchase, or store
  submission was performed during consolidation. Renuir was not touched.
- The shared `/Users/yemi/anstoss-redesign-review-20261113` checkout and its index
  were left untouched. Its active auth work must be integrated from that
  session's tested commit, not copied wholesale over this candidate.

## Included and excluded work

Includes billing verification, replay protection, restore handling, telemetry
redaction, six billing/catalogue migrations, approved package prices, admin
directory and chat fixes, QA records, and draft store assets. The existing
reminder/quality-gate commits `dbaa0777` and `abe50365` are ancestors.

Website commits `251dcec1` (localized app previews) and `578876ac` (hover/focus
contrast) were merged without conflicts. Their original history is retained.
Draft store screenshots remain draft assets, not approved submissions.

At the user's request, unfinished social login and Apple session-security work
is excluded: auth/users/onboarding source and policy, OAuth migration/models,
Apple/Google native sign-in SDKs/configuration and entitlements. The membership
and notification follow-up changes only role/operational-role logic in
UsersService and access refresh in AuthContext; it does not add OAuth or merge
the other session's auth work. Anstoss Android Firebase client configuration is
now included for push. Existing age-gate text
was preserved in every app locale. Defensive telemetry redaction includes auth
field names but does not add or enable an auth flow.

The earlier full local snapshot branch `codex/consolidate-snapshot-20261116`
is **not** an ancestor of this candidate and must not be pushed or promoted.
Local `.impeccable` screenshots and private credentials were not included.

## Verification on the isolated candidate

Fresh offline npm installation, required patches and Prisma generation passed.
Node 20.20.2 matched the CI major version. Fresh PostgreSQL databases were created
on `127.0.0.1:55484`; all candidate migrations applied successfully to both
`anstoss_test` and `anstoss_billing_test`. Provider/email/push/store boundaries
in the automated suites are mocked; SQL and socket tests are real and local.

| Check | Result |
| --- | --- |
| API | 175 suites; 1,812 tests passed; no skipped tests |
| Mobile | 158 suites; 1,235 passed; 1 existing skipped test |
| Shared | 12 suites; 202 tests passed |
| Repository lint | Passed; removed one unused reminder-test binding |
| Repository typecheck | Passed |
| Repository build | Passed; does not compile native mobile binaries |
| Web/admin smoke | Passed |
| Diff whitespace | Passed |

API line coverage is 73.58%, below the documented 80% target; the configured
Jest baseline gates pass. Mobile line coverage is 65.22%. Do not describe the API
coverage target as achieved. Local machine reports are saved under
`/Users/yemi/anstoss-backups/consolidation-20261116/`; the JSON alongside this file
contains portable summary results.

Independent read-only adversarial review confirmed auth exclusion, isolated
workspace dependency resolution, matching billing runtime markers, matching
OpenIAP package/pin versions, and no new confirmed source-integration blocker.
Secret-pattern scanning found no private credentials in candidate changes.

The [billing audit follow-up](2026-11-16-billing-audit-followup.md) adds entitlement
enforcement, canonical resubscription/deferred-plan recovery, refund reversal
reconciliation, and checkout payer/store/SKU ownership. The independent final
recheck reported all concrete findings addressed. Unknown checkout recovery
requires operator review; same-payer use of multiple store accounts remains a
real-store validation limit. No automatic timeout transfers billing ownership.

The [admin plan-sync follow-up](2026-11-16-admin-plan-sync.md) refreshes plan and
live-match permissions on focus/resume and every 15 seconds while visible,
independently of IAP. It rejects delayed permission responses and preserves newer
live scores. The adversarial review found no remaining concrete blocker after
fixes. Full local suites pass; the combined native device walkthrough remains
a release check.

The [invitations, roles, private rooms and push follow-up](2026-11-16-members-rooms-push.md)
adds expiring approval-required coach campaigns, the three-admin cap, current
role refresh, explicit private-group closure and push registration leases. Its
three independent reviews were rechecked after fixes. Full suites above include
these changes; compiled local push HTTP smoke also passes. Physical push and
combined-native verification remain outstanding. The report records exact
integration overlaps and known distributed-system limitations.

## Native and store release limits

The billing-only runtime is `57.0.1-billing2` in Expo, Android and iOS. ExpoIap
6.5.0 and OpenIAP 4.2.0 are retained; unfinished native auth SDKs are excluded.
The earlier signed Android build 26 and device tests used the mixed
`57.0.1-billing1-auth1` source. They **do not certify this isolated candidate**.
The eventual combined auth/billing code requires fresh native verification.
This candidate also adds Android Firebase client/plugin wiring; choose a fresh
compatible runtime when combining and building it. Do not ship that native
configuration as an OTA to older binaries.

Billing remains disabled by default and staged production configuration remains
disabled. Real sandbox purchases/restores and lifecycle tests are deferred by
the user. Webhook delivery, non-EUR pricing, Apple group localization/review
assets, final binary/store declarations and auth security/device gates remain
release prerequisites. See [billing evidence](2026-11-16-billing-credentials.md).

## Apple review-risk audit

The audit found no cancelable camera pre-permission alert, no device GPS
permission, and no Apple Pay implementation in current Anstoss source. Native
camera/microphone permission is requested from the user-initiated action;
Settings recovery follows denial. Final-archive linkage is still unverified.

The stale [submission notes](../launch/store-submission.md) were corrected:
StoreKit subscriptions are distinguished from Apple Pay and bank-transfer dues;
login claims must match the eventual combined build; reports go to moderation;
and age-assurance reviewer instructions point to fresh-account DOB onboarding.
Live App Store Connect age-rating selections were not checked or changed.
Guardian profile management alone is not a claim of parental content controls.
