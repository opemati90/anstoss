# Invitations, roles, private groups and notifications — 16 November 2026

Review branch: `codex/consolidate-anstoss-20261116` in
`/Users/yemi/anstoss-consolidation-20261116`. This is a local verification and
review-branch handoff, not a production release. No `develop`/`prod` push,
deployment, paid build, purchase, store submission or Renuir change was made.
The separate auth checkout and its index were not modified.

## Minimal implementation

- Reused existing invitation campaigns, approval flow, team roles, custom rooms,
  role picker, and notification transport. No new group model or redesigned flow.
- Player and assistant-coach links/codes can be shared to WhatsApp, with existing
  QR/share controls. Campaign defaults are 14 days and 50 uses; administrators
  can revoke them. Coach links always require approval; no access is granted by
  redemption alone. Head-coach appointments remain personal invitations. Name,
  email/sign-in and DOB/age rules still apply; optional profile fields may be
  completed later. Visible active campaigns match the chosen team and role.
- The role picker now includes ordinary members. Club OWNER/ADMIN capacity is
  capped at three, including the owner, under the club ownership lock across
  direct promotions, staff approvals and ownership changes. Existing team
  PLAYER/COACH access remains independent, supporting combined roles. Existing
  owner-only administrator appointment is preserved. Admins cannot change owner
  or peer-admin roles, or assign/remove secretary/treasurer responsibilities.
- Role changes emit access-refresh events. The app refreshes on those events,
  foreground resume and its existing 30-second foreground fallback. Old account
  reads cannot overwrite newer access; role/team changes clear memory caches.
  Server permissions remain authoritative while a device refreshes.
- A private room is the existing custom group: only explicitly added people can
  access it. Invited admins can add/remove members and close it. Existing
  moderation and child-supervision rules still apply; adding someone does not
  bypass a prior moderation removal/suspension.
- Closing a group hides the group and history from everyone, stops access and
  new writes, refreshes connected inboxes and disconnects subscribed chat
  sockets. Stored records remain; this is not permanent deletion and there is
  no reopen control. The app asks for destructive confirmation. Close is only
  available for custom groups to an invited OWNER/ADMIN.

## Race and notification fixes

Campaign revoke/redeem decisions share a transaction lock and recheck the actor.
Room changes serialize with closure and current club roles; writes recheck
canonical team readability, preserving guardian/trial/acting access rules.
Delete-other and pin actions recheck current authority. Removed members and
stale add events cannot rejoin sockets. Delayed history, media, polls, pin,
search and detail responses cannot repopulate a closed/revoked room.

Push registration uses a compare-and-swap lease (`id`, `updatedAt`) for writes
and logout cleanup. A previous session, delayed provider failure or old Expo
receipt cannot delete a renewed registration. Token rotation preserves the
committed token/lease pair, and received late registration successes are cleaned
up conditionally. Notification inbox and badge responses are scoped to user and
session; pending mutations invalidate stale reads and finish with a canonical
refresh. Consent/compliance taps reach the relevant existing screens.

Added the Anstoss Android Firebase client configuration and Google Services
plugin wiring. These files are public client configuration for `anstoss-b268f`,
package `com.renuirug.anstoss`; they contain no service-account private key.
A fresh combined native build and compatible runtime selection are required.
The existing billing-only runtime marker does not certify this new native
configuration; do not publish an OTA to an older binary to deliver it.

## Verification and adversarial review

All three independent agents reviewed different surfaces and cross-reviewed
fixes. Confirmed findings addressed include stale manager and coach checks,
concurrent member removal, legacy member-list access after closure, pin/write
races, account-switch inbox responses, and stale push receipt cleanup. The final
reviews reported no further concrete blocker in the changed paths.

- Full API: 175 suites, 1,812 tests passed, none skipped, using dedicated local
  PostgreSQL databases at port 55484 for every opt-in database suite.
- Full mobile and shared results, lint/typecheck/build and coverage are recorded
  in the [consolidation record](2026-11-16-consolidation.json).
- Real PostgreSQL coverage includes concurrent last-admin-slot promotions,
  role/coach changes, coach campaign redemption and approval, revocation,
  room membership races, close-versus-write ordering, denied closed inbox/member
  reads, and push registration leases.
- Compiled API HTTP smoke passed signed session registration for player, coach,
  free agent and admin, inbox/read ownership, token reassignment and logout.
  Expo transport was captured, with unexpected network destinations rejected.
- Mobile regressions cover combined roles, fresh access events, invitation
  role/team separation, close confirmation/permissions/failure, stale chat and
  detail callbacks, pin reconnect, account changes and notification mutations.
- Local isolated Chromium preview at 390×844 checked the role picker, coach
  sharing controls and private-room copy without page errors. This used E2E
  fixture data, not production. Close interaction is covered by component and
  server tests, not a native walkthrough.

Local logs and preview images are in
`/Users/yemi/anstoss-backups/consolidation-20261116/` (not committed).
The first full mobile run exposed an outdated ClubHeader auth fixture without a
user/session; it was corrected and the full mobile suite rerun. API line coverage
is 73.58%, below the repository's 80% target; passing configured gates does not
mean the coverage target or release criteria are met.

## Explicit remaining limits

Physical APNs/FCM delivery, foreground/background/terminated-device behavior,
permission denial/recovery, native token rotation and the combined auth/billing
build still need device verification. Billing stays disabled pending actual
sandbox store tests. No claim of perfect push delivery is made.

A server-committed registration whose entire response is lost after logout
cannot be conditionally retracted by a client that never received its lease.
Solving that fully requires durable session/device intent on the server. Legacy
clients without leases cannot remove or reassign a current registration; update
the client for the new safe protocol. Notifications already handed to the OS or
provider cannot be recalled when a group closes. Closure and role/room locks do
not universally serialize unrelated team-access, guardian or acting-grant
lifecycles. Existing clubs above three admins are not automatically demoted;
additional capacity-increasing actions are blocked.

## Combination handoff

Merge the tested review branch with the separately tested auth commit, preserving
older billing, website, admin and plan-sync history. Review these overlaps:

- `UsersService`: capacity and operational-role boundaries/events only.
- `TeamsService`: assignment serialization/events and optional transaction-client
  reads in canonical team access helpers.
- `AuthContext`: access refresh, stale-response sequence and memory-cache reset.
- `ChatGateway`: current add-event authorization, closure fanout and locked
  text writes; retain the other session's Apple session guards.
- `ChannelsService`, `ChatService`, `MessagesService`: closure/read/write guards.
- Prisma: additive `Channel.archivedAt` and migration
  `20261116201500_close_private_channels`; preserve separate OAuth migrations.
- Shared push request schemas/types and mobile/API lease handling must move
  together. API should precede the updated native client at eventual promotion.
- `app.json`, Android Gradle and both `google-services.json` files: preserve this
  Anstoss-only wiring alongside the other session's native sign-in configuration.

Do not promote this review branch directly. Run combined tests and a fresh native
walkthrough before any requested promotion; do not include unfinished auth work.
