# Anstoss launch operations runbook

## Release checkpoint — 2026-11-04

At mobile/API revision `89d3967`, the full mobile suite passed 134 suites
(984 tests passed, one skipped), the full API suite passed 171 suites (2,049
tests), and workspace type checking passed. On the iOS development simulator,
the mock FC Treptow onboarding journey submitted a club claim with no team-page
link and reached pending review. The welcome email field, policy links and
Continue button were also visible with the keyboard open. These simulator
journeys use mock data and do not establish production API or device readiness.

A read-only production inventory at approximately 13:49 UTC found two named
demo-email accounts, no club with slug `fc-musterstadt`, and two memberships
outside that slug; those accounts must not be assumed isolated or used for
destructive tests. The same query found zero undeleted users with a recorded
date of birth less than 18 years ago; it does not establish that all users
have a known date of birth. Do not run the broad development seed in production.
Recheck current state before a cutover. No production data was modified.

The same day's read-only inspection found PostgreSQL 18.6, `en_US.utf8`
collation, only `plpgsql` installed, and 73 finished migrations with none
unfinished. Fourteen migration directories differ between bridge revision
`f31b82f` and the candidate. This is not a migration rehearsal or proof that
the migrations are safe for existing data and production locks. An initial
schema-only rehearsal script failed independent safety review and was disabled
before execution. A replacement passed independent review and took a single
read-only PostgreSQL snapshot of schema and `_prisma_migrations` history only;
no member-table rows were exported. Both archives came from the same exported
snapshot and were restored into an isolated PostgreSQL 18.6 instance using a
private Unix socket with TCP disabled. The local Prisma run identified and
applied the exact 14 candidate migrations, verified their checksums, reported
an up-to-date migration status, and passed seven selected catalog assertions.
The local server was stopped and the exact temporary snapshot directory removed.
The snapshot history can contain operational error details; it was not committed.

This rehearsal is **not** a production migration approval. It used an empty
member-data set, did not compare the complete post-migration schema with a
clean baseline, and ran on macOS rather than production's Debian collation
implementation. It cannot prove data-dependent constraints, lock acquisition,
index duration, disk/WAL requirements, concurrent-writer safety, or production
application behavior. Recheck production data, locks and storage under the
cutover freeze and complete those remaining gates before any deployment.

This checkpoint does not authorize enabling private-media cleanup or publishing
store builds: the media cutover, compatible-client delivery, independent
release audit, store artwork review and production/device verification gates
below remain applicable.

## Private chat-media rollout (not yet production-verified)

The pending implementation routes new `chat/.../private-v1-*` and
`dm/.../private-v1-*` objects to the private EU bucket configured by
`R2_QUARANTINE_*`. Normal private chat objects, preserved evidence under
`quarantine/`, and cleanup records under `retired-chat/` have separate prefixes.
The `publicUrl` response field is retained for wire compatibility but contains
a non-resolving `https://private-media.anstoss.invalid/...` reference. Playback
must use the authorized signed-media endpoint, never that reference directly.

Do not deploy this API change alone:

1. Confirm private bucket public access is disabled, EU jurisdiction is correct,
   and the scoped credentials can PUT/GET/HEAD/DELETE and LIST these prefixes.
2. Release compatible clients that forward the supplied `uploadHeaders`
   (`If-None-Match: *`) and renew five-minute signed URLs before expiry.
   Older clients omit this signed header and cannot upload successfully.
3. Presign endpoints require `X-Anstoss-Private-Media: 1`; unsupported clients
   receive HTTP 426 with `UPGRADE_REQUIRED` before any upload URL is minted.
   Distribute compatible clients before deployment. Older channel clients use
   raw fetch and may show a generic upload failure rather than the update screen.
   No public-storage fallback is allowed.
4. Test channel and DM upload/playback with two accounts, then revoke access.
   Include a chat left open past URL expiry and app background/foreground.
5. Exercise two simultaneous moderation workers. Evidence writes are create-only;
   a zero-byte removal marker must never overwrite the preserved evidence.
6. Test conditional PUT replay after removal, restart safety, R2 outages,
   and slow uploads started before signature expiry. Time-based source-barrier
   deletion has been removed locally: signature expiry does not end in-flight
   uploads. Retained zero-byte barriers prevent conditional writes from restoring
   content, but their keys and retirement receipts retain metadata. Complete
   metadata erasure requires a verified upload/finalization lifecycle; do not
   certify full erasure or enable bucket lifecycle rules that delete barriers.
