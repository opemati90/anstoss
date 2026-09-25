# Deletion and retention evidence ledger

Date: 24 September 2026. Status: **partial code-level evidence; production claim not proven**. Do not use this document as a certificate of legal compliance. No real account was deleted and no production log was purged to make this record.

## Public promise versus implementation

The current `apps/web/src/legal.html` says **all personal account data is irrevocably deleted within 30 days** and **logs are automatically deleted after 90 days** (German and English). These are stronger than what current source and provider evidence establish. The account deletion service (`apps/api/src/users/users.service.ts`, `deleteAccount`) immediately removes access and some rows, anonymizes the user row, message text and audit actors, and attempts R2 object deletion after the database transaction. It deliberately retains some pseudonymized/ledger/audit records. It cannot by itself prove removal from backups, Sentry, infrastructure logs, Expo, transactional email, or all supplier systems. **The R2 cleanup currently catches/logs an object-deletion error and still returns account-deletion success.** This needs a durable retry/reconciliation path and test evidence.

| Data / promise | Code or test evidence | Production proof still required |
| --- | --- | --- |
| Account access and direct profile deletion/anonymization | `UsersService.deleteAccount`; targeted Jest tests passed 24 Sep 2026 | Disposable-account end-to-end export → delete → old-token denial → DB/object inspection, plus failed-R2 retry. Backups/processor deletion periods. |
| Chat messages and attachments | `ChatRetentionWorker` and tests; worker runs only with `CHAT_RETENTION_SWEEP_ENABLED=true`; club retention must be enabled | Production flag/settings, scheduler/instance uptime, 2 old synthetic messages (reported and unreported), object-store absence, failed-job alert. |
| Governance evidence and unaccepted invites | `GovernanceRetentionWorker` hourly and tests | Production execution timestamp, row counts, exception/hold review. |
| Raw bank import | Import parses bytes in memory and sets `rawPurgedAt` immediately; retention worker only clears a non-null `rawObjectKey` metadata field | Verify request-body logging/APM, proxy limits and backups. Do not claim an object-store purge when no raw object was written. |
| 90-day application/infrastructure logs | **No global 90-day deletion worker or provider setting is in this repository.** Sentry is enabled by DSN and sets user ID; beforeSend only strips auth/cookie request headers | Sentry project retention screenshot/API result; Railway/Cloudflare/Upstash/Resend/Expo/DB audit-log retention settings and contracts; sample oldest event query and deletion proof. |
| Child consent withdrawal/deletion | Age gate and consent implementation in progress | Guardian withdrawal E2E: immediately denies child REST/socket access in every affected club, cancels notifications, prevents stale session, preserves only justified records. |
| Compliance records (medical/vaccination/background checks) | Launch API and mobile kill switches added. Account deletion now removes member-linked `ComplianceRecord` rows and collects their document keys for post-transaction object deletion; targeted service tests cover these calls | Prove document deletion in staging and production canary, including failed-object-delete recovery. Audit any records created before the kill switch; do not enable the module without Article 9/10 review. |
| Carpool rides/seats and pickup notes | Account deletion now removes driver offers and passenger seats within the club transaction; targeted service tests cover these calls | Run a synthetic end-to-end carpool erasure test and inspect any duplicated location text, notifications and logs. |

## Reproducible test evidence

Command from repository root:

```sh
npm test --workspace @anstoss/api -- --runInBand src/users/users.service.spec.ts src/chat/chat-retention.worker.spec.ts src/club-activation/governance-retention.worker.spec.ts src/contributions/contribution-imports.service.spec.ts src/auth/age-gate.guard.spec.ts
```

Result on 24 Sep 2026: **5 suites, 57 tests passed**. These are unit/service tests with mocks, not a production configuration or complete GDPR erasure demonstration. Preserve the CI log/commit SHA with the release evidence pack; rerun on the final release commit.

## Required production proof protocol (non-destructive to real users)

1. Create a synthetic, adult, disposable test club and member with unique marker; ensure no real member or financial data is used.
2. Exercise profile, media, chat, RSVP and push token; export account data. Capture a pre-deletion inventory of test-only IDs/objects.
3. Delete the test account through the actual app path; verify access denial with the previously issued token, absence/anonymization in all tenant records, and object deletion. Re-run deletion/idempotency and simulate object-store failure in staging to prove retry/reconciliation.
4. For retention, create synthetic records older than each configured cutoff in staging; run the actual workers, verify expected removal and hold exceptions, object-store absence, metrics and alerts. Do not backdate or delete production user records.
5. Export timestamped **provider settings** for log/event retention and transfer locations, plus oldest/newest event queries. Check Sentry user-ID erasure procedure and backups. Record who reviewed each screenshot, date, URL/setting and next review date.
6. Compare the resulting evidence with the public 30/90-day wording. If the claim cannot be proved across primary DB, replicas/backups, objects and suppliers, change the German and English policy to the accurate scope/period **after legal review**, deploy it, and update the in-app legal link/version. Do not leave the current unqualified promise live as a substitute for implementation.

Release acceptance requires named owner, dated evidence, and a passing independent audit. Current status: **NO-GO on the 30/90-day proof**.
