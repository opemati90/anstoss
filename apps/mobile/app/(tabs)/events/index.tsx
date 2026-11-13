import { useCallback, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native'
import {
  type CrossTeamEventItem,
  type EventFeedItem,
  type ImportedFixture,
  RSVP,
} from '@anstoss/shared'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api, API_URL } from '../../../src/api/client'
import { useEventsSocket, type EventRsvpUpdate } from '../../../src/hooks/useEventsSocket'
import { EmptyState } from '../../../src/components/EmptyState'
import { EventListSkeleton } from '../../../src/components/Skeleton'
import { Banner, FilterChipRow, Icon, Text } from '../../../src/components/ui'
import { LiveStatusPill } from '../../../src/components/match'
import { EventRow } from '../../../src/components/events/EventRow'
import type { AbsenceDetail, RsvpStatus } from '../../../src/components/events/RsvpControl'
import { monthKey, sameLocalDay } from '../../../src/components/events/eventFormat'
import { Haptics } from '../../../src/utils/haptics'
import { getAppLanguage, getAppLocale } from '../../../src/i18n'
import {
  fonts,
  RADIUS_CARD,
  RADIUS_FULL,
  RADIUS_INPUT,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
  SPACING_XXS,
  TAB_BAR_CLEARANCE,
} from '../../../src/theme/tokens'

type EventScope = 'upcoming' | 'past'
/** Design 10's chips: Alle · Training · Spiele, plus Vergangen for the past scope. */
type ListFilter = 'all' | 'TRAINING' | 'MATCH' | 'past'

/** A list row: a team event, or a (event, child) pair for parents. */
type Row =
  | { kind: 'team'; key: string; event: EventFeedItem }
  | { kind: 'child'; key: string; event: CrossTeamEventItem }

type MonthSection = { key: string; title: string; data: Row[] }