7. Keep `MODERATION_SAFETY_SWEEP_ENABLED` enabled. The worker retries on startup
   and every minute; storage operations abort after thirty seconds. Database
   latency and storage outages mean this is not a guaranteed one-minute SLA.
8. Inventory and migrate legacy public attachments separately. New private
   upload routing does not make existing public objects private retroactively.

Do not give the private bucket a public domain or apply blanket short retention
to it: active chat media and safeguarding evidence have different lifetimes.

### Synthetic storage verification

From `apps/api`, with the existing R2 variables securely injected into the
process environment, run `RUN_PRIVATE_MEDIA_CANARY=1 npx ts-node scripts/verify-private-media.ts`.
This is an explicitly enabled **storage write test**, not a read-only preview.
It accepts only `anstoss-quarantine` in the EU jurisdiction. It uses a new UUID
for a synthetic attachment, its evidence copy and its cleanup marker; it never
enumerates or deletes user objects. The final JSON reports checks and cleanup
status without credentials or signed URLs. A failed check or unverified cleanup
returns a nonzero exit code. Do not treat partial checks as a pass.

The test covers conditional upload, signed reads, evidence preservation,
removal, immediate replay rejection and authenticated absence after cleanup.
Unsigned S3 rejection does **not** prove public-domain/r2.dev settings, and an
immediate absence check does not rule out a delayed in-flight write. It does
not cover API authorization, member revocation or device playback. Those
remain separate rollout gates above. Local mocked tests verify the canary's
guards, successful sequence, evidence/replay failures and cleanup reporting;
they are not proof of live R2 behavior.

Live synthetic verification on 2026-10-27 using the API service's configured
EU bucket credentials: **11/11 checks passed**, process exit 0, and
`cleanupComplete: true`. Verified non-public reference, conditional upload,
stored-object validation, signed read, unsigned S3 request rejection (HTTP
400), overwrite rejection (412), quarantine destination, preserved evidence
bytes, original bytes removed, immediate post-removal replay rejection (412),
and provider validation rejection of the removed object (not an API attachment
request). All three synthetic keys were deleted
and authenticated reads returned 404. No user objects or database rows changed.
This exercises the local pending provider implementation against live storage,
not the deployed API or released mobile clients.

Cloudflare's [consistency documentation](https://developers.cloudflare.com/r2/reference/consistency/)
states that conditional writes are checked atomically at commit, but an
in-flight write can still commit after a negative read. The unsafe ten-minute
tombstone cleanup has therefore been removed locally, including its periodic
bucket scan. The source zero-byte object and retirement receipt remain; this
is content-resurrection hardening, not complete metadata erasure. Keys contain
club/team/conversation identifiers and may contain filenames, and receipts
duplicate the source key. The metadata-retention gate remains open until a
durable upload/finalization lifecycle can prove old writes terminal before
removing these records. The scheduler regression advances 24 hours after a
provider restart and models R2's atomic conditional commit; it is not a live
slow-upload canary. Existing live-canary results above predate this change.

Replacement protocol groundwork (local only): `private-upload-storage.ts`
implements opaque-key multipart initiation, a five-minute single-part upload
capability, server-verified size/ETag completion, and abort. It is deliberately
not registered or called by live routes. A dedicated single-attempt SDK client
prevents hidden retries from creating extra sessions after ambiguous initiation;
transport-level tests cover HTTP 503 and lost responses. This is not a complete
upload lifecycle. Before activation, implement durable intent before initiation,
reconciliation of lost upload IDs, serialized completion/cancellation, account
and membership revocation, orphan-part cleanup, client completion handshake,
and provider-level concurrent-part/abort tests. Completion timeouts remain
unknown outcomes, never proof of absence. Existing v1 barriers must not be
removed merely because the replacement protocol ships.

The next local slice adds `PrivateMediaUpload` and a transaction-only ledger.
An operation token survives restart; neither expiry nor cancellation steals an
in-flight initiation/completion. A successful completion after cancellation is
eligible for removal, never message attachment. Attaching the object inside the
message transaction moves it to `ATTACHED`, so upload expiry cannot delete live
message media. Reservation fields are allowlisted and tenant/owner scope is
checked in addition to Prisma tenant middleware. The ledger is still unwired:
it is not caller authorization, a background reconciler or a deployed protocol.

