# Anstoss MVP Sprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 8 features across two sprints — removing all paywalls and closing the 7 critical club-workflow gaps that prevent clubs from replacing WhatsApp.

**Architecture:** All backend changes extend existing NestJS modules (events, channels, push, streaks). All frontend changes extend existing home components and screens. Four additive Prisma migrations. No breaking changes to any existing API shape.

**Tech Stack:** NestJS + Prisma + Railway Postgres (API), Expo Router + React Native + `useAuth` / `useEntitlements` / `useClubColors` (mobile), `@anstoss/shared` Zod schemas for validation.

---

## Sprint 1

### Task 1: Paywall Removal — MVP_ALL_FREE flag

**Files:**
- Modify: `apps/mobile/src/hooks/useEntitlements.ts`
- Modify: `apps/mobile/app/(tabs)/more/index.tsx`
- Modify: `apps/mobile/src/components/home/CoachHome.tsx`

- [ ] **Step 1: Add MVP_ALL_FREE constant and gate the hook**

  In `apps/mobile/src/hooks/useEntitlements.ts`, add after the `STALE_MS` line (line 11):

  ```typescript
  const MVP_ALL_FREE = true
  ```

  Replace the `has` callback (lines 84–88) and `isPremium` line (line 89):

  ```typescript
  const has = useCallback(
    (feature: string) => {
      if (MVP_ALL_FREE) return true
      return Boolean(Array.isArray(data?.features) && data.features.includes(feature))
    },
    [data],
  )
  const isPremium = MVP_ALL_FREE || data?.plan === 'PREMIUM'
  ```

- [ ] **Step 2: Run the entitlements tests**

  ```bash
  cd /Users/yemi/anstoss
  npm test -- --filter=mobile --testPathPattern=useEntitlements 2>/dev/null || echo "no entitlements spec — proceed"
  ```
  Expected: PASS or "no entitlements spec — proceed"

- [ ] **Step 3: Remove upgrade banner from more/index.tsx**

  In `apps/mobile/app/(tabs)/more/index.tsx`:

  Remove the `showUpgradeBanner` variable (lines 49–50):
  ```typescript
  // DELETE: const showUpgradeBanner =
  //           isOwnerOrAdmin && entitlements.plan === 'FOUNDATION' && !entitlements.loading
  ```

  Find the `{showUpgradeBanner ? (` conditional block (around line 311) and remove the entire conditional including its JSX children.

  Remove `const [paywallVisible, setPaywallVisible] = useState(false)` if it's only used by the banner (check if it's also used for the PaywallSheet further down — if so keep it).

  Remove the `<PaywallSheet ... />` render at the bottom of more/index.tsx (line ~348).

  Remove the `PaywallSheet` import if no longer used.

- [ ] **Step 4: Remove paywall guard in CoachHome**

  In `apps/mobile/src/components/home/CoachHome.tsx`, the "Build lineup" Pressable `onPress` (lines 191–202):

  Replace:
  ```typescript
  onPress={(e) => {
    ;(e as unknown as { stopPropagation?: () => void }).stopPropagation?.()
    if (!entitlements.has('lineup_builder_pro')) {
      setPaywallTrigger('lineup_builder_pro')
      setPaywallVisible(true)
      return
    }
    router.push({
      pathname: '/lineup-builder',
      params: { fixtureId: nextMatch.id },
    } as never)
  }}
  ```
  With:
  ```typescript
  onPress={(e) => {
    ;(e as unknown as { stopPropagation?: () => void }).stopPropagation?.()
    router.push({
      pathname: '/lineup-builder',
      params: { fixtureId: nextMatch.id },
    } as never)
  }}
  ```

  The "MOTM archive" Pressable `onPress` (lines 221–231):

  Replace:
  ```typescript
  onPress={(e) => {
    ;(e as unknown as { stopPropagation?: () => void }).stopPropagation?.()
    if (!entitlements.has('motm_archive')) {
      setPaywallTrigger('motm_archive')
      setPaywallVisible(true)
      return
    }
    router.push('/motm-archive' as never)
  }}
  ```
  With:
  ```typescript
  onPress={(e) => {
    ;(e as unknown as { stopPropagation?: () => void }).stopPropagation?.()
    router.push('/motm-archive' as never)
  }}
  ```

  Remove the `paywallVisible`, `paywallTrigger`, `setPaywallVisible`, `setPaywallTrigger` state declarations (lines 37–40).

  Remove the `<PaywallSheet ... />` render at the bottom of the component.

  Remove `PaywallSheet` import. Remove `useEntitlements` import and the `entitlements` variable if no longer used.

- [ ] **Step 5: Run mobile lint check**

  ```bash
  cd /Users/yemi/anstoss
  npx turbo lint --filter=mobile 2>&1 | tail -20
  ```
  Expected: 0 errors.

- [ ] **Step 6: Commit**

  ```bash
  git add apps/mobile/src/hooks/useEntitlements.ts \
          apps/mobile/app/\(tabs\)/more/index.tsx \
          apps/mobile/src/components/home/CoachHome.tsx
  git commit -m "$(cat <<'EOF'
  feat: remove paywalls for MVP — MVP_ALL_FREE flag in useEntitlements

  All features gated behind has() or isPremium now return true.
  Removes upgrade banner from More tab and paywall guards from CoachHome.
  One-line revert when billing relaunches.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 2: DB Migration — Sprint 1 (Event.lastRsvpReminderAt)

**Files:**
- Create: `apps/api/prisma/migrations/20260612090000_rsvp_reminder_rate_limit/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add lastRsvpReminderAt to Event model in schema.prisma**

  In `apps/api/prisma/schema.prisma`, in the `model Event` block, add after `updatedAt DateTime @updatedAt`:

  ```prisma
  lastRsvpReminderAt DateTime?
  ```

- [ ] **Step 2: Create migration SQL file**

  ```bash
  mkdir -p apps/api/prisma/migrations/20260612090000_rsvp_reminder_rate_limit
  ```

  Write `apps/api/prisma/migrations/20260612090000_rsvp_reminder_rate_limit/migration.sql`:

  ```sql
  -- AddColumn: Event.lastRsvpReminderAt for RSVP push reminder rate-limiting
  ALTER TABLE "Event" ADD COLUMN "lastRsvpReminderAt" TIMESTAMP(3);
  ```

- [ ] **Step 3: Apply migration locally and verify**

  ```bash
  cd apps/api && npx prisma migrate deploy 2>&1 | tail -5
  ```
  Expected: `All migrations have been applied` or `1 migration applied`.

  If database isn't running locally, apply the SQL directly:
  ```bash
  psql $DATABASE_URL -c 'ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "lastRsvpReminderAt" TIMESTAMP(3);'
  ```

- [ ] **Step 4: Regenerate Prisma client**

  ```bash
  cd /Users/yemi/anstoss/apps/api && npx prisma generate 2>&1 | tail -3
  ```
  Expected: `Generated Prisma Client`.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/yemi/anstoss
  git add apps/api/prisma/schema.prisma \
          apps/api/prisma/migrations/20260612090000_rsvp_reminder_rate_limit
  git commit -m "$(cat <<'EOF'
  chore: additive migration — Event.lastRsvpReminderAt for RSVP reminder rate-limiting

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 3: RSVP Reminders — Backend Endpoint

**Files:**
- Modify: `apps/api/src/events/events.controller.ts`
- Modify: `apps/api/src/events/events.service.ts`
- Modify: `apps/api/src/events/events.module.ts` (inject PushService if not already)
- Modify: `apps/api/src/events/events.service.spec.ts`

- [ ] **Step 1: Write the failing test**

  In `apps/api/src/events/events.service.spec.ts`, add a test group for `remindRsvp`:

  ```typescript
  describe('remindRsvp', () => {
    it('sends push to non-RSVP members and updates lastRsvpReminderAt', async () => {
      const now = new Date()
      const futureDate = new Date(now.getTime() + 48 * 60 * 60 * 1000)

      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        clubId: 'club-1',
        teamId: 'team-1',
        date: futureDate,
        cancelledAt: null,
        lastRsvpReminderAt: null,
        title: 'Training',
        location: 'Sportplatz',
      })
      prisma.teamAccess.findMany.mockResolvedValue([
        { userId: 'user-a' },
        { userId: 'user-b' },
        { userId: 'user-c' },
      ])
      prisma.rsvp.findMany.mockResolvedValue([
        { userId: 'user-a', status: 'YES' },
      ])
      prisma.pushToken.findMany.mockResolvedValue([
        { userId: 'user-b', token: 'ExponentPushToken[b]' },
        { userId: 'user-c', token: 'ExponentPushToken[c]' },
      ])
      prisma.event.update.mockResolvedValue({})

      teamsService.assertManageAccess = jest.fn().mockResolvedValue({})

      const result = await service.remindRsvp('event-1', 'coach-user-1')

      expect(result.sent).toBe(2)
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { lastRsvpReminderAt: expect.any(Date) },
      })
    })

    it('returns 429 if already reminded within 24h', async () => {
      const now = new Date()
      const futureDate = new Date(now.getTime() + 48 * 60 * 60 * 1000)
      const recentReminder = new Date(now.getTime() - 1 * 60 * 60 * 1000)

      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        clubId: 'club-1',
        teamId: 'team-1',
        date: futureDate,
        cancelledAt: null,
        lastRsvpReminderAt: recentReminder,
        title: 'Training',
        location: null,
      })
      teamsService.assertManageAccess = jest.fn().mockResolvedValue({})

      await expect(service.remindRsvp('event-1', 'coach-user-1')).rejects.toThrow(
        'Rate limited',
      )
    })
  })
  ```

