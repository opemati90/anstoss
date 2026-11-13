import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RSVP, type ChildrenOverview, type MyContributionSummary } from '@anstoss/shared'
import { api, API_URL } from '../../api/client'
import { useEventsSocket } from '../../hooks/useEventsSocket'
import { Button, FilterChipRow, Icon, PressableScale, Text } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { useClubColors } from '../../context/ClubThemeContext'
import { SPACING_LG, SPACING_XL, SPACING_XS, SPACING_XXS, hairline, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { SILENT_REFRESH_DEBOUNCE_MS, outstandingDues } from '../../hooks/usePlayerHome'
import type { AbsenceDetail, RsvpStatus } from '../events/RsvpControl'
import { HeroRsvp, HeroSurface, heroKickoff, useHeroColors } from './HomeHero'
import {
  EmptyCard,
  HomeCard,
  HomeRow,
  HomeTag,
  InlineError,
  eventHeadline,
  formatShortDate,
  formatTime,
} from './HomeKit'
import { useHomeLocale } from './useHomeLocale'
import { HomeSkeleton } from './HomeSkeleton'
import { dutyIcon, dutyTitle, type HomeTask } from './HomeTasks'
import { setChildrenSummary, type ChildSummary } from './childrenSummary'
import { type ChildEvent as ConflictEvent, findConflicts } from '../../lib/scheduleConflicts'

type ChildEvent = {
  id: string
  clubId?: string
  type?: string
  title: string
  date: string
  location?: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
  opponent?: string | null
  homeAway?: 'HOME' | 'AWAY' | null
  meetingAt?: string | null
  meetingPoint?: string | null
  fixtureId?: string | null
  carpoolEnabled?: boolean
  /** schemas/home.ts — carpool state on away matches. */
  carpoolSummary?: { seeking: number; seatsFree: number; myRideSeats: number | null } | null
  teamName: string
  teamDisplayName: string | null
  /** API: CrossTeamEventItem.childUserId — the child this row belongs to. */
  childUserId?: string
  childName?: string
  childRsvp?: 'YES' | 'MAYBE' | 'NO' | null
}

const EMPTY_OVERVIEW: ChildrenOverview = { children: [], duties: [], announcements: [] }

export type ParentHomeProps = {
  onRefreshStateChange?: (state: { refresh: () => void; refreshing: boolean }) => void
}

const TASK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
const SCHEDULE_ROUTE = '/(tabs)/events'
/** The existing guardian flow: redeem a handoff code for a child's slot. */
const LINK_CHILD_ROUTE = '/(auth)/parent-handoff'

/**
 * The parent's home: one card per child with that child's next event,
 * answerable on the child's behalf in place ("Für Leo antworten"), then the
 * parent's own jobs (Kuchen, Fahrdienst), family fees, and announcements.
 */
export function ParentHome({ onRefreshStateChange }: ParentHomeProps = {}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const locale = useHomeLocale()
  const { activeClub, token } = useAuth()
  const clubId = activeClub?.club?.id ?? null

  const [events, setEvents] = useState<ChildEvent[]>([])
  const [overview, setOverview] = useState<ChildrenOverview | null>(null)
  const [dues, setDues] = useState<MyContributionSummary | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [pendingIds, setPendingIds] = useState<Record<string, boolean>>({})
  const requestSeq = useRef(0)
  const silentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    const [evs, overviewRes, contributions] = await Promise.all([
      api<ChildEvent[]>('/me/children-events?limit=20').catch(() => null),
      clubId
        ? api<ChildrenOverview>(
            `/me/children-overview?clubId=${encodeURIComponent(clubId)}&limit=3`,
          ).catch(() => null)
        : Promise.resolve(EMPTY_OVERVIEW),
      clubId
        ? api<MyContributionSummary>(`/clubs/${clubId}/contributions/my`).catch(() => null)
        : Promise.resolve(null),
    ])
    if (seq !== requestSeq.current) return
    // Failed requests keep what is already on screen (stale-while-revalidate).
    if (evs === null) {
      setError(true)
    } else {
      setError(false)
      setEvents(Array.isArray(evs) ? evs : [])
    }
    if (overviewRes !== null) setOverview(normalizeOverview(overviewRes))
    if (contributions !== null) setDues(contributions)
    setLoaded(true)
    setRefreshing(false)
  }, [clubId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const refresh = useCallback(() => {
    setRefreshing(true)
    void load()
  }, [load])

  // Realtime changes on a child's team re-read quietly, once per burst.
  const scheduleSilentLoad = useCallback(() => {
    if (silentTimer.current) clearTimeout(silentTimer.current)
    silentTimer.current = setTimeout(() => {
      silentTimer.current = null
      void load()
    }, SILENT_REFRESH_DEBOUNCE_MS)
  }, [load])

  useEffect(
    () => () => {
      if (silentTimer.current) clearTimeout(silentTimer.current)
    },
    [],
  )

  useEffect(() => {
    onRefreshStateChange?.({ refresh, refreshing })
  }, [onRefreshStateChange, refresh, refreshing])

  const children = useMemo(() => overview?.children ?? [], [overview])
  const childTeamIds = useMemo(
    () => Array.from(new Set(children.flatMap((child) => child.teams.map((team) => team.id)))),
    [children],
  )

  // One card per child: the next non-cancelled event on that child's calendar.
  const childCards = useMemo(() => {
    const byChild = new Map<string, { next: ChildEvent; more: number }>()
    const byDate = [...events].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    )
    for (const ev of byDate) {
      if (ev.cancelledAt) continue
      const key = ev.childUserId ?? `team:${ev.teamName}`
      const entry = byChild.get(key)
      if (!entry) byChild.set(key, { next: ev, more: 0 })
      else entry.more += 1
    }
    return Array.from(byChild.values())
  }, [events])

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selectedCard =
    childCards.find(({ next }) => cardKey(next) === selectedKey) ?? childCards[0] ?? null

  // Share "Leo · U15/U17, Mia · U11" with the header: every linked child
  // (also those with nothing planned) and every team they play on.
  useEffect(() => {
    const summary: ChildSummary[] =
      children.length > 0
        ? children.map((child) => ({
            id: child.userId ?? child.name,
            name: firstName(child.name),
            team: child.teams.map((team) => team.name || team.displayName).join('/'),
          }))
        : childCards
            .filter(({ next }) => Boolean(next.childName))
            .map(({ next }) => ({
              id: next.childUserId ?? next.teamName,
              name: firstName(next.childName),
              team: teamLabel(next),
            }))
    setChildrenSummary(summary)
  }, [childCards, children])
  useEffect(() => () => setChildrenSummary([]), [])

  const conflicts = useMemo(() => {
    const kids = new Set(events.map((e) => e.childUserId).filter(Boolean))
    if (kids.size < 2) return []
    const agenda: ConflictEvent[] = events
      .filter((e) => e.childUserId && !e.cancelledAt)
      .map((e) => ({
        id: e.id,
        kidId: e.childUserId as string,
        title: e.title,
        date: e.date,
        location: e.location ?? null,
        rsvp: e.childRsvp ?? 'PENDING',
      }))
    return findConflicts(agenda)
  }, [events])

  // The parent's own jobs and their children's (Trikotwäsche, Kabinendienst),
  // from the team duty rota; soonest first, next two weeks.
  const tasks: HomeTask[] = useMemo(() => {
    const now = Date.now()
    const names = new Map(
      children.filter((child) => child.userId).map((child) => [child.userId as string, child.name]),
    )
    return (overview?.duties ?? [])
      .filter((duty) => {
        if (!duty.dueDate) return true
        const due = new Date(duty.dueDate).getTime()
        return Number.isFinite(due) && due >= now - 12 * 3600_000 && due - now <= TASK_WINDOW_MS
      })
      .slice(0, 3)
      .map((duty) => ({
        id: duty.id,
        icon: dutyIcon(duty.kind),
        title: duty.childUserId
          ? t('homeHub.parent.childDuty', {
              defaultValue: '{{child}}: {{duty}}',
              child: firstName(names.get(duty.childUserId) ?? duty.assignedUser?.name),
              duty: dutyTitle(duty.kind, t),
            })
          : dutyTitle(duty.kind, t),
        detail: [
          duty.teamName,
          duty.dueDate
            ? t('homeHub.dueBy', {
                defaultValue: 'by {{date}}',
                date: formatShortDate(duty.dueDate, locale),
              })
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
        onPress: () => router.push('/aufgaben' as never),
      }))
  }, [children, locale, overview, t])

  // Loaded, and no child linked at all: point to the link flow instead of an
  // empty schedule that can never fill.
  const noLinkedChild = loaded && overview !== null && children.length === 0 && events.length === 0

  const familyDues = useMemo(() => outstandingDues(dues), [dues])

  const onChildRsvp = useCallback(
    async (ev: ChildEvent, status: RsvpStatus, absence?: AbsenceDetail) => {
      const pendingKey = `${ev.childUserId}-${ev.id}`
      if (!ev.childUserId || !ev.clubId || pendingIds[pendingKey]) return
      const previous = ev.childRsvp ?? null
      const apply = (value: ChildEvent['childRsvp']) =>
        setEvents((list) =>
          list.map((item) =>
            item.id === ev.id && item.childUserId === ev.childUserId
              ? { ...item, childRsvp: value }
              : item,
          ),
        )
      setPendingIds((prev) => ({ ...prev, [pendingKey]: true }))
      apply(status)
      try {
        await new Promise((resolve) => setTimeout(resolve, RSVP.DEBOUNCE_MS))
        await api(`/clubs/${ev.clubId}/events/${ev.id}/rsvp-proxy`, {
          method: 'PUT',
          body: { status, childUserId: ev.childUserId, ...(status === 'NO' ? absence : {}) },
        })
        Haptics.success()
      } catch {
        apply(previous)
        Haptics.fail()
        Alert.alert(
          t('event.rsvpFailedTitle', { defaultValue: 'RSVP not saved' }),
          t('event.rsvpFailedBody', {
            defaultValue: 'Could not save your reply. Tap again when you have a connection.',
          }),
        )
      } finally {
        setPendingIds((prev) => {
          const next = { ...prev }
          delete next[pendingKey]
          return next
        })
      }
    },
    [pendingIds, t],
  )

  if (!loaded) return <HomeSkeleton variant="parent" />

  const socketListeners = childTeamIds.map((teamId) => (
    <TeamEventsListener key={teamId} teamId={teamId} token={token} onChange={scheduleSilentLoad} />
  ))

  if (error && events.length === 0) {
    return (
      <View style={styles.root}>
        <InlineError
          title={t('homeHub.parent.loadError', {
            defaultValue: "Couldn't load your children's schedule",
          })}
          body={t('states.home.error.body', {
            defaultValue: 'Check your connection and pull down to try again.',
          })}
          onRetry={refresh}
        />
      </View>
    )
  }

  const selectedEvent = selectedCard?.next ?? null
  const selectedChild =
    children.find((child) => child.userId && child.userId === selectedEvent?.childUserId) ??
    (children.length === 1 ? children[0] : null)
  const isAway = Boolean(selectedEvent && selectedEvent.type === 'MATCH' && selectedEvent.homeAway === 'AWAY')
  const carpool = selectedEvent?.carpoolSummary ?? null
  const offered = carpool?.myRideSeats != null
  const groupRows: Array<{ key: string; render: (divider: boolean) => ReactNode }> = []

  if (conflicts.length > 0) {
    groupRows.push({
      key: 'conflicts',
      render: (divider) => (
        <HomeRow
          icon="exclamationmark.triangle"
          tone="warning"
          title={t('homeHub.parent.conflicts', {
            defaultValue: '{{count}} schedule clashes',
            count: conflicts.length,
          })}
          detail={t('homeHub.parent.conflictsBody', {
            defaultValue: 'Two of your children are due at the same time. Decide who goes.',
          })}
          onPress={() => router.push('/conflicts' as never)}
          showDivider={divider}
        />
      ),
    })
  }
  if (selectedEvent && isAway) {
    const openCarpool = () =>
      router.push({
        pathname: '/carpool',
        params: selectedEvent.fixtureId
          ? { fixtureId: selectedEvent.fixtureId, eventId: selectedEvent.id }
          : { eventId: selectedEvent.id },
      } as never)
    groupRows.push({
      key: 'carpool',
      render: (divider) => (
        <HomeRow
          icon="car"
          title={t('homeHub.parent.carpool', { defaultValue: 'Carpool' })}
          detail={
            offered
              ? t('homeHub.parent.carpoolDriving', {
                  defaultValue: "You're driving. {{count}} seats free.",
                  count: carpool?.myRideSeats ?? 0,
                })
              : carpool && carpool.seeking > 0
                ? t('homeHub.parent.carpoolSeeking', {
                    defaultValue: '{{count}} kids still need a ride',
                    count: carpool.seeking,
                  })
                : t('homeHub.parent.carpoolPlan', { defaultValue: 'Plan rides for the away match' })
          }
          trailing={
            <Button
              label={
                offered
                  ? t('homeHub.parent.seatOffered', { defaultValue: 'Offered' })
                  : t('homeHub.parent.offerSeat', { defaultValue: 'Offer a seat' })
              }
              variant="accent"
              size="sm"
              onPress={openCarpool}
              testID="parent-offer-seat"
            />
          }
          showDivider={divider}
        />
      ),
    })
  }
  if (selectedChild || children.length > 0) {
    const consent = selectedChild?.photoConsent ?? null
    groupRows.push({
      key: 'photo',
      render: (divider) => (
        <HomeRow
          icon="camera"
          title={t('homeHub.parent.photoConsent', { defaultValue: 'Photo consent' })}
          detail={
            consent === 'GRANTED'
              ? t('homeHub.parent.photoConsentGranted', { defaultValue: 'Given for team photos on the club site' })
              : t('homeHub.parent.photoConsentBody', { defaultValue: 'For team photos on the club website' })
          }
          trailing={
            <Button
              label={t('homeHub.parent.review', { defaultValue: 'Review' })}
              variant="bordered"
              size="sm"
              onPress={() => router.push('/child-consent' as never)}
              testID="parent-photo-consent"
            />
          }
          showDivider={divider}
        />
      ),
    })
  }
  for (const task of tasks) {
    groupRows.push({
      key: `task-${task.id}`,
      render: (divider) => (
        <HomeRow
          icon={task.icon}
          title={task.title}
          detail={task.detail}
          onPress={task.onPress}
          showDivider={divider}
        />
      ),
    })
  }
  if (familyDues && familyDues.amounts.length > 0) {
    groupRows.push({
      key: 'dues',
      render: (divider) => (
        <HomeRow
          icon="creditcard"
          title={familyDues.planName || t('homeHub.dues', { defaultValue: 'Membership fee' })}
          trailing={
            <HomeTag
              label={
                familyDues.overdue
                  ? t('contributions.status.OVERDUE')
                  : familyDues.dueDate
                    ? t('homeHub.parent.dueOn', {
                        defaultValue: 'Due {{date}}',
                        date: formatDayMonth(familyDues.dueDate, locale),
                      })
                    : t('contributions.status.PENDING')
              }
              tone={familyDues.overdue ? 'alert' : 'neutral'}
            />
          }
          onPress={() => router.push('/my-contributions' as never)}
          showDivider={divider}
          testID="parent-home-dues"
        />
      ),
    })
  }

  return (
    <View style={styles.root}>
      {socketListeners}

      {noLinkedChild ? (
        <EmptyCard
          icon="person.badge.plus"
          title={t('homeHub.parent.linkTitle', { defaultValue: 'Link your child' })}
          body={t('homeHub.parent.linkBody', {
            defaultValue:
              "Enter the code from your child's coach to see their trainings and matches here.",
          })}
          actionLabel={t('homeHub.parent.linkCta', { defaultValue: 'Link child' })}
          onAction={() => router.push(LINK_CHILD_ROUTE as never)}
        />
      ) : childCards.length > 0 && selectedCard ? (
        <>
          {childCards.length > 1 ? (
            <FilterChipRow
              chips={childCards.map(({ next }) => ({
                key: cardKey(next),
                label: next.childName
                  ? `${firstName(next.childName)} · ${teamLabel(next)}`
                  : teamLabel(next),
              }))}
              selected={cardKey(selectedCard.next)}
              onToggle={(key) => setSelectedKey(key)}
              singleSelect
              testID="parent-child-chips"
            />
          ) : null}
          <ChildCard
            key={`${selectedCard.next.childUserId ?? selectedCard.next.teamName}-${selectedCard.next.id}`}
            event={selectedCard.next}
            locale={locale}
            pending={Boolean(pendingIds[`${selectedCard.next.childUserId}-${selectedCard.next.id}`])}
            onRsvp={(status, absence) => void onChildRsvp(selectedCard.next, status, absence)}
          />
        </>
      ) : (
        <EmptyCard
          icon="calendar"
          title={t('homeHub.parent.emptyTitle', { defaultValue: 'No events for your children' })}
          body={t('homeHub.parent.emptyBody', {
            defaultValue:
              'The coaches are still planning. New trainings and matches show up here.',
          })}
          actionLabel={t('home.parent.actionOpenScheduleCta', { defaultValue: 'Open schedule' })}
          onAction={() => router.push(SCHEDULE_ROUTE as never)}
        />
      )}

      {/* Board 25: one group — carpool (away), photo consent, jobs, fee. */}
      {groupRows.length > 0 ? (
        <HomeCard>
          {groupRows.map((row, index) => (
            <Fragment key={row.key}>{row.render(index > 0)}</Fragment>
          ))}
        </HomeCard>
      ) : null}

      {error ? (
        <PressableScale
          onPress={refresh}
          accessibilityRole="button"
          accessibilityLabel={t('homeHub.retry', { defaultValue: 'Try again' })}
          style={[styles.stale, { borderTopColor: c.borderSubtle }]}
        >
          <Icon name="arrow.clockwise" size={14} color="secondary" />
          <Text variant="footnote" color="secondary">
            {t('states.home.stale', {
              defaultValue: 'Showing your last update — pull down to retry.',
            })}
          </Text>
        </PressableScale>
      ) : null}
    </View>
  )
}

/**
 * The selected child's next event as the club hero (board 25): "E-Jugend ·
 * Turnier in Treptow", the time, the Treffpunkt, then "Antwort für Emil"
 * with the in-hero segmented reply.
 */
function ChildCard({
  event,
  locale,
  pending,
  onRsvp,
}: {
  event: ChildEvent
  locale: string
  pending: boolean
  onRsvp: (status: RsvpStatus, absence?: AbsenceDetail) => void
}) {
  const hero = useHeroColors()
  const { t } = useTranslation()
  const team = teamLabel(event)
  const child = firstName(event.childName) || team
  const canAnswer = Boolean(event.childUserId && event.clubId)
  const meeting = formatTime(event.meetingAt, locale)
  const place = event.meetingPoint || event.location || null
  const meetLine = [
    meeting ? t('homeHub.hero.meetAt', { defaultValue: 'Meet {{time}}', time: meeting }) : null,
    place,
  ]
    .filter(Boolean)
    .join(' · ')
  const replyFor = t('homeHub.parent.replyFor', { defaultValue: 'Reply for {{child}}', child })

  return (
    <HeroSurface style={styles.hero}>
      <PressableScale
        onPress={() =>
          router.push({ pathname: '/event-detail', params: { eventId: event.id } } as never)
        }
        accessibilityRole="button"
        accessibilityLabel={t('home.parent.actionOpenEventA11y', {
          defaultValue: 'Open {{title}} for {{child}}',
          title: eventHeadline(event),
          child,
        })}
        haptic="tapLight"
        style={styles.heroBody}
      >
        <Text variant="footnote" weight="semibold" numberOfLines={2} style={{ color: hero.muted }}>
          {[team, eventHeadline(event)].filter(Boolean).join(' · ')}
        </Text>
        <Text variant="display" numberOfLines={1} adjustsFontSizeToFit style={[styles.kickoff, { color: hero.fg }]}>
          {heroKickoff(event.date, locale)}
        </Text>
        {meetLine ? (
          <Text variant="footnote" numberOfLines={2} style={{ color: hero.muted }}>
            {meetLine}
          </Text>
        ) : null}
      </PressableScale>

      {canAnswer ? (
        <View style={styles.reply}>
          <Text variant="footnote" weight="semibold" style={{ color: hero.fg }}>
            {replyFor}
          </Text>
          <HeroRsvp
            value={event.childRsvp ?? null}
            onChange={onRsvp}
            disabled={pending}
            subjectName={child}
            contextLabel={`${heroKickoff(event.date, locale).split(' ')[0]} ${eventHeadline(event)}`}
            accessibilityLabel={replyFor}
            testID={`parent-rsvp-${event.childUserId}`}
          />
        </View>
      ) : null}
    </HeroSurface>
  )
}

/** "30.11." */
function formatDayMonth(iso: string, locale: string): string {
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(new Date(iso))
  return locale.startsWith('de') && !day.endsWith('.') ? `${day}.` : day
}

function cardKey(event: ChildEvent): string {
  return event.childUserId ?? `team:${event.teamName}`
}

function firstName(name: string | undefined | null): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

/** "U15" rather than the group-prefixed display name. */
function teamLabel(event: ChildEvent): string {
  return event.teamName || event.teamDisplayName || ''
}

/** Coerce the overview so an older API or an error envelope renders empty. */
function normalizeOverview(value: unknown): ChildrenOverview {
  const v = (value ?? {}) as Partial<ChildrenOverview>
  return {
    children: Array.isArray(v.children)
      ? v.children.map((child) => ({ ...child, teams: Array.isArray(child.teams) ? child.teams : [] }))
      : [],
    duties: Array.isArray(v.duties) ? v.duties : [],
    announcements: Array.isArray(v.announcements) ? v.announcements : [],
  }
}

/** One events-socket subscription per child team (the hook takes one team). */
function TeamEventsListener({
  teamId,
  token,
  onChange,
}: {
  teamId: string
  token: string | null
  onChange: () => void
}) {
  useEventsSocket({ teamId, token, apiUrl: API_URL, onRsvpUpdate: onChange, onEventUpsert: onChange })
  return null
}

const styles = StyleSheet.create({
  // Board 25: 20pt between blocks (the other homes use 24).
  root: { gap: SPACING_XL },
  hero: { gap: SPACING_LG + SPACING_XXS },
  heroBody: { gap: SPACING_XS + SPACING_XXS },
  kickoff: { fontSize: 50 },
  reply: { gap: space.sm },
  stale: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    minHeight: 44,
    borderTopWidth: hairline,
  },
})
