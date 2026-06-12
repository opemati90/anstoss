# Anstoss MVP Feature Sprint — Design Spec
**Date:** 2026-06-12
**Status:** Approved for implementation

## Context

Anstoss is a white-label mobile app for amateur football clubs in Germany/Europe, replacing WhatsApp-based club coordination. The app has a working core (events, RSVP, squad, chat, billing) but has critical gaps that prevent clubs from fully switching away from WhatsApp. This spec covers two sequential sprints to close those gaps and unlock the complete club workflow.

---

## Sprint 1 — Quick wins (~1 week)

### 1. Paywall Removal (MVP: all features free)

**Goal:** Remove all feature gates so every club gets the full experience. Billing infrastructure stays intact for future reactivation.

**Change:**
- Add `const MVP_ALL_FREE = true` to `useEntitlements.ts`
- When `MVP_ALL_FREE` is true, `has()` always returns `true` and `isPremium` returns `true`
- Remove the "Upgrade to Plus" upgrade banner from `AdminHome` and `more/index.tsx`
- Remove `showUpgradeBanner` logic from `more/index.tsx`

**Paywall call sites (6 locations to verify open):**
- `CoachHome.tsx` — `lineup_builder_pro`, `motm_archive`
- `admin-sponsors.tsx` — `sponsor_logos`
- `admin-dashboard.tsx` — `scouting_marketplace`, `sponsor_logos`
- `admin-billing.tsx` — `contribution_intake`
- `more/index.tsx` — upgrade banner

**What stays:** All billing screens, Stripe Connect, contribution tracking, `PaywallSheet` component, the `plan` field on the API. One-line revert when billing relaunches.

---

### 2. RSVP Reminders

**Goal:** Coach can push a reminder to all non-responding players for a specific event in one tap.

**UI — event-detail screen (admin/coach only):**
- Below the existing RSVP summary bar, add: `"[N] haven't responded  [Remind]"`
- Button is primary-tinted, disabled when N = 0
- After sending: button becomes `"Reminded [N] people · [X] ago"`, disabled for 24h
- 24h rate limit per event — stored as `lastRsvpReminderAt` on the event

**Push notification:**
- Title: `"[Event title]"`
- Body: `"[Day], [time] at [location] — have you replied yet?"`
- Deep link: `anstoss:///event-detail?eventId=[id]`
- Category: `events`
- Recipients: all active team members with no RSVP row for this event

**Backend:**
- New endpoint: `POST /clubs/:clubId/events/:eventId/remind-rsvp`
- Auth: requires `EVENTS` capability (OWNER, ADMIN, COACH)
- Logic: query memberships for team → exclude users with existing RSVP → batch push
- Response: `{ sent: number, nextAvailableAt: string }`
- Rate limit: 1 call per event per 24h enforced server-side (return 429 with `retryAfter` if called again)
- Add `lastRsvpReminderAt DateTime?` to Event model (Prisma migration)

**Edge cases:**
- Event in the past → endpoint returns 400, button hidden client-side
- All players already responded → button shows "All responded ✓", disabled
- No team members → button hidden

---

### 3. Announcement Create

**Goal:** Admin/coach can post a club announcement from the home screen in under 10 seconds, without navigating to the Chat tab.

**UI — compose sheet:**
- Triggered from: "📢 Announce" quick action button in the admin/coach home action grid (alongside "Create event")
- Sheet: `title` field (required, max 80 chars) + `body` field (optional, max 500 chars, multiline) + `"Post to all players"` primary button
- On submit: posts to the team's ANNOUNCEMENTS channel as a regular message (title as message text, body as a second paragraph if present)
- Success: sheet dismisses, brief haptic + toast `"Announcement posted"`

**Backend:** No new endpoints. Uses existing `POST /clubs/:clubId/channels/:channelId/messages`. To resolve the channelId: client fetches `GET /clubs/:clubId/channels?teamId=:teamId` (already used in ChatTab), finds the channel with `kind === 'ANNOUNCEMENTS'`, and uses its id. The ANNOUNCEMENTS channel is already seeded per team. Push notification already fires for announcements channel messages (see `chat.gateway.ts:428`).

**Access control:** Only users with `EVENTS` or `COMMUNICATIONS` capability can see the "Announce" action. Players do not see it.

**Coach home action grid change:**
- Current: `[+ Create event]  [👤 Invite]  [🔍 Scouting]  [🔥 Streaks]`
- Updated: `[+ Create event]  [📢 Announce]  [👤 Invite]  [🔍 Scouting]`

**Admin home action grid:** Same addition — "Announce" is added to the quick action grid in `AdminHome.tsx`. The exact current grid shape must be confirmed at implementation time (read the component before editing); the principle is the same: Announce sits alongside Create event.

