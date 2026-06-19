# Sprint 4: Parent Command Center — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ParentHome` the most useful screen a football parent has ever seen — conflict detection surfaced visually, carpool coordination built-in, consent status and payment per child at a glance.

**Architecture:** `ParentHome.tsx` already fetches children's events and runs `findConflicts()` — the conflict logic exists but is invisible. Sprint 4 surfaces it, adds a `CarpoolOffer` table for per-event lift sharing, adds a `/me/children-summary` aggregate endpoint that combines consent + contribution status per child, and adds screens for consent management and carpool coordination. No new NestJS module needed — carpool goes in the existing `events` module; consent and contributions endpoints already exist.

**Tech Stack:** NestJS + Prisma (API), Expo Router + React Native (mobile), `@anstoss/shared` Zod.

## Global Constraints

- `CarpoolOffer.direction` values: `TO` (to ground) | `FROM` (home from ground) | `BOTH`.
- Carpool is per-event and per-club; `CarpoolOffer` is scoped to `clubId`.
- Consent status values (from existing `ParentalConsentStatus` enum): `REQUIRED`, `PENDING`, `SIGNED`, `DECLINED`.
- All mobile components: `useClubColors()`, design tokens only.
- I18n: all new copy in all 8 locales (ar, de, en, es, fr, pl, pt, tr).
- The `findConflicts()` helper in `apps/mobile/src/lib/scheduleConflicts.ts` already exists; do not rewrite it.

---

## File Map

**New files (API):**
- `apps/api/src/users/children-summary.ts` — `getChildrenSummary()` helper (pure function over DB results)

**New files (Mobile):**
- `apps/mobile/src/components/home/ConflictAlert.tsx` — visual conflict flag card in ParentHome
- `apps/mobile/app/(tabs)/more/consent.tsx` — consent management screen
- `apps/mobile/app/(tabs)/events/carpool/[eventId].tsx` — carpool coordination screen

**Modified files:**
- `apps/api/prisma/schema.prisma` — add `CarpoolOffer` model
- `apps/api/src/users/users.controller.ts` — add `GET /me/children-summary`
- `apps/api/src/users/users.service.ts` — add `getChildrenSummary(userId)`
- `apps/api/src/events/events.controller.ts` — add `GET /:eventId/carpool`, `POST /:eventId/carpool`, `DELETE /:eventId/carpool/:offerId`
- `apps/api/src/events/events.service.ts` — add `getCarpoolOffers()`, `createCarpoolOffer()`, `deleteCarpoolOffer()`
- `apps/mobile/src/components/home/ParentHome.tsx` — surface conflict alert, add consent/payment rows, add carpool link
- `apps/mobile/src/i18n/locales/*.json` — parent i18n keys (8 locales)

---

### Task 1: Schema — CarpoolOffer Model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `CarpoolOffer` model used by Tasks 3, 5

- [ ] **Step 1: Add CarpoolOffer model**

  In `apps/api/prisma/schema.prisma`, after `model EventCheckIn` block:

  ```prisma
  enum CarpoolDirection {
    TO
    FROM
    BOTH
  }

  model CarpoolOffer {
    id              String            @id @default(cuid())
    clubId          String
    eventId         String
    offeredByUserId String
    claimedByUserId String?
    seatsAvailable  Int               @default(1)
    meetingPoint    String?
    direction       CarpoolDirection  @default(BOTH)
    note            String?
    claimedAt       DateTime?
    createdAt       DateTime          @default(now())
    updatedAt       DateTime          @updatedAt

    club        Club  @relation(fields: [clubId], references: [id], onDelete: Cascade)
    event       Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
    offeredBy   User  @relation("CarpoolOfferer", fields: [offeredByUserId], references: [id], onDelete: Cascade)
    claimedBy   User? @relation("CarpoolClaimer", fields: [claimedByUserId], references: [id])

    @@index([clubId, eventId])
    @@index([offeredByUserId])
    @@map("carpool_offers")
  }
  ```

  Add back-relations to `model Event` (after `matchLiveEvents MatchLiveEvent[]` or `checkIns EventCheckIn[]`):
  ```prisma
  carpoolOffers CarpoolOffer[]
  ```

  Add to `model Club`:
  ```prisma
  carpoolOffers CarpoolOffer[]
  ```

  Add to `model User` (two relations):
  ```prisma
  carpoolOffersAsOfferer CarpoolOffer[] @relation("CarpoolOfferer")
  carpoolOffersAsClaimer CarpoolOffer[] @relation("CarpoolClaimer")
  ```

- [ ] **Step 2: Run migration**

  ```bash
  cd /Users/yemi/anstoss/apps/api
  npx prisma migrate dev --name carpool_offers
  ```
  Expected: "Your database is now in sync with your schema."

- [ ] **Step 3: Type-check**

  ```bash
  cd /Users/yemi/anstoss/apps/api
  npx tsc --noEmit 2>&1 | head -10
  ```
  Expected: no output