Local PostgreSQL evidence (27 Oct): migration 75 applied to the isolated
Unix-socket test database only. `verify-private-upload-ledger.ts` verified one
winner among eight concurrent initiation claims, tenant/owner isolation with
the actual middleware, cancellation across ledger restart, transaction rollback
and synthetic fixture cleanup (exit 0). The initial verifier failed its fixture
cleanup due to lazy Prisma execution outside tenant context; corrected to await
inside that context and rerun successfully. Unit/schema tests: 17 passed;
API lint/typecheck passed. These checks use no R2 and do not prove external
request reconciliation. Test database was stopped after verification.

Local recovery now uses bounded, exact-key multipart discovery and positive
object observations to reconcile `INITIATING` and `FINALIZING` ledger states.
It settles only the original operation token; late observations cannot overwrite
newer state, and cancellation flags survive settlement. Empty observations,
truncated listings and conflicting sessions/metadata never prove completion or
deletion. Tests exercise the actual ledger with a mock transaction/store; there
has been no live multipart canary. Abort/removal recovery, finalization identity
proof, route authorization, scheduling and mobile integration remain required.
The [S3 pagination contract](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListMultipartUploads.html)
uses both key and upload-ID markers; the adapter carries both and rejects
repeated/incomplete cursors rather than silently returning an exhaustive result.
Verification of this local checkpoint: full API 134 suites / 1,401 tests passed;
API lint and typecheck passed. Independent recovery audit reran three suites /
54 tests and passed the scoped change. Positive recovery requires unique,
never-reused object keys and single-attempt initiation; preserve both invariants
when connecting authenticated orchestration. This does not approve deployment.

Subsequent abort/removal slice: acknowledged/missing multipart sessions first
settle to `ABORTED`, not `REMOVED`. An empty existing session is still pending.
The [S3 abort contract](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html)
warns that in-flight parts may survive an abort and require further cleanup;
this protocol must not erase its tracking metadata merely on an abort receipt.
The current executor deliberately does **not** reclaim ABORTED capacity based
on `NoSuchUpload`, an empty session or a missing final object: an already-issued
part upload can still complete. It does not repeat an ambiguous abort. ABORTED
stays charged until a provider-backed terminal part-erasure receipt is available;
timeouts and access errors retain the durable operation and quota.
Recovery can confirm `REMOVING` on object absence only because that state follows
terminal finalization of a unique, never-reused key: no direct client final PUT
or repeated server completion may exist. The remove primitive is not wired;
evidence/live-message holds must be enforced before claiming removal. Independent
audit passed this scoped ordering; 67 tests and API lint/typecheck passed.
Migration 76 applied only to the isolated local PostgreSQL fixture. Provider
part cleanup, evidence-hold orchestration and live verification remain gates.

Removal-claim guards are now implemented in the local ledger: the bound message
lock precedes the upload and media-object locks; the binding is rechecked after
locking. Live channel/DM references and unpurged report evidence (by canonical
v2 reference or bound message ID) prevent `REMOVING`; query failures fail closed.
Existing report creation uses the same message lock and rejects deleted rows.
Independent audit reran 76 tests and passed this scoped guard. Integration still
must forbid cross-club sharing/noncanonical v2 references and make every new
attachment path reject `REMOVING` under the upload lock. Channel-reference
queries are club-scoped, not global. No provider delete or live route is enabled
by this guard; end-to-end report/deletion races remain a release test.

Attachment binding now validates the actual channel/DM message before claiming
`ATTACHED`: matching sender, club, destination, canonical object reference,
undeleted status and media message type. It uses message → upload → media locks.
It does not replace membership/safeguarding authorization. Callers must insert
and bind in the same transaction and throw/roll back if binding returns false.
An independent audit reran 80 tests and passed this scope. API lint/typecheck
passed. Expanded isolated PostgreSQL verification (exit 0) exercised real DM
predicates against wrong sender, foreign conversation, wrong reference, deleted
message and text-only cases; successful binding, live-reference hold, report
hold after deletion and removal eligibility after evidence purge also passed.
Synthetic fixture cleanup succeeded. Channel bindings have unit coverage here,
not the same relational fixture or device E2E evidence. No live routes enabled.