**Edge cases:**
- Team has no ANNOUNCEMENTS channel yet (pre-migration clubs) → server auto-provisions on first message (existing `ensureTeamChannels` idempotent behaviour)
- Empty title → post button disabled
- Network failure → sheet stays open with error inline

---

### 4. Chat Discovery

**Goal:** New players find the team channel without hunting through tabs.

#### 4a. Player home "Team chat" row

Added between the event hero card and the announcements section on `PlayerHome`:

```
┌─────────────────────────────────────────┐
│  💬  Team · Senior Team                  │
│      "Julian: See you Saturday! 👊"   3  │
└─────────────────────────────────────────┘
```

- Tapping navigates to Chat tab with the Team channel pre-selected
- Unread badge (count, capped at 99+)
- Last message preview: `"[Sender first name]: [message]"`, max 60 chars, truncated
- If no messages yet: `"Say hi to your teammates →"`
- If user has no team channel (free agent): row hidden

**Data:** PlayerHome currently makes no channel API call — add `GET /clubs/:id/channels?teamId=:teamId` to the existing `load()` function alongside the events fetch. Filter the result for `kind === 'TEAM'` to get the channel row (lastMessage, unreadCount). This is the same endpoint used by ChatTab's ChannelRail.

#### 4b. Chat tab auto-select

- On mount, if `activeChannel` is null, auto-select the `TEAM` kind channel for the current team
- Users land directly in the conversation instead of the blank channel rail
- Channel rail remains accessible via the info/menu icon for switching channels

---

## Sprint 2 — Core flows (~2 weeks)

### 5. Player Self Check-in

**Goal:** Players confirm physical presence at an event by tapping a check-in button. Coach sees who showed up vs who just RSVPed.

**Check-in window:** 2 hours before event start → 3 hours after event start. Outside this window the button is not shown.

**UI — event-detail screen (player):**
- Within the check-in window: a `"Check in"` button below the RSVP section
- After check-in: `"✓ Checked in at [time]"` — non-interactive, final
- No confirmation dialog — one tap, immediate

**UI — event-attendance screen (coach/admin):**
Two sections:
1. **RSVPs** — existing (YES / MAYBE / NO grouped list)
2. **Check-ins ([N])** — players who checked in, sorted by check-in time, with timestamp
3. **No-shows** — players who RSVPed YES but did not check in (only shown after event window closes)

**Streak integration:** Check-in events are the input to the existing `attendanceWeeks` / `attendanceLongest` streak counters in `streaks.service.ts`. These counters were previously undriven — check-in activates them.

**Backend:**
- New model: `EventCheckIn { id, clubId, teamId, eventId, userId, checkedInAt }`
- Endpoint: `POST /clubs/:clubId/events/:eventId/check-in` — idempotent (second tap = 200 with existing record, no duplicate)
- Endpoint: `GET /clubs/:clubId/events/:eventId/attendance` — returns `{ rsvps: [...], checkIns: [...], noShows: [...] }`
- Time window enforced server-side: 400 if called outside window
- Index: `@@index([eventId, userId])`, `@@index([clubId, checkedInAt])`

**Edge cases:**
- Player RSVPed NO but checks in (showed up last minute) → check-in recorded, displayed separately, RSVP not mutated
- Event cancelled → check-in button hidden (event status = CANCELLED)
- Coach checks in on behalf of player → not supported in MVP (trust-based, player-only)

---

### 6. Availability Status (RSVP reasons)

**Goal:** When a player RSVPs No, they can optionally specify why. Coach sees injury/suspension flags in attendance and lineup builder.

**UI — player RSVP flow:**
After tapping "No" on an event RSVP, a bottom sheet appears:

```
Why can't you make it?
  🤕  Injured
  🟥  Suspended
  ✈️  Away
  ❌  Other / prefer not to say
     [Skip]
```

Selection is optional — "Skip" records No with no reason. Reason can be changed by re-tapping No on the event detail.

**UI — coach views:**
- Event attendance list: icon badge next to player name (🤕 / 🟥 / ✈️)
- Lineup builder: injured and suspended players greyed out with icon, moved to bottom of picker list, cannot be dragged into the lineup without a confirmation warning
- Admin home "Squad availability" widget: shows players currently marked injured or suspended across all teams, with event name and date

**Backend:**
- Add `reason: 'INJURED' | 'SUSPENDED' | 'AWAY' | 'OTHER' | null` to the `Rsvp` model
- Prisma migration: one nullable enum column, no breaking change
- `PUT /clubs/:clubId/events/:eventId/rsvp` already exists — add `reason` to request body schema (optional, ignored if status ≠ 'NO')
- `GET /clubs/:clubId/squad/availability` — new endpoint returning members with active injury/suspension (across all upcoming events). Used by admin home widget.

**Edge cases:**
- Player changes RSVP from No to Yes → reason cleared server-side
- Player marks Injured for multiple overlapping events → each event has its own RSVP row, each independently flagged
- Coach cannot override a player's reason (read-only for coach)

