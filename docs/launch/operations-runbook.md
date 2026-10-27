# Anstoss launch operations runbook

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
6. Test conditional PUT replay after removal, restart-safe cleanup, R2 outages,
   and slow uploads started before signature expiry. The ten-minute empty-object
   cleanup horizon has not yet been verified against R2's in-flight request
   lifetime; do not certify absolute replay prevention until this is resolved.
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
in-flight write can still commit after a negative read. Thus the ten-minute
tombstone cleanup horizon remains a release gate: URL expiry alone is not
evidence that every previously started upload has terminated. Do not remove
that gate based on this immediate-replay canary.

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

## Release rollback

1. Stop the rollout or disable the affected subsystem kill switch.
2. Keep additive migrations in place; roll application code forward with a corrective build rather than deleting production data.
3. Verify API health, authentication, tenant isolation, chat, claims, invitations, contributions, and entitlement resolution.
4. Run the canary checks and review Sentry before resuming rollout.
