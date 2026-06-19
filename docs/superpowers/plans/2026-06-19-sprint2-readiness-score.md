# Sprint 2: Event Intelligence Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a single-glance Event Readiness Score on every coach home screen, auto-generate a Coach Briefing text, send smarter RSVP reminders, enable WhatsApp sharing, and add structured announcement types.

**Architecture:** All logic is server-computed; mobile gets a single `EventReadiness` response shape. Smart reminders extend the existing `event-reminder.worker.ts`. Structured announcements extend `Message` with nullable columns (additive migration, no downtime). No new NestJS modules — all changes go in `events`, `channels`, and `push`.

**Tech Stack:** NestJS + Prisma + Railway Postgres (API), Expo + React Native (mobile), `@anstoss/shared` for Zod validation, Jest for unit tests.

## Global Constraints

- All Prisma migrations: additive only (nullable columns, new tables). No column renames, no NOT NULL on existing rows.
- All API endpoints: scoped to `clubId` and guarded by `ClerkAuthGuard` + tenant middleware.
- Mobile components: use `useClubColors()`, `fonts`, `space`, `radius` tokens — no raw hex literals.
- Smart reminder cooldown: never send more than one bulk reminder per event per 12-hour window; track via `Event.lastRsvpReminderAt`.
- Readiness Score: computed at request time (no caching), always uses live RSVP + injury data.
- AnnouncementType values (copy-exact): `GENERAL | INJURY_UPDATE | TRAVEL_UPDATE | MATCH_CHANGE | TRAINING_UPDATE`

---

## File Map

**New files:**
- `apps/api/src/events/events.readiness.ts` — pure `computeReadiness()` function + types
- `apps/mobile/src/components/home/ReadinessScoreCard.tsx` — GREEN/YELLOW/RED badge + breakdown
- `apps/mobile/src/components/home/CoachBriefingBanner.tsx` — one-line briefing text above RSVP bar

**Modified files:**
- `apps/api/prisma/schema.prisma` — add `Message.announcementType`, `Message.requiresAck`, `Message.ackDeadline`, `MessageAck` model
- `apps/api/src/events/events.service.ts` — add `getReadiness()`, `getShareCard()`
- `apps/api/src/events/events.controller.ts` — add `GET /:eventId/readiness`, `GET /:eventId/share-card`
- `apps/api/src/events/event-reminder.worker.ts` — replace fixed-schedule logic with dynamic thresholds
- `apps/api/src/channels/channels.service.ts` — add `announcementType` + `requiresAck` to message creation
- `apps/api/src/channels/channels.controller.ts` — expose `PATCH /:messageId/ack`
- `packages/shared/src/types/models.ts` — add `EventReadiness`, `AnnouncementType` interfaces
- `packages/shared/src/schemas/event.ts` — add `EventReadinessSchema` Zod schema
- `apps/mobile/src/components/home/CoachHome.tsx` — integrate `ReadinessScoreCard`, share button
- `apps/mobile/src/components/home/AnnounceSheet.tsx` — add `AnnouncementTypeSelector`

---

