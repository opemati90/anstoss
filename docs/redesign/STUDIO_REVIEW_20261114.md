# Matchday Studio — selective integration review

Reviewed incoming commit: `5510d949` on `origin/redesign/anstoss-2026-11`.
Integration baseline: `f23b532c` on `codex/redesign-integration-20261113`.
Date: 2026-11-14.

Implementation checkpoint: selected schemas/pure graphic rules and a rewritten,
scope-safe match hook are now on the integration worktree, with 70 focused tests
passing. A tested honest export handoff primitive is also present. Studio screens
are not yet ported/wired; backend routes, brand-kit persistence and browser/simulator
acceptance remain pending. The findings below describe the reviewed upstream
snapshot, not a claim that every item is already resolved.

## Decision

Keep the incoming visual direction and reusable graphic-building work. Do not
blanket-merge or describe Studio as production-complete. Its own
`BACKEND_GAPS.md` documents missing server implementations. This review does not
reject the design because of cosmetic board differences.

The incoming snapshot was inspected in a separate detached worktree. It has not
replaced the integration branch's calendar, localization, attendance, reminder,
chat or native-module fixes. No production configuration or database changed.

## Findings requiring correction before enabling Studio

### 1. Export can report success without exporting (high)

Incoming `apps/mobile/app/studio/editor.tsx:308` catches capture and archive
failures independently. When neither native sharing nor browser sharing is
available, it still sets `shared`. Browser-share cancellation is swallowed too.
An archive response alone selects `posted`, without a confirmed publication
result. Opening the native share sheet also cannot establish that a social post
was published.

Separate capture, archive, share-sheet and publication outcomes. Offer retry or
an explicitly labelled caption-only fallback. Do not show a successful image
export when capture failed, or a published state for an archive/share-sheet
operation. Test unavailable sharing, capture failure, archive failure,
cancellation and partial destination failure.

### 2. Match and consent state is not scoped to the current selection (high)

Incoming `apps/mobile/src/hooks/useStudio.ts:407` retains event/live/consent state
when club, team or event changes, including when the club becomes null. Async
responses have no cancellation or request-generation guard. The memoized
graphic input can therefore combine the new club identity with the previous
match and consent data. This is a code-path finding, not a claimed production
incident.

Reset or reject mismatched snapshots immediately; guard every async response
and mutation by user, club, team and event scope. Prevent export until the
current snapshot is ready. The fallback match lookup must also respect the
active team. Test selection changes, out-of-order responses, logout and access
revocation. Scope/clear the module-level brand-kit and credit caches on session
changes as well.

### 3. Persistence failures are hidden (medium)

Incoming `useStudio.ts:146` keeps optimistic brand-kit changes and resolves
normally after any failed PUT, including authorization errors and absent routes.
The editor's result-update confirmation (`editor.tsx:283`) proceeds to sharing
even when the requested match update returns false. On web, that confirmation
is skipped altogether.

Expose unsaved/local-only state and a retry path. Distinguish editing a graphic
from updating a match. Keep a failed server update visible instead of silently
advancing as though the requested write succeeded.

### 4. Shared schemas and mocks are not server implementations (high)

The incoming backend additions provide the plan flag and MEDIA_MANAGER role,
not the Studio routes. Context/consents, brand-kit persistence, credits/ledger,
AI actions, archive/rendering and social posting still require implementations.
The UI tests inspected mock those APIs and capture/sharing.

Every server operation needs club/team authorization and runtime validation.
Rendering/publication must obtain current facts and consent from trusted server
records, not accept the client's arbitrary graphic data as authority. Keep paid
AI, credit purchases and connected-social promises unavailable until their
actual implementation and platform requirements are verified. Do not enable
new paid providers as part of this review.

### 5. Role expansion is not an approved requirement

The handoff lists Vorstand, Teammanager, Kapitän and Medienwart. Incoming
`src/studio/access.ts` additionally admits head and assistant coaches. Entry
points on coach screens do not establish authorization. Preserve the brief's
role boundary by default, and implement matching server enforcement; any
expansion is an explicit product decision, not a side effect of navigation.

## Useful incoming work to retain

- Five-screen Studio layout and the existing design-system treatment.
- Shared template/format definitions and pure match-to-graphic rules, after
  comparing them against existing contracts rather than duplicating them.
- Fail-closed name/photo handling in `buildGraphicData.ts`: missing consent
  suppresses identifying player content. Retain this client defense alongside
  server checks and scope-safe data loading.
- Coach-recorded match data as an explicit source; no inference that scheduled
  kickoff time provides a live feed.

Clip overlays, a full archive UI and visual differences caused by demo club
names/colours can be phased separately. They do not justify delaying the core
player/coach/admin MVP, provided unavailable capabilities are not sold or
presented as working.

## Ordered follow-through

1. Preserve the completed player calendar fix and its German simulator evidence.
2. Port only the new Studio contracts/components after resolving the findings
   above; retain verified integration-branch behavior in overlapping files.
3. Implement and test permission-scoped context/consent and brand-kit persistence
   before enabling dependent UI. Add honest export outcomes and isolation tests.
4. Finish core connected player/coach/admin checks. Stage optional paid Studio
   services independently, without new spending or unsupported promises.
5. Recheck relevant screens against the boards and rerun the integrated suite
   before proposing a merge to develop.

## Evidence boundaries

- Incoming author's report: 938 mobile, 1,362 API and 157 shared tests. These
  totals have not been independently rerun for `5510d949` in this review.
- GitHub queries returned no runs for the redesign branch and no open PR from
  that branch at review time. This does not validate the reported local totals.
- Integration branch independently passed 129 mobile suites: 918 tests passed,
  one pre-existing skip. Mobile typecheck and scoped lint passed.
- German dark-mode player calendar simulator flow passed selection, horizontal
  scrolling, event detail, empty-day and clear-to-agenda checks. It used mock
  data and is not evidence of cross-account production synchronization.
- The supplied design comparison page has a title but no URL. Its full set of
  40 captures has not been independently inspected; the attached boards and
  repository source were reviewed. No blanket visual sign-off is given.
