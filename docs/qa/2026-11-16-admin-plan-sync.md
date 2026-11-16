# Admin grants and app refresh — 16 November 2026

Changes are isolated to `codex/consolidate-anstoss-20261116` in
`/Users/yemi/anstoss-consolidation-20261116`. No production grants, deployments,
store operations, paid builds or Renuir changes were made. Auth remains separate.

## Behavior

The app's plan hook now fetches canonical server state when a screen receives
focus, when the app resumes, and every 15 seconds while focused and active.
This applies to the Abo screen and More plan summary. It is independent of
Apple/Google billing configuration and notification permissions. Backgrounded,
unfocused and unmounted screens do not poll.

Polling coalesces a pending request. Focus/resume explicitly starts a fresh
read, invalidating a delayed pre-background response. User, session, club and
role changes continue to clear scoped state. Failed reads clear stale plan
access; a later successful check restores the server-confirmed plan.

The live-match screen uses the same refresh lifecycle for the server's
current-user `canRecord` permission. Complimentary upgrades unlock recording;
revocation or expiry hides controls and closes an open player picker. Socket
broadcasts never grant rights. Delayed writes cannot restore revoked rights or
overwrite newer scores/timeline data. A lost network connection leaves readable
history without write controls; a denied read removes that history. Switching
session/club/event/role resets the component and rejects old callbacks.

This is periodic revalidation, not an instant push guarantee. While a screen
stays open, the next check starts within 15 seconds; network/server latency
determines completion. Server-side feature checks and capacity rules remain
authoritative between refreshes.

## Verification

- Real PostgreSQL/controller/service tests grant each current package, read the
  mobile plan contract, revoke it, and verify limits/features return to free.
  They also verify expiry without a webhook/cleanup worker, club isolation,
  audit records and zero store subscriptions/checkouts, with IAP disabled.
  Authentication guards are not bypassed in production; these tests call
  controllers directly and do not claim to exercise the HTTP login boundary.
- Mobile hook/component tests cover visible grants and revocations, focus,
  resume, background/blur/unmount cleanup, stale requests across session/club/
  role changes, read failures, permission-denied history, delayed writes,
  socket rights, and score/timeline races. Focus/AppState events are simulated.
- Independent read-only adversarial review identified the initial live-screen
  gap, stale pre-background responses and a score/timeline race. Each was fixed
  and regression tested. Final recheck reported no remaining concrete blocker.

Exact suite results and tested code commit are recorded in the
[consolidation report](2026-11-16-consolidation.md). A fresh combined native
build and real-device navigation/resume walkthrough remain release checks;
these automated results do not claim a physical-device walkthrough.
