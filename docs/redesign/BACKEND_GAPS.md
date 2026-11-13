# Anstoss Redesign (2026-11) — backend gaps

The mobile app now follows the 34-screen Anstoss Redesign. Every screen is wired to
existing endpoints; elements whose data the API does not provide yet are hidden or
fall back to the previous behaviour. This list is what the API needs for the design to
be complete, grouped by priority. Suggested shapes are starting points, not contracts.

## Done

| Design | What shipped |
|---|---|
| 09 Mitteilungen | `InboxNotification` table; inbox-worthy pushes (events, Absagen, join requests, dues, trials, consent, moderation, fixture changes, full time) are stored per recipient even when the push is muted or in quiet hours; chat is excluded. `GET /me/notifications` (cursor), `GET /me/notifications/unread-count`, `POST /me/notifications/:id/read`, `POST /me/notifications/read-all`; 90-day retention worker. App: bell dot, `/notifications` screen with inline Annehmen/Ablehnen. |
| 14 Live-Spiel | `MatchLive` + `MatchLiveEvent` on MATCH events (any match, with or without fussball.de). `GET/PATCH /clubs/:c/events/:e/live` (kick-off → half time → second half → full time), `POST …/live/events` (GOAL, CONCEDED, YELLOW, RED, SUB), `DELETE …/live/events/:id` (undo, score recounted). Coaches only for writes; `live:match` socket broadcast in room `live-event:{eventId}`; goal and full-time pushes. App: Tor / Gegentor / Karte / Wechsel with player picker, clock button, long-press undo; event detail's Live button opens it for every match. |
| 29/31 Vorschau und Vertretung | `ActingSession { clubId, actorUserId, teamId, role: COACH, reason?, startedAt, expiresAt, endedAt? }` (tenant-scoped). Vorstand (OWNER/ADMIN) in any team, Teammanager (TEAM_COORDINATOR until per-team TEAM_MANAGER lands) in own team only; 15/30/60 min; starting replaces the actor's running session. While unexpired, `TeamsService.assertEventManagementAccess` / `assertManageAccess` / `assertReadableAccess` grant coach access for that team (membership still required). Audit `acting_session.started/ended` ("Yemi (Vorstand) als Trainer", `actingSessionId`); head coaches get `ACTING_SESSION_STARTED` push + inbox. App: ink card on Mehr, `PreviewCoverSheet`, `ActingAsBanner` on every tab; Vorschau (player/parent) is client-only with all writes blocked in the API client. Open: per-write `actingSessionId` attribution on Event/Message rows (today only the audit log records it). |

## P1 — visible gaps on core screens

| Design | Element | Missing | Suggested shape |
|---|---|---|---|
| 11 Termin anlegen | "Team benachrichtigen" (auto-reminder 24h before) | No flag on Event | `rsvpAutoReminder: boolean` (default true) on create/update + scheduled `remind-rsvp` job |
| 30 Mehrere Rollen | Combined multi-role home | Client only (data exists) | Frontend role resolution; no API change |

## P2 — onboarding and squad

| Design | Element | Missing | Suggested shape |
|---|---|---|---|
| 04 Beitreten | "Ich bin Kofi Osei, Nr. 9" — claim your roster slot while joining | Slots only visible to members | `GET /public/teams/by-code/:joinCode/roster-slots` (unclaimed only: `id, fullName, jerseyNumber`); optional `rosterSlotId` on join request, claimed on approval |
| 05 Rolle | Several roles in one request | Join request carries one role | `roles: ('PLAYER'\|'PARENT'\|'COACH')[]`, board confirms each |
| 06 Verein anlegen | Crest upload, DFB club number, second colour | Not on `submitFirstClubClaimSchema` | `secondaryColor`, `federationClubNumber?`, `badgeUploadId` |
| 07b Kader anlegen | Role chips, captain, invite by e-mail/phone, "Eingeladen" tag | Roster slot has name + number only | `role`, `isCaptain`, `email` on `rosterSlotInputSchema`; send invite when contact given; return invite status |
| 07 Team einladen | Short team code ("SVS-7K2Q") on the invite card | Campaign code used instead | Human-readable code per campaign |
| 17 Spielerprofil | Profile route with season stats, attendance, roles, dues, Spielerpass | None of these per member | `GET /clubs/:c/teams/:t/members/:u` bundling `{ appearances, goals, assists }`, `attendance { items, attended, total }`, `operationalRoles[]`, `contributionStatus`, `playerPass { number, validUntil }`. Needs product sign-off: rows currently open DM / edit sheet |
| 16 Kader | Attendance bars per row | No per-member attendance on roster-ops | `recentAttendance: { attended, total }` on `RosterOpsMemberSummary` |
| 15 Chat | "Gelesen von N" | No read count on channel messages | `readCount` on channel message DTO (receipts exist) |
| 08 Start Trainer | "Treffpunkt ankündigen" as a pinned message | No pinned flag on create | `pinned: boolean` on message create |
| 08 Start Trainer | Lineup row subtitle "Entwurf 4-2-3-1 · 9 von 11" | No draft summary on the feed | `lineupDraft: { formation, filled, slots }` on event feed / roster-ops |
| 25 Start Eltern | Photo-consent row per child | Not in children overview | `photoConsent: 'GRANTED'\|'PENDING'\|null` on `/me/children-overview` |

## P3 — money, league data, polish