Atomic publication component added locally: `PrivateUploadPublisher` owns the
transaction containing authorization callback, state/type/target checks, message
insertion, binding, and DM inbox update. Binding failure throws inside that
transaction. The expanded isolated PostgreSQL verifier forces binding failure
after INSERT and confirms no message persists and the upload stays READY, then
publishes successfully with the real ledger (exit 0; fixture cleanup succeeded).
The fixture's authorization callback returns a synthetic target: it does not
prove membership or safeguarding. Independent publisher/ledger audit: 42 tests
passed; API lint/typecheck passed. Existing ChatService/DmService routes remain
unchanged. Live wiring must supply lifecycle locks, real policy checks, bounded
content/metadata validation, and post-commit-only broadcasting.

Publication input validation is now implemented locally through the shared
`privateMediaPublishSchema`: strict fields (no client-chosen URL/routing), raw
caption length at most 1,000, bounded media metadata, and filenames without C0
or DEL characters. The publisher parses before its transaction, uses the parsed
copy, rejects supplied MIME/size that contradict the ledger, and writes ledger
MIME/size into the message metadata. These values reflect declarations/storage
metadata, not file-content sniffing or malware analysis; dimensions/duration/
waveform remain bounded client claims. Independent audit passed 23 publisher
tests and 19 schema tests. Live route and mobile integration remain outstanding.

Read-only production check, 2026-10-27: API service
`373adb45-3ab1-4076-b2b9-72f1590ba1b3`, environment
`c6651cfe-f78d-4c06-aefd-634f5933cc22`, has the public R2 and separate quarantine
credential variables present; quarantine bucket is `anstoss-quarantine` with
jurisdiction `eu`. Presence does not prove permissions or public-access policy.
`MODERATION_SAFETY_SWEEP_ENABLED` is unset (enabled by default in source).
`CHAT_RETENTION_SWEEP_ENABLED` is also unset: the operational chat-retention
worker requires explicit `true`, so automated retention is not enabled by this
configuration. Inspect affected clubs and dry-run deletion counts before
enabling it; do not treat retention as production-proven.

Use `npm run retention:preview --workspace=@anstoss/api` with a securely supplied,
reachable `DATABASE_URL` to obtain per-club message and attachment candidate
counts. The command uses a repeatable-read, read-only database transaction and
does not bootstrap the app or storage clients. Disabled clubs and unresolved
reports are excluded. Counts are advisory (the purge rechecks under locks), do
not represent distinct storage objects, and do not include the separate cleanup
of translations and poll children on previously deleted messages. Do not paste credentials into
chat or commit them. Review this output before approving retention activation.

Production preview verified at `2026-10-27T13:10:00.173Z`: seven clubs scanned,
zero clubs with retention enabled (`enabledClubs: []`). This proves the current
eligibility scope is empty, not that the production deletion lifecycle works.
No settings or data were changed. API connection host, database, username and
password were compared in memory against the database service before running
the read-only preview; credentials were neither printed nor persisted.

The API's actual database is service `a04d6695-4b78-42c2-947c-0713337a7762`
(`Postgres`), not the separately named `PostgresEU-*` service. Railway reports
its active deployment `85f83e13-6b55-49c6-9bd1-f7e4c3cb4347` as `SUCCESS` in
`europe-west4-drams3a`. API deployment
`48885721-28d2-46a2-bf9e-8b4197af3809` is also `SUCCESS` in that region. Do not
infer a database target or region from a service's display name alone.

Read-only R2 checks on 2026-10-27: the configured EU quarantine credentials
returned HTTP 200 for HeadBucket and ListObjectsV2 on `anstoss-quarantine`.
Listing was complete with zero objects. This verifies read/list access only;
write/delete permission and public-domain/r2.dev settings were not proven by
that read-only check. The later synthetic canary above verifies write/delete
permission; public-domain/r2.dev policy remains unverified.
Complete metadata-only listings of the configured public asset bucket found
zero objects and zero bytes under both `chat/` and `dm/` (one page each, not
truncated). No contents were fetched. Reconcile database attachment references
and recheck at rollout before declaring the legacy migration unnecessary:
this snapshot covers those two prefixes, not all possible external URLs or
future uploads.