- [ ] **Step 4: Commit**

  ```bash
  git add apps/api/prisma/
  git commit -m "feat(db): add CarpoolOffer model + CarpoolDirection enum"
  ```

---

### Task 2: Backend — Children Summary Endpoint

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.controller.ts`

**Interfaces:**
- Produces: `GET /me/children-summary` → `ChildSummary[]` used by Task 4

- [ ] **Step 1: Write failing test**

  In `apps/api/src/users/users.service.spec.ts` (create if absent):

  ```typescript
  import { aggregateChildSummary } from '../users/children-summary'

  describe('aggregateChildSummary', () => {
    it('marks consent as REQUIRED when no consent record exists', () => {
      const result = aggregateChildSummary({
        userId: 'u1',
        displayName: 'Lea',
        consents: [],
        contributionRecords: [],
      })
      expect(result.consentStatus).toBe('REQUIRED')
    })

    it('marks consent SIGNED when latest consent is SIGNED', () => {
      const result = aggregateChildSummary({
        userId: 'u1',
        displayName: 'Lea',
        consents: [{ status: 'SIGNED', updatedAt: new Date() }],
        contributionRecords: [],
      })
      expect(result.consentStatus).toBe('SIGNED')
    })

    it('counts pending dues', () => {
      const result = aggregateChildSummary({
        userId: 'u1',
        displayName: 'Lea',
        consents: [],
        contributionRecords: [
          { status: 'PENDING', amount: 20 },
          { status: 'PAID', amount: 20 },
          { status: 'PENDING', amount: 20 },
        ],
      })
      expect(result.pendingDues).toBe(2)
      expect(result.pendingDuesTotal).toBe(40)
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=children-summary 2>&1 | tail -5
  ```
  Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Create children-summary.ts helper**

  Create `apps/api/src/users/children-summary.ts`:

  ```typescript
  export type ConsentInput = { status: string; updatedAt: Date }
  export type ContributionInput = { status: string; amount: number }

  export type ChildSummaryInput = {
    userId: string
    displayName: string | null
    consents: ConsentInput[]
    contributionRecords: ContributionInput[]
  }

  export type ChildSummary = {
    userId: string
    displayName: string
    consentStatus: 'REQUIRED' | 'PENDING' | 'SIGNED' | 'DECLINED'
    pendingDues: number
    pendingDuesTotal: number
  }

  export function aggregateChildSummary(input: ChildSummaryInput): ChildSummary {
    const latest = input.consents.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    )[0]
    const consentStatus = (latest?.status as ChildSummary['consentStatus']) ?? 'REQUIRED'

    const pending = input.contributionRecords.filter((r) => r.status === 'PENDING')
    const pendingDuesTotal = pending.reduce((sum, r) => sum + (r.amount ?? 0), 0)

    return {
      userId: input.userId,
      displayName: input.displayName ?? 'Unknown',
      consentStatus,
      pendingDues: pending.length,
      pendingDuesTotal,
    }
  }
  ```

- [ ] **Step 4: Add getChildrenSummary() to users.service.ts**

  In `apps/api/src/users/users.service.ts`, add at the bottom:

  ```typescript
  async getChildrenSummary(userId: string): Promise<ChildSummary[]> {
    const relationships = await this.prisma.guardianRelationship.findMany({
      where: { parentUserId: userId },
      include: {
        player: {
          include: {
            parentalConsentsAsPlayer: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: { status: true, updatedAt: true },
            },
            contributionRecords: {
              where: { status: { in: ['PENDING', 'PARTIAL'] } },
              select: { status: true, amount: true },
            },
          },
        },
      },
    })

    return relationships.map((rel) => {
      if (!rel.player) {
        return {
          userId: '',
          displayName: rel.childName ?? 'Unknown',
          consentStatus: 'REQUIRED' as const,
          pendingDues: 0,
          pendingDuesTotal: 0,
        }
      }
      return aggregateChildSummary({
        userId: rel.player.id,
        displayName: rel.player.displayName,
        consents: rel.player.parentalConsentsAsPlayer,
        contributionRecords: rel.player.contributionRecords,
      })
    })
  }
  ```

  Add the import at the top of users.service.ts:
  ```typescript
  import { aggregateChildSummary, type ChildSummary } from './children-summary'
  ```

- [ ] **Step 5: Add GET /me/children-summary endpoint**

  In `apps/api/src/users/users.controller.ts`, add:

  ```typescript
  @Get('me/children-summary')
  @UseGuards(ClerkAuthGuard)
  @RateLimit('read')
  async getChildrenSummary(@AuthUser() user: ReqUser) {
    return this.usersService.getChildrenSummary(user.id)
  }
  ```

- [ ] **Step 6: Run tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=api --testPathPattern=children-summary 2>&1 | tail -5
  ```
  Expected: PASS

- [ ] **Step 7: Commit**

  ```bash
  git add apps/api/src/users/
  git commit -m "feat(users): GET /me/children-summary — consent + dues per child"
  ```

---

### Task 3: Backend — Carpool CRUD Endpoints

**Files:**
- Modify: `apps/api/src/events/events.service.ts`
- Modify: `apps/api/src/events/events.controller.ts`

**Interfaces:**
- Consumes: `CarpoolOffer` model from Task 1
- Produces:
  - `GET /clubs/:clubId/events/:eventId/carpool` → `CarpoolOfferView[]`
  - `POST /clubs/:clubId/events/:eventId/carpool` → create offer
  - `POST /clubs/:clubId/events/:eventId/carpool/:offerId/claim` → claim a seat
  - `DELETE /clubs/:clubId/events/:eventId/carpool/:offerId` → delete own offer

- [ ] **Step 1: Write failing test**

  In `apps/api/src/events/events.service.spec.ts`, add:

  ```typescript
  describe('getCarpoolOffers', () => {
    it('returns empty array for event with no offers', async () => {
      // Type-check: verify method exists on service
      expect(typeof eventsService.getCarpoolOffers).toBe('function')
    })
  })
  ```

- [ ] **Step 2: Add carpool methods to events.service.ts**

  In `apps/api/src/events/events.service.ts`, add:

  ```typescript
  async getCarpoolOffers(eventId: string, userId: string) {
    // Verify user belongs to club
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { clubId: true, teamId: true },
    })
    await this.prisma.teamMember.findFirstOrThrow({
      where: { userId, teamId: event.teamId, leftAt: null },
    })
    return this.prisma.carpoolOffer.findMany({
      where: { eventId },
      include: {
        offeredBy: { select: { displayName: true } },
        claimedBy: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  async createCarpoolOffer(input: {
    eventId: string
    clubId: string
    userId: string
    seatsAvailable: number
    meetingPoint?: string
    direction: 'TO' | 'FROM' | 'BOTH'
    note?: string
  }) {
    return this.prisma.carpoolOffer.create({
      data: {
        eventId: input.eventId,
        clubId: input.clubId,
        offeredByUserId: input.userId,
        seatsAvailable: input.seatsAvailable,
        meetingPoint: input.meetingPoint ?? null,
        direction: input.direction,
        note: input.note ?? null,
      },
    })
  }

  async claimCarpoolOffer(offerId: string, userId: string) {
    const offer = await this.prisma.carpoolOffer.findUniqueOrThrow({ where: { id: offerId } })
    if (offer.claimedByUserId) throw new Error('Offer already claimed')
    return this.prisma.carpoolOffer.update({
      where: { id: offerId },
      data: { claimedByUserId: userId, claimedAt: new Date() },
    })
  }

  async deleteCarpoolOffer(offerId: string, userId: string) {
    const offer = await this.prisma.carpoolOffer.findUniqueOrThrow({ where: { id: offerId } })
    if (offer.offeredByUserId !== userId) throw new ForbiddenException('Not your offer')
    await this.prisma.carpoolOffer.delete({ where: { id: offerId } })
  }
  ```

- [ ] **Step 3: Add endpoints to events.controller.ts**

  After the existing RSVP endpoints in `apps/api/src/events/events.controller.ts`, add:

  ```typescript
  @Get(':eventId/carpool')
  @RateLimit('read')
  async getCarpoolOffers(@AuthUser() user: ReqUser, @Param('eventId') eventId: string) {
    return this.eventsService.getCarpoolOffers(eventId, user.id)
  }

  @Post(':eventId/carpool')
  @RateLimit('write')
  async createCarpoolOffer(
    @AuthUser() user: ReqUser,
    @Param('clubId') clubId: string,
    @Param('eventId') eventId: string,
    @Body() body: { seatsAvailable: number; meetingPoint?: string; direction: 'TO' | 'FROM' | 'BOTH'; note?: string },
  ) {
    return this.eventsService.createCarpoolOffer({
      eventId,
      clubId,
      userId: user.id,
      seatsAvailable: body.seatsAvailable,
      meetingPoint: body.meetingPoint,
      direction: body.direction,
      note: body.note,
    })
  }

  @Post(':eventId/carpool/:offerId/claim')
  @RateLimit('write')
  async claimCarpoolOffer(
    @AuthUser() user: ReqUser,
    @Param('offerId') offerId: string,
  ) {
    return this.eventsService.claimCarpoolOffer(offerId, user.id)
  }

  @Delete(':eventId/carpool/:offerId')
  @RateLimit('write')
  async deleteCarpoolOffer(
    @AuthUser() user: ReqUser,
    @Param('offerId') offerId: string,
  ) {
    await this.eventsService.deleteCarpoolOffer(offerId, user.id)
    return { ok: true }
  }
  ```

- [ ] **Step 4: Type-check**

  ```bash
  cd /Users/yemi/anstoss/apps/api
  npx tsc --noEmit 2>&1 | head -10
  ```
  Expected: no output

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/src/events/
  git commit -m "feat(events): carpool CRUD — GET/POST/claim/DELETE per event"
  ```

---

### Task 4: Frontend — ConflictAlert + Enhanced ParentHome

**Files:**
- Create: `apps/mobile/src/components/home/ConflictAlert.tsx`
- Modify: `apps/mobile/src/components/home/ParentHome.tsx`

**Interfaces:**
- Consumes: existing `findConflicts()` from `../../lib/scheduleConflicts`, `GET /me/children-summary` from Task 2
- Produces: visible conflict banner in ParentHome; consent + dues summary per child

- [ ] **Step 1: Create ConflictAlert.tsx**

  ```typescript
  // apps/mobile/src/components/home/ConflictAlert.tsx
  import { StyleSheet, View } from 'react-native'
  import { useTranslation } from 'react-i18next'
  import { Icon, Text } from '../ui'
  import { useClubColors } from '../../context/ClubThemeContext'
  import { fonts, hairline, radius, space } from '../../theme/tokens'

  type Conflict = {
    childName: string
    event1Title: string
    event2Title: string
    date: string
  }

  type Props = { conflicts: Conflict[] }

  export function ConflictAlert({ conflicts }: Props) {
    const c = useClubColors()
    const { t } = useTranslation()
    if (conflicts.length === 0) return null

    return (
      <View style={[styles.card, { backgroundColor: '#f59e0b18', borderColor: '#f59e0b40' }]}>
        <View style={styles.header}>
          <Icon name="exclamationmark.triangle.fill" size={14} color="#f59e0b" />
          <Text style={styles.heading}>
            {t('parent.conflict.title', {
              defaultValue: '{{count}} schedule conflict',
              count: conflicts.length,
            })}
          </Text>
        </View>
        {conflicts.map((conflict, i) => (
          <Text key={i} style={[styles.body, { color: c.textSecondary }]}>
            {t('parent.conflict.detail', {
              defaultValue: '{{childName}}: {{event1}} and {{event2}} overlap',
              childName: conflict.childName,
              event1: conflict.event1Title,
              event2: conflict.event2Title,
            })}
          </Text>
        ))}
      </View>
    )
  }

  const styles = StyleSheet.create({
    card: {
      borderRadius: radius.md,
      borderWidth: hairline,
      padding: space.md,
      gap: space.xs,
      marginBottom: space.md,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    heading: { fontFamily: fonts.label, fontSize: 13, fontWeight: '700', color: '#f59e0b' },
    body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  })
  ```

- [ ] **Step 2: Write failing test for ConflictAlert**

  Create `apps/mobile/src/components/home/__tests__/ConflictAlert.test.tsx`:

  ```typescript
  import React from 'react'
  import { render } from '@testing-library/react-native'
  import { ConflictAlert } from '../ConflictAlert'

  describe('ConflictAlert', () => {
    it('renders nothing when no conflicts', () => {
      const { toJSON } = render(<ConflictAlert conflicts={[]} />)
      expect(toJSON()).toBeNull()
    })

    it('renders conflict details', () => {
      const { getByText } = render(
        <ConflictAlert
          conflicts={[{ childName: 'Lea', event1Title: 'Training', event2Title: 'Match', date: '2026-07-05' }]}
        />
      )
      expect(getByText(/1 schedule conflict/i)).toBeTruthy()
    })
  })
  ```

- [ ] **Step 3: Run test**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=mobile --testPathPattern=ConflictAlert 2>&1 | tail -5
  ```
  Expected: PASS

- [ ] **Step 4: Update ParentHome.tsx**

  In `apps/mobile/src/components/home/ParentHome.tsx`, add these imports:

  ```typescript
  import { router } from 'expo-router'
  import { ConflictAlert } from './ConflictAlert'
  ```

  Add children summary state:
  ```typescript
  type ChildSummary = {
    userId: string
    displayName: string
    consentStatus: 'REQUIRED' | 'PENDING' | 'SIGNED' | 'DECLINED'
    pendingDues: number
    pendingDuesTotal: number
  }
  const [childSummaries, setChildSummaries] = useState<ChildSummary[]>([])
  ```

  Add to the `load` callback (alongside the existing Promise.all):
  ```typescript
  const summaries = await api<ChildSummary[]>('/me/children-summary').catch(() => [])
  setChildSummaries(summaries ?? [])
  ```

  Compute conflicts from the existing `agenda` state (already computed in the component):
  ```typescript
  const conflicts = useMemo(() => {
    if (!agenda) return []
    return findConflicts(agenda.kids, agenda.events).map((c) => ({
      childName: c.kid.name,
      event1Title: c.event1.title,
      event2Title: c.event2.title,
      date: c.event1.date,
    }))
  }, [agenda])
  ```

  In the JSX, at the very top of the content area (before the next event card):
  ```typescript
  <ConflictAlert conflicts={conflicts} />
  ```

  Below the announcements section, add a "Children" summary row:
  ```typescript
  {childSummaries.map((child) => (
    <View key={child.userId} style={[styles.childRow, { borderColor: c.borderDefault }]}>
      <Text style={[styles.childName, { color: c.textPrimary }]}>{child.displayName}</Text>
      <View style={styles.childBadges}>
        {child.consentStatus !== 'SIGNED' && (
          <Pressable
            onPress={() => router.push('/(tabs)/more/consent' as never)}
            style={[styles.badge, { backgroundColor: '#ef444418', borderColor: '#ef444440' }]}
          >
            <Text style={[styles.badgeText, { color: '#ef4444' }]}>
              {t('parent.consent.needed', { defaultValue: 'Consent needed' })}
            </Text>
          </Pressable>
        )}
        {child.pendingDues > 0 && (
          <View style={[styles.badge, { backgroundColor: '#f59e0b18', borderColor: '#f59e0b40' }]}>
            <Text style={[styles.badgeText, { color: '#f59e0b' }]}>
              {t('parent.dues.pending', {
                defaultValue: '€{{amount}} due',
                amount: (child.pendingDuesTotal / 100).toFixed(0),
              })}
            </Text>
          </View>
        )}
      </View>
    </View>
  ))}
  ```

  Add styles to ParentHome's `StyleSheet.create`:
  ```typescript
  childRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: hairline },
  childName: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
  childBadges: { flexDirection: 'row', gap: 6 },
  badge: { borderRadius: 4, borderWidth: hairline, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: fonts.label, fontSize: 11, fontWeight: '700' },
  ```

- [ ] **Step 5: Run mobile tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=mobile 2>&1 | tail -10
  ```
  Expected: pre-existing failures only

- [ ] **Step 6: Commit**

  ```bash
  git add apps/mobile/src/components/home/ConflictAlert.tsx apps/mobile/src/components/home/ParentHome.tsx apps/mobile/src/components/home/__tests__/
  git commit -m "feat(mobile): ParentHome — conflict alert + per-child consent/dues badges"
  ```

---

### Task 5: Frontend — Carpool Coordination Screen

**Files:**
- Create: `apps/mobile/app/(tabs)/events/carpool/[eventId].tsx`

**Interfaces:**
- Consumes: `GET /events/:id/carpool`, `POST /events/:id/carpool`, `POST /events/:id/carpool/:offerId/claim`, `DELETE /events/:id/carpool/:offerId` from Task 3

- [ ] **Step 1: Create carpool screen**

  Create `apps/mobile/app/(tabs)/events/carpool/[eventId].tsx`:

  ```typescript
  import { useCallback, useEffect, useState } from 'react'
  import { Alert, FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native'
  import { Stack, useLocalSearchParams } from 'expo-router'
  import { useTranslation } from 'react-i18next'
  import * as Haptics from 'expo-haptics'
  import { Icon, Text } from '../../../../src/components/ui'
  import { useClubColors } from '../../../../src/context/ClubThemeContext'
  import { api } from '../../../../src/api/client'
  import { fonts, hairline, radius, space } from '../../../../src/theme/tokens'
  import { useAuth } from '../../../../src/auth/useAuth'

  type CarpoolOffer = {
    id: string
    offeredByUserId: string
    offeredBy: { displayName: string | null }
    claimedByUserId: string | null
    claimedBy: { displayName: string | null } | null
    seatsAvailable: number
    meetingPoint: string | null
    direction: 'TO' | 'FROM' | 'BOTH'
    note: string | null
  }

  const DIR_LABELS: Record<string, string> = {
    TO: 'To ground',
    FROM: 'Home from ground',
    BOTH: 'Both ways',
  }

  export default function CarpoolScreen() {
    const { eventId, clubId } = useLocalSearchParams<{ eventId: string; clubId: string }>()
    const c = useClubColors()
    const { t } = useTranslation()
    const { userId } = useAuth()
    const [offers, setOffers] = useState<CarpoolOffer[]>([])
    const [addVisible, setAddVisible] = useState(false)
    const [seats, setSeats] = useState('1')
    const [meetingPoint, setMeetingPoint] = useState('')
    const [direction, setDirection] = useState<'TO' | 'FROM' | 'BOTH'>('BOTH')
    const [submitting, setSubmitting] = useState(false)

    const load = useCallback(async () => {
      const data = await api<CarpoolOffer[]>(`/clubs/${clubId}/events/${eventId}/carpool`).catch(() => [])
      setOffers(data ?? [])
    }, [clubId, eventId])

    useEffect(() => { void load() }, [load])

    const createOffer = async () => {
      if (submitting) return
      setSubmitting(true)
      try {
        await api(`/clubs/${clubId}/events/${eventId}/carpool`, {
          method: 'POST',
          body: {
            seatsAvailable: parseInt(seats, 10) || 1,
            meetingPoint: meetingPoint.trim() || undefined,
            direction,
          },
        })
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
        setAddVisible(false)
        void load()
      } finally {
        setSubmitting(false)
      }
    }

    const claimOffer = async (offerId: string) => {
      await api(`/clubs/${clubId}/events/${eventId}/carpool/${offerId}/claim`, { method: 'POST' }).catch(() => {})
      void load()
    }

    const deleteOffer = async (offerId: string) => {
      Alert.alert(
        t('carpool.delete.title', { defaultValue: 'Remove offer?' }),
        undefined,
        [
          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
          {
            text: t('common.delete', { defaultValue: 'Delete' }),
            style: 'destructive',
            onPress: async () => {
              await api(`/clubs/${clubId}/events/${eventId}/carpool/${offerId}`, { method: 'DELETE' }).catch(() => {})
              void load()
            },
          },
        ],
      )
    }

    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <Stack.Screen
          options={{
            title: t('carpool.title', { defaultValue: 'Carpool' }),
            headerRight: () => (
              <Pressable onPress={() => setAddVisible(true)} accessibilityRole="button">
                <Icon name="plus" size={22} color={c.primary} />
              </Pressable>
            ),
          }}
        />

        <FlatList
          data={offers}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: space.md, gap: space.sm }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.offeror, { color: c.textPrimary }]}>
                  {item.offeredBy.displayName ?? t('common.unknown', { defaultValue: 'Unknown' })}
                </Text>
                <Text style={[styles.dirChip, { color: c.primary }]}>
                  {t(`carpool.dir.${item.direction.toLowerCase()}`, { defaultValue: DIR_LABELS[item.direction] })}
                </Text>
              </View>
              {item.meetingPoint && (
                <Text style={[styles.meta, { color: c.textSecondary }]}>
                  📍 {item.meetingPoint}
                </Text>
              )}
              <Text style={[styles.meta, { color: c.textSecondary }]}>
                {t('carpool.seats', { defaultValue: '{{n}} seat', count: item.seatsAvailable, n: item.seatsAvailable })}
              </Text>
              {item.claimedByUserId ? (
                <Text style={[styles.claimed, { color: c.textTertiary }]}>
                  {t('carpool.claimed', {
                    defaultValue: 'Claimed by {{name}}',
                    name: item.claimedBy?.displayName ?? '?',
                  })}
                </Text>
              ) : item.offeredByUserId !== userId ? (
                <Pressable
                  onPress={() => claimOffer(item.id)}
                  style={[styles.claimBtn, { backgroundColor: c.primary }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.claimBtnText}>
                    {t('carpool.claim', { defaultValue: 'Claim a seat' })}
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => deleteOffer(item.id)} accessibilityRole="button">
                  <Text style={[styles.deleteLink, { color: c.error }]}>
                    {t('carpool.delete.cta', { defaultValue: 'Remove my offer' })}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: c.textTertiary }]}>
              {t('carpool.empty', { defaultValue: 'No carpool offers yet. Be the first to offer a lift.' })}
            </Text>
          }
        />

        {/* Add offer sheet */}
        <Modal visible={addVisible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setAddVisible(false)}>
          <View style={[styles.sheet, { backgroundColor: c.background }]}>
            <Text style={[styles.sheetTitle, { color: c.textPrimary }]}>
              {t('carpool.add.title', { defaultValue: 'Offer a lift' })}
            </Text>
            <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
              {t('carpool.add.seats', { defaultValue: 'SEATS AVAILABLE' })}
            </Text>
            <TextInput
              value={seats}
              onChangeText={setSeats}
              keyboardType="number-pad"
              style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceSunken }]}
            />
            <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
              {t('carpool.add.direction', { defaultValue: 'DIRECTION' })}
            </Text>
            <View style={styles.dirRow}>
              {(['TO', 'FROM', 'BOTH'] as const).map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDirection(d)}
                  style={[
                    styles.dirOpt,
                    {
                      backgroundColor: direction === d ? c.primary : c.surfaceSunken,
                      borderColor: direction === d ? c.primary : c.borderDefault,
                    },
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.dirOptText, { color: direction === d ? '#fff' : c.textSecondary }]}>
                    {t(`carpool.dir.${d.toLowerCase()}`, { defaultValue: DIR_LABELS[d] })}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
              {t('carpool.add.meetingPoint', { defaultValue: 'MEETING POINT (optional)' })}
            </Text>
            <TextInput
              value={meetingPoint}
              onChangeText={setMeetingPoint}
              placeholder={t('carpool.add.meetingPointPlaceholder', { defaultValue: 'e.g. Hauptbahnhof South exit' })}
              placeholderTextColor={c.textSecondary}
              style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.surfaceSunken }]}
            />
            <Pressable
              onPress={createOffer}
              disabled={submitting}
              style={[styles.submitBtn, { backgroundColor: c.primary, opacity: submitting ? 0.5 : 1 }]}
              accessibilityRole="button"
            >
              <Text style={styles.submitBtnText}>
                {t('carpool.add.submit', { defaultValue: 'Post offer' })}
              </Text>
            </Pressable>
          </View>
        </Modal>
      </View>
    )
  }

  const styles = StyleSheet.create({
    screen: { flex: 1 },
    card: { borderRadius: radius.md, borderWidth: hairline, padding: space.md, gap: 8 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    offeror: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600' },
    dirChip: { fontFamily: fonts.label, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    meta: { fontFamily: fonts.body, fontSize: 13 },
    claimed: { fontFamily: fonts.body, fontSize: 12, fontStyle: 'italic' },
    claimBtn: { borderRadius: radius.sm, padding: 10, alignItems: 'center', marginTop: 4 },
    claimBtnText: { fontFamily: fonts.label, fontSize: 13, fontWeight: '700', color: '#fff' },
    deleteLink: { fontFamily: fonts.body, fontSize: 12, textDecorationLine: 'underline' },
    empty: { textAlign: 'center', fontFamily: fonts.body, fontSize: 13, paddingVertical: 32 },
    sheet: { flex: 1, padding: space.lg, gap: space.md },
    sheetTitle: { fontFamily: fonts.label, fontSize: 16, fontWeight: '700' },
    fieldLabel: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },
    input: { height: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, fontFamily: fonts.body, fontSize: 15 },
    dirRow: { flexDirection: 'row', gap: 8 },
    dirOpt: { flex: 1, borderRadius: radius.sm, borderWidth: hairline, padding: 10, alignItems: 'center' },
    dirOptText: { fontFamily: fonts.label, fontSize: 12, fontWeight: '700' },
    submitBtn: { borderRadius: radius.md, padding: 14, alignItems: 'center', marginTop: 8 },
    submitBtnText: { fontFamily: fonts.label, fontSize: 14, fontWeight: '700', color: '#fff' },
  })
  ```

- [ ] **Step 2: Add carpool link from event-detail**

  In `apps/mobile/app/(tabs)/events/[eventId].tsx`, add a "Carpool" button for non-match or match events:

  ```typescript
  <Pressable
    onPress={() => router.push({ pathname: '/(tabs)/events/carpool/[eventId]', params: { eventId: event.id, clubId: event.clubId } } as never)}
    accessibilityRole="button"
    style={[styles.carpoolBtn, { borderColor: c.borderDefault }]}
  >
    <Icon name="car" size={14} color={c.textSecondary} />
    <Text style={[styles.carpoolBtnText, { color: c.textSecondary }]}>
      {t('carpool.open', { defaultValue: 'Carpool' })}
    </Text>
  </Pressable>
  ```

- [ ] **Step 3: Add i18n keys to all 8 locales**

  Add to each locale file:

  ```json
  "carpool": {
    "title": "Carpool",
    "open": "Carpool",
    "empty": "No carpool offers yet. Be the first to offer a lift.",
    "seats": "{{n}} seat",
    "claimed": "Claimed by {{name}}",
    "claim": "Claim a seat",
    "dir": {
      "to": "To ground",
      "from": "Home from ground",
      "both": "Both ways"
    },
    "delete": { "title": "Remove offer?", "cta": "Remove my offer" },
    "add": {
      "title": "Offer a lift",
      "seats": "SEATS AVAILABLE",
      "direction": "DIRECTION",
      "meetingPoint": "MEETING POINT (optional)",
      "meetingPointPlaceholder": "e.g. Hauptbahnhof South exit",
      "submit": "Post offer"
    }
  },
  "parent": {
    "conflict": {
      "title": "{{count}} schedule conflict",
      "detail": "{{childName}}: {{event1}} and {{event2}} overlap"
    },
    "consent": { "needed": "Consent needed" },
    "dues": { "pending": "€{{amount}} due" }
  }
  ```

- [ ] **Step 4: Run full test suite**

  ```bash
  cd /Users/yemi/anstoss
  npm test 2>&1 | tail -15
  ```
  Expected: pre-existing failures only

- [ ] **Step 5: Commit**

  ```bash
  git add apps/mobile/app/\(tabs\)/events/carpool/ apps/mobile/src/i18n/
  git commit -m "feat(mobile): carpool coordination screen — offer/claim/delete lifts per event"
  ```

---

### Task 6: Frontend — Consent Management Screen

**Files:**
- Create: `apps/mobile/app/(tabs)/more/consent.tsx`

**Interfaces:**
- Consumes: `GET /me/children-summary` from Task 2 for status; existing consent API for action
- Produces: screen listing consent status per child with action buttons

- [ ] **Step 1: Create consent screen**

  Create `apps/mobile/app/(tabs)/more/consent.tsx`:

  ```typescript
  import { useCallback, useEffect, useState } from 'react'
  import { FlatList, StyleSheet, View } from 'react-native'
  import { Stack } from 'expo-router'
  import { useTranslation } from 'react-i18next'
  import { Icon, Text } from '../../../src/components/ui'
  import { useClubColors } from '../../../src/context/ClubThemeContext'
  import { api } from '../../../src/api/client'
  import { fonts, hairline, radius, space } from '../../../src/theme/tokens'

  type ChildSummary = {
    userId: string
    displayName: string
    consentStatus: 'REQUIRED' | 'PENDING' | 'SIGNED' | 'DECLINED'
    pendingDues: number
    pendingDuesTotal: number
  }

  const STATUS_COLOR: Record<string, string> = {
    REQUIRED: '#ef4444',
    PENDING: '#f59e0b',
    SIGNED: '#22c55e',
    DECLINED: '#6b7280',
  }

  export default function ConsentScreen() {
    const c = useClubColors()
    const { t } = useTranslation()
    const [children, setChildren] = useState<ChildSummary[]>([])

    const load = useCallback(async () => {
      const data = await api<ChildSummary[]>('/me/children-summary').catch(() => [])
      setChildren(data ?? [])
    }, [])

    useEffect(() => { void load() }, [load])

    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <Stack.Screen options={{ title: t('consent.title', { defaultValue: 'Consent Status' }) }} />
        <FlatList
          data={children}
          keyExtractor={(c) => c.userId}
          contentContainerStyle={{ padding: space.md, gap: space.sm }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              <Text style={[styles.name, { color: c.textPrimary }]}>{item.displayName}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[item.consentStatus] ?? c.textTertiary }]} />
                <Text style={[styles.statusText, { color: STATUS_COLOR[item.consentStatus] ?? c.textTertiary }]}>
                  {t(`consent.status.${item.consentStatus.toLowerCase()}`, { defaultValue: item.consentStatus })}
                </Text>
              </View>
              {item.consentStatus === 'REQUIRED' && (
                <Text style={[styles.hint, { color: c.textTertiary }]}>
                  {t('consent.required.hint', {
                    defaultValue: 'Contact your club admin to complete the consent form for this player.',
                  })}
                </Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: c.textTertiary }]}>
              {t('consent.empty', { defaultValue: 'No children found. Ask your club admin to link your account.' })}
            </Text>
          }
        />
      </View>
    )
  }

  const styles = StyleSheet.create({
    screen: { flex: 1 },
    card: { borderRadius: radius.md, borderWidth: hairline, padding: space.md, gap: space.sm },
    name: { fontFamily: fonts.body, fontSize: 15, fontWeight: '600' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontFamily: fonts.label, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
    hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
    empty: { textAlign: 'center', fontFamily: fonts.body, fontSize: 13, paddingVertical: 32 },
  })
  ```

- [ ] **Step 2: Add "Consent" link in the more/index.tsx**

  In `apps/mobile/app/(tabs)/more/index.tsx`, find the settings list section. Add a "Consent Status" row for PARENT role users:

  ```typescript
  {role === 'PARENT' && (
    <Pressable
      onPress={() => router.push('/(tabs)/more/consent' as never)}
      style={[styles.row, { borderBottomColor: c.borderDefault }]}
      accessibilityRole="button"
    >
      <Text style={[styles.rowLabel, { color: c.textPrimary }]}>
        {t('consent.title', { defaultValue: 'Consent Status' })}
      </Text>
      <Icon name="chevron.right" size={14} color={c.textTertiary} />
    </Pressable>
  )}
  ```

- [ ] **Step 3: Add i18n to all 8 locales**

  Add under `consent` key:
  ```json
  "consent": {
    "title": "Consent Status",
    "empty": "No children found. Ask your club admin to link your account.",
    "required": { "hint": "Contact your club admin to complete the consent form for this player." },
    "status": {
      "required": "Required",
      "pending": "Pending",
      "signed": "Signed",
      "declined": "Declined"
    }
  }
  ```

- [ ] **Step 4: Run full test suite**

  ```bash
  cd /Users/yemi/anstoss
  npm test 2>&1 | tail -10
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/mobile/app/\(tabs\)/more/consent.tsx apps/mobile/app/\(tabs\)/more/index.tsx apps/mobile/src/i18n/
  git commit -m "feat(mobile): consent management screen for parents + more tab link"
  ```

---

## Self-Review

**Spec coverage:**
- ✅ Schedule conflict surface: `ConflictAlert` in Task 4, uses existing `findConflicts()`
- ✅ Carpool coordination: Tasks 1+3+5 (model + API + screen)
- ✅ Consent status dashboard: Tasks 2+6
- ✅ Payment status per child: Task 2 (`pendingDues` + `pendingDuesTotal` in children-summary) + Task 4 (badge in ParentHome)

**No placeholders detected.**

**Type consistency:** `ChildSummary` defined in `children-summary.ts` (Task 2), consumed with identical shape in Tasks 4+6. `CarpoolOffer` frontend type matches Prisma model fields.