| Design | Element | Missing | Suggested shape |
|---|---|---|---|
| 19 Kasse | Month chip | No period selector | `GET /clubs/:id/contributions?period=YYYY-MM` |
| 19 Kasse | "Kontoauszug" / "Bar beim Training" meta | Payment method not stored | `paymentMethod` on `ContributionMemberRecord` |
| 19 Kasse | "Gemeldet" status | Encoded as a magic `note` string | `paymentReported: boolean` on `ContributionMemberRecord` |
| 26 Meine Beiträge | Paid history by month | Only current period per plan | `history: { planId, period, amount, paidAt, method }[]` on `MyContributionSummary` |
| 18 Mehr | Row values: table position, new Wechselbörse candidates, invite code | No cheap summary | `GET /me/summary → { tablePosition, newFreeAgents, teamInviteCode }` |
| 20 Tabelle | Form column for every club | `TableSnapshotRow` has no form | `form: ('W'\|'D'\|'L')[]` (last 5) from the scraper |
| 20 Tabelle, 12 Termin | "Berlin · Staffel 3", "Kreisliga C · 11. Spieltag" | No region/division/matchday | `region`, `division` on `ImportedFixture`/`ExternalTeamLink`; `competition { name, matchday? }` on `EventDetail` |
| 14 Live-Spiel | Opponent crest colour | Not in feed | `homeColor`, `awayColor` on `ImportedFixture` |

## Client-only follow-ups (no API change)

- **Offline banner + queued RSVPs (28):** add `@react-native-community/netinfo` and a persisted RSVP outbox.
- **Languages (02):** the design lists de/en/tr/es/fr/pt/ar; the app ships de/en/fr/it/pt/tr. Spanish and Arabic (with RTL) are product decisions plus server-side e-mail/push templates.
- **Copy buttons (MyDues, Invite):** add `expo-clipboard`.
- **Sign in with Apple/Google (03):** not in scope of the email-OTP auth today.
- **Lineup drag-and-drop from the bench (13):** the tap-a-spot picker is kept.

## Contract for backend

| Endpoint | Request | Response | Schema (packages/shared) | Status |
|---|---|---|---|---|
| `GET /clubs/:clubId/plan` (35 Abo, 19 Mehr row) | — (any club member) | `ClubPlan { clubId, tier: FREE\|PRO\|SCALE, source: NONE\|TRIAL\|PAID\|COMPLIMENTARY\|MIGRATED, trialEndsAt, trialUsed, limits {teams, players}, usage {teams, players}, prices { monthly, yearly: { amountCents, currency } }, features: Record<PlanFeature, boolean>, canManage, salesEmail? }` | `clubPlanSchema` (schemas/plan.ts) | Built: `apps/api/src/billing/plan.controller.ts` |
| `POST /clubs/:clubId/plan/trial` (35 Abo) | `{}`; Vorstand (OWNER/ADMIN/BOARD_MEMBER) or Kassenwart (TREASURER) only, one trial per club | `ClubPlan` (PRO, source TRIAL, `trialEndsAt` = now + 30 days); 403 others, 409 used/already Verein | `startPlanTrialSchema` | Built: TRIAL `EntitlementGrant`, no card, expires to FREE |
| `GET /clubs/:clubId/acting-sessions/candidates` (29 Vertretung row) | — (Vorstand / Teammanager) | `{ items: { teamId, teamName, headCoachName, coachAway }[] }`, away coaches first, teams the caller coaches excluded | `actingCandidateSchema` (schemas/acting.ts) | Built: `apps/api/src/acting/` |
| `POST /clubs/:clubId/acting-sessions` (29/31) | `{ teamId, role: 'COACH', durationMin: 15\|30\|60, reason? }` | `ActingSessionDto { id, clubId, teamId, teamName, role, reason, startedAt, expiresAt, endedAt }`; 403 `ACTING_SESSION_FORBIDDEN`, 404 `ACTING_SESSION_TEAM_NOT_FOUND` | `startActingSessionSchema`, `actingSessionSchema` | Built |
| `DELETE /acting-sessions/:id` (31 Beenden) | — (actor only) | `ActingSessionDto` with `endedAt`; 404 `ACTING_SESSION_NOT_ACTIVE` | `actingSessionSchema` | Built |
| `GET /me/acting-session` (31 banner) | — | `{ session: ActingSessionDto \| null }` | `CurrentActingSessionResponse` | Built |
| `POST/PATCH /clubs/:c/events`, `POST …/events/series` (12 Termin anlegen) | `rsvpAutoReminder?: boolean` (default true): "Team benachrichtigen", remind open replies 24 h before | `EventDetail.rsvpAutoReminder` | `eventLogisticsShape.rsvpAutoReminder` (schemas/event.ts), `Event.rsvpAutoReminder` | Client sends it; server strips it today (no column, no job) |
| `GET /clubs/:c/events/:e` (13 Event hero) | — | `competition: { name, matchday \| null } \| null` ("Kreisliga C · 11. Spieltag") | `eventCompetitionSchema` (schemas/event.ts), `EventDetail.competition` | Mocked in e2e; absent → kind line "Spiel · Heim" |
| `GET /clubs/:c/events/:e/live` (15 Live-Spiel) | — | `opponentColor?: string \| null` (opponent crest fill) | `MatchLiveStateDto.opponentColor` (types/live.ts) | Mocked in e2e; absent → white crest |
| Push/inbox `target.actorName` (10 Mitteilungen) | — | `InboxNotification.target.actorName` for JOIN_REQUEST and RSVP_UPDATE (avatar initials + bold name) | `InboxNotification.target` | Built: join-requests + events services add it |
