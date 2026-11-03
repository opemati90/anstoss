# Availability policy implementation — 2026-10-28

Backend slice of the matchday plan, not a completed mobile/release feature.

Implemented locally:

- Additive event fields: nullable RSVP deadline and manual availability lock.
- Strict shared request schema and read/update policy endpoints.
- Existing team read and event-management authorization, with authority rows
  held through commit and permissions rechecked after acquiring locks.
- Parameterized tenant-qualified event-row lock shared by policy and RSVP writes.
- Exact deadline boundary, manual lock, cancellation and archive enforcement.
- Guardian actor propagation and tenant-qualified guardian-link locking.
- Atomic nomination removal and RSVP persistence for a NO response.
- Reminder scheduling failures cannot turn a saved response into request failure.

The independent audit found and drove corrections for authority rechecks,
archived events and cross-club guardian-link substitution. Four event suites /
141 tests pass, including 18 new availability tests. Source-aware API no-emit
type checking is used so the shared package need not be built.

Final full API verification: 140 suites / 1,593 tests passed. Shared and
source-aware API no-emit checks and targeted lint passed. Independent review
returned a scoped PASS and independently ran the 18 availability tests.

## Follow-up integration and relational checks

Mobile event detail now lets managers set a preset deadline or manual lock and
shows a localized deadline/status to members. Shared RSVP controls in Home,
Schedule and parent views close at the deadline without requiring a refresh.
Save failures do not claim that an ambiguous request left server settings
unchanged. All six app languages have copy. The parent feed excludes archived
events and carries deadline/lock metadata.

Race regressions cover stale refresh, field-only RSVP rollback, A-to-B navigation
and A-to-B-to-A revisits during a policy save. Mutation completion is tied to a
per-visit generation. The independent reviewer passed those fixes and the shared
control/parent-feed changes.

Migration `20261028160000` applied only to the isolated Unix-socket PostgreSQL
fixture. `scripts/verify-availability-policy.ts` passed actual event-row and
membership-row lock contention, closed RSVP rollback and tenant/guardian-link
predicate checks with tenant middleware enabled. It exercises relational helpers,
not a full authenticated service/device journey. Fixtures were removed and the
isolated server stopped.

The existing Anstoss SE3 development app loaded local code without a new native
build. Simulator actions confirmed lock/closed, unlock/open and a 24-hour deadline
selection. Light-mode and large-text screenshots and sampled recording frames
were inspected. The OS-dark screenshot remained light due app appearance state;
it is not dark-mode evidence. Recording/frame sampling is not a measured 60fps
claim. The repository Maestro flow preserves the coach interaction check.

Appllama research was unavailable because its subscription was inactive; this
slice reused the existing Anstoss component system instead. Pending acceptance:
arbitrary date/time deadline selection, complete dark/large-text interaction and
Android checks, full authenticated device journeys and event-change refresh.
No production migration, native/EAS build or deployment ran for this slice.

Latest integration verification: full API 140 suites / 1,593 tests passed; full
mobile 125 suites / 884 tests passed, one skipped. Independent reviewers passed
the per-visit race fix (15 event-detail tests) and archived parent-feed query
(42 user-service tests). A shared-control timer regression confirms all three
RSVP choices close at the deadline without a refresh. API Jest now resolves shared
TypeScript source for type checking as well as runtime imports; this avoids a
stale declaration failure without generating a shared-package build.
