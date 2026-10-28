# Chat acknowledgement verification — 2026-10-28

The installed Nest Socket.IO adapter emits an event-envelope response instead
of invoking the supplied acknowledgement callback. Mobile history and send
operations wait for that callback. The gateway now explicitly acknowledges
channel and DM history/send handlers while retaining legacy event responses.

Saved-message acknowledgements no longer wait on post-persistence room, inbox,
translation or push work. Delivery failures are contained and logged without
message content. This is best-effort delivery, not a durable delivery outbox.
Unexpected handler failures produce an opaque acknowledgement. Failed history
responses preserve cached messages and pagination; channel pagination clears its
loading state and reports the existing localized history-error state.

The regression opens real localhost Socket.IO connections through the installed
Nest adapter and discovers the four handlers' real `@Ack()` metadata. It checks
channel and DM history/send callbacks, invalid sends, a history database error
and a saved DM with failed fan-out. Hook regressions check history-error safety.
Independent adversarial review passed after resolving all raised findings:
22 gateway tests and 15 hook tests passed independently.

Full API run: 139 suites / 1,575 tests passed. Full mobile run: 123 suites /
864 tests passed, one skipped. API/mobile typechecks and targeted ESLint passed.

Live production evidence (before this patch, synthetic accounts only):

- Five reviewer accounts authenticated and received array-shaped responses for
  events, channels, inbox, conversations, club members and chat contacts.
- A demo admin created a training event; a shared-team demo player reopened it
  and saved YES; the admin subsequently read that saved RSVP.
- The roster snapshot had the expected team, squad, operations and kit shapes.
- REST DM send/read-back succeeded for sender and recipient after reopening.
- Test messages were soft-deleted and test events cancelled. Normal synthetic
  conversation, cancellation and audit history remains. No physical-erasure
  claim is made.

The live realtime canary stopped at an event-envelope join acknowledgement
timeout, so it does not establish production realtime delivery. This patch is
local and needs coordinated deployment plus a repeat production socket check.
No Expo build or production deployment was performed for these checks.
