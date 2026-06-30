# Anstoss — Club Dashboard Spec (#2 / "C")

Status: DRAFT 2026-06-30. Gated by spec #0 (strategy). Pairs with #1 (mobile) and #3
(match intelligence). This is the **monetization phase** — build it after the free
consumer core (B) and the differentiator (D) have captured the graph, per strategy §9
build order B → D → C. Caveat from strategy §11: ship a *minimal* paid board tier early
to validate willingness-to-pay; do not over-build before a single club pays.

## 1. Role in the system
The mobile app captures the private operational graph (attendance, lineups, events,
ratings, dues, comms). The **dashboard is where the board operates and pays for it.** It
is not a second app with new data — it is a board-grade lens on the *same* graph, at a
scale and density a phone can't serve: multi-team oversight, finances, compliance, comms.

Mobile = capture + engagement (free, viral). Dashboard = oversight + monetization (paid).
The graph is the product; the dashboard sells access to operating it.

## 2. Why web, why now
- The board/treasurer does admin work **at a desk**, across many teams, reconciling money
  and exporting reports — a big screen, keyboard, multi-column density. Wrong job for a phone.
- The capture layer (B) and the data it produces already exist in the NestJS API; the
  dashboard is a new *surface*, not new infrastructure.
- Willingness-to-pay sits with the board (Vorstand/Kassenwart), and they expect a web
  console — it reads as "real software" to the people signing the cheque.

## 3. Personas × jobs-to-be-done
| Persona | Core jobs |
|---|---|
| **Board / Vorstand** | See every team at a glance; member roster + roles across the club; approve joins; run comms; oversee compliance; manage the club's subscription |
| **Treasurer / Kassenwart** | Define dues plans; track who paid (IBAN/SEPA — bank-transfer already shipped in mobile); reconcile; chase overdue; export for the books |
| **(later) League / association** | Cross-club reporting — out of scope for the first cut |

## 4. The free/paid boundary (the monetization line)
Strategy §7: player engagement is free forever; the **club/board SaaS is the core paid
tier.** The dashboard is the paywall.
- **Free (already in mobile):** chat, events, RSVP, player card, rankings, basic dues
  (bank-transfer pinned IBAN), a single team.
- **Paid — Club/Board tier (the dashboard):** multi-team oversight, the finance console
  (dues reconciliation, overdue tracking, exports), member/role administration at club
  scale, club-wide announcements, compliance/consent records, the subscription itself.
- Entitlements already exist server-side (`EntitlementGuard` / `@RequireFeature`, e.g.
  `motm_archive`). The dashboard gates on a `club_dashboard` / board entitlement.

## 5. Surfaces (IA)
1. **Overview** — club pulse for the board: teams, member count, upcoming fixtures/events,
   dues collected vs outstanding, RSVP health. The board's "is the club healthy?" glance.
2. **Teams** — every team, its roster, coaches, next fixtures; drill into one team.
3. **Members** — club-wide directory: roles, status, join requests to approve, remove/transfer.
4. **Finance** — dues plans, per-member paid/overdue, reconciliation against the pinned
   IBAN, CSV/PDF export. The treasurer's home. (Builds on the shipped bank-transfer model.)
5. **Comms** — club-wide announcements + targeting; history.
6. **Compliance** — consent/age-gate records (GDPR Art. 8 under-16), data-export/delete
   audit. The "we're defensible" surface.
7. **Settings & Billing** — club profile, colours/badge, the subscription + invoices.

## 6. Technical approach
- **The current `apps/web` is a static HTML marketing site** (index/join/pricing/legal +
  vanilla JS). The dashboard is a **net-new SPA**, separate from that marketing site —
  do not retrofit it into the static pages.
- **Stack (recommended):** Vite + React + TypeScript + TanStack Query + Tailwind. Vite over
  Next.js — this is an authenticated internal console, not SEO/SSR; keep it simple and fast.
  Reuse **`@anstoss/shared`** for types/contracts end to end (same package the mobile app and
  API already share) so the dashboard is type-safe against the real API.
- **Auth:** the existing email-OTP → 30-day JWT (`AUTH_JWT_SECRET`), same as mobile. Board
  members sign in with the same identity; the dashboard checks the board entitlement + RBAC.
- **API:** reuse the NestJS surface that already exists (teams, members, events, contributions/
  billing, announcements, streaks, motm). Add board-scoped aggregate endpoints only where the
  overview needs cross-team rollups the mobile API doesn't already serve.
- **Multi-tenant safety:** every query club-scoped + RBAC-gated server-side (never trust the
  client). Reuse the Prisma tenant-scoping already mandated in CLAUDE.md.

## 7. Build order (ship the minimal paid tier first — strategy §11)
Each slice its own brainstorm → spec → plan → verify, same as B.
1. **App skeleton** — Vite/React/TS app, auth (OTP/JWT reuse), club switcher, shell + nav,
   `@anstoss/shared` wired, deploy target. No features yet, just a logged-in empty console.
2. **Overview** — the board glance (teams, members, dues collected vs outstanding, RSVP health).
3. **Finance console** — dues plans + per-member paid/overdue + reconciliation + export.
   This is the treasurer's must-have and the clearest willingness-to-pay hook → prioritize.
4. **Members + roles** — club directory, approve joins, role management at scale.
5. **Billing/subscription** — the actual paywall: board entitlement + plan + invoices.
   (Payment provider TBD; reuse Stripe Connect groundwork if present. Do NOT enter card data
   on the user's behalf — the board self-serves checkout.)
6. **Comms + Compliance** — club announcements; consent/age-gate/export-delete records.
7. **Teams drill-down** — per-team oversight, fixtures, lineups view.

Slices 1-3 = the minimal paid board tier to validate willingness-to-pay. 4-7 deepen lock-in.

## 8. Seed milestone this unlocks (strategy §10)
N active clubs with a **paying board tier** + **dues GMV flowing** + weekly-active players.
The dashboard is the surface that turns engagement into the paying-board signal investors
want. Slices 3 + 5 (finance + billing) are the ones that produce that proof.

## 9. Risks (named, not hidden)
- **B2C → B2B conversion** — players love it free; will the board pay? Slice 3 tests this fast.
- **Scope** — a board console can sprawl. Hold the line at the minimal tier (1-3) until a
  club pays. Resist building 4-7 ahead of demand.
- **Payments + money movement** — dues reconciliation touches real money; never auto-move
  funds or enter financial credentials (assistant constraint). The board self-serves.
- **Security / multi-tenant** — a board console is a fat target: club-scope + RBAC every
  endpoint, audit access, no client-trust. Treat as launch-blocking.
- **Greenfield cost** — this is a new app, not an edit. It is the largest single lift in the
  program and is outward-facing + monetizing; it should not be auto-built without founder
  review of this spec and an explicit go.
