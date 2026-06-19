# Anstoss 5-Sprint Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Anstoss from a basic scheduling app into the intelligence layer for amateur football clubs — making the coach's Saturday morning routine, the parent's logistics juggle, and the admin's dues headaches dramatically easier.

**Architecture:** Each sprint is self-contained — ships working, testable software on its own. All backend changes extend existing NestJS modules. No breaking API changes; all new fields are nullable or additive.

**Tech Stack:** NestJS + Prisma + Railway Postgres (API), Expo Router + React Native (mobile), `@anstoss/shared` for Zod schemas.

---

## Sprint 1 — Already Planned
**Plan:** `docs/superpowers/plans/2026-06-12-anstoss-mvp-sprints.md`

Features: Paywall removal, RSVP reminders, announcement create, chat discovery, event check-in, player availability status, multi-team home, onboarding cold-start.

---

## Sprint 2 — Event Intelligence Layer
**Plan:** `docs/superpowers/plans/2026-06-19-sprint2-readiness-score.md`

**Theme:** Give coaches a single-glance answer to "can we field a team Saturday?"

| Feature | What it ships |
|---|---|
| Event Readiness Score | RED/YELLOW/GREEN badge per event, computed from RSVPs + injuries + position gaps |
| Coach Briefing | One-line natural-language summary: "9 yes, 3 pending — no keeper, Max injured" |
| Smart Reminders | Dynamic RSVP nudges at 72h/24h/day-of based on pending count, not just time |
| WhatsApp Bridge | Share card endpoint — coach taps share and WhatsApp gets formatted availability text |
| Structured Announcements | announcementType enum + requiresAck flag + per-message ack tracking |

**Key new models:** `MessageAck`, `Message.announcementType`, `Message.requiresAck`
**Key new endpoints:** `GET /events/:id/readiness`, `GET /events/:id/share-card`

---

## Sprint 3 — Matchday Mode
**Plan:** `docs/superpowers/plans/2026-06-19-sprint3-matchday.md`

**Theme:** Replace the group chat during a match with a structured, real-time record.

| Feature | What it ships |
|---|---|
| Live check-in | Players tap "I'm here" at the ground, coach sees arrival count in real time |
| Lineup confirmation | Coach locks starting 11 + subs from the lineup builder before kickoff |
| Live match events | Goals, yellow/red cards, substitutions logged to `MatchLiveEvent` table, broadcast via Socket.io |
| MOTM voting | Post-match squad vote, resolved automatically after 30 min |
| Post-match recap | Auto-generated summary card with score, scorers, MOTM, attendance |

**Key new model:** `MatchLiveEvent` (type, minute, userId?, opponentGoal Boolean, note)
**Key new endpoints:** `POST /events/:id/match-events`, `GET /events/:id/match-events`, `POST /events/:id/motm-vote`

---

## Sprint 4 — Parent Command Center
**Plan:** `docs/superpowers/plans/2026-06-19-sprint4-parent.md`

**Theme:** Make ParentHome the most useful screen for parents with 1-2 kids across multiple teams.

| Feature | What it ships |
|---|---|
| Schedule conflict surface | Visual flag when two kids have overlapping events — already computed in `findConflicts`, needs UI |
| Carpool coordination | Parents post/claim lifts per event; `CarpoolOffer` model |
| Consent status dashboard | Parent sees which consents are REQUIRED, PENDING, SIGNED per child |
| Payment status per child | Contribution record status per child at a glance |

**Key new model:** `CarpoolOffer` (eventId, offeredByUserId, seatsAvailable, meetingPoint, direction: TO|FROM|BOTH)
**Key new endpoint:** `GET /me/children-summary`, `POST /events/:id/carpool`, `GET /events/:id/carpool`

---

## Sprint 5 — Club Health + Public Page
**Plan:** `docs/superpowers/plans/2026-06-19-sprint5-club-health.md`

**Theme:** Give club admins the visibility they need to run a healthy club, and give clubs a shareable presence.

| Feature | What it ships |
|---|---|
| Club Health Dashboard | Dues health %, consent coverage %, teams active/inactive — all in one AdminHome panel |
| Roster Intelligence | Position gap analysis, squad age pyramid, recurring injury patterns — coach-facing |
| Coach handover tool | Admin reassigns coach role to another team member without losing data |
| Public Club/Team Page | Unauthenticated `GET /public/clubs/:slug` — club info, upcoming fixtures, join CTA |

**Key new endpoints:** `GET /clubs/:id/health-snapshot`, `GET /clubs/:id/roster-intelligence`, `POST /clubs/:id/teams/:teamId/transfer-coach`, `GET /public/clubs/:slug`

---

## Cross-Sprint Data Model Changes Summary

| Sprint | Migration |
|---|---|
| S2 | `Message.announcementType String?`, `Message.requiresAck Boolean @default(false)`, `Message.ackDeadline DateTime?`, `MessageAck` table |
| S3 | `MatchLiveEvent` table (type, minute, userId?, opponentGoal, note, eventId, clubId, teamId) |
| S4 | `CarpoolOffer` table (eventId, offeredByUserId, claimedByUserId?, seatsAvailable, meetingPoint, direction) |
| S5 | No schema changes — all Sprint 5 features derive from existing data |

---

## Sequencing Rationale

Sprint 2 before Sprint 3: readiness score needs RSVP + injury data; matchday mode is the natural sequel (you know who's coming, now track what happens).

Sprint 4 before Sprint 5: parent carpool (S4) creates `CarpoolOffer` rows that could surface in admin health view (S5).

Sprint 5 last: all Club Health metrics aggregate data from S1–S4 features, so it's richer if built last.
