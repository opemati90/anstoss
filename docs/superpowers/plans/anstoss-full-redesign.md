# Anstoss — Full Redesign & Journey Refresh Plan

> Goal: every screen and every flow rebuilt to one consistent, modern, polished
> bar. No half-baked screens. The success criterion is **consistency + hierarchy
> + calm**, not novelty. This document is the single source of truth for the
> revamp; nothing ships that deviates from it.

---

## 0. Why the app feels "AI-generated / mismatched" today (diagnosis)

The app already has a design system (DESIGN.md, spacing/type tokens, DM Sans +
Geist Mono, club-adaptive color). The failure is **adoption drift, not absence**:

- Nearly every screen carries `eslint-disable … TODO Pass 3 migrate raw
  spacing/radius/rgba literals` — i.e. hand-picked pixels instead of tokens.
- Cards, rows, sheets, headers, badges are **reinvented per screen** (multiple
  divergent versions of the same component) → "mismatch of styles".
- Redundant stacked text + over-coloring + weak size contrast → "jampacked, no
  hierarchy".

So the revamp = **enforce one system everywhere + declutter + reimagine the
journeys** — and lock it so it can't drift again.

## 1. Research synthesis (what "modern & best" means here)

- **Category leaders win on simplicity.** Heja/Spond are praised for being
  clean, mobile-first, "obvious from day one," not overcomplicated.
- **2026 hierarchy principles:** users *scan*, don't read. Lead with size
  (headers 1.5–2× body), then contrast, then spacing. Strict 8px grid (8/16/24/32).
  One card language with explicit elevation. "Remove anything that doesn't help
  the user — calmer, more focused screens."
- **Onboarding → value fast.** PayPal cut 11 steps → mobile-first flow that
  delivers value *before* heavy verification; first-success users retain 3×.
- **Gamification drives retention** (esp. 18–45): progress bars, streaks, badges,
  social milestones — 90% of younger users prefer them over plain utility. We
  already have MOTM, streaks, contribution progress — make them first-class.

Sources: Spond best-apps, parallelhq visual-hierarchy, Muzli 2026 patterns,
VWO/Plotline onboarding, StriveCloud/Merge gamification (see chat for links).

## 2. The design language — "Editorial Calm" (refined, locked)

Builds on existing tokens (least churn, leverages DM Sans + Geist Mono).

**Type scale** (one ramp, used everywhere; ~1.5× steps):
`display 34 / title1 28 / title2 22 / title3 18 / headline 17(sb) / body 15 /
footnote 13 / caption 11`. Data/scores/times/money → **Geist Mono** (tabular).
Never hand-pick fontSize+weight in a screen — only `<Text variant=…>`.

**Spacing** (8px grid, tokens only): `2xs 2 / xs 4 / sm 8 / md 12 / lg 16 /
xl 20 / 2xl 24 / 3xl 32`. Screen padding 16. Section gap 24. In-card gap 8–12.

**Color**: neutral canvas; **club color = the single accent** (primary action,
active state, key data). Semantic success/warning/error ONLY for status. No
rainbow icon tiles, no per-row hues. Decoration: minimal.

**Surface & elevation**: one card (`radius.lg`, hairline border, one soft
shadow token). Buttons `radius.md`. Pills `radius.full` only for true chips.
Explicit layering: base → card → sheet.

**Motion**: one spring for sheets/press (already in BottomSheet), 150–200ms
fades for state changes, subtle press opacity. No gratuitous animation.

**Hierarchy rule per screen**: one clear primary action, one H1, sections with
a quiet eyebrow label, generous whitespace. If two things compete, one loses.

## 3. Component canon (Phase 1 — build once, delete the rest)

One blessed implementation each; every screen consumes these, nothing bespoke:

- `Screen` scaffold (safe-area, header slot, scroll, bottom-chrome clearance)
- `ScreenHeader` (large-title + back/close per presentation) & `TabHeader`
- `Card` (the only card) + `Section` (eyebrow + content rhythm)
- `ListRow` (leading icon/avatar, title, subtitle, trailing) — the one row
- `Button` (primary/secondary/ghost/destructive) + `Pill`/`Badge`
- `BottomSheet` (fixed — auto-height bug resolved) + `SelectionSheet`
- `StatTile` / `StatGrid` (KPIs, de-rainbowed)
- `EmptyState` / `Skeleton` / `ErrorState` (every screen has all three)
- `Avatar`, `ProgressBar`, `SegmentedControl`, `FilterChipRow`

Acceptance: zero `eslint-disable Pass 3` left; zero raw spacing/hex literals.

## 4. Journey refresh (not just reskin — rethink the flows)

1. **Onboarding/Auth → value fast.** One unified entry; collect the minimum,
   show the club/home *before* heavy steps; progress indicator; celebrate first
   action (joined club / first RSVP). Under-16 gate stays.
2. **Matchday** (the hero journey): pre-match readiness → live ticker → MOTM →
   recap, as one coherent, energetic spine. Live screen gets the most "punch".
3. **RSVP/Events**: one-tap respond, clear who's in, calm schedule; reminders
   wired (done).
4. **Dues/Billing**: progress-to-collected framing, clear status, frictionless
   "mark paid"/pay; treasurer view calm.
5. **MOTM / Streaks / Recognition** = the gamification layer: votes, badges,
   attendance streaks surfaced tastefully on Home/profile.
6. **Chat**: clean bubbles, localized timestamps (done), real membership (done),
   push on every message (done).
7. **Squad/Roster**: one card language, one-accent actions (done as pilot).

## 5. Full screen inventory (every screen — tracked to 100%)

Grouped; each gets: declutter → canon components → adversarial design review →
simulator screenshot → ✅. (Checklist maintained as we go.)

- **Tabs/Home**: home (player/coach/admin/parent/free-agent), events, chat,
  squad, more
- **Matchday**: match-detail, match-live, lineup-builder, motm, attendance,
  event-detail, create/edit-event
- **Roster/People**: roster, squad, team-management, transfer-list, scouting,
  pending-requests, club-staff, free-agent profile/[id], invite, join/[code]
- **Money**: admin-billing, contribution-plan, my-contributions, stripe-connect,
  paywall
- **Comms**: chat channels/DM, announce, notification-settings
- **Club/Admin**: admin-dashboard, members, roles, families, club-stats,
  club-setup, compliance, sportgericht
- **Settings/Legal**: more, language, legal, policy, account-next-step
- **Auth/Onboarding**: splash, sign-in, OTP, registration, role select, age gate
- **Extras**: carpool, duty-roster, ehrenamt, trikotwart, photo-wall, streaks,
  voice-memos, pitch-status, vereinsheim, exchange, league-table, find-club

(~90 screens. None skipped.)

## 6. Execution method — how we guarantee no half-baked screens

1. **Phase 0**: build **Home** to the new bar = the locked reference. Confirm
   direction on-device before mass rollout.
2. **Phase 1**: ship the component canon (§3). After this, screens are mostly
   *assembly*, which is what enforces consistency.
3. **Phase 2**: screens in journey order (Matchday → Events → Squad → Chat →
   Money → Club/Admin → Settings → Onboarding). Each screen:
   redesign → build with canon only → **adversarial design review agent** →
   simulator screenshot → fix → mark ✅ in the checklist.
4. **Phase 3**: motion, every empty/loading/error state, dark mode, WCAG
   contrast sweep.
5. **Guardrails**: a lint rule fails the build on raw spacing/hex literals once a
   screen is migrated; a visual checklist tracks every screen to 100% so nothing
   is left "the other half shitty".

## 7. Sequencing & checkpoints

- Commit per screen/component locally on `develop` (no pushes unless asked).
- You review screenshots at each journey boundary (Home, then Matchday, etc.).
- Branch order honored: frontend → develop.

---

### Status / next action
Phase 0 = revamp **Home** as the on-device reference, then propagate. Awaiting
direction confirmation (Editorial Calm recommended) to begin Phase 0.