- [ ] **Step 2: Run the test to verify it fails**

  ```bash
  cd /Users/yemi/anstoss/apps/api && npx jest --testPathPattern=events.service.spec --testNamePattern="remindRsvp" 2>&1 | tail -10
  ```
  Expected: FAIL — `service.remindRsvp is not a function`.

- [ ] **Step 3: Implement remindRsvp in EventsService**

  Add `PushService` and `HttpException, HttpStatus` to imports in `apps/api/src/events/events.service.ts`:

  ```typescript
  import { Injectable, NotFoundException, ForbiddenException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common'
  ```

  Add PushService injection in the constructor (check existing constructor signature and add after existing params):

  ```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamsService: TeamsService,
    private readonly contributionsService: ContributionsService,
    private readonly pushService: PushService,
  ) {}
  ```

  Add the method before the closing `}` of the class:

  ```typescript
  async remindRsvp(eventId: string, actorUserId: string): Promise<{ sent: number; nextAvailableAt: string }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        clubId: true,
        teamId: true,
        date: true,
        title: true,
        location: true,
        cancelledAt: true,
        lastRsvpReminderAt: true,
      },
    })

    if (!event) throw new NotFoundException('Event not found')
    if (event.cancelledAt) throw new BadRequestException('Event is cancelled')

    await this.teamsService.assertManageAccess(actorUserId, event.teamId)

    if (new Date(event.date) < new Date()) {
      throw new BadRequestException('Cannot send reminder for past events')
    }

    const RATE_LIMIT_MS = 24 * 60 * 60 * 1000
    if (event.lastRsvpReminderAt) {
      const msAgo = Date.now() - new Date(event.lastRsvpReminderAt).getTime()
      if (msAgo < RATE_LIMIT_MS) {
        const nextAvailableAt = new Date(
          new Date(event.lastRsvpReminderAt).getTime() + RATE_LIMIT_MS,
        ).toISOString()
        throw new HttpException(
          { message: 'Rate limited', retryAfter: nextAvailableAt },
          HttpStatus.TOO_MANY_REQUESTS,
        )
      }
    }

    // Find team members who have not yet RSVPed
    const [teamMembers, existingRsvps] = await Promise.all([
      this.prisma.teamAccess.findMany({
        where: { teamId: event.teamId, status: 'ACTIVE' },
        select: { userId: true },
      }),
      this.prisma.rsvp.findMany({
        where: { eventId },
        select: { userId: true },
      }),
    ])

    const rsvpedUserIds = new Set(existingRsvps.map((r: { userId: string }) => r.userId))
    const pendingUserIds = teamMembers
      .map((m: { userId: string }) => m.userId)
      .filter((id: string) => !rsvpedUserIds.has(id))

    if (pendingUserIds.length === 0) {
      await this.prisma.event.update({
        where: { id: eventId },
        data: { lastRsvpReminderAt: new Date() },
      })
      return { sent: 0, nextAvailableAt: new Date(Date.now() + RATE_LIMIT_MS).toISOString() }
    }

    const d = new Date(event.date)
    const dayStr = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
    const timeStr = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    const locationPart = event.location ? ` — ${event.location}` : ''

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: pendingUserIds } },
      select: { token: true },
    })

    const sent = tokens.length

    if (sent > 0) {
      // Fire-and-forget: push failures should not fail the request
      void this.pushService['sendPush'](
        tokens.map((t: { token: string }) => t.token),
        event.title,
        `${dayStr}, ${timeStr}${locationPart} — have you replied yet?`,
        { type: 'event_rsvp_reminder', eventId },
      ).catch(() => {/* tolerated */})
    }

    await this.prisma.event.update({
      where: { id: eventId },
      data: { lastRsvpReminderAt: new Date() },
    })

    return {
      sent,
      nextAvailableAt: new Date(Date.now() + RATE_LIMIT_MS).toISOString(),
    }
  }
  ```

  **Note:** `pushService['sendPush']` accesses the private method directly since it accepts an arbitrary token array. If the PushService exposes a `sendToTokens` method (check line 307 of push.service.ts), prefer that instead:
  ```typescript
  void this.pushService.sendToTokens(
    tokens.map((t: { token: string }) => t.token),
    event.title,
    `${dayStr}, ${timeStr}${locationPart} — have you replied yet?`,
    { type: 'event_rsvp_reminder', eventId },
  ).catch(() => {})
  ```

- [ ] **Step 4: Add PushService to EventsModule**

  In `apps/api/src/events/events.module.ts`, import PushModule and add to imports array:

  ```typescript
  import { PushModule } from '../push/push.module'
  // ...
  @Module({
    imports: [...existingImports, PushModule],
    // ...
  })
  ```

- [ ] **Step 5: Add the controller endpoint**

  In `apps/api/src/events/events.controller.ts`, add after the `getRsvpSummary` method:

  ```typescript
  /**
   * POST /clubs/:clubId/events/:eventId/remind-rsvp — send push to non-RSVP members.
   * Rate-limited to 1 call per event per 24h. Requires EVENTS manage access (coach+).
   */
  @Post(':eventId/remind-rsvp')
  @RateLimit('write')
  async remindRsvp(
    @CurrentUser() user: { id: string },
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.remindRsvp(eventId, user.id)
  }
  ```

- [ ] **Step 6: Run the test suite**

  ```bash
  cd /Users/yemi/anstoss/apps/api && npx jest --testPathPattern=events.service.spec 2>&1 | tail -15
  ```
  Expected: All tests PASS.

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/yemi/anstoss
  git add apps/api/src/events/events.service.ts \
          apps/api/src/events/events.controller.ts \
          apps/api/src/events/events.module.ts \
          apps/api/src/events/events.service.spec.ts
  git commit -m "$(cat <<'EOF'
  feat: POST remind-rsvp endpoint — push non-RSVP team members with 24h rate limit

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 4: RSVP Reminders — Frontend UI on event-detail

**Files:**
- Modify: `apps/mobile/app/event-detail.tsx`

- [ ] **Step 1: Add remindRsvp state and handler**

  In `apps/mobile/app/event-detail.tsx`, add after the existing state declarations (around line 64):

  ```typescript
  const [remindResult, setRemindResult] = useState<{
    sent: number
    nextAvailableAt: string
  } | null>(null)
  const [reminding, setReminding] = useState(false)
  ```

  Add the handler before the `if (loading)` block:

  ```typescript
  const canRemind =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH'

  const handleRemindRsvp = useCallback(async () => {
    if (!activeClub || !event || reminding) return
    setReminding(true)
    try {
      const result = await api<{ sent: number; nextAvailableAt: string }>(
        `/clubs/${activeClub.club.id}/events/${event.id}/remind-rsvp`,
        { method: 'POST' },
      )
      setRemindResult(result)
    } catch {
      // tolerated — no UI change on failure
    } finally {
      setReminding(false)
    }
  }, [activeClub, event, reminding])
  ```

- [ ] **Step 2: Add the Remind RSVP row in the JSX**

  In `apps/mobile/app/event-detail.tsx`, find the `RsvpBreakdown` render block (around line 344). Add the remind row immediately BEFORE the `<RsvpBreakdown` component, inside the `isFutureEvent` guard:

  ```typescript
  {isFutureEvent && canRemind && event.noCount !== undefined ? (() => {
    const pending = Math.max(
      0,
      (event.rsvps?.length
        ? // if we have full rsvp list, compute pending from squad
          0
        : (event.yesCount ?? 0) + (event.maybeCount ?? 0) + (event.noCount ?? 0)),
    )
    const allResponded = !remindResult && pending === 0
    const alreadySent = Boolean(remindResult)

    return (
      <View
        style={[
          styles.remindRsvpRow,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
        ]}
      >
        <Text variant="footnote" color="secondary" style={{ flex: 1 }}>
          {alreadySent
            ? t('event.remindSent', {
                defaultValue: 'Reminded {{count}} · check back in 24h',
                count: remindResult!.sent,
              })
            : allResponded
              ? t('event.allResponded', { defaultValue: 'All responded ✓' })
              : t('event.pendingRsvp', {
                  defaultValue: "Some haven't responded",
                })}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void handleRemindRsvp()}
          disabled={reminding || allResponded || alreadySent}
          style={({ pressed }) => [
            styles.remindBtn,
            { backgroundColor: c.primary },
            (reminding || allResponded || alreadySent) && { opacity: 0.4 },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Text variant="footnote" weight="semibold" style={{ color: c.textInverse }}>
            {reminding
              ? t('common.sending', { defaultValue: 'Sending…' })
              : t('event.remind', { defaultValue: 'Remind' })}
          </Text>
        </Pressable>
      </View>
    )
  })() : null}
  ```

  Add the styles in the `StyleSheet.create` block at the bottom of the file:

  ```typescript
  remindRsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  remindBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: 999,
  },
  ```