Production database reconciliation at `2026-10-27T13:35:05.688Z`, using a
repeatable-read/read-only transaction against the verified API database:
channel attachment references = 0; DM attachment references = 0; channel report
evidence URLs = 0; DM report evidence URLs = 0. Combined with the complete empty
storage-prefix inventory, no legacy chat-media migration is currently required.
Re-run both checks immediately before rollout because existing clients can
still create new uploads in the meantime. This does not certify the new upload,
moderation, or deletion paths in production.

## Fixture/reference failure

1. Check the saved official Fussball.de, DFB.de, or FuPa URL still opens over HTTPS.
2. Public pages are reference-only: never enable roster or fixture import for them.
3. If an explicitly licensed feed is configured, check provider health and the latest `SyncRun`.
4. Keep the existing event when the provider is unavailable. Show the stale state and let staff edit it manually.
5. Never scrape a public page as a fallback.

## Claim, dispute, and owner recovery

1. First club claims are always platform-reviewed.
2. Staff claims remain with the club for seven days, then appear in the platform escalation queue.
3. Confirm the claimant account is active before approval. Nobody may approve their own claim.
4. Open a dispute before owner recovery. This freezes owner transfer, new administrator grants, and high-volume invite campaigns.
5. Record the evidence and resolution in the dispute. Use the ownership-transfer workflow for normal handovers; use platform reassignment only for recovery.

## Invite abuse

1. Review campaigns with unusually high capacity or redemption volume in the platform console.
2. Revoke the campaign, record a specific reason, and inspect its audit trail.
3. Generic QR/link/code campaigns may only create player or parent requests. Never grant staff authority from a generic campaign.
4. If abuse crosses clubs or IPs, lower the campaign limit temporarily and block the source at the edge.

## Subscription failure

1. Stripe webhook signatures must verify; do not manually replay unsigned payloads.
2. A `past_due` subscription receives one seven-day grace window. Repeated events do not restart it.
3. Subscription deletion is authoritative over older delayed updates.
4. Do not manually revoke paid or migrated grants. Fix the Stripe subscription or migration source.
5. Complimentary access must include a reason and expiry and remains independently auditable.

## Contribution import mismatch

1. Do not edit the raw statement. Upload a corrected CSV/CAMT file as a new batch.
2. Duplicate files are rejected by hash. Raw import objects expire within 24 hours; normalized transactions and confirmed matches remain.
3. Confirm every suggested allocation manually. Validate currency, member, period, partial payments, and split allocations.
4. A manual adjustment cannot reduce the total below confirmed bank matches. Reverse the incorrect match first.
5. Failed reminders may be retried. A reminder is marked sent only when email or push succeeds; minors are routed to linked guardians.

## OTP abuse or delivery failure

1. Check Resend suppression/bounce status and the verified sending domain.
2. Claims are limited per user and IP; OTP and invite-code attempts remain rate-limited at the API/edge.
3. Do not disclose whether an arbitrary email exists.
4. Revoke leaked credentials and rotate the affected provider key. Never paste secrets into support notes.

## Local channel-media binding verification — 2026-10-27

The media-send transaction now rereads the channel through its transaction
client and requires both the expected club and the expected team (or a club-wide
channel in that club). Regression cases cover deleted channels, changed teams,
and cross-club bindings before message insertion. The targeted media/inbox run
passed 31 tests across two suites; API typecheck and targeted ESLint passed.
An independent adversarial review passed this diff and independently ran the
10-test media service suite.

This is not proof of complete concurrent channel authorization: channel writers
do not yet share a lock with this reread, and the team/channel permission services
still use their existing clients. The v2 upload route/client rollout remains
unfinished. These local changes were not pushed, deployed, or built with Expo.

### Media notification failure isolation — 2026-10-27

After media persistence and response serialization, push preparation now runs
in a detached async helper with a caught, non-identifying warning. Sender lookup,
reply-author lookup, recipient lookup and push rejection cannot reject the media
send response through this helper. Existing reader/mute filtering, sender
exclusion and localized push payloads remain intact. Positive tests cover both
team channels and same-club club-wide channels.

