# Anstoss — Strategy & Positioning Spec (#0)

Status: LOCKED 2026-07 (founder-approved, delegated decision). Gates specs #1 (mobile
revamp), #2 (club dashboard), #3 (match intelligence). Refinements baked in:
**free consumer core forever** + **Germany-first / go deeper** before any expansion.

## 1. Thesis
**The operating system for amateur football — Germany first.** Anstoss turns a club's
*private operational graph* (who actually trained, who paid, who played, who got rated,
who travels together, who runs the board) into a data moat that public-data apps
(PreMatch, fussball.de) structurally cannot touch, then layers PreMatch-grade engagement
and AI intelligence on top of that truth.

One-liner: "Shopify for the 99% of football below the pros."

## 2. Why now
Amateur football runs on WhatsApp + Excel + paper + fussball.de — four disconnected tools.
Three unlocks: (a) fussball.de public data is accessible (already scraped), (b) AI is cheap
enough to turn ops data into tactical/training insight, (c) Veo/XbotGo democratize match
video. PreMatch proved demand for daily engagement; nobody has fused engagement with ops.

## 3. Wedge (win order)
Chat + events (shipped) are the Trojan horse — they pull the whole team on and start
capturing the private graph. Then:
- Coach/manager = orchestrator who replaces 4 tools → activates the team.
- Player = daily engagement via *verified* gamification → retention + virality.
- Board/treasurer = who pays → the dashboard monetizes the captured graph.

Win coach + players first (free, viral); they drag the board in; the board pays.

## 4. Personas × must-have hook
- Player → verified gamified player card + "who made it happen" + own stats/streaks.
- Coach → squad ops + lineup + match intelligence + training drills in one place.
- Board/Vorstand → multi-team oversight, finances, compliance, comms (web dashboard).
- Treasurer/Kassenwart → dues + IBAN/SEPA + reconciliation (bank-transfer shipped).
- Parent → child schedule, dues, carpool, consent.
- Free agent → discoverable verified profile → club-matching marketplace.
- Referee/league → results, match reports, league-wide admin.

## 5. Moat (ranked)
1. Proprietary operational data graph (attendance, lineups, events, finance, ratings).
2. Multi-sided network effects (value + switching cost rise with each member + history).
3. Verified-data gamification (cards/ToTW/rankings backed by truth, not scrapes).
4. AI insight flywheel (more ops data → better recommendations → more usage).
5. Workflow lock-in (dues, compliance, comms run through Anstoss).

## 6. Why we beat each competitor
- PreMatch — public-data vanity layer; no ops/club/private truth. We adopt their retention
  engine, back it with verified data, and own the club workflow underneath.
- fussball.de/DFBnet — system of record, terrible UX, zero engagement/tooling. We are the
  UX + engagement + ops layer on top.
- Spond/TeamSnap/Heja — team org + payments, but no league data, gamification, intelligence,
  or German depth.
- Veo/XbotGo — capture hardware, no club OS. We integrate streams into the graph.

## 7. Monetization (free core forever)
- Player + Team core: **free permanently** (network-first; the moat needs the network).
- Coach/Team Pro: optional subscription (intelligence, training library, advanced stats).
- Club/Board SaaS: per-club paid — dashboard, multi-team, finance, compliance. **Core revenue.**
- League/association: enterprise.
- Take-rate / add-ons: dues payments (SEPA/Stripe), video (Veo/XbotGo), free-agent + sponsor
  marketplace.

## 8. Design north-star
PreMatch-grade visual energy (player cards, ToTW, power rankings, prediction polls) adapted
to Anstoss's editorial system so it reads as ours: club-adaptive accent (not fixed yellow),
DM Sans + Geist Mono, restrained charts, both light + dark, anti-slop. Same dopamine, more
credible, unmistakably not a copy.

## 9. Program build order
B (mobile revamp + facts/gamification — capture + engagement) → D (match intelligence — the
differentiator that powers B) → C (club dashboard — monetization + lock-in). Cross-cutting:
video integration, AI training library, Turkish locale, free-agent marketplace.
Do NOT lead B2B-first: the dashboard's value comes from the already-captured graph.

## 10. Fundability + seed milestone
- Wedge → expand: free chat/events/gamification → paid club SaaS.
- Seed-ready signal: N active German clubs with a paying board tier + dues GMV flowing +
  weekly-active players (engagement proof).
- Named risks: fussball.de data/ToS dependency, B2C→B2B conversion, marketplace cold-start,
  video capex, incumbent (PreMatch) adding ops.

## 11. Adversarial hardening (kill-the-deal review → 3 changes)
The biggest objections and the strategy's answers:
- **"PreMatch copies the ops layer in 6 months."** A club-LOCAL graph is a weak moat. The
  fix: make the network effect **league-wide** — cross-club opponent scouting, a league-wide
  verified player marketplace, referee/league tooling — so value compounds beyond one club
  and the graph becomes a multi-sided asset an incumbent can't bootstrap. **(Change #1.)**
- **"fussball.de scraping is existential."** Correct if the moat depended on it. It doesn't:
  the moat is **private own-entered data** (attendance, lineups, ratings, finance);
  fussball.de is the *acquisition hook* (gamification), not the moat. De-risk by making
  own-data-first and pursuing an official DFBnet/data partnership. **(Change #2.)**
- **"Deferring revenue (C) starves the company."** We don't fully defer: ship a **minimal
  paid board tier early** (dues + multi-team admin — the billing/contributions foundation
  already exists) so revenue starts while the consumer engine compounds; full dashboard later.
  **(Change #3 — a "C-lite" runs in parallel, not strictly after B/D.)**
- **Most likely failure = cold-start/engagement.** If players don't open it daily, no graph,
  no moat, no conversion. That is precisely why B (verified gamification) is first, and why
  the bar for B is "PreMatch-level habit-forming."

Verdict: investable thesis IF the network goes league-wide and the moat is decoupled from
fussball.de. Both folded in above.
