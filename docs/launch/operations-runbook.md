# Anstoss launch operations runbook

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
