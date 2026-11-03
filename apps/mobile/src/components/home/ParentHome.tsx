import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RSVP, type ChildrenOverview, type MyContributionSummary } from '@anstoss/shared'
import { api, API_URL } from '../../api/client'
import { useEventsSocket } from '../../hooks/useEventsSocket'
import { Avatar, Icon, PressableScale, Text } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { SILENT_REFRESH_DEBOUNCE_MS, outstandingDues } from '../../hooks/usePlayerHome'
import { RsvpControl, type AbsenceDetail, type RsvpStatus } from '../events/RsvpControl'
import {
  EmptyCard,
  HomeAwayChip,
  HomeCard,
  HomeRow,
  HomeSection,
  InlineError,
  KickoffBlock,
  LocationLine,
  TypeChip,
  eventHeadline,
  formatShortDate,
  useAccentText,
} from './HomeKit'
import { useHomeLocale } from './useHomeLocale'
import { HomeSkeleton } from './HomeSkeleton'
import { DuesRow, TasksSection, dutyIcon, dutyTitle, type HomeTask } from './HomeTasks'
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
    for (const ev of events) {
      if (ev.cancelledAt) continue
      const key = ev.childUserId ?? `team:${ev.teamName}`
      const entry = byChild.get(key)
      if (!entry) byChild.set(key, { next: ev, more: 0 })
      else entry.more += 1
    }
    return Array.from(byChild.values())
  }, [events])

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

  const announcements = overview?.announcements ?? []
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

  return (
    <View style={styles.root}>
      {socketListeners}
      {conflicts.length > 0 ? (
        <HomeSection title={t('homeHub.coach.attention', { defaultValue: 'Needs attention' })}>
          <HomeCard>
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
            />
          </HomeCard>
        </HomeSection>
      ) : null}

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
      ) : childCards.length > 0 ? (
        <HomeSection title={t('homeHub.nextUp', { defaultValue: 'Next up' })}>
          <View style={styles.childCards}>
            {childCards.map(({ next, more }) => (
              <ChildCard
                key={`${next.childUserId ?? next.teamName}-${next.id}`}
                event={next}
                more={more}
                locale={locale}
                pending={Boolean(pendingIds[`${next.childUserId}-${next.id}`])}
                onRsvp={(status, absence) => void onChildRsvp(next, status, absence)}
              />
            ))}
          </View>
        </HomeSection>
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

      <TasksSection tasks={tasks} />

      <DuesRow
        dues={familyDues}
        locale={locale}
        title={t('homeHub.parent.familyDues', { defaultValue: 'Family fees' })}
      />

      {announcements.length > 0 ? (
        <HomeSection title={t('home.announcements', { defaultValue: 'Announcements' })}>
          <HomeCard>
            {announcements.map((a, index) => (
              <HomeRow
                key={a.id}
                icon="megaphone"
                title={a.title}
                detail={[a.teamName, a.body].filter(Boolean).join(' · ')}
                showDivider={index > 0}
              />
            ))}
          </HomeCard>
        </HomeSection>
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

function ChildCard({
  event,
  more,
  locale,
  pending,
  onRsvp,
}: {
  event: ChildEvent
  more: number
  locale: string
  pending: boolean
  onRsvp: (status: RsvpStatus, absence?: AbsenceDetail) => void
}) {
  const c = useClubColors()
  const accent = useAccentText()
  const { t } = useTranslation()
  const team = teamLabel(event)
  const child = firstName(event.childName) || team
  const canAnswer = Boolean(event.childUserId && event.clubId)
  const isAway = event.type === 'MATCH' && event.homeAway === 'AWAY'
  const carpool = isAway && Boolean(event.carpoolEnabled || event.fixtureId)
  const moreLabel = t('homeHub.parent.moreEvents', { defaultValue: '+{{count}} more', count: more })

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
      <View style={styles.childHead}>
        <Avatar size="sm" fallbackText={child.slice(0, 1).toUpperCase()} />
        <Text variant="headline" weight="semibold" color="primary" style={styles.flex} numberOfLines={2}>
          {event.childName ? `${child} · ${team}` : team}
        </Text>
        {more > 0 ? (
          <PressableScale
            onPress={() => router.push(SCHEDULE_ROUTE as never)}
            accessibilityRole="button"
            accessibilityLabel={moreLabel}
            haptic="tapLight"
            style={styles.more}
          >
            <Text variant="subheadline" weight="semibold" tabular style={{ color: accent }}>
              {moreLabel}
            </Text>
          </PressableScale>
        ) : null}
      </View>

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
        style={[styles.body, { borderTopColor: c.borderSubtle }]}
      >
        <View style={styles.chipRow}>
          <TypeChip type={event.type} />
          {event.type === 'MATCH' ? <HomeAwayChip homeAway={event.homeAway} /> : null}
        </View>
        <Text variant="title3" weight="bold" color="primary" numberOfLines={2}>
          {eventHeadline(event)}
        </Text>
        <KickoffBlock event={event} locale={locale} compact />
        <LocationLine event={event} />
      </PressableScale>

      {canAnswer ? (
        <View style={[styles.reply, { borderTopColor: c.borderSubtle }]}>
          <Text variant="subheadline" weight="semibold" color="primary">
            {t('homeHub.parent.replyFor', { defaultValue: 'Reply for {{child}}', child })}
          </Text>
          <RsvpControl
            policy={event}
            value={event.childRsvp ?? null}
            onChange={onRsvp}
            disabled={pending}
            subjectName={child}
            accessibilityLabel={t('homeHub.parent.replyFor', { defaultValue: 'Reply for {{child}}', child })}
            testID={`parent-rsvp-${event.childUserId}`}
          />
        </View>
      ) : null}

      {carpool ? (
        <PressableScale
          onPress={() =>
            router.push({
              pathname: '/carpool',
              params: event.fixtureId
                ? { fixtureId: event.fixtureId, eventId: event.id }
                : { eventId: event.id },
            } as never)
          }
          accessibilityRole="button"
          accessibilityLabel={t('homeHub.parent.carpool', { defaultValue: 'Carpool' })}
          haptic="tapLight"
          style={[styles.carpool, { borderTopColor: c.borderSubtle }]}
        >
          <Icon name="car.fill" size={17} color={accent} />
          <Text variant="subheadline" weight="semibold" style={[styles.flex, { color: accent }]}>
            {t('homeHub.parent.carpool', { defaultValue: 'Carpool' })}
          </Text>
          <Icon name="chevron.right" size={14} color="tertiary" />
        </PressableScale>
      ) : null}
    </View>
  )
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
  root: { gap: space.lg },
  childCards: { gap: space.sm + space.xs },
  flex: { flex: 1 },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  childHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 4,
    minHeight: 56,
  },
  more: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.xs },
  body: {
    borderTopWidth: hairline,
    padding: space.md,
    gap: space.sm + 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  reply: {
    borderTopWidth: hairline,
    padding: space.md,
    gap: space.sm + 4,
  },
  carpool: {
    borderTopWidth: hairline,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 4,
    paddingHorizontal: space.md,
    minHeight: 52,
  },
  stale: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    minHeight: 44,
    borderTopWidth: hairline,
  },
})