The independent adversarial pass approved the production diff. The full API
run passed 135 suites / 1,467 tests before three additional notification-failure
regressions were added. The expanded 17-test media suite subsequently passed locally and in
the independent audit, including all four notification failure boundaries.
Notification delivery remains best-effort: process termination may still lose
pending notifications.

### Media response preparation and realtime isolation — 2026-10-27

The subsequent change prepares the media response using the transaction client
before commit. Response-read or serialization errors now reject the owned
transaction. After commit, synchronous realtime broadcast failures and both
synchronous/asynchronous inbox scheduling failures are caught independently;
neither suppresses push preparation or rejects the saved response.

The full API suite passed 135 suites / 1,475 tests. API typecheck, targeted ESLint
and an independent adversarial review passed; the auditor independently ran six
chat service/gateway suites (66 tests). Tests verify use of the transaction
client, rejection of the transaction promise, no fan-out on serialization failure,
and successful saved responses despite each delivery failure. They do not prove
real PostgreSQL rollback for this specific service path. Response loss after
commit still needs idempotent retry handling, and durable notification delivery
and concurrent channel mutation protections remain incomplete. No deployment.

## Private-upload publication retries — local verification 2026-10-27

The not-yet-routed v2 publisher now serializes publication attempts for an upload,
locks the existing bound message before the upload, and returns a matching live
message on retry. Every attempt reauthorizes current access. Changed captions,
types, attachment references/metadata, unavailable messages and cancelled uploads
are not accepted as successful retries. Successful replay returns `replayed: true`;
future callers must not repeat broadcasts, inbox mutations or push dispatch.

The isolated local PostgreSQL verifier passed three simultaneous attempts with
one stored message, one non-replay result and identical returned message IDs.
It also rejected changed-caption retries and replays after a recipient block,
using the real DM permission callback. Synthetic rows were cleaned up. The
independent adversarial review passed 76 tests across the publisher/ledger/recovery
suites; API typecheck and targeted ESLint passed.

This is not live mobile retry support yet: routes/client integration and durable
post-commit delivery remain unfinished. A crash between commit and notification
dispatch still requires a durable delivery mechanism. No production changes.

## Release rollback

1. Stop the rollout or disable the affected subsystem kill switch.
2. Keep additive migrations in place; roll application code forward with a corrective build rather than deleting production data.
3. Verify API health, authentication, tenant isolation, chat, claims, invitations, contributions, and entitlement resolution.
4. Run the canary checks and review Sentry before resuming rollout.

## Private-upload coordinator — local verification 2026-10-27

The internal coordinator connects authorization, active-user/target checks,
committed operation claims and storage initiation/completion. Provider I/O runs
only after the claim transaction resolves; exceptions produce an opaque unknown
outcome and leave pending state for reconciliation. Receipt settlement preserves
cancellation and does not require access to remain active after external I/O.

Sixteen coordinator tests and API typecheck passed. The independent review first
caught a test-only implicit-any error; after correction its rerun passed four
suites / 96 tests. The local PostgreSQL verifier passed three concurrent advances
for each operation, one provider call each, and provider-stub reads observing
committed INITIATING/FINALIZING state. Synthetic fixtures were cleaned up and the
isolated server stopped. Storage calls in that verifier were stubs, not live R2.

The coordinator is not an exposed route. Reservation/signing/client integration,
cleanup scheduling, ambiguous initiation handling, live-provider verification,
and durable delivery remain incomplete. No production deployment or Expo build.

## Private upload-part signing — local verification 2026-10-27

The internal coordinator now reauthorizes the user and target, checks the locked
upload is UPLOADING with no pending operation/cancellation, and signs only its
stored multipart session, part number and byte length. Capabilities last at most
300 seconds and are bounded by the reservation deadline. The returned projection
contains only the signed PUT URL, expiration and required Content-Length header;
it grants no final-object write or multipart completion authority.

The first independent audit found deadline drift between separate clock reads.
The corrected implementation anchors TTL, reported expiry and the AWS signing
date to one captured instant and rejects a capability that expires while signing.
Regressions exercise signing delays, elapsed deadlines, unusable upload states,
revoked authorization, secret-error redaction and the actual signed URL date/TTL.

This does not revoke an already issued URL; cancellation prevents finalization,
while private in-flight part cleanup remains a separate lifecycle requirement.
Live R2, HTTP/client integration and native Content-Length behavior are unverified.