---

### 7. Multi-Team Home

**Goal:** A player on multiple teams (e.g. senior squad + reserves) sees upcoming events from all their teams on the home screen.

**UI — PlayerHome "Your week" list:**

Replaces the single event hero card when the user has events across > 1 team:

```
YOUR WEEK
┌─────────────────────────────────────────┐
│  [SEN]  Training · Mon 18:00            │
│         Sportplatz am Tierpark          │
│         [Yes] [Maybe] [No]              │
├─────────────────────────────────────────┤
│  [RES]  Match vs FC Blau-Weiß · Sat    │
│         [Yes] [Maybe] [No]              │
└─────────────────────────────────────────┘
```

- Shows up to 4 upcoming events across all teams, sorted chronologically
- Team badge chip: abbreviation of team display name in club primary color
- Single-team players: renders as today (single hero card, no chip, backwards compatible)
- Live fixture card (primary-color fullbleed) surfaces above the list if any fixture is live

**Backend:**
- `GET /clubs/:clubId/events?mine=1&scope=upcoming` — remove the `teamId` filter restriction when user belongs to multiple teams. Return events for all of the user's teams, ordered by date, limit 4.
- No schema change needed — the event rows already carry `team.id` and `team.name`.

**Edge cases:**
- User in 3+ teams: still capped at 4 events, sorted by date (not by team)
- RSVP on multi-team list: same optimistic update pattern as today, each event's RSVP is independent
- One team has no upcoming events: only the other team's events show

---

### 8. Onboarding Cold-Start

**Goal:** A player who accepts an invite lands in a contextual, welcoming experience — not an empty app.

#### 8a. Welcome card (PlayerHome, first 7 days)

A dismissible card pinned above the event section for players within 7 days of joining their first team:

```
┌─────────────────────────────────────────┐
│  👋  Welcome to Senior Team             │
│  Your coach added you. Here's where     │
│  to start:                              │
│                                         │
│  → Check your first event               │
│  → Say hi in team chat                  │
│  → Fill in your profile photo           │
│                                [✕ Done] │
└─────────────────────────────────────────┘
```

- Each row is tappable (deep links to Events tab, team channel, edit-profile)
- `[✕ Done]` dismisses permanently (AsyncStorage flag `onboarding_welcome_dismissed`)
- Auto-hides after 7 days regardless of dismissal
- `joinedAt` date comes from the membership record already in `AuthContext`

#### 8b. System welcome message

When a player's membership status transitions to `ACTIVE` (join-code accepted or admin invite accepted), a system message is posted to the team's ANNOUNCEMENTS channel:

`"👋 [Player name] joined [Team name]."`

- Posted by a system user (no sender attribution to a human)
- Fires from the existing membership confirmation flow in the backend
- Creates a social moment + confirms the join worked
- Push notification fires as normal for announcements messages

#### 8c. Coach empty-state nudge

When a coach's team has 0 events and 0 members (fresh setup), their home screen shows a one-time onboarding prompt instead of empty state:

```
Get started
[+ Create your first event]
[👥 Invite players]
```

Disappears after either action completes (checked via event count > 0 OR pending invite count > 0).

**Backend for 8b:**
- Hook into `MembershipsService.confirmMembership()` (or equivalent) — after status → ACTIVE, call `ChannelsService.postSystemMessage(teamId, clubId, message)`
- New method `postSystemMessage` on ChannelsService: creates a message row with `isSystem: true`, emits via Socket.io, triggers push
- Add `isSystem Boolean @default(false)` to Message model — system messages render without an avatar/sender in the chat UI

---

## Data model changes summary

| Model | Change | Migration type |
|---|---|---|
| `Event` | Add `lastRsvpReminderAt DateTime?` | Additive nullable |
| `Rsvp` | Add `reason String?` (enum: INJURED/SUSPENDED/AWAY/OTHER) | Additive nullable |
| `EventCheckIn` | New table | New table |
| `Message` | Add `isSystem Boolean @default(false)` | Additive with default |

All migrations are additive (no dropped columns, no breaking changes to existing queries).

---

## API surface summary

| Endpoint | Method | Auth | Sprint |
|---|---|---|---|
| `/clubs/:id/events/:id/remind-rsvp` | POST | EVENTS cap | 1 |
| `/clubs/:id/events/:id/check-in` | POST | member | 2 |
| `/clubs/:id/events/:id/attendance` | GET | EVENTS cap | 2 |
| `/clubs/:id/squad/availability` | GET | EVENTS cap | 2 |

---

## What is explicitly out of scope

- Geofencing for check-in (trust-based)
- Coach checking in on behalf of a player
- Reason codes for MAYBE RSVP (only NO)
- Group chat creation by players (coach/admin only, already implemented)
- Export of attendance data (post-MVP)
- Billing reactivation (separate spec when ready)