export default function EventsScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeRoleMode, token } = useAuth()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())
  const clubId = activeClub?.club.id ?? null

  const roleMode =
    activeRoleMode ??
    (activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
      ? 'ADMIN'
      : activeClub?.role === 'COACH'
        ? 'COACH'
        : activeClub?.role === 'PARENT'
          ? 'PARENT'
          : 'PLAYER')
  const isParent = roleMode === 'PARENT'
  const isClubManager = roleMode === 'ADMIN'
  const canManage =
    roleMode === 'ADMIN'
      ? Boolean(activeClub?.permissions?.EVENTS ?? true)
      : roleMode === 'COACH'

  const [filter, setFilter] = useState<ListFilter>('all')
  const scope: EventScope = filter === 'past' ? 'past' : 'upcoming'
  const [events, setEvents] = useState<EventFeedItem[]>([])
  const [childEvents, setChildEvents] = useState<CrossTeamEventItem[]>([])
  const [liveFixture, setLiveFixture] = useState<ImportedFixture | null>(null)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pending, setPending] = useState<Record<string, boolean>>({})

  const viewKey = isParent
    ? `parent:${clubId ?? 'none'}`
    : `team:${clubId ?? 'none'}:${activeTeamId ?? 'none'}:${scope}`
  const viewKeyRef = useRef(viewKey)
  viewKeyRef.current = viewKey
  const canLoad = Boolean(clubId && (isParent || activeTeamId || isClubManager))
  const loaded = loadedKey === viewKey

  const fetchEvents = useCallback(async () => {
    const key = viewKey
    if (!canLoad || !clubId) {
      setEvents([])
      setChildEvents([])
      setLiveFixture(null)
      setError(false)
      setLoadedKey(key)
      return
    }
    try {
      if (isParent) {
        const data = await api<CrossTeamEventItem[]>('/me/children-events')
        if (viewKeyRef.current !== key) return
        setChildEvents(data ?? [])
        setEvents([])
        setLiveFixture(null)
      } else {
        // Managers without a selected team read the club feed; everyone else
        // stays team-scoped so nobody sees another squad's schedule.
        const query = new URLSearchParams({ scope })
        if (activeTeamId) query.set('teamId', activeTeamId)
        const [data, fixtures] = await Promise.all([
          api<EventFeedItem[]>(`/clubs/${clubId}/events?${query.toString()}`),
          activeTeamId && scope === 'upcoming'
            ? api<ImportedFixture[]>(`/teams/${activeTeamId}/fixtures?scope=upcoming&limit=5`).catch(
                () => [] as ImportedFixture[],
              )
            : Promise.resolve([] as ImportedFixture[]),
        ])
        if (viewKeyRef.current !== key) return
        setEvents(data ?? [])
        setChildEvents([])
        setLiveFixture(fixtures?.find((fixture) => fixture.status === 'live') ?? null)
      }
      setError(false)
    } catch {
      if (viewKeyRef.current !== key) return
      setError(true)
    } finally {
      if (viewKeyRef.current === key) setLoadedKey(key)
    }
  }, [activeTeamId, canLoad, clubId, isClubManager, isParent, scope, viewKey])

  useFocusEffect(
    useCallback(() => {
      void fetchEvents()
    }, [fetchEvents]),
  )

  useEventsSocket({
    teamId: isParent ? null : activeTeamId,
    token,
    apiUrl: API_URL,
    onRsvpUpdate: useCallback((update: EventRsvpUpdate) => {
      setEvents((current) =>
        current.map((event) =>
          event.id === update.eventId
            ? {
                ...event,
                yesCount: update.yesCount,
                maybeCount: update.maybeCount,
                noCount: update.noCount,
                responseCount: update.responseCount,
              }
            : event,
        ),
      )
    }, []),
    onEventUpsert: useCallback(() => {
      void fetchEvents()
    }, [fetchEvents]),
  })

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchEvents()
    } finally {
      setRefreshing(false)
    }
  }

  const submitRsvp = async (
    rowKey: string,
    eventId: string,
    eventClubId: string,
    status: RsvpStatus,
    absence: AbsenceDetail | undefined,
    childUserId: string | null,
  ) => {
    if (pending[rowKey]) return
    Haptics.tap()
    setPending((current) => ({ ...current, [rowKey]: true }))
    const apply = (value: RsvpStatus | null) => {
      if (childUserId) {
        setChildEvents((current) =>
          current.map((item) =>
            item.id === eventId && item.childUserId === childUserId
              ? { ...item, childRsvp: value }
              : item,
          ),
        )
      } else {
        setEvents((current) =>
          current.map((item) =>
            item.id === eventId ? { ...item, myRsvp: value, myRsvpStale: false } : item,
          ),
        )
      }
    }
    const previous = childUserId
      ? (childEvents.find((item) => item.id === eventId && item.childUserId === childUserId)
          ?.childRsvp ?? null)
      : (events.find((item) => item.id === eventId)?.myRsvp ?? null)
    apply(status)
    try {
      await new Promise((resolve) => setTimeout(resolve, RSVP.DEBOUNCE_MS))
      await api(`/clubs/${eventClubId}/events/${eventId}/rsvp`, {
        method: 'PUT',
        body: {
          status,
          ...(status === 'NO' ? absence : {}),
          ...(childUserId ? { childUserId } : {}),
        },
      })
      Haptics.success()
    } catch {
      apply(previous)
      Haptics.fail()
      Alert.alert(t('eventFlow.rsvp.failedTitle'), t('eventFlow.rsvp.failedBody'))
    } finally {
      setPending((current) => {
        const next = { ...current }
        delete next[rowKey]
        return next
      })
    }
  }

  const rows: Row[] = useMemo(
    () =>
      isParent
        ? childEvents.map((event) => ({
            kind: 'child' as const,
            key: `${event.id}:${event.childUserId ?? 'self'}`,
            event,
          }))
        : events
            .filter((event) => filter === 'all' || filter === 'past' || event.type === filter)
            .map((event) => ({ kind: 'team' as const, key: event.id, event })),
    [childEvents, events, filter, isParent],
  )
  // Coaches (design 11) and players (design 23) see one white group with
  // no month labels; parents keep the month sections across children.
  const sections = useMemo<MonthSection[]>(
    () =>
      !isParent
        ? rows.length > 0
          ? [{ key: 'all', title: '', data: rows }]
          : []
        : buildMonthSections(rows, locale),
    [isParent, locale, rows],
  )

  const openEvent = (eventId: string) =>
    router.push({ pathname: '/event-detail', params: { eventId } })

  const showSkeleton = canLoad && !loaded && !error
  const title = isParent ? t('eventFlow.list.parentTitle') : t('eventFlow.list.title')

  // Players and parents: how many upcoming events still wait for an answer.
  const openReplies = useMemo(() => {
    if (scope !== 'upcoming') return 0
    if (isParent) {
      return childEvents.filter(
        (event) => event.childUserId && !event.cancelledAt && !event.childRsvp,
      ).length
    }
    return events.filter(
      (event) => !event.cancelledAt && (!event.myRsvp || event.myRsvpStale),
    ).length
  }, [childEvents, events, isParent, scope])
  const showReplyStatus = !canManage && scope === 'upcoming' && loaded && !error && rows.length > 0

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <Text variant="title1" color="primary" accessibilityRole="header">
            {title}
          </Text>
        </View>
        {canManage ? (
          <Pressable
            onPress={() => router.push('/create-event')}
            accessibilityRole="button"
            accessibilityLabel={t('eventFlow.list.create')}
            hitSlop={4}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: c.ink },
              pressed && styles.pressed,
            ]}
            testID="events-create"
          >
            <Icon name="plus" size={20} color={c.onInk} />
          </Pressable>
        ) : null}
      </View>
      {canManage && scope === 'upcoming' ? (
        <WeekStrip events={events} locale={locale} />
      ) : null}
      {/* Players answer the upcoming list (design 23): no filter chips. */}
      {canManage ? (
        <FilterChipRow<ListFilter>
          chips={[
            { key: 'all', label: t('eventFlow.list.filterAll', { defaultValue: 'All' }) },
            { key: 'TRAINING', label: t('eventFlow.type.TRAINING') },
            { key: 'MATCH', label: t('eventFlow.list.filterMatches', { defaultValue: 'Matches' }) },
            { key: 'past', label: t('eventFlow.list.past') },
          ]}
          selected={filter}
          onToggle={setFilter}
          singleSelect
          testID="events-filter"
        />
      ) : null}
      {showReplyStatus ? (
        <View style={styles.status} accessible accessibilityRole="text">
          <View style={[styles.statusDot, { backgroundColor: c.accent, borderColor: c.ink }]} />
          <Text variant="subheadline" weight="semibold" color="primary" style={styles.flex}>
            {openReplies > 0
              ? t('eventFlow.list.awaitingReply', {
                  count: openReplies,
                  defaultValue: '{{count}} events waiting for your answer',
                })
              : t('eventFlow.list.allAnswered', { defaultValue: 'All answered' })}
          </Text>
        </View>
      ) : null}
      {/* The live score is a coach row here; players see it on Start. */}
      {liveFixture && canManage ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/match-detail',
              params: { fixtureId: liveFixture.id, teamId: liveFixture.teamId },
            })
          }
          accessibilityRole="button"
          android_ripple={{ color: c.surfaceSunken }}
          accessibilityLabel={t('eventFlow.list.liveA11y', {
            home: liveFixture.homeTeam,
            away: liveFixture.awayTeam,
          })}
          style={({ pressed }) => [
            styles.liveBanner,
            { backgroundColor: c.surface },
            pressed && styles.pressed,
          ]}
        >
          <LiveStatusPill status="live" />
          <Text variant="subheadline" weight="semibold" color="primary" numberOfLines={2} style={styles.flex}>
            {`${liveFixture.homeTeam} `}
            <Text variant="subheadline" weight="semibold" color="primary" tabular style={styles.liveScore}>
              {`${liveFixture.resultHome ?? 0}:${liveFixture.resultAway ?? 0}`}
            </Text>
            {` ${liveFixture.awayTeam}`}
          </Text>
          <Icon name="chevron.right" size={14} color="tertiary" />
        </Pressable>
      ) : null}
      {error && loaded ? (
        <Banner
          tone="error"
          title={t('eventFlow.list.errorTitle')}
          action={{ label: t('eventFlow.retry'), onPress: () => void fetchEvents() }}
        />
      ) : null}
    </View>
  )

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <SectionList
        sections={showSkeleton ? [] : sections}
        keyExtractor={(row) => row.key}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <View style={[styles.monthHeader, { backgroundColor: c.background }]}>
              <Text variant="label" accessibilityRole="header">
                {section.title}
              </Text>
            </View>
          ) : (
            <View style={styles.groupGap} />
          )
        }
        renderItem={({ item, index, section }) =>
          item.kind === 'child' ? (
            <EventRow
              testID={`event-row-${item.event.id}`}
              event={item.event}
              locale={locale}
              first={index === 0}
              last={index === section.data.length - 1}
              eyebrow={[item.event.childName, item.event.teamDisplayName || item.event.teamName]
                .filter(Boolean)
                .join(' · ')}
              onOpen={() => openEvent(item.event.id)}
              rsvp={
                item.event.childUserId
                  ? {
                      value: item.event.childRsvp ?? null,
                      pending: pending[item.key],
                      subjectName: firstName(item.event.childName),
                      onChange: (status, absence) =>
                        void submitRsvp(
                          item.key,
                          item.event.id,
                          item.event.clubId,
                          status,
                          absence,
                          item.event.childUserId ?? null,
                        ),
                    }
                  : undefined
              }
            />
          ) : (
            <EventRow
              testID={`event-row-${item.event.id}`}
              event={item.event}
              locale={locale}
              first={index === 0}
              last={index === section.data.length - 1}
              eyebrow={isClubManager && !activeTeamId ? item.event.team?.name : null}
              compact={canManage}
              onOpen={() => openEvent(item.event.id)}
              trailing={canManage ? summaryValue(item.event, scope) : null}
              trailingHint={canManage ? summaryHint(item.event, scope, t) : null}
              accessibilityExtra={canManage ? summaryExtra(item.event, scope, t) : null}
              rsvp={
                !canManage && scope === 'upcoming'
                  ? {
                      value: item.event.myRsvpStale ? null : item.event.myRsvp,
                      pending: pending[item.key],
                      onChange: (status, absence) =>
                        void submitRsvp(item.key, item.event.id, item.event.clubId, status, absence, null),
                    }
                  : undefined
              }
            />
          )
        }
        ListEmptyComponent={
          showSkeleton ? (
            <EventListSkeleton />
          ) : !error ? (
            <View style={styles.empty}>
              <EmptyState
                icon="calendar"
                illustration="emptyEvents"
                title={
                  isParent
                    ? t('eventFlow.list.emptyParentTitle')
                    : scope === 'past'
                      ? t('eventFlow.list.emptyPastTitle')
                      : t('eventFlow.list.emptyTitle')
                }
                description={
                  isParent
                    ? t('eventFlow.list.emptyParentBody')
                    : canManage
                      ? t('eventFlow.list.emptyCoachBody')
                      : t('eventFlow.list.emptyPlayerBody')
                }
                actionLabel={canManage && scope === 'upcoming' ? t('eventFlow.list.create') : undefined}
                onAction={canManage && scope === 'upcoming' ? () => router.push('/create-event') : undefined}
              />
            </View>
          ) : null
        }
      />
    </View>
  )
}