Final verification: 136 API suites / 1,517 tests passed with local socket
permission (the sandboxed run had four EPERM HTTP listener failures). API
typecheck and targeted ESLint passed. Independent re-audit passed three suites /
96 tests and confirmed the timing finding resolved. No build or deployment.

## Private upload reservation — local verification 2026-10-27

The internal coordinator accepts a strict shared reservation schema containing
only media type, MIME declaration and expected byte length. Per-kind MIME/size
limits now live in shared constants; existing API consumers reexport those same
values. The current-user/target authorization callback supplies routing, and an
active-account check precedes the transactional reservation. The response contains
only upload ID and expiry, with no provider operation or storage key exposure.

Shared schema tests passed 37 cases; coordinator tests passed 32. Independent
review passed the shared suite and 63 coordinator/publisher tests. API typecheck,
shared lint and targeted API ESLint passed. This validates declarations, not
actual byte content. HTTP authorization, reservation rate/quota enforcement and
mobile integration must be completed before this entry point is exposed.

## Upload reservation admission limits — local verification 2026-10-27

Reservations now take a per-club/per-owner PostgreSQL advisory lock and check
pending count and expected bytes in the same transaction as insertion. Admission
limits are 10 pending records and 250 MiB; usage includes every state except
ATTACHED and REMOVED. Exceeding a limit returns 429 with
`PRIVATE_UPLOAD_PENDING_LIMIT`; a failed usage query rejects creation.

These are operational admission limits, not plan entitlements, global storage
quotas or HTTP rate limits. Cancellation, expiry and ABORTED do not prove storage
erasure and do not automatically free capacity. Retiring formerly ATTACHED media
can increase charged cleanup backlog above the admission cap; this deliberately
blocks further reservations until cleanup catches up. Do not claim an invariant
that all lifecycle transitions preserve a count below ten.

The local PostgreSQL verifier raced twelve reservations and verified precisely
the remaining admission slots succeeded; excess requests returned 429. Synthetic
rows were cleaned up and the isolated server stopped. Boundary/failure unit tests,
API typecheck and targeted lint passed. Full API: 136 suites / 1,526 tests passed.
Cleanup scheduling and user recovery UX remain required before route activation.

## Private upload cleanup executor — local verification 2026-10-27

An internal per-intent executor now expires unstarted reservations, claims abort
or removal for eligible uploads, and reconciles pending operations through
observations rather than blindly retrying storage writes. Uncancelled ATTACHED
records never expire. Removal uses the ledger's message/evidence hold checks and
message-before-upload lock order. ABORTED remains charged; neither absent
session nor absent final object proves that an in-flight part cannot finish.
Do not re-abort or reclaim quota based on those observations.

The local PostgreSQL verifier confirmed a live DM blocks removal, an unpurged
report continues to block it after message deletion, clearing those holds allows
one stub storage deletion after committed REMOVING state, and rerunning terminal
cleanup does not repeat that deletion. Synthetic fixtures were removed and the
isolated server stopped. This is real relational verification with stub storage,
not live R2 erasure evidence.

Full API: 137 suites / 1,538 tests passed. API typecheck, targeted lint and independent
adversarial audit passed; the auditor ran three suites / 61 tests. Scheduling,
bounded retries/alerts, ambiguous initiation resolution, live-provider cleanup
verification, metadata erasure and client integration remain outstanding. No production change.

## Persistent cleanup batch scheduling — local verification 2026-10-27

Added cleanupAvailableAt/cleanupClaimId with an additive migration and tenant/due
index. The per-club runner selects at most 25 cancelled or expired eligible
intents, claims each observed schedule with a random token, and conditionally
reschedules only its own token. A ten-minute scheduling lease permits process
restart recovery; it never overrides provider-operation state. Held/conflict
records wait one hour, unknown outcomes fifteen minutes, and aborted-part cleanup
six hours; normal follow-up waits one minute.

Migration 20261027190000 applied only to the isolated local database. The relational
verifier at that historical checkpoint covered expiry and aborted-session
observations. That behavior was subsequently tightened: ABORTED remains charged
even after an absent-session observation. Do not rely on the old reclamation
result. Fixtures
were cleaned up and the test server stopped.
This does not establish real concurrent worker takeover; CAS predicates have
unit coverage. Database failure may end a batch, leaving its lease for recovery.