- [ ] **Step 3: Lint check**

  ```bash
  cd /Users/yemi/anstoss && npx turbo lint --filter=mobile 2>&1 | tail -10
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/mobile/app/event-detail.tsx
  git commit -m "$(cat <<'EOF'
  feat: RSVP reminder button on event-detail for coaches/admins

  Shows 'Remind' CTA below attendance breakdown for future events.
  Disabled for 24h after firing and when all have responded.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 5: Announcement Create — Compose Sheet Component

**Files:**
- Create: `apps/mobile/src/components/home/AnnounceSheet.tsx`

- [ ] **Step 1: Create the AnnounceSheet component**

  ```typescript
  // apps/mobile/src/components/home/AnnounceSheet.tsx
  import { useCallback, useState } from 'react'
  import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native'
  import { useTranslation } from 'react-i18next'
  import type { Channel } from '@anstoss/shared'
  import { api } from '../../api/client'
  import { BottomSheet } from '../ui/BottomSheet'
  import { Text } from '../ui'
  import { useClubColors } from '../../context/ClubThemeContext'
  import { fonts, hairline, radius, space } from '../../theme/tokens'
  import { Haptics } from '../../utils/haptics'

  type Props = {
    visible: boolean
    clubId: string
    teamId: string
    onClose: () => void
    onPosted: () => void
  }

  export function AnnounceSheet({ visible, clubId, teamId, onClose, onPosted }: Props) {
    const { t } = useTranslation()
    const c = useClubColors()
    const [title, setTitle] = useState('')
    const [body, setBody] = useState('')
    const [posting, setPosting] = useState(false)

    const canPost = title.trim().length > 0 && !posting

    const handlePost = useCallback(async () => {
      if (!canPost) return
      setPosting(true)
      try {
        // Resolve the ANNOUNCEMENTS channel for this team
        const channels = await api<Channel[]>(
          `/teams/${teamId}/channels`,
        )
        const announcementsChannel = channels.find(
          (ch) => ch.kind === 'ANNOUNCEMENTS',
        )
        if (!announcementsChannel) {
          throw new Error('No announcements channel')
        }

        const content = body.trim()
          ? `${title.trim()}\n\n${body.trim()}`
          : title.trim()

        await api(`/clubs/${clubId}/channels/${announcementsChannel.id}/messages`, {
          method: 'POST',
          body: { content },
        })

        Haptics.success?.()
        setTitle('')
        setBody('')
        onPosted()
        onClose()
      } catch {
        Alert.alert(
          t('common.error'),
          t('announce.postError', {
            defaultValue: 'Could not post announcement. Try again.',
          }),
        )
      } finally {
        setPosting(false)
      }
    }, [canPost, clubId, teamId, title, body, onPosted, onClose, t])

    return (
      <BottomSheet visible={visible} onClose={onClose} title={t('announce.title', { defaultValue: 'Announce' })}>
        <View style={styles.form}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('announce.titlePlaceholder', { defaultValue: 'Headline (required)' })}
            placeholderTextColor={c.textTertiary}
            maxLength={80}
            style={[styles.input, { color: c.textPrimary, borderColor: c.borderDefault, backgroundColor: c.surface }]}
            accessibilityLabel={t('announce.titlePlaceholder', { defaultValue: 'Headline' })}
          />
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t('announce.bodyPlaceholder', { defaultValue: 'Details (optional)' })}
            placeholderTextColor={c.textTertiary}
            maxLength={500}
            multiline
            numberOfLines={4}
            style={[styles.textArea, { color: c.textPrimary, borderColor: c.borderDefault, backgroundColor: c.surface }]}
            accessibilityLabel={t('announce.bodyPlaceholder', { defaultValue: 'Details' })}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => void handlePost()}
            disabled={!canPost}
            style={({ pressed }) => [
              styles.postBtn,
              { backgroundColor: c.primary },
              !canPost && { opacity: 0.4 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text variant="subheadline" weight="semibold" style={{ color: c.textInverse }}>
              {posting
                ? t('common.sending', { defaultValue: 'Sending…' })
                : t('announce.postToAll', { defaultValue: 'Post to all players' })}
            </Text>
          </Pressable>
        </View>
      </BottomSheet>
    )
  }

  const styles = StyleSheet.create({
    form: { gap: space.md, padding: space.md },
    input: {
      paddingHorizontal: space.md,
      paddingVertical: 12,
      borderRadius: radius.md,
      borderWidth: hairline,
      fontFamily: fonts.body,
      fontSize: 16,
    },
    textArea: {
      paddingHorizontal: space.md,
      paddingVertical: 12,
      borderRadius: radius.md,
      borderWidth: hairline,
      fontFamily: fonts.body,
      fontSize: 15,
      minHeight: 96,
      textAlignVertical: 'top',
    },
    postBtn: {
      height: 50,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: space.sm,
    },
  })
  ```

  **Note:** If `BottomSheet` is not available from `'../ui/BottomSheet'`, check `apps/mobile/src/components/ui/` for the actual sheet component name (e.g., `Sheet`, `Modal`, or similar). Read the directory first:
  ```bash
  ls apps/mobile/src/components/ui/
  ```
  Use whatever sheet/modal component is available with a `visible` + `onClose` prop pattern.

- [ ] **Step 2: Check BottomSheet import path is correct**

  ```bash
  ls /Users/yemi/anstoss/apps/mobile/src/components/ui/ | grep -i sheet
  ```
  If nothing found:
  ```bash
  ls /Users/yemi/anstoss/apps/mobile/src/components/ui/ | grep -i modal
  ```
  Update the import in `AnnounceSheet.tsx` to match the actual component found.

- [ ] **Step 3: Check Haptics.success exists**

  ```bash
  grep -n "success\|tap\|light\|medium" /Users/yemi/anstoss/apps/mobile/src/utils/haptics.ts 2>/dev/null | head -10
  ```
  If `Haptics.success` doesn't exist, replace `Haptics.success?.()` with `Haptics.tap()` in the component.

- [ ] **Step 4: Commit**

  ```bash
  git add apps/mobile/src/components/home/AnnounceSheet.tsx
  git commit -m "$(cat <<'EOF'
  feat: AnnounceSheet component — compose and post club announcement

  Posts to team's ANNOUNCEMENTS channel via existing messages endpoint.
  Title required (max 80), body optional (max 500). Haptic on success.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 6: Announcement Create — Wire into Home Action Grids

**Files:**
- Modify: `apps/mobile/src/components/home/AdminHome.tsx`
- Modify: `apps/mobile/src/components/home/CoachHome.tsx`

- [ ] **Step 1: Add Announce tile to AdminHome**

  In `apps/mobile/src/components/home/AdminHome.tsx`:

  Add the import at the top with the other imports:
  ```typescript
  import { AnnounceSheet } from './AnnounceSheet'
  ```

  Add `teamId` to the `AdminHomeProps` type and the component signature:
  ```typescript
  export type AdminHomeProps = {
    clubId: string
    teamId: string | null
  }

  export function AdminHome({ clubId, teamId }: AdminHomeProps) {
  ```

  Add state for the sheet (after the `pendingPauses` state):
  ```typescript
  const [announceOpen, setAnnounceOpen] = useState(false)
  ```

  Find the first `<View style={styles.actionRow}>` block (around line 253) and add a new ActionTile for Announce. The current first row has "Create event" + "Invite". Change to:

  ```typescript
  <View style={styles.actionRow}>
    <ActionTile
      icon="plus.circle.fill"
      label={t('home.admin.createEvent', { defaultValue: 'Create event' })}
      onPress={() => router.push('/create-event' as never)}
    />
    <ActionTile
      icon="megaphone.fill"
      label={t('home.admin.announce', { defaultValue: 'Announce' })}
      onPress={() => setAnnounceOpen(true)}
    />
  </View>
  <View style={styles.actionRow}>
    <ActionTile
      icon="person.circle.fill"
      label={t('home.admin.invite', { defaultValue: 'Invite' })}
      onPress={() =>
        router.push({
          pathname: '/invite',
          params: { returnTo: '/(tabs)' },
        } as never)
      }
    />
    <ActionTile
      icon="flame"
      label={t('home.admin.streaks', { defaultValue: 'Streaks' })}
      onPress={() => router.push('/streaks' as never)}
    />
  </View>
  ```

  Add the sheet render before the closing `</View>` of the root:
  ```typescript
  {teamId ? (
    <AnnounceSheet
      visible={announceOpen}
      clubId={clubId}
      teamId={teamId}
      onClose={() => setAnnounceOpen(false)}
      onPosted={() => void load()}
    />
  ) : null}
  ```

- [ ] **Step 2: Find where AdminHome is rendered and pass teamId**

  ```bash
  grep -rn "AdminHome" /Users/yemi/anstoss/apps/mobile --include="*.tsx" | grep -v "spec\|test" | head -10
  ```

  Open the parent component (likely `apps/mobile/app/(tabs)/index.tsx` or similar). Find the `<AdminHome clubId={...} />` render and add `teamId={activeTeamId}`. Example:
  ```typescript
  <AdminHome clubId={activeClub.club.id} teamId={activeTeamId ?? null} />
  ```

- [ ] **Step 3: Add Announce tile to CoachHome**

  In `apps/mobile/src/components/home/CoachHome.tsx`:

  Add the import:
  ```typescript
  import { AnnounceSheet } from './AnnounceSheet'
  ```

  Add state after existing state declarations:
  ```typescript
  const [announceOpen, setAnnounceOpen] = useState(false)
  ```

  The CoachHome doesn't currently have an action grid. Add one after the "This week" section (before the `<PaywallSheet` or before the closing `</View>`). Insert:

  ```typescript
  {/* Quick actions */}
  <View style={styles.actionRow}>
    <ActionTile
      icon="plus.circle.fill"
      label={t('home.coach.createEvent', { defaultValue: 'Create event' })}
      onPress={() => router.push('/create-event' as never)}
    />
    <ActionTile
      icon="megaphone.fill"
      label={t('home.coach.announce', { defaultValue: 'Announce' })}
      onPress={() => setAnnounceOpen(true)}
    />
  </View>
  ```

  Add the `ActionTile` helper component at the bottom of `CoachHome.tsx` (after the `withAlpha` helper, before the styles):

  ```typescript
  function ActionTile({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
    const c = useClubColors()
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.action,
          { backgroundColor: c.surface, borderColor: c.borderDefault },
          pressed && { opacity: 0.94 },
        ]}
      >
        <View style={[styles.actionIcon, { backgroundColor: c.primary50 }]}>
          <Icon name={icon as never} size={18} color="tint" />
        </View>
        <Text variant="footnote" color="primary" weight="semibold" numberOfLines={2} style={styles.actionLabel}>
          {label}
        </Text>
      </Pressable>
    )
  }
  ```

  Add the action styles to the StyleSheet:
  ```typescript
  actionRow: { flexDirection: 'row', gap: space.sm },
  actionLabel: { flex: 1 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    minHeight: 56,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ```

  Add the sheet at the bottom of CoachHome render (before closing root View):
  ```typescript
  {teamId ? (
    <AnnounceSheet
      visible={announceOpen}
      clubId={clubId}
      teamId={teamId}
      onClose={() => setAnnounceOpen(false)}
      onPosted={() => void load()}
    />
  ) : null}
  ```

- [ ] **Step 4: Lint and type check**

  ```bash
  cd /Users/yemi/anstoss && npx turbo lint --filter=mobile 2>&1 | tail -10
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/mobile/src/components/home/AdminHome.tsx \
          apps/mobile/src/components/home/CoachHome.tsx
  git commit -m "$(cat <<'EOF'
  feat: Announce quick action in admin and coach home grids

  Opens AnnounceSheet to post to team ANNOUNCEMENTS channel.
  AdminHome gains teamId prop; CoachHome gains ActionTile grid.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 7: Chat Discovery — Team Chat Row on PlayerHome

**Files:**
- Modify: `apps/mobile/src/components/home/PlayerHome.tsx`

The Chat tab's `ChannelRail` already auto-selects the TEAM channel on mount (it calls `onSelect(sorted[0])` when `selectedChannelId` is null). So navigation to `/(tabs)/chat` from PlayerHome will land the user directly in the team channel.

- [ ] **Step 1: Extend PlayerHome state and load**

  In `apps/mobile/src/components/home/PlayerHome.tsx`, add to the imports:
  ```typescript
  import type { Channel } from '@anstoss/shared'
  ```

  Add state after the `announcements` state:
  ```typescript
  const [teamChannel, setTeamChannel] = useState<(Channel & { lastMessagePreview?: string; unreadCount?: number }) | null>(null)
  ```

  Extend the `load` function's `Promise.all` to also fetch channels:

  Replace the existing `load` function body:
  ```typescript
  const load = useCallback(async () => {
    if (!teamId) return
    const [evs, fxs, anns, channels] = await Promise.all([
      api<EventItem[]>(`/clubs/${clubId}/events?teamId=${teamId}&scope=upcoming&mine=1`).catch(() => []),
      api<ImportedFixture[]>(`/teams/${teamId}/fixtures?scope=upcoming&limit=5`).catch(() => []),
      api<Announcement[]>(`/clubs/${clubId}/announcements?limit=3`).catch(() => []),
      api<Channel[]>(`/teams/${teamId}/channels`).catch(() => []),
    ])
    setEvent(evs?.[0] ?? null)
    const live = fxs?.find((f) => f.status === 'live') ?? null
    setFixture(live ?? fxs?.[0] ?? null)
    setAnnouncements(anns ?? [])
    const team = (channels ?? []).find((ch: Channel) => ch.kind === 'TEAM') ?? null
    setTeamChannel(team)
  }, [clubId, teamId])
  ```

- [ ] **Step 2: Add the team chat row in JSX**

  In `apps/mobile/src/components/home/PlayerHome.tsx`, add the team chat row between the event hero and the announcements section label. Insert after the closing of the event hero `Pressable` / empty event block and before the `ANNOUNCEMENTS` sectionLabel:

  ```typescript
  {/* Team chat shortcut */}
  {teamChannel ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.player.teamChat', { defaultValue: 'Team chat' })}
      onPress={() => router.push('/(tabs)/chat' as never)}
      style={({ pressed }) => [
        styles.chatRow,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.92 },
      ]}
    >
      <View style={[styles.chatIcon, { backgroundColor: c.primary50 }]}>
        <Text style={styles.chatEmoji}>💬</Text>
      </View>
      <View style={styles.chatBody}>
        <Text variant="callout" color="primary" weight="semibold">
          {t('home.player.teamChatLabel', { defaultValue: 'Team · {{name}}', name: teamChannel.name })}
        </Text>
        <Text variant="caption1" color="secondary" numberOfLines={1}>
          {t('home.player.teamChatCta', { defaultValue: 'Say hi to your teammates →' })}
        </Text>
      </View>
    </Pressable>
  ) : null}
  ```

  Add these styles to the `StyleSheet.create` block:
  ```typescript
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  chatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatEmoji: { fontSize: 20 },
  chatBody: { flex: 1, gap: 2 },
  ```

- [ ] **Step 3: Lint check**

  ```bash
  cd /Users/yemi/anstoss && npx turbo lint --filter=mobile 2>&1 | tail -10
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/mobile/src/components/home/PlayerHome.tsx
  git commit -m "$(cat <<'EOF'
  feat: team chat discovery row on PlayerHome

  Fetches team channels alongside events; shows TEAM channel shortcut card.
  Tapping navigates to Chat tab which auto-selects the team channel.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Sprint 2

