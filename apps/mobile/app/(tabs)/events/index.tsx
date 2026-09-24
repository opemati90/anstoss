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
import { Banner, Icon, SegmentedControl, Text } from '../../../src/components/ui'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { LiveStatusPill } from '../../../src/components/match'
import { EventRow } from '../../../src/components/events/EventRow'
import type { AbsenceDetail, RsvpStatus } from '../../../src/components/events/RsvpControl'
import { monthKey } from '../../../src/components/events/eventFormat'
import { Haptics } from '../../../src/utils/haptics'
import { getAppLanguage, getAppLocale } from '../../../src/i18n'
import { fonts, radius, space, TAB_BAR_CLEARANCE } from '../../../src/theme/tokens'

type EventScope = 'upcoming' | 'past'

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

  const [scope, setScope] = useState<EventScope>('upcoming')
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
        : events.map((event) => ({ kind: 'team' as const, key: event.id, event })),
    [childEvents, events, isParent],
  )
  const sections = useMemo(() => buildMonthSections(rows, locale), [locale, rows])

  const openEvent = (eventId: string) =>
    router.push({ pathname: '/event-detail', params: { eventId } })

  const showSkeleton = canLoad && !loaded && !error
  const title = isParent ? t('eventFlow.list.parentTitle') : t('eventFlow.list.title')

  const header = (
    <View>
      <View style={styles.headerWrap}>
        <TabScreenHeader
          eyebrow={activeClub?.club.name}
          title={title}
          actionIcon={canManage ? 'plus' : undefined}
          onActionPress={canManage ? () => router.push('/create-event') : undefined}
          actionAccessibilityLabel={t('eventFlow.list.create')}
          actionColor={c.primary}
        />
      </View>
      {!isParent ? (
        <View style={styles.controls}>
          <SegmentedControl<EventScope>
            segments={[
              { key: 'upcoming', label: t('eventFlow.list.upcoming') },
              { key: 'past', label: t('eventFlow.list.past') },
            ]}
            value={scope}
            onChange={setScope}
          />
        </View>
      ) : null}
      {liveFixture ? (
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
            { backgroundColor: c.surface, borderColor: c.borderSubtle },
            pressed && { opacity: 0.7 },
          ]}
        >
          <LiveStatusPill status="live" />
          <Text variant="subheadline" weight="semibold" color="primary" numberOfLines={1} style={styles.liveText}>
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
        <View style={styles.bannerWrap}>
          <Banner
            tone="error"
            title={t('eventFlow.list.errorTitle')}
            action={{ label: t('eventFlow.retry'), onPress: () => void fetchEvents() }}
          />
        </View>
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
        renderSectionHeader={({ section }) => (
          <View style={[styles.monthHeader, { backgroundColor: c.background }]}>
            <Text variant="footnote" weight="semibold" color="secondary" style={styles.monthText}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) =>
          item.kind === 'child' ? (
            <EventRow
              testID={`event-row-${item.event.id}`}
              event={item.event}
              locale={locale}
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
              eyebrow={isClubManager && !activeTeamId ? item.event.team?.name : null}
              onOpen={() => openEvent(item.event.id)}
              trailing={canManage ? summaryValue(item.event, scope) : null}
              trailingHint={canManage ? summaryHint(item.event, scope, t) : null}
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

/** Coach summary: confirmed of squad ("14/18"), or attendance for past rows. */
function summaryValue(event: EventFeedItem, scope: EventScope): string | null {
  if (event.cancelledAt) return null
  const squad = event.squadSize ?? 0
  if (scope === 'past') {
    const checkIns = event.checkInCount ?? 0
    return squad > 0 ? `${checkIns}/${squad}` : String(checkIns)
  }
  return squad > 0 ? `${event.yesCount}/${squad}` : String(event.yesCount)
}

function summaryHint(
  event: EventFeedItem,
  scope: EventScope,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (event.cancelledAt) return null
  if (scope === 'past') return t('eventFlow.list.attended')
  const open = Math.max(0, (event.squadSize ?? 0) - event.responseCount)
  return open > 0 ? t('eventFlow.list.openCount', { count: open }) : t('eventFlow.list.confirmed')
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
  list: { paddingBottom: TAB_BAR_CLEARANCE + space.lg },
  headerWrap: { paddingHorizontal: space.md, paddingTop: space.sm },
  controls: { paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: space.sm },
  monthHeader: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  monthText: { fontFamily: fonts.label, textTransform: 'capitalize' },
  liveBanner: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  liveText: { flex: 1 },
  liveScore: { fontFamily: fonts.data },
  bannerWrap: { paddingHorizontal: space.md, paddingTop: space.sm },
  empty: { paddingTop: space.xl, paddingHorizontal: space.md },
})