Full API: 138 suites / 1,546 tests passed. Typecheck, targeted lint and independent
audit passed; the auditor ran four suites / 69 tests. Runtime timer/DI activation,
tenant enumeration, alerting and live-provider cleanup verification remain unfinished. No deploy.

## Cleanup runtime registration — local verification 2026-10-27

The Assets module now registers a cleanup worker that is inert unless
`PRIVATE_UPLOAD_CLEANUP_ENABLED=true`. Keep it unset/false for the current rollout.
Enabling requires configured separate private-bucket credentials, a valid R2
account ID and the EU endpoint; configuration checks alone do not verify bucket
privacy, token scope or physical data placement.

The worker runs at startup and every minute, discovers at most ten due tenant IDs
directly from upload intents (including deleted clubs), and delegates mutation to
the scoped 25-item batch runner. It refuses global discovery inside tenant request
context. Concurrent cycles in one instance are suppressed; cross-instance claims
use persisted compare-and-swap scheduling tokens. Warnings contain no identities,
URLs, provider errors or credentials. They are not yet an operational alert system.

The initial independent audit found that an active batch could start more jobs
after shutdown. Continuation checks now run before scanning, before each claim
and after claim acquisition. Stop/disable prevents further jobs at these boundaries;
an already-running cleanup job is not forcibly aborted or drained. Its operation
state remains durable for reconciliation. Targeted tests cover default-off, failed
configuration, deleted-club discovery, overlap, disablement, tenant isolation and
stopping during a job/claim. No environment flag was enabled and no deployment ran.

## Upload status/cancellation and legacy boundary — local verification 2026-10-28

The internal coordinator now exposes an explicit three-field status projection
(`id`, `status`, `expiresAt`) after current authorization and a locked target
check. Provider keys, multipart IDs and operation tokens are not returned.
Cancellation rejects message-bound uploads; its acknowledgement is not evidence
of physical erasure. Published bindings do not expire with the upload reservation.
The prior independent status/cancellation audit passed its scoped checks. A fresh
full API run on October 28 passed 139 suites / 1,571 tests before the legacy guard
below was added.

The legacy R2 adapter now refuses the reserved `private-chat/` namespace, including
explicit-bucket operations. It cannot accidentally issue a final PUT or fall back
to public storage for v2 keys. Mixed deletion batches are validated in full before
any storage operation starts. Public URL parsing also rejects that namespace.
Targeted R2 tests passed (21 tests), as did API typecheck and targeted lint.
The independent adversarial review returned a scoped PASS and independently ran
two suites / 23 tests. The post-change full API run passed 139 suites / 1,574 tests.

This is not v2 read-path/client activation or launch approval. Routes, client
integration, lifecycle-aware reads/moderation, durable delivery and live storage
verification remain required. No Expo build, production deployment or flag change
was performed for this verification.

## Private v1 upload reservation rollout

`PRIVATE_V1_UPLOAD_RESERVATIONS` defaults off and controls pending-upload
cleanup, not reservation creation. The bridge always records reservations;
while the flag is off it schedules them at a distant sentinel date that old
workers will not select. Do not enable cleanup while any API replica running
the pre-bridge media writer can accept requests: that writer does not take the
object lock, so cleanup could race a committed message. Apply the reservation
migration and deploy the bridge with the flag off; verify every pre-bridge
replica and in-flight writer has drained. During the mixed-version interval,
globally pause account deletion at the edge for **all** replicas, including
old ones: new erasure can otherwise schedule immediately due cleanup while an
old unlocked writer is still committing a message. Alternatively first deploy
and fully drain a writer-lock-only bridge before deploying reservation/erasure
changes. Resume account deletion and enable the flag only after verifying the
drain, then check the new presign, publish, retry and orphan
cleanup paths end to end. Verify the live API configuration and worker health;
do not rely on the flag default as evidence that cleanup is enabled.

The bridge requires the private-media capability header and conditional PUT.
Old mobile clients that lack them cannot upload through it; existing messages
must remain readable where authorized. Coordinate distribution and minimum
version messaging before cutover; do not describe old-client compatibility as
verified. A legacy pre-cutover presign may need to be uploaded again. The flag
off bridge retains abandoned-upload cleanup obligations but does not process
them, so it is a temporary rollout state, not a completed release configuration.