function firstName(name: string | null | undefined): string | null {
  if (!name) return null
  return name.trim().split(/\s+/)[0] ?? null
}

/** Coach summary (design 10): the Zusagen as one Barlow number, or check-ins for past rows. */
function summaryValue(event: EventFeedItem, scope: EventScope): string | null {
  if (event.cancelledAt) return null
  return String(scope === 'past' ? (event.checkInCount ?? 0) : event.yesCount)
}

function summaryHint(
  event: EventFeedItem,
  scope: EventScope,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (event.cancelledAt) return null
  return scope === 'past'
    ? t('eventFlow.list.attended')
    : t('eventFlow.list.going', { defaultValue: 'going' })
}

/** Not shown, read out: the squad size and how many replies are still open. */
function summaryExtra(
  event: EventFeedItem,
  scope: EventScope,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (event.cancelledAt || scope === 'past') return null
  const open = Math.max(0, (event.squadSize ?? 0) - event.responseCount)
  return open > 0 ? t('eventFlow.list.openCount', { count: open }) : null
}

/**
 * Design 10's week strip: the next seven days, today in ink, a club-colour
 * dot under days with an event. Decorative for screen readers; the list
 * below carries the same information.
 */
function WeekStrip({ events, locale }: { events: EventFeedItem[]; locale: string }) {
  const c = useClubColors()
  const days = useMemo(() => {
    const start = new Date()
    start.setHours(12, 0, 0, 0)
    return Array.from({ length: 7 }, (_, offset) => {
      const day = new Date(start)
      day.setDate(start.getDate() + offset)
      return {
        key: day.toDateString(),
        weekday: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day).replace('.', ''),
        number: String(day.getDate()),
        today: offset === 0,
        busy: events.some((event) => !event.cancelledAt && sameLocalDay(event.date, day)),
      }
    })
  }, [events, locale])
  return (
    <View
      style={[styles.week, { backgroundColor: c.surface }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="events-week"
    >
      {days.map((day) => {
        const fg = day.today ? c.onInk : c.textPrimary
        return (
          <View
            key={day.key}
            style={[styles.weekDay, day.today && { backgroundColor: c.ink }]}
          >
            <Text variant="caption1" weight="semibold" color={fg} style={styles.weekLabel}>
              {day.weekday}
            </Text>
            <Text variant="data" color={fg} style={styles.weekNumber}>
              {day.number}
            </Text>
            <View
              style={[
                styles.weekDot,
                { backgroundColor: day.busy ? (day.today ? c.onInk : c.primary) : 'transparent' },
              ]}
            />
          </View>
        )
      })}
    </View>
  )
}

function buildMonthSections(rows: Row[], locale: string): MonthSection[] {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const date = new Date(row.event.date)
    if (Number.isNaN(date.getTime())) continue
    const key = monthKey(row.event.date)
    const bucket = groups.get(key) ?? []
    bucket.push(row)
    groups.set(key, bucket)
  }
  return Array.from(groups.entries()).map(([key, data]) => ({
    key,
    title: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      new Date(`${key}-01T12:00:00`),
    ),
    data,
  }))
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.7 },
  list: { paddingBottom: TAB_BAR_CLEARANCE + SPACING_XL },
  header: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_LG,
    gap: SPACING_XL,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  week: {
    flexDirection: 'row',
    gap: SPACING_XXS,
    padding: SPACING_SM,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    gap: SPACING_XS,
    paddingVertical: SPACING_SM,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
  },
  weekLabel: { opacity: 0.7 },
  weekNumber: { fontFamily: fonts.data, fontSize: 21, lineHeight: 22 },
  weekDot: { width: 5, height: 5, borderRadius: RADIUS_FULL },
  status: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD - 2 },
  statusDot: { width: 8, height: 8, borderRadius: RADIUS_FULL, borderWidth: 1 },
  monthHeader: {
    paddingHorizontal: SCREEN_PADDING + SPACING_XS,
    paddingTop: SPACING_XL,
    paddingBottom: SPACING_MD,
  },
  liveBanner: {
    minHeight: 52,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_SM,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING_SM,
  },
  liveScore: { fontFamily: fonts.data },
  groupGap: { height: SPACING_XL },
  empty: { paddingTop: SPACING_XL, paddingHorizontal: SCREEN_PADDING },
})