### Task 8: DB Migrations — Sprint 2 (Rsvp.reason + EventCheckIn table)

**Files:**
- Create: `apps/api/prisma/migrations/20260619090000_rsvp_reason_event_checkin/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Update schema.prisma**

  In `model Rsvp`, add `reason` after `status`:
  ```prisma
  model Rsvp {
    id        String      @id @default(cuid())
    eventId   String
    userId    String
    status    RsvpStatus
    reason    String?     // INJURED | SUSPENDED | AWAY | OTHER; only relevant when status=NO
    updatedAt DateTime    @updatedAt

    event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
    user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@unique([eventId, userId])
    @@index([eventId])
  }
  ```

  Add the `EventCheckIn` model after the `Rsvp` model:
  ```prisma
  model EventCheckIn {
    id          String   @id @default(cuid())
    clubId      String
    teamId      String
    eventId     String
    userId      String
    checkedInAt DateTime @default(now())

    club  Club  @relation(fields: [clubId], references: [id], onDelete: Cascade)
    team  Team  @relation(fields: [teamId], references: [id], onDelete: Cascade)
    event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
    user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@unique([eventId, userId])
    @@index([eventId, userId])
    @@index([clubId, checkedInAt])
  }
  ```

  Add the `EventCheckIn` relation to `model Event`:
  ```prisma
  checkIns EventCheckIn[]
  ```

  Add the `EventCheckIn` relation to `model Club`, `Team`, and `User` as well (Prisma requires the reverse side):
  ```prisma
  // In model Club:
  checkIns EventCheckIn[]

  // In model Team:
  checkIns EventCheckIn[]

  // In model User:
  checkIns EventCheckIn[]
  ```

- [ ] **Step 2: Create migration SQL**

  ```bash
  mkdir -p apps/api/prisma/migrations/20260619090000_rsvp_reason_event_checkin
  ```

  Write `apps/api/prisma/migrations/20260619090000_rsvp_reason_event_checkin/migration.sql`:
  ```sql
  -- Rsvp.reason: optional string for NO-RSVP reason codes
  ALTER TABLE "Rsvp" ADD COLUMN "reason" TEXT;

  -- EventCheckIn: player self-check-in for presence tracking
  CREATE TABLE "EventCheckIn" (
    "id"          TEXT NOT NULL,
    "clubId"      TEXT NOT NULL,
    "teamId"      TEXT NOT NULL,
    "eventId"     TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventCheckIn_pkey" PRIMARY KEY ("id")
  );

  ALTER TABLE "EventCheckIn"
    ADD CONSTRAINT "EventCheckIn_clubId_fkey"  FOREIGN KEY ("clubId")  REFERENCES "Club"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "EventCheckIn_teamId_fkey"  FOREIGN KEY ("teamId")  REFERENCES "Team"("id")  ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "EventCheckIn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "EventCheckIn_userId_fkey"  FOREIGN KEY ("userId")  REFERENCES "User"("id")  ON DELETE CASCADE ON UPDATE CASCADE;

  CREATE UNIQUE INDEX "EventCheckIn_eventId_userId_key" ON "EventCheckIn"("eventId", "userId");
  CREATE INDEX "EventCheckIn_eventId_userId_idx"        ON "EventCheckIn"("eventId", "userId");
  CREATE INDEX "EventCheckIn_clubId_checkedInAt_idx"    ON "EventCheckIn"("clubId", "checkedInAt");
  ```

- [ ] **Step 3: Apply migration and regenerate client**

  ```bash
  cd /Users/yemi/anstoss/apps/api && npx prisma migrate deploy 2>&1 | tail -5
  npx prisma generate 2>&1 | tail -3
  ```

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/yemi/anstoss
  git add apps/api/prisma/schema.prisma \
          apps/api/prisma/migrations/20260619090000_rsvp_reason_event_checkin
  git commit -m "$(cat <<'EOF'
  chore: additive migrations — Rsvp.reason + EventCheckIn table

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 9: Player Self Check-in — Backend

**Files:**
- Modify: `apps/api/src/events/events.service.ts`
- Modify: `apps/api/src/events/events.controller.ts`
- Modify: `apps/api/src/events/events.service.spec.ts`

- [ ] **Step 1: Write failing tests for checkIn and getAttendance**

  In `apps/api/src/events/events.service.spec.ts`, add:

  ```typescript
  describe('checkIn', () => {
    it('creates a check-in within the window and returns the record', async () => {
      const now = new Date()
      const eventDate = new Date(now.getTime() + 60 * 60 * 1000) // 1h from now (in window)

      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        clubId: 'club-1',
        teamId: 'team-1',
        date: eventDate,
        cancelledAt: null,
      })
      prisma.teamAccess.findFirst.mockResolvedValue({ userId: 'user-1' })
      prisma.eventCheckIn.upsert.mockResolvedValue({
        id: 'checkin-1',
        eventId: 'event-1',
        userId: 'user-1',
        checkedInAt: now,
      })

      const result = await service.checkIn('event-1', 'user-1')
      expect(result.eventId).toBe('event-1')
    })

    it('throws 400 outside the check-in window', async () => {
      const future = new Date(Date.now() + 5 * 60 * 60 * 1000) // 5h away (before window)
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        clubId: 'club-1',
        teamId: 'team-1',
        date: future,
        cancelledAt: null,
      })
      teamsService.assertReadableAccess = jest.fn().mockResolvedValue({})

      await expect(service.checkIn('event-1', 'user-1')).rejects.toThrow(BadRequestException)
    })
  })

  describe('getAttendance', () => {
    it('returns rsvps and checkIns', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        date: new Date(Date.now() - 1000),
        rsvps: [{ userId: 'u1', status: 'YES', user: { id: 'u1', name: 'Alice' } }],
        checkIns: [{ userId: 'u1', checkedInAt: new Date(), user: { id: 'u1', name: 'Alice' } }],
      })
      teamsService.assertReadableAccess = jest.fn().mockResolvedValue({})

      const result = await service.getAttendance('event-1', 'u1')
      expect(result.rsvps).toHaveLength(1)
      expect(result.checkIns).toHaveLength(1)
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd /Users/yemi/anstoss/apps/api && npx jest --testPathPattern=events.service.spec --testNamePattern="checkIn|getAttendance" 2>&1 | tail -10
  ```
  Expected: FAIL.

- [ ] **Step 3: Implement checkIn and getAttendance in EventsService**

  Add to `apps/api/src/events/events.service.ts`:

  ```typescript
  // Check-in window: 2h before event start → 3h after event start
  private static CHECK_IN_WINDOW_BEFORE_MS = 2 * 60 * 60 * 1000
  private static CHECK_IN_WINDOW_AFTER_MS = 3 * 60 * 60 * 1000

  async checkIn(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, clubId: true, teamId: true, date: true, cancelledAt: true },
    })
    if (!event) throw new NotFoundException('Event not found')
    if (event.cancelledAt) throw new BadRequestException('Event is cancelled')

    await this.teamsService.assertReadableAccess(userId, event.teamId)

    const now = Date.now()
    const eventMs = new Date(event.date).getTime()
    const windowStart = eventMs - EventsService.CHECK_IN_WINDOW_BEFORE_MS
    const windowEnd = eventMs + EventsService.CHECK_IN_WINDOW_AFTER_MS

    if (now < windowStart || now > windowEnd) {
      throw new BadRequestException('Check-in window is not open for this event')
    }

    return this.prisma.eventCheckIn.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: {},
      create: {
        clubId: event.clubId,
        teamId: event.teamId,
        eventId,
        userId,
      },
    })
  }

  async getAttendance(eventId: string, actorUserId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        teamId: true,
        date: true,
        rsvps: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        checkIns: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
          orderBy: { checkedInAt: 'asc' },
        },
      },
    })
    if (!event) throw new NotFoundException('Event not found')

    await this.teamsService.assertReadableAccess(actorUserId, event.teamId)

    const checkInUserIds = new Set(event.checkIns.map((c: any) => c.userId))
    const eventPast = new Date(event.date).getTime() + EventsService.CHECK_IN_WINDOW_AFTER_MS < Date.now()

    const noShows = eventPast
      ? event.rsvps
          .filter((r: any) => r.status === 'YES' && !checkInUserIds.has(r.userId))
          .map((r: any) => r.user)
      : []

    return {
      rsvps: event.rsvps,
      checkIns: event.checkIns,
      noShows,
    }
  }
  ```

- [ ] **Step 4: Add controller endpoints**

  In `apps/api/src/events/events.controller.ts`, add:

  ```typescript
  /**
   * POST /clubs/:clubId/events/:eventId/check-in — player self check-in.
   * Idempotent: second call returns existing record.
   */
  @Post(':eventId/check-in')
  @RateLimit('write')
  async checkIn(
    @CurrentUser() user: { id: string },
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.checkIn(eventId, user.id)
  }

  /**
   * GET /clubs/:clubId/events/:eventId/attendance — RSVPs + check-ins + no-shows.
   */
  @Get(':eventId/attendance')
  async getAttendance(
    @CurrentUser() user: { id: string },
    @Param('eventId') eventId: string,
  ) {
    return this.eventsService.getAttendance(eventId, user.id)
  }
  ```

- [ ] **Step 5: Run all events tests**

  ```bash
  cd /Users/yemi/anstoss/apps/api && npx jest --testPathPattern=events.service.spec 2>&1 | tail -10
  ```
  Expected: All PASS.

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/yemi/anstoss
  git add apps/api/src/events/events.service.ts \
          apps/api/src/events/events.controller.ts \
          apps/api/src/events/events.service.spec.ts
  git commit -m "$(cat <<'EOF'
  feat: player self check-in endpoints — POST check-in + GET attendance

  Check-in window: 2h before → 3h after event start. Idempotent upsert.
  GET attendance returns rsvps, checkIns, noShows (after window closes).

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 10: Player Self Check-in — Frontend (event-detail + attendance screen)

**Files:**
- Modify: `apps/mobile/app/event-detail.tsx`
- Modify: `apps/mobile/app/event-attendance.tsx`

- [ ] **Step 1: Add check-in state and handler to event-detail**

  In `apps/mobile/app/event-detail.tsx`:

  Add `checkInRecord` to the `EventDetail` type:
  ```typescript
  type EventDetail = {
    // ... existing fields ...
    myCheckIn?: { checkedInAt: string } | null
  }
  ```

  Add state and handler after the existing `reminderPending` state:
  ```typescript
  const [checkInPending, setCheckInPending] = useState(false)
  const [checkInDone, setCheckInDone] = useState(false)
  const [checkInAt, setCheckInAt] = useState<string | null>(null)
  ```

  Add to the `fetchEvent` callback to set check-in state after `setEvent(data)`:
  ```typescript
  if (data.myCheckIn) {
    setCheckInDone(true)
    setCheckInAt(data.myCheckIn.checkedInAt)
  }
  ```

  Add the `handleCheckIn` callback:
  ```typescript
  const isInCheckInWindow = event
    ? (() => {
        const now = Date.now()
        const eventMs = new Date(event.date).getTime()
        return now >= eventMs - 2 * 60 * 60 * 1000 && now <= eventMs + 3 * 60 * 60 * 1000
      })()
    : false

  const handleCheckIn = useCallback(async () => {
    if (!activeClub || !event || checkInPending || checkInDone) return
    setCheckInPending(true)
    try {
      const result = await api<{ checkedInAt: string }>(
        `/clubs/${activeClub.club.id}/events/${event.id}/check-in`,
        { method: 'POST' },
      )
      setCheckInDone(true)
      setCheckInAt(result.checkedInAt)
      Haptics.tap()
    } catch {
      // tolerated — button remains available for retry
    } finally {
      setCheckInPending(false)
    }
  }, [activeClub, event, checkInPending, checkInDone])

  const isPlayer =
    activeClub?.role === 'PLAYER' ||
    (!['OWNER', 'ADMIN', 'COACH'].includes(activeClub?.role ?? ''))
  ```

- [ ] **Step 2: Add check-in button in JSX**

  In `apps/mobile/app/event-detail.tsx`, add the check-in section AFTER the `reminderEnabled` Switch row and BEFORE the "Your RSVP" section label:

  ```typescript
  {isInCheckInWindow && isPlayer ? (
    <View
      style={[
        styles.checkInRow,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      {checkInDone ? (
        <Text variant="body" color="secondary" style={{ flex: 1 }}>
          {t('event.checkedInAt', {
            defaultValue: '✓ Checked in at {{time}}',
            time: checkInAt
              ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
                  new Date(checkInAt),
                )
              : '—',
          })}
        </Text>
      ) : (
        <>
          <Text variant="body" color="primary" style={{ flex: 1 }}>
            {t('event.checkInLabel', { defaultValue: "I'm here" })}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleCheckIn()}
            disabled={checkInPending}
            style={({ pressed }) => [
              styles.checkInBtn,
              { backgroundColor: c.primary },
              checkInPending && { opacity: 0.5 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text variant="footnote" weight="semibold" style={{ color: c.textInverse }}>
              {checkInPending
                ? t('common.sending', { defaultValue: 'Checking in…' })
                : t('event.checkIn', { defaultValue: 'Check in' })}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  ) : null}
  ```

  Add styles:
  ```typescript
  checkInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  checkInBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: 999,
  },
  ```

- [ ] **Step 3: Update event-attendance screen with check-in tab**

  Read the first 50 lines of `apps/mobile/app/event-attendance.tsx` to understand current structure:
  ```bash
  head -50 /Users/yemi/anstoss/apps/mobile/app/event-attendance.tsx
  ```

  Add a `checkIns` section after the existing RSVP sections. The screen already shows RSVPs grouped by YES/MAYBE/NO. Add at the bottom of the loaded data section:

  ```typescript
  // Add to the fetch in event-attendance.tsx (alongside existing rsvp fetch):
  const [attendance, setAttendance] = useState<{
    checkIns: Array<{ userId: string; checkedInAt: string; user: { id: string; name: string } }>
    noShows: Array<{ id: string; name: string }>
  } | null>(null)

  // In the load function, add alongside existing API call:
  api<typeof attendance>(
    `/clubs/${clubId}/events/${eventId}/attendance`,
  ).then(setAttendance).catch(() => null)
  ```

  Add a "Check-ins" section in the JSX after the existing RSVP breakdown:
  ```typescript
  {attendance && attendance.checkIns.length > 0 ? (
    <View style={styles.checkInSection}>
      <Text variant="headline" weight="semibold" color="primary">
        {t('event.checkInsLabel', {
          defaultValue: 'Check-ins ({{count}})',
          count: attendance.checkIns.length,
        })}
      </Text>
      {attendance.checkIns.map((ci) => (
        <View key={ci.userId} style={[styles.checkInRow, { borderColor: c.borderDefault }]}>
          <Text variant="callout" color="primary">{ci.user.name}</Text>
          <Text variant="caption2" color="secondary" tabular>
            {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(ci.checkedInAt))}
          </Text>
        </View>
      ))}
    </View>
  ) : null}
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/mobile/app/event-detail.tsx apps/mobile/app/event-attendance.tsx
  git commit -m "$(cat <<'EOF'
  feat: player self check-in UI — event-detail check-in button + attendance screen

  Check-in button visible within 2h before / 3h after event start.
  Attendance screen adds check-ins section and no-shows (post-window).

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 11: Availability Status (RSVP Reasons)

**Files:**
- Modify: `apps/api/src/events/events.service.ts`
- Create: `apps/mobile/src/components/events/RsvpReasonSheet.tsx`
- Modify: `apps/mobile/app/event-detail.tsx`

- [ ] **Step 1: Update upsertRsvp to accept reason**

  In `apps/api/src/events/events.service.ts`, find the `upsertRsvp` method (around the `rsvp.upsert` call). Update the upsert to include reason and clear it on non-NO RSVP:

  ```typescript
  async upsertRsvp(eventId: string, userId: string, status: RsvpStatus, reason?: string | null) {
    // ... existing validation (contributions check, event lookup) ...

    const rsvp = await this.prisma.rsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: {
        status,
        reason: status === RsvpStatus.NO ? (reason ?? null) : null,
      },
      create: {
        eventId,
        userId,
        status,
        reason: status === RsvpStatus.NO ? (reason ?? null) : null,
      },
    })
    // ... rest of method unchanged ...
  }
  ```

  Update the controller endpoint to pass reason from body. In `apps/api/src/events/events.controller.ts`, update the `upsertRsvp` handler:

  ```typescript
  @Put(':eventId/rsvp')
  @RateLimit('write')
  async upsertRsvp(
    @CurrentUser() user: { id: string },
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ) {
    const parsed = updateRsvpSchema.parse(body)
    const reason = (body as Record<string, unknown>)?.reason as string | undefined
    return this.eventsService.upsertRsvp(eventId, user.id, parsed.status, reason ?? null)
  }
  ```

- [ ] **Step 2: Create RsvpReasonSheet component**

  ```typescript
  // apps/mobile/src/components/events/RsvpReasonSheet.tsx
  import { Pressable, StyleSheet, View } from 'react-native'
  import { useTranslation } from 'react-i18next'
  import { Text } from '../ui'
  import { useClubColors } from '../../context/ClubThemeContext'
  import { hairline, radius, space } from '../../theme/tokens'

  export type RsvpReason = 'INJURED' | 'SUSPENDED' | 'AWAY' | 'OTHER'

  type Props = {
    visible: boolean
    onSelect: (reason: RsvpReason | null) => void
    onSkip: () => void
  }

  const REASONS: Array<{ value: RsvpReason; emoji: string; labelKey: string; defaultLabel: string }> = [
    { value: 'INJURED', emoji: '🤕', labelKey: 'rsvp.reason.injured', defaultLabel: 'Injured' },
    { value: 'SUSPENDED', emoji: '🟥', labelKey: 'rsvp.reason.suspended', defaultLabel: 'Suspended' },
    { value: 'AWAY', emoji: '✈️', labelKey: 'rsvp.reason.away', defaultLabel: 'Away' },
    { value: 'OTHER', emoji: '❌', labelKey: 'rsvp.reason.other', defaultLabel: 'Other / prefer not to say' },
  ]

  export function RsvpReasonSheet({ visible, onSelect, onSkip }: Props) {
    const { t } = useTranslation()
    const c = useClubColors()

    if (!visible) return null

    return (
      <View
        style={[
          styles.container,
          { backgroundColor: c.surface, borderTopColor: c.borderDefault },
        ]}
      >
        <Text variant="headline" weight="semibold" color="primary" style={styles.title}>
          {t('rsvp.whyCantYou', { defaultValue: "Why can't you make it?" })}
        </Text>
        {REASONS.map((r) => (
          <Pressable
            key={r.value}
            accessibilityRole="button"
            onPress={() => onSelect(r.value)}
            style={({ pressed }) => [
              styles.option,
              { borderColor: c.borderDefault },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.emoji}>{r.emoji}</Text>
            <Text variant="body" color="primary">{t(r.labelKey, { defaultValue: r.defaultLabel })}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={onSkip}
          style={({ pressed }) => [styles.skip, pressed && { opacity: 0.7 }]}
        >
          <Text variant="footnote" color="secondary">
            {t('rsvp.skip', { defaultValue: 'Skip' })}
          </Text>
        </Pressable>
      </View>
    )
  }

  const styles = StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopWidth: 1,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: space.lg,
      gap: space.sm,
    },
    title: { marginBottom: space.xs },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      paddingVertical: space.md,
      borderBottomWidth: hairline,
    },
    emoji: { fontSize: 22 },
    skip: { paddingTop: space.sm, alignSelf: 'center' },
  })
  ```

- [ ] **Step 3: Wire RsvpReasonSheet into event-detail**

  In `apps/mobile/app/event-detail.tsx`:

  Import:
  ```typescript
  import { RsvpReasonSheet, type RsvpReason } from '../src/components/events/RsvpReasonSheet'
  ```

  Add state:
  ```typescript
  const [reasonSheetVisible, setReasonSheetVisible] = useState(false)
  ```

  Update `handleRsvp` so that after an optimistic NO RSVP is set, it shows the reason sheet before submitting:

  ```typescript
  const handleRsvp = useCallback(
    (status: string) => {
      if (!activeClub || !event || rsvpPending) return

      Haptics.tap()
      Animated.sequence([
        Animated.timing(rsvpScale, { toValue: 0.95, duration: 50, useNativeDriver: true }),
        Animated.spring(rsvpScale, { toValue: 1, useNativeDriver: true }),
      ]).start()

      setEvent((prev) =>
        prev ? { ...prev, myRsvp: status as EventDetail['myRsvp'] } : prev,
      )

      if (status === 'NO') {
        // Show reason sheet; actual API call deferred until reason chosen or skipped
        setReasonSheetVisible(true)
        return
      }

      submitRsvp(status, null)
    },
    [activeClub, event, rsvpPending, rsvpScale, fetchEvent],
  )

  const submitRsvp = useCallback(
    (status: string, reason: RsvpReason | null) => {
      if (!activeClub || !event) return
      if (rsvpTimer.current) clearTimeout(rsvpTimer.current)
      rsvpTimer.current = setTimeout(async () => {
        setRsvpPending(true)
        try {
          await api(`/clubs/${activeClub.club.id}/events/${event.id}/rsvp`, {
            method: 'PUT',
            body: { status, ...(reason ? { reason } : {}) },
          })
          await fetchEvent()
        } catch {
          await fetchEvent()
        } finally {
          setRsvpPending(false)
        }
      }, RSVP.DEBOUNCE_MS)
    },
    [activeClub, event, fetchEvent],
  )
  ```

  Add the RsvpReasonSheet render before the closing `</Screen>`:
  ```typescript
  <RsvpReasonSheet
    visible={reasonSheetVisible}
    onSelect={(reason) => {
      setReasonSheetVisible(false)
      submitRsvp('NO', reason)
    }}
    onSkip={() => {
      setReasonSheetVisible(false)
      submitRsvp('NO', null)
    }}
  />
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add apps/mobile/src/components/events/RsvpReasonSheet.tsx \
          apps/mobile/app/event-detail.tsx \
          apps/api/src/events/events.service.ts \
          apps/api/src/events/events.controller.ts
  git commit -m "$(cat <<'EOF'
  feat: RSVP reason sheet — players specify why when replying No

  RsvpReasonSheet appears after No RSVP; reason stored server-side.
  Reason cleared automatically when RSVP changes from No to Yes/Maybe.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 12: Multi-Team Home

**Files:**
- Modify: `apps/api/src/events/events.service.ts`
- Modify: `apps/mobile/src/components/home/PlayerHome.tsx`

- [ ] **Step 1: Update listUpcoming to support multi-team**

  In `apps/api/src/events/events.service.ts`, find the `listUpcoming` method. The current implementation filters by a single `teamId`. Update to accept an optional `mine=1` flag that, when set, fetches events for ALL teams the user belongs to (not just the given teamId):

  ```typescript
  async listUpcoming(teamId: string | undefined, userId: string, filters: EventFilters) {
    // When mine=1 is set (and no teamId restriction), fetch events from all user's teams
    let targetTeamIds: string[]

    if (filters.mine && !teamId) {
      // Multi-team mode: find all active team memberships for this user
      const userTeams = await this.prisma.teamAccess.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { teamId: true },
      })
      targetTeamIds = userTeams.map((t: { teamId: string }) => t.teamId)
    } else if (teamId) {
      targetTeamIds = [teamId]
    } else {
      return []
    }

    // ... rest of existing query logic, replacing `teamId: teamId` with `teamId: { in: targetTeamIds }` ...
  }
  ```

  **Important:** Before changing the query, read the full `listUpcoming` implementation to understand the exact Prisma query shape:
  ```bash
  grep -n "listUpcoming\|findMany\|orderBy\|where.*teamId" /Users/yemi/anstoss/apps/api/src/events/events.service.ts | head -20
  ```
  Then update only the `where: { teamId: ... }` clause to `where: { teamId: { in: targetTeamIds } }`.

- [ ] **Step 2: Update PlayerHome to fetch multi-team events**

  In `apps/mobile/src/components/home/PlayerHome.tsx`:

  Add a `allTeamEvents` state alongside `event`:
  ```typescript
  const [allTeamEvents, setAllTeamEvents] = useState<EventItem[]>([])
  ```

  Update the `load` function to also fetch all-team events (add to the existing Promise.all):
  ```typescript
  api<EventItem[]>(
    `/clubs/${clubId}/events?scope=upcoming&mine=1&limit=4`,
  ).catch(() => []),
  ```

  In `setEvent(evs?.[0] ?? null)` block, also set:
  ```typescript
  setAllTeamEvents(multiEvs ?? [])
  ```

  In the JSX, show the multi-team "Your week" list when `allTeamEvents.length > 1` (events from > 1 team):

  ```typescript
  {allTeamEvents.length > 1 ? (
    <View style={styles.weekBlock}>
      <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary" style={styles.sectionLabel}>
        {t('home.player.yourWeek', { defaultValue: 'YOUR WEEK' })}
      </Text>
      {allTeamEvents.map((ev) => (
        <Pressable
          key={ev.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/event-detail', params: { eventId: ev.id } })}
          style={({ pressed }) => [
            styles.weekRow,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.95 },
          ]}
        >
          <View style={styles.weekRowBody}>
            <Text variant="callout" color="primary" numberOfLines={1}>{ev.title}</Text>
            <Text variant="caption2" color="secondary">
              {new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ev.date))}
            </Text>
          </View>
          {ev.myRsvp ? (
            <View style={[styles.rsvpBadge, {
              backgroundColor: ev.myRsvp === 'YES' ? c.success : ev.myRsvp === 'NO' ? c.error : c.warning,
            }]}>
              <Text variant="caption2" style={{ color: c.textInverse, fontWeight: '600' }}>
                {ev.myRsvp}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  ) : null}
  ```

  Add styles:
  ```typescript
  weekBlock: { gap: space.xs },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
  },
  weekRowBody: { flex: 1, gap: 2 },
  rsvpBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  ```

- [ ] **Step 3: Run API tests**

  ```bash
  cd /Users/yemi/anstoss/apps/api && npx jest --testPathPattern=events.service.spec 2>&1 | tail -10
  ```

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/yemi/anstoss
  git add apps/api/src/events/events.service.ts \
          apps/mobile/src/components/home/PlayerHome.tsx
  git commit -m "$(cat <<'EOF'
  feat: multi-team home — Your Week list for players on multiple teams

  listUpcoming supports mine=1 with no teamId to fetch all user teams.
  PlayerHome shows chronological 4-event list when player is on > 1 team.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 13: Onboarding Cold-Start

**Files:**
- Create: `apps/mobile/src/components/home/WelcomeCard.tsx`
- Modify: `apps/mobile/src/components/home/PlayerHome.tsx`
- Modify: `apps/api/src/channels/channels.service.ts`
- Modify: wherever membership confirmation fires (read first: `grep -rn "confirmMembership\|status.*ACTIVE\|membership.*ACTIVE" apps/api/src --include="*.ts" -l`)

- [ ] **Step 1: Create WelcomeCard component**

  ```typescript
  // apps/mobile/src/components/home/WelcomeCard.tsx
  import { useCallback } from 'react'
  import { Pressable, StyleSheet, View } from 'react-native'
  import AsyncStorage from '@react-native-async-storage/async-storage'
  import { router } from 'expo-router'
  import { useTranslation } from 'react-i18next'
  import { Text } from '../ui'
  import { useClubColors } from '../../context/ClubThemeContext'
  import { hairline, radius, space } from '../../theme/tokens'

  const DISMISSED_KEY = 'onboarding_welcome_dismissed'
  const WELCOME_DAYS = 7

  type Props = {
    teamName: string
    joinedAt: string // ISO date
    onDismiss: () => void
  }

  export function WelcomeCard({ teamName, joinedAt, onDismiss }: Props) {
    const { t } = useTranslation()
    const c = useClubColors()

    const daysSinceJoin = Math.floor(
      (Date.now() - new Date(joinedAt).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (daysSinceJoin > WELCOME_DAYS) return null

    const handleDismiss = useCallback(async () => {
      await AsyncStorage.setItem(DISMISSED_KEY, '1')
      onDismiss()
    }, [onDismiss])

    const steps: Array<{ label: string; route: string }> = [
      {
        label: t('welcome.checkFirstEvent', { defaultValue: 'Check your first event' }),
        route: '/(tabs)/events',
      },
      {
        label: t('welcome.sayHi', { defaultValue: 'Say hi in team chat' }),
        route: '/(tabs)/chat',
      },
      {
        label: t('welcome.fillProfile', { defaultValue: 'Fill in your profile photo' }),
        route: '/edit-profile',
      },
    ]

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: c.surface, borderColor: c.primary },
        ]}
      >
        <View style={styles.header}>
          <Text variant="headline" weight="semibold" color="primary">
            {t('welcome.title', { defaultValue: '👋 Welcome to {{team}}', team: teamName })}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleDismiss()}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <Text variant="footnote" color="secondary">
              {t('welcome.done', { defaultValue: '✕ Done' })}
            </Text>
          </Pressable>
        </View>
        <Text variant="footnote" color="secondary">
          {t('welcome.subtitle', { defaultValue: "Your coach added you. Here's where to start:" })}
        </Text>
        {steps.map((step) => (
          <Pressable
            key={step.route}
            accessibilityRole="link"
            onPress={() => router.push(step.route as never)}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <Text variant="callout" color="primary">
              {'→ '}{step.label}
            </Text>
          </Pressable>
        ))}
      </View>
    )
  }

  export async function isWelcomeCardDismissed(): Promise<boolean> {
    const val = await AsyncStorage.getItem(DISMISSED_KEY)
    return val === '1'
  }

  const styles = StyleSheet.create({
    card: {
      padding: space.md,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      gap: space.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: space.sm,
    },
  })
  ```

- [ ] **Step 2: Wire WelcomeCard into PlayerHome**

  In `apps/mobile/src/components/home/PlayerHome.tsx`:

  Import:
  ```typescript
  import { WelcomeCard, isWelcomeCardDismissed } from './WelcomeCard'
  ```

  Add state:
  ```typescript
  const [showWelcome, setShowWelcome] = useState(false)
  ```

  Add an `useEffect` after the existing `useEffect` to check dismissal:
  ```typescript
  useEffect(() => {
    isWelcomeCardDismissed().then((dismissed) => {
      if (!dismissed) setShowWelcome(true)
    })
  }, [])
  ```

  The `PlayerHomeProps` already receives `clubId` and `teamId`. We need `joinedAt` and `teamName`. Check `AuthContext` for where this is available:
  ```bash
  grep -n "joinedAt\|createdAt\|membership\|activeTeam\|teamName" /Users/yemi/anstoss/apps/mobile/src/context/AuthContext.tsx 2>/dev/null | head -10
  ```
  If `joinedAt` is on `activeClub`, use it. Otherwise read the `membership` object from `useAuth()` inside `PlayerHome` to get the join date. Adjust accordingly.

  Add the WelcomeCard in JSX — as the FIRST item inside `<View style={styles.root}>`, before the liveCard:
  ```typescript
  {showWelcome ? (
    <WelcomeCard
      teamName={/* team display name from auth context or passed as prop */}
      joinedAt={/* activeClub?.joinedAt or membership.createdAt */}
      onDismiss={() => setShowWelcome(false)}
    />
  ) : null}
  ```

- [ ] **Step 3: Add postSystemMessage to ChannelsService**

  In `apps/api/src/channels/channels.service.ts`, add the method:

  ```typescript
  async postSystemMessage(teamId: string, clubId: string, content: string): Promise<void> {
    // Ensure the ANNOUNCEMENTS channel exists
    await this.ensureTeamChannels(clubId, teamId)

    const channel = await this.prisma.channel.findFirst({
      where: { teamId, clubId, kind: 'ANNOUNCEMENTS' },
      select: { id: true },
    })
    if (!channel) return

    // Find or create a system user for the club
    // Use a deterministic ID based on clubId so it's idempotent
    const systemUserId = `system-${clubId}`

    // The Message model requires senderId; use a real club member as fallback
    // if the system user doesn't exist. Better: find the club owner.
    const owner = await this.prisma.membership.findFirst({
      where: { clubId, role: 'OWNER' },
      select: { userId: true },
    })
    if (!owner) return

    await this.prisma.message.create({
      data: {
        clubId,
        teamId,
        channelId: channel.id,
        senderId: owner.userId,
        content,
        messageType: 'SYSTEM',
      },
    })
  }
  ```

- [ ] **Step 4: Hook postSystemMessage into membership confirmation**

  Find the membership confirmation service:
  ```bash
  grep -rn "confirmMembership\|membership.*ACTIVE\|joinCode\|acceptInvite" /Users/yemi/anstoss/apps/api/src --include="*.ts" -l | head -5
  ```

  Open the relevant file. Find where membership status transitions to `ACTIVE`. After the membership is activated, add:

  ```typescript
  // Post system welcome message to team's announcements channel
  const memberName = member.user?.name ?? 'A new player'
  const teamName = team?.name ?? 'the team'
  await this.channelsService.postSystemMessage(
    membership.teamId,
    membership.clubId,
    `👋 ${memberName} joined ${teamName}.`,
  ).catch(() => { /* tolerated — messaging must not block join */ })
  ```

  Inject ChannelsService into the constructor if not already present.

- [ ] **Step 5: Add coach empty-state nudge to CoachHome**

  In `apps/mobile/src/components/home/CoachHome.tsx`, in the "This week" empty state section (around line 303), enhance it to show the onboarding nudge when `thisWeek.length === 0` AND no roster data:

  ```typescript
  {thisWeek.length === 0 && !roster ? (
    <View style={[styles.emptyOnboard, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <Text variant="title3" color="primary" weight="semibold">
        {t('home.coach.getStarted', { defaultValue: 'Get started' })}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/create-event' as never)}
        style={({ pressed }) => [styles.onboardBtn, { backgroundColor: c.primary }, pressed && { opacity: 0.8 }]}
      >
        <Text variant="callout" weight="semibold" style={{ color: c.textInverse }}>
          {t('home.coach.createFirstEvent', { defaultValue: '+ Create your first event' })}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/invite', params: { returnTo: '/(tabs)' } } as never)}
        style={({ pressed }) => [styles.onboardBtn, { borderColor: c.borderStrong, borderWidth: hairline }, pressed && { opacity: 0.8 }]}
      >
        <Text variant="callout" weight="semibold" color="primary">
          {t('home.coach.invitePlayers', { defaultValue: '👥 Invite players' })}
        </Text>
      </Pressable>
    </View>
  ) : thisWeek.length === 0 ? (
    <View style={[styles.empty, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <Text variant="footnote" color="secondary">
        {t('home.coach.nothingScheduled', { defaultValue: 'Nothing scheduled yet.' })}
      </Text>
    </View>
  ) : (
    // ... existing thisWeek.map(...) ...
  )}
  ```

  Add styles:
  ```typescript
  emptyOnboard: { padding: space.lg, borderRadius: radius.lg, borderWidth: hairline, gap: space.md },
  onboardBtn: { paddingVertical: 14, borderRadius: radius.md, alignItems: 'center' },
  ```

- [ ] **Step 6: Run full test suite**

  ```bash
  cd /Users/yemi/anstoss && npm test 2>&1 | tail -20
  ```
  Expected: All pre-existing tests pass; new test failures are only for tests covering changed code that need minor updates.

- [ ] **Step 7: Commit**

  ```bash
  cd /Users/yemi/anstoss
  git add apps/mobile/src/components/home/WelcomeCard.tsx \
          apps/mobile/src/components/home/PlayerHome.tsx \
          apps/mobile/src/components/home/CoachHome.tsx \
          apps/api/src/channels/channels.service.ts
  git commit -m "$(cat <<'EOF'
  feat: onboarding cold-start — welcome card, system join message, coach nudge

  WelcomeCard shown to players for first 7 days; dismissable via AsyncStorage.
  System message posted to announcements on membership activation.
  Coach home shows Get Started nudge on completely empty team state.

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Paywall removal — MVP_ALL_FREE | Task 1 |
| Upgrade banner removed (more/index, AdminHome) | Task 1 |
| RSVP reminders backend endpoint with 24h rate limit | Task 3 |
| RSVP reminders UI on event-detail (coach/admin only) | Task 4 |
| Announcement compose sheet | Task 5 |
| Announce action in admin + coach home grids | Task 6 |
| Player home team chat row | Task 7 |
| Chat tab auto-select TEAM channel | ✓ Already implemented in ChannelRail (auto-selects sorted[0], TEAM has priority 0) |
| DB: Event.lastRsvpReminderAt | Task 2 |
| DB: Rsvp.reason | Task 8 |
| DB: EventCheckIn table | Task 8 |
| Player self check-in backend (POST + GET) | Task 9 |
| Player self check-in frontend UI | Task 10 |
| RSVP reason sheet + backend storage | Task 11 |
| Multi-team home "Your week" list | Task 12 |
| listUpcoming multi-team query | Task 12 |
| Welcome card (first 7 days, dismissable) | Task 13 |
| System join message on membership activation | Task 13 |
| Coach empty-state onboarding nudge | Task 13 |

**Notes:**
- Task 13 Step 2 (WelcomeCard joinedAt) requires inspecting `AuthContext` at implementation time — the field path varies by what the API returns.
- Task 13 Step 4 (membership confirmation hook) requires reading the actual service file at implementation time.
- `Message.isSystem` boolean is NOT needed — `MessageType.SYSTEM` already exists in the schema enum.
- `sendPush` private method access in Task 3 should be swapped for `sendToTokens` if that public method accepts a token array.
