# Anstoss — Mobile App Revamp Spec (#1 / "B")

Derives from `00-strategy.md`. Goal: re-think the mobile app IA + design end-to-end into a
PreMatch-grade, habit-forming club app — keeping chat + events, adding verified gamification
and the match-intelligence surfaces — adapted to Anstoss's editorial system so it never reads
as a PreMatch copy. Both light + dark. Turkish locale added.

## Design north-star (locked)
Editorial-premium, club-adaptive accent (NOT PreMatch's fixed yellow), DM Sans + Geist Mono,
restrained charts, hairline separation, both modes, anti-slop (the facts mockups are the
reference). Same dopamine as PreMatch, more credible (verified data), unmistakably ours.

## Information architecture (5 tabs)
- **Home** — personalized club pulse: next match, dues nudge, "who made it happen" prompt,
  club feed, role-aware (player/coach/board/parent variants already exist).
- **Matches** — fixtures + the **Facts/Intelligence** layer (H2H, form, goal-timing, top
  scorers, prediction poll). Slice #1 (D) is already in flight here.
- **Squad** — roster + ops (revamped this session: squad-health, admin actions) + **Team of
  the Week**.
- **Chat** — kept (the Trojan horse), revamped this session (channel rail, voice playback).
- **Profile / Me** — the **verified gamified player card**, personal stats, streaks, a
  credible "form rating" (our honest answer to PreMatch's scraped "market value").

A **League** surface (table, rankings, ToTW) folds into Matches/Home rather than a 6th tab.

## Verified gamification engine (the retention flywheel)
All backed by real ops data, not scrapes — the credibility wedge:
- Player cards (verified: real attendance, lineups, coach ratings).
- Team of the Week (from real match events + ratings).
- 5-match power ranking / form guide.
- "Who made it happen" post-match goal/assist entry (already prompted via push).
- Streaks (shipped) + season stats.
- Prediction polls.

## Slice order (each its own brainstorm→spec→plan→verify)
1. **Match Facts brick** (H2H + form) — backend `/facts` endpoint + RN modules. IN FLIGHT.
2. Goal-timing + top scorers (needs scraper extension + react-native-svg).
3. Verified player card + Profile/Me revamp.
4. Team of the Week + power rankings (League surface).
5. Home pulse revamp (role-aware feed).
6. IA/navigation pass tying it together.
7. Turkish locale: complete `tr` translations across all namespaces (currently partial).

## Cross-cutting
- react-native-svg added once (for charts) — gates slices 2/4.
- Turkish locale parity (slice 7) — guarded by the i18n parity test.
- Every surface dual-mode via useClubColors() tokens from line one.