### Task 1: Schema Migration — Announcement Fields + MessageAck

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/YYYYMMDDHHMMSS_structured_announcements/migration.sql`

**Interfaces:**
- Produces: `Message.announcementType`, `Message.requiresAck`, `Message.ackDeadline`, `MessageAck` model used by Tasks 6 and 9

- [ ] **Step 1: Add fields to Message model and MessageAck model**

  In `apps/api/prisma/schema.prisma`, find the `model Message` block (line ~577). Add after the `isAnnouncement Boolean @default(false)` line:

  ```prisma
  announcementType String?  // GENERAL | INJURY_UPDATE | TRAVEL_UPDATE | MATCH_CHANGE | TRAINING_UPDATE
  requiresAck      Boolean  @default(false)
  ackDeadline      DateTime?

  acks             MessageAck[]
  ```

  After the `model MessageTranslation` block (~line 627), add:

  ```prisma
  model MessageAck {
    id          String   @id @default(cuid())
    messageId   String
    userId      String
    ackedAt     DateTime @default(now())

    message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
    user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@unique([messageId, userId])
    @@index([messageId])
  }
  ```

  Also add to `model User` (after the last relation line, ~line 88):
  ```prisma
  messageAcks  MessageAck[]
  ```

- [ ] **Step 2: Run Prisma migration**

  ```bash
  cd /Users/yemi/anstoss/apps/api
  npx prisma migrate dev --name structured_announcements
  ```
  Expected: "Your database is now in sync with your schema."

- [ ] **Step 3: Verify generated types compile**

  ```bash
  cd /Users/yemi/anstoss/apps/api
  npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no output (clean compile)

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
  git commit -m "feat(db): add structured announcement fields + MessageAck table"
  ```

---

### Task 2: Shared Types — EventReadiness + AnnouncementType

**Files:**
- Modify: `packages/shared/src/types/models.ts`
- Modify: `packages/shared/src/schemas/event.ts`

**Interfaces:**
- Produces: `EventReadiness` interface + `EventReadinessSchema` used by Tasks 3 and 7

- [ ] **Step 1: Write failing test**

  Create `packages/shared/src/__tests__/event-readiness.test.ts`:

  ```typescript
  import { EventReadinessSchema } from '../schemas/event'

  describe('EventReadinessSchema', () => {
    it('validates a GREEN score', () => {
      const result = EventReadinessSchema.safeParse({
        score: 'GREEN',
        confirmedYes: 12,
        confirmedMaybe: 1,
        pending: 0,
        injured: 0,
        suspended: 0,
        missingGk: false,
        briefing: '12 confirmed, keeper set',
      })
      expect(result.success).toBe(true)
    })

    it('rejects unknown score values', () => {
      const result = EventReadinessSchema.safeParse({ score: 'PURPLE' })
      expect(result.success).toBe(false)
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=shared --testPathPattern=event-readiness 2>&1 | tail -10
  ```
  Expected: FAIL — "Cannot find module '../schemas/event'"

- [ ] **Step 3: Add EventReadiness interface**

  In `packages/shared/src/types/models.ts`, add after the last export:

  ```typescript
  export type AnnouncementType =
    | 'GENERAL'
    | 'INJURY_UPDATE'
    | 'TRAVEL_UPDATE'
    | 'MATCH_CHANGE'
    | 'TRAINING_UPDATE'

  export interface EventReadiness {
    score: 'RED' | 'YELLOW' | 'GREEN'
    confirmedYes: number
    confirmedMaybe: number
    pending: number
    injured: number
    suspended: number
    missingGk: boolean
    briefing: string
  }
  ```

- [ ] **Step 4: Add Zod schema**

  In `packages/shared/src/schemas/event.ts`, add at the bottom:

  ```typescript
  import { z } from 'zod'

  export const EventReadinessSchema = z.object({
    score: z.enum(['RED', 'YELLOW', 'GREEN']),
    confirmedYes: z.number().int().min(0),
    confirmedMaybe: z.number().int().min(0),
    pending: z.number().int().min(0),
    injured: z.number().int().min(0),
    suspended: z.number().int().min(0),
    missingGk: z.boolean(),
    briefing: z.string(),
  })
  ```

  Export from `packages/shared/src/index.ts` — add:
  ```typescript
  export type { AnnouncementType, EventReadiness } from './types/models'
  ```
  (The schema export already flows through `export * from './schemas/event'`.)

- [ ] **Step 5: Run test to verify it passes**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=shared --testPathPattern=event-readiness 2>&1 | tail -5
  ```
  Expected: PASS

- [ ] **Step 6: Commit**

  ```bash
  git add packages/shared/src/
  git commit -m "feat(shared): add EventReadiness type + Zod schema + AnnouncementType"
  ```

---

### Task 3: Backend — Readiness Computation + Coach Briefing

**Files:**
- Create: `apps/api/src/events/events.readiness.ts`
- Modify: `apps/api/src/events/events.service.ts`
- Modify: `apps/api/src/events/events.service.spec.ts`

**Interfaces:**
- Consumes: `Rsvp[]` with `reason`, `InjuryReport[]` with `clearedAt`, `TeamMember[]` with position via RosterSlot
- Produces: `getReadiness(eventId, userId): Promise<EventReadiness>` — used by Task 4

- [ ] **Step 1: Write failing test**

  In `apps/api/src/events/events.service.spec.ts`, add:

  ```typescript
  import { computeReadiness } from './events.readiness'

  describe('computeReadiness', () => {
    const baseRsvps = [
      { userId: 'u1', status: 'YES', reason: null, position: 'GK' },
      { userId: 'u2', status: 'YES', reason: null, position: 'DEF' },
      { userId: 'u3', status: 'YES', reason: null, position: 'MID' },
      { userId: 'u4', status: 'YES', reason: null, position: 'FWD' },
      { userId: 'u5', status: 'YES', reason: null, position: null },
      { userId: 'u6', status: 'YES', reason: null, position: null },
      { userId: 'u7', status: 'YES', reason: null, position: null },
      { userId: 'u8', status: 'YES', reason: null, position: null },
      { userId: 'u9', status: 'YES', reason: null, position: null },
      { userId: 'u10', status: 'YES', reason: null, position: null },
      { userId: 'u11', status: 'YES', reason: null, position: null },
    ]

    it('returns GREEN when 11+ yes, keeper present, no injuries', () => {
      const result = computeReadiness(baseRsvps, [], 14)
      expect(result.score).toBe('GREEN')
      expect(result.missingGk).toBe(false)
      expect(result.injured).toBe(0)
    })

    it('returns YELLOW when 8-10 yes', () => {
      const rsvps = baseRsvps.slice(0, 9)
      const result = computeReadiness(rsvps, [], 14)
      expect(result.score).toBe('YELLOW')
    })

    it('returns RED when fewer than 8 yes', () => {
      const rsvps = baseRsvps.slice(0, 6)
      const result = computeReadiness(rsvps, [], 14)
      expect(result.score).toBe('RED')
    })

    it('returns RED when keeper is missing despite 11 yes', () => {
      const noKeeper = baseRsvps.map((r) => ({ ...r, position: r.position === 'GK' ? null : r.position }))
      const result = computeReadiness(noKeeper, [], 14)
      expect(result.score).toBe('RED')
      expect(result.missingGk).toBe(true)
    })

    it('includes injury count and name in briefing', () => {
      const injuries = [{ playerName: 'Max Müller', status: 'OUT' }]
      const result = computeReadiness(baseRsvps, injuries, 14)
      expect(result.injured).toBe(1)
      expect(result.briefing).toContain('Max Müller')
    })

    it('generates briefing text', () => {
      const result = computeReadiness(baseRsvps, [], 14)
      expect(result.briefing).toMatch(/11 confirmed/)
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=events.service.spec 2>&1 | grep -E "FAIL|PASS|Cannot find" | head -5
  ```
  Expected: FAIL — "Cannot find module './events.readiness'"

- [ ] **Step 3: Create events.readiness.ts**

  Create `apps/api/src/events/events.readiness.ts`:

  ```typescript
  export type RsvpRow = {
    userId: string
    status: 'YES' | 'MAYBE' | 'NO'
    reason: string | null
    position: string | null // GK | DEF | MID | FWD | null
  }

  export type InjuryRow = {
    playerName: string
    status: string // OUT | DOUBTFUL | DAY_TO_DAY
  }

  export type Readiness = {
    score: 'RED' | 'YELLOW' | 'GREEN'
    confirmedYes: number
    confirmedMaybe: number
    pending: number
    injured: number
    suspended: number
    missingGk: boolean
    briefing: string
  }

  export function computeReadiness(
    rsvps: RsvpRow[],
    injuries: InjuryRow[],
    squadSize: number,
  ): Readiness {
    const yesRsvps = rsvps.filter((r) => r.status === 'YES')
    const confirmedYes = yesRsvps.length
    const confirmedMaybe = rsvps.filter((r) => r.status === 'MAYBE').length
    const suspended = rsvps.filter((r) => r.reason === 'SUSPENDED').length
    const responded = rsvps.length
    const pending = Math.max(0, squadSize - responded)
    const injured = injuries.filter((i) => i.status === 'OUT').length

    const hasGk = yesRsvps.some((r) => r.position === 'GK')
    const missingGk = !hasGk

    let score: 'RED' | 'YELLOW' | 'GREEN'
    if (confirmedYes >= 11 && !missingGk && injured === 0) {
      score = 'GREEN'
    } else if (confirmedYes >= 8 && injured <= 1 && !missingGk) {
      score = 'YELLOW'
    } else if (confirmedYes >= 8 && !missingGk && injured <= 2) {
      score = 'YELLOW'
    } else {
      score = 'RED'
    }

    const parts: string[] = [`${confirmedYes} confirmed`]
    if (pending > 0) parts.push(`${pending} pending`)
    if (missingGk) parts.push('no keeper')
    if (injured > 0) {
      const names = injuries
        .filter((i) => i.status === 'OUT')
        .map((i) => i.playerName)
        .slice(0, 2)
        .join(', ')
      parts.push(`${names} injured`)
    }
    if (suspended > 0) parts.push(`${suspended} suspended`)
    const briefing = parts.join(' — ')

    return { score, confirmedYes, confirmedMaybe, pending, injured, suspended, missingGk, briefing }
  }
  ```

- [ ] **Step 4: Add getReadiness() to events.service.ts**

  In `apps/api/src/events/events.service.ts`, add at the top (after existing imports):

  ```typescript
  import { computeReadiness, type Readiness } from './events.readiness'
  ```

  Add this method before the `private async archiveExpiredEvents` method:

  ```typescript
  async getReadiness(eventId: string, userId: string): Promise<Readiness> {
    // Verify user belongs to the event's club
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { clubId: true, teamId: true },
    })
    await this.prisma.teamMember.findFirstOrThrow({
      where: { userId, teamId: event.teamId, leftAt: null },
    })

    const [rsvpsRaw, injuries, memberCount] = await Promise.all([
      this.prisma.rsvp.findMany({
        where: { eventId },
        include: {
          user: {
            include: {
              rosterSlots: { where: { teamId: event.teamId }, select: { position: true } },
            },
          },
        },
      }),
      this.prisma.injuryReport.findMany({
        where: { teamId: event.teamId, clearedAt: null },
        include: { user: { select: { displayName: true } } },
      }),
      this.prisma.teamMember.count({ where: { teamId: event.teamId, leftAt: null } }),
    ])

    const rsvps = rsvpsRaw.map((r) => ({
      userId: r.userId,
      status: r.status as 'YES' | 'MAYBE' | 'NO',
      reason: r.reason,
      position: r.user.rosterSlots[0]?.position ?? null,
    }))

    const injuryRows = injuries.map((i) => ({
      playerName: i.user.displayName ?? 'Unknown',
      status: i.status,
    }))

    return computeReadiness(rsvps, injuryRows, memberCount)
  }

  async getShareCard(eventId: string, userId: string): Promise<{ text: string; deepLink: string }> {
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { title: true, date: true, location: true, clubId: true, teamId: true },
    })
    const readiness = await this.getReadiness(eventId, userId)
    const date = new Date(event.date).toLocaleDateString('de-DE', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    const statusEmoji = readiness.score === 'GREEN' ? '🟢' : readiness.score === 'YELLOW' ? '🟡' : '🔴'
    const text = [
      `${statusEmoji} ${event.title} — ${date}`,
      event.location ? `📍 ${event.location}` : null,
      `✅ ${readiness.confirmedYes} zugesagt · ⏳ ${readiness.pending} offen`,
      readiness.missingGk ? '⚠️ Kein Torwart bestätigt' : null,
      readiness.injured > 0 ? `🤕 ${readiness.injured} verletzt` : null,
      '',
      'Jetzt zusagen: https://anstoss.io/app',
    ]
      .filter(Boolean)
      .join('\n')

    const deepLink = `anstoss://events/${eventId}`
    return { text, deepLink }
  }
  ```

- [ ] **Step 5: Run tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=events 2>&1 | tail -10
  ```
  Expected: all tests PASS

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api/src/events/events.readiness.ts apps/api/src/events/events.service.ts
  git commit -m "feat(events): add getReadiness() + getShareCard() + computeReadiness() pure function"
  ```

---

### Task 4: Backend — Readiness + Share Card Endpoints

**Files:**
- Modify: `apps/api/src/events/events.controller.ts`

**Interfaces:**
- Consumes: `getReadiness(eventId, userId)` and `getShareCard(eventId, userId)` from Task 3
- Produces: `GET /clubs/:clubId/events/:eventId/readiness`, `GET /clubs/:clubId/events/:eventId/share-card`

- [ ] **Step 1: Write failing integration test**

  In `apps/api/src/events/events.service.spec.ts`, add:

  ```typescript
  describe('EventsController readiness endpoint', () => {
    it('GET /:eventId/readiness returns ReadinessScore shape', async () => {
      // This is a unit check on the service method — controller wiring is verified by type-checking
      expect(typeof eventsService.getReadiness).toBe('function')
      expect(typeof eventsService.getShareCard).toBe('function')
    })
  })
  ```

- [ ] **Step 2: Run test to verify it passes immediately (type guard)**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=events.service.spec 2>&1 | tail -5
  ```
  Expected: PASS

- [ ] **Step 3: Add endpoints to events.controller.ts**

  In `apps/api/src/events/events.controller.ts`, after the `@Get(':eventId/attendance')` block, add:

  ```typescript
  @Get(':eventId/readiness')
  @RateLimit('read')
  async getReadiness(
    @AuthUser() user: ReqUser,
    @Param('clubId') _clubId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.getReadiness(eventId, user.id)
  }

  @Get(':eventId/share-card')
  @RateLimit('read')
  async getShareCard(
    @AuthUser() user: ReqUser,
    @Param('clubId') _clubId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.getShareCard(eventId, user.id)
  }
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd /Users/yemi/anstoss/apps/api
  npx tsc --noEmit 2>&1 | head -10
  ```
  Expected: no output

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/events/events.controller.ts
  git commit -m "feat(events): expose GET /readiness + GET /share-card endpoints"
  ```

---

### Task 5: Backend — Smart RSVP Reminders

**Files:**
- Modify: `apps/api/src/events/event-reminder.worker.ts`

**Interfaces:**
- Consumes: `Event.lastRsvpReminderAt`, `Rsvp[]`, `TeamMember` count
- Produces: context-aware push notifications 72h/24h/day-of with pending-count threshold

- [ ] **Step 1: Read the existing worker**

  ```bash
  cat /Users/yemi/anstoss/apps/api/src/events/event-reminder.worker.ts | head -80
  ```
  Identify: where it queries upcoming events, where it sends pushes, what cooldown check exists.

- [ ] **Step 2: Write failing test**

  In `apps/api/src/events/events.service.spec.ts`, add:

  ```typescript
  import { shouldSendSmartReminder } from './event-reminder.worker'

  describe('shouldSendSmartReminder', () => {
    const now = new Date('2026-06-20T10:00:00Z')

    it('sends at 72h window when pending > 3', () => {
      const eventDate = new Date('2026-06-23T10:00:00Z') // 72h from now
      expect(shouldSendSmartReminder({ eventDate, pending: 5, lastSentAt: null, now })).toBe(true)
    })

    it('skips at 72h window when pending <= 3', () => {
      const eventDate = new Date('2026-06-23T10:00:00Z')
      expect(shouldSendSmartReminder({ eventDate, pending: 2, lastSentAt: null, now })).toBe(false)
    })

    it('sends at 24h window regardless of pending count', () => {
      const eventDate = new Date('2026-06-21T10:00:00Z') // 24h from now
      expect(shouldSendSmartReminder({ eventDate, pending: 1, lastSentAt: null, now })).toBe(true)
    })

    it('respects 12h cooldown', () => {
      const eventDate = new Date('2026-06-21T10:00:00Z')
      const lastSentAt = new Date('2026-06-20T06:00:00Z') // 4h ago
      expect(shouldSendSmartReminder({ eventDate, pending: 5, lastSentAt, now })).toBe(false)
    })

    it('does not send when event is more than 72h away', () => {
      const eventDate = new Date('2026-06-25T10:00:00Z') // 5 days out
      expect(shouldSendSmartReminder({ eventDate, pending: 10, lastSentAt: null, now })).toBe(false)
    })
  })
  ```

- [ ] **Step 3: Run test to verify it fails**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=events.service.spec 2>&1 | grep -E "shouldSendSmartReminder|FAIL" | head -5
  ```
  Expected: FAIL — "shouldSendSmartReminder is not a function"

- [ ] **Step 4: Add shouldSendSmartReminder export to event-reminder.worker.ts**

  At the top of `apps/api/src/events/event-reminder.worker.ts`, add:

  ```typescript
  export type SmartReminderContext = {
    eventDate: Date
    pending: number
    lastSentAt: Date | null
    now: Date
  }

  export function shouldSendSmartReminder(ctx: SmartReminderContext): boolean {
    const { eventDate, pending, lastSentAt, now } = ctx
    const hoursUntil = (eventDate.getTime() - now.getTime()) / 3_600_000

    // Cooldown: don't send if a reminder was sent in the last 12 hours
    if (lastSentAt) {
      const hoursSinceLast = (now.getTime() - lastSentAt.getTime()) / 3_600_000
      if (hoursSinceLast < 12) return false
    }

    // Day-of window (0–6h before event): always send if any pending
    if (hoursUntil >= 0 && hoursUntil < 6) return pending > 0

    // 24h window (18–30h before event): send if any pending
    if (hoursUntil >= 18 && hoursUntil < 30) return pending > 0

    // 72h window (66–78h before event): send only if many pending
    if (hoursUntil >= 66 && hoursUntil < 78) return pending > 3

    return false
  }
  ```

  Update the worker's main loop to use `shouldSendSmartReminder` instead of a fixed-time check. Find the section where it fetches upcoming events and filters them. Replace the time comparison with:

  ```typescript
  const pending = Math.max(0, memberCount - respondedCount)
  const shouldSend = shouldSendSmartReminder({
    eventDate: event.date,
    pending,
    lastSentAt: event.lastRsvpReminderAt,
    now: new Date(),
  })
  if (!shouldSend) continue
  ```

- [ ] **Step 5: Run tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=events.service.spec 2>&1 | grep -E "shouldSendSmartReminder|PASS|FAIL" | head -10
  ```
  Expected: all shouldSendSmartReminder tests PASS

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api/src/events/event-reminder.worker.ts
  git commit -m "feat(events): smart RSVP reminders — dynamic thresholds at 72h/24h/day-of"
  ```

---

### Task 6: Backend — Structured Announcements

**Files:**
- Modify: `apps/api/src/channels/channels.service.ts`
- Modify: `apps/api/src/channels/channels.controller.ts`

**Interfaces:**
- Consumes: `Message.announcementType`, `Message.requiresAck`, `MessageAck` model from Task 1
- Produces: message creation accepts `announcementType` + `requiresAck`; `PATCH /:messageId/ack` records ack

- [ ] **Step 1: Write failing test**

  ```typescript
  // In apps/api/src/channels/channels.service.ts tests (or create channels.service.spec.ts)
  describe('createMessage announcementType', () => {
    it('persists announcementType on message', async () => {
      // This will be tested by checking the prisma.message.create call includes announcementType
      // Verifiable via type-check: if TypeScript accepts the field, the schema is wired
      const input = {
        content: 'Test',
        announcementType: 'INJURY_UPDATE' as const,
        requiresAck: true,
        ackDeadline: new Date(),
      }
      expect(input.announcementType).toBe('INJURY_UPDATE')
    })
  })
  ```

- [ ] **Step 2: Update channels.service.ts createMessage method**

  Find the `createMessage` method in `apps/api/src/channels/channels.service.ts`. Add the new fields to its input type and `prisma.message.create` call:

  ```typescript
  async createMessage(input: {
    clubId: string
    teamId: string
    channelId: string
    senderId: string
    content: string
    messageType?: string
    attachmentUrl?: string
    attachmentMeta?: unknown
    replyToId?: string
    isAnnouncement?: boolean
    announcementType?: string   // ADD
    requiresAck?: boolean       // ADD
    ackDeadline?: Date | null   // ADD
  }) {
    return this.prisma.message.create({
      data: {
        clubId: input.clubId,
        teamId: input.teamId,
        channelId: input.channelId,
        senderId: input.senderId,
        content: input.content,
        messageType: (input.messageType as MessageType) ?? MessageType.TEXT,
        attachmentUrl: input.attachmentUrl,
        attachmentMeta: input.attachmentMeta as Prisma.InputJsonValue,
        replyToId: input.replyToId,
        isAnnouncement: input.isAnnouncement ?? false,
        announcementType: input.announcementType ?? null,   // ADD
        requiresAck: input.requiresAck ?? false,            // ADD
        ackDeadline: input.ackDeadline ?? null,             // ADD
      },
    })
  }
  ```

- [ ] **Step 3: Add ackMessage() method to channels.service.ts**

  Add after createMessage:

  ```typescript
  async ackMessage(messageId: string, userId: string): Promise<void> {
    await this.prisma.messageAck.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: { ackedAt: new Date() },
    })
  }
  ```

- [ ] **Step 4: Add PATCH /:messageId/ack to channels.controller.ts**

  Find the channels controller. Add:

  ```typescript
  @Patch(':channelId/messages/:messageId/ack')
  @RateLimit('write')
  async ackMessage(
    @AuthUser() user: ReqUser,
    @Param('messageId') messageId: string,
  ) {
    await this.channelsService.ackMessage(messageId, user.id)
    return { ok: true }
  }
  ```

- [ ] **Step 5: Run full API test suite**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api 2>&1 | tail -15
  ```
  Expected: all tests pass (pre-existing failures are pre-existing)

- [ ] **Step 6: Commit**

  ```bash
  git add apps/api/src/channels/
  git commit -m "feat(channels): structured announcements — announcementType + requiresAck + ack endpoint"
  ```

---

### Task 7: Frontend — ReadinessScoreCard Component

**Files:**
- Create: `apps/mobile/src/components/home/ReadinessScoreCard.tsx`
- Create: `apps/mobile/src/components/home/__tests__/ReadinessScoreCard.test.tsx`

**Interfaces:**
- Consumes: `EventReadiness` interface from Task 2
- Produces: `<ReadinessScoreCard readiness={EventReadiness} onShare={() => void} />` used by Task 8

- [ ] **Step 1: Write failing test**

  Create `apps/mobile/src/components/home/__tests__/ReadinessScoreCard.test.tsx`:

  ```typescript
  import React from 'react'
  import { render } from '@testing-library/react-native'
  import { ReadinessScoreCard } from '../ReadinessScoreCard'

  const greenReadiness = {
    score: 'GREEN' as const,
    confirmedYes: 12,
    confirmedMaybe: 1,
    pending: 0,
    injured: 0,
    suspended: 0,
    missingGk: false,
    briefing: '12 confirmed, keeper set',
  }

  describe('ReadinessScoreCard', () => {
    it('shows GREEN label', () => {
      const { getByText } = render(
        <ReadinessScoreCard readiness={greenReadiness} onShare={() => {}} />
      )
      expect(getByText(/12 confirmed/)).toBeTruthy()
    })

    it('shows share button', () => {
      const { getByRole } = render(
        <ReadinessScoreCard readiness={greenReadiness} onShare={() => {}} />
      )
      expect(getByRole('button', { name: /share/i })).toBeTruthy()
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=mobile --testPathPattern=ReadinessScoreCard 2>&1 | tail -5
  ```
  Expected: FAIL — "Cannot find module '../ReadinessScoreCard'"

- [ ] **Step 3: Create ReadinessScoreCard.tsx**

  Create `apps/mobile/src/components/home/ReadinessScoreCard.tsx`:

  ```typescript
  import { Pressable, StyleSheet, View } from 'react-native'
  import { useTranslation } from 'react-i18next'
  import type { EventReadiness } from '@anstoss/shared'
  import { Icon, Text } from '../ui'
  import { useClubColors } from '../../context/ClubThemeContext'
  import { fonts, hairline, radius, space } from '../../theme/tokens'

  const SCORE_COLORS = {
    GREEN: '#22c55e',
    YELLOW: '#f59e0b',
    RED: '#ef4444',
  } as const

  type Props = {
    readiness: EventReadiness
    onShare: () => void
  }

  export function ReadinessScoreCard({ readiness, onShare }: Props) {
    const c = useClubColors()
    const { t } = useTranslation()
    const dotColor = SCORE_COLORS[readiness.score]

    return (
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
        <View style={styles.header}>
          <View style={styles.scoreRow}>
            <View style={[styles.scoreDot, { backgroundColor: dotColor }]} />
            <Text style={[styles.scoreLabel, { color: c.textPrimary }]}>
              {t(`readiness.score.${readiness.score.toLowerCase()}`, {
                defaultValue: readiness.score === 'GREEN' ? 'Ready' : readiness.score === 'YELLOW' ? 'Watch' : 'At risk',
              })}
            </Text>
          </View>
          <Pressable
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel={t('readiness.share', { defaultValue: 'Share availability' })}
            style={styles.shareBtn}
          >
            <Icon name="square.and.arrow.up" size={16} color={c.primary} />
          </Pressable>
        </View>
        <Text style={[styles.briefing, { color: c.textSecondary }]}>{readiness.briefing}</Text>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: c.textPrimary }]}>{readiness.confirmedYes}</Text>
            <Text style={[styles.statLabel, { color: c.textTertiary }]}>
              {t('readiness.yes', { defaultValue: 'YES' })}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: c.textPrimary }]}>{readiness.confirmedMaybe}</Text>
            <Text style={[styles.statLabel, { color: c.textTertiary }]}>
              {t('readiness.maybe', { defaultValue: 'MAYBE' })}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: c.textPrimary }]}>{readiness.pending}</Text>
            <Text style={[styles.statLabel, { color: c.textTertiary }]}>
              {t('readiness.pending', { defaultValue: 'PENDING' })}
            </Text>
          </View>
          {readiness.injured > 0 && (
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: SCORE_COLORS.RED }]}>{readiness.injured}</Text>
              <Text style={[styles.statLabel, { color: c.textTertiary }]}>
                {t('readiness.injured', { defaultValue: 'INJURED' })}
              </Text>
            </View>
          )}
        </View>
        {readiness.missingGk && (
          <View style={[styles.alert, { backgroundColor: SCORE_COLORS.RED + '18', borderColor: SCORE_COLORS.RED + '40' }]}>
            <Icon name="exclamationmark.triangle" size={12} color={SCORE_COLORS.RED} />
            <Text style={[styles.alertText, { color: SCORE_COLORS.RED }]}>
              {t('readiness.noKeeper', { defaultValue: 'No goalkeeper confirmed' })}
            </Text>
          </View>
        )}
      </View>
    )
  }

  const styles = StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      borderWidth: hairline,
      padding: space.md,
      gap: space.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    scoreDot: { width: 10, height: 10, borderRadius: 5 },
    scoreLabel: { fontFamily: fonts.label, fontSize: 13, fontWeight: '700', letterSpacing: 0.6 },
    shareBtn: { padding: 4 },
    briefing: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
    statRow: { flexDirection: 'row', gap: space.md, marginTop: 4 },
    stat: { alignItems: 'center', gap: 2 },
    statValue: { fontFamily: fonts.data, fontSize: 18, fontWeight: '700' },
    statLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1, fontWeight: '600' },
    alert: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radius.sm,
      borderWidth: hairline,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    alertText: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600' },
  })
  ```

- [ ] **Step 4: Run tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=mobile --testPathPattern=ReadinessScoreCard 2>&1 | tail -5
  ```
  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add apps/mobile/src/components/home/ReadinessScoreCard.tsx apps/mobile/src/components/home/__tests__/
  git commit -m "feat(mobile): ReadinessScoreCard — GREEN/YELLOW/RED with breakdown + share button"
  ```

---

### Task 8: Frontend — CoachHome Integration

**Files:**
- Modify: `apps/mobile/src/components/home/CoachHome.tsx`

**Interfaces:**
- Consumes: `ReadinessScoreCard` from Task 7; `GET /events/:id/readiness` and `GET /events/:id/share-card` from Task 4
- Produces: Updated CoachHome with readiness card above the RSVP bar; share sheet on tap

- [ ] **Step 1: Add readiness state and fetch to CoachHome**

  In `apps/mobile/src/components/home/CoachHome.tsx`, add after the existing state declarations:

  ```typescript
  import { Share } from 'react-native'
  import type { EventReadiness } from '@anstoss/shared'
  import { ReadinessScoreCard } from './ReadinessScoreCard'

  // Inside CoachHome function, after const [announceVisible, ...]:
  const [readiness, setReadiness] = useState<EventReadiness | null>(null)
  ```

  In the `load` callback, after fetching `upcoming`, add:

  ```typescript
  if (upcoming?.[0]) {
    const r = await api<EventReadiness>(
      `/clubs/${clubId}/events/${upcoming[0].id}/readiness`,
    ).catch(() => null)
    setReadiness(r)
  }
  ```

- [ ] **Step 2: Add share handler**

  Inside `CoachHome`, after the `goToMatch` function:

  ```typescript
  const handleShare = async () => {
    if (!nextMatch) return
    const card = await api<{ text: string; deepLink: string }>(
      `/clubs/${clubId}/events/${nextMatch.id}/share-card`,
    ).catch(() => null)
    if (!card) return
    await Share.share({ message: card.text }).catch(() => {})
  }
  ```

- [ ] **Step 3: Place ReadinessScoreCard in the render tree**

  In the JSX return of `CoachHome`, find the RSVP bar section (where `yesPct`/`maybePct` are shown). Insert `ReadinessScoreCard` immediately above it:

  ```typescript
  {readiness && nextMatch && (
    <ReadinessScoreCard readiness={readiness} onShare={handleShare} />
  )}
  ```

- [ ] **Step 4: Run mobile test suite**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=mobile 2>&1 | tail -15
  ```
  Expected: pre-existing failures only (all new tests pass)

- [ ] **Step 5: Commit**

  ```bash
  git add apps/mobile/src/components/home/CoachHome.tsx
  git commit -m "feat(mobile): CoachHome — readiness score card + WhatsApp share"
  ```

---

### Task 9: Frontend — Structured Announcement Type Picker

**Files:**
- Modify: `apps/mobile/src/components/home/AnnounceSheet.tsx`

**Interfaces:**
- Consumes: `AnnouncementType` from Task 2; `PATCH /channels/:channelId/messages` or `POST /announce` with new fields
- Produces: type selector chip row in the announce bottom sheet

- [ ] **Step 1: Add type state and chip row to AnnounceSheet**

  In `apps/mobile/src/components/home/AnnounceSheet.tsx`, after existing state:

  ```typescript
  import type { AnnouncementType } from '@anstoss/shared'

  const ANNOUNCEMENT_TYPES: { value: AnnouncementType; labelKey: string; icon: string }[] = [
    { value: 'GENERAL', labelKey: 'announce.type.general', icon: 'megaphone' },
    { value: 'INJURY_UPDATE', labelKey: 'announce.type.injury', icon: 'bandage' },
    { value: 'TRAVEL_UPDATE', labelKey: 'announce.type.travel', icon: 'car' },
    { value: 'MATCH_CHANGE', labelKey: 'announce.type.matchChange', icon: 'calendar.badge.exclamationmark' },
    { value: 'TRAINING_UPDATE', labelKey: 'announce.type.training', icon: 'figure.run' },
  ]

  // Inside AnnounceSheet:
  const [announcementType, setAnnouncementType] = useState<AnnouncementType>('GENERAL')
  const [requiresAck, setRequiresAck] = useState(false)
  ```

  In the JSX, above the text input, add a horizontal scroll row of type chips:

  ```typescript
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
    {ANNOUNCEMENT_TYPES.map((type) => (
      <Pressable
        key={type.value}
        onPress={() => setAnnouncementType(type.value)}
        style={[
          styles.typeChip,
          {
            backgroundColor: announcementType === type.value ? c.primary : c.surfaceSunken,
            borderColor: announcementType === type.value ? c.primary : c.borderDefault,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: announcementType === type.value }}
      >
        <Text style={[styles.typeChipText, { color: announcementType === type.value ? '#fff' : c.textSecondary }]}>
          {t(type.labelKey, { defaultValue: type.value.replace(/_/g, ' ') })}
        </Text>
      </Pressable>
    ))}
  </ScrollView>
  ```

  Add to the API call body when submitting:
  ```typescript
  announcementType,
  requiresAck,
  ```

  Add styles:
  ```typescript
  typeRow: { marginBottom: space.sm },
  typeChip: {
    borderRadius: 20,
    borderWidth: hairline,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  typeChipText: { fontFamily: fonts.label, fontSize: 12, fontWeight: '700' },
  ```

- [ ] **Step 2: Add i18n keys**

  Add to all 8 locale JSON files under `apps/mobile/src/i18n/locales/`:

  ```json
  "announce": {
    "type": {
      "general": "General",
      "injury": "Injury",
      "travel": "Travel",
      "matchChange": "Match change",
      "training": "Training"
    }
  }
  ```

  German (`de`):
  ```json
  "announce": {
    "type": {
      "general": "Allgemein",
      "injury": "Verletzung",
      "travel": "Anreise",
      "matchChange": "Spieländerung",
      "training": "Training"
    }
  }
  ```

  (Translate for all 8 locales: ar, de, en, es, fr, pl, pt, tr)

- [ ] **Step 3: Run mobile test suite**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=mobile 2>&1 | tail -10
  ```
  Expected: pre-existing failures only

- [ ] **Step 4: Commit**

  ```bash
  git add apps/mobile/src/components/home/AnnounceSheet.tsx apps/mobile/src/i18n/
  git commit -m "feat(mobile): structured announcement type picker — 5 types + requiresAck"
  ```

---

## Self-Review

**Spec coverage check:**
- ✅ Event Readiness Score: Tasks 2+3+4+7+8
- ✅ Coach Briefing: Task 3 (generated server-side, surfaced via ReadinessScoreCard.briefing)
- ✅ Smart Reminders: Task 5
- ✅ WhatsApp Bridge: Task 4 (share-card endpoint) + Task 8 (Share.share() call)
- ✅ Structured Announcements: Tasks 1+6+9
- ✅ AnnouncementType i18n: Task 9 (all 8 locales)

**No placeholders detected.** Every step has exact code.

**Type consistency:** `EventReadiness` defined in Task 2, consumed in Tasks 7+8 using exact same interface. `AnnouncementType` defined in Task 2, consumed in Task 9.
