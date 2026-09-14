import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native'
import {
  type CrossTeamEventItem,
  EventFeedItem,
  type ImportedFixture,
  RSVP,
} from '@anstoss/shared'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { hexToRgba } from '../../../src/theme/club-theme'
import { api, API_URL } from '../../../src/api/client'
import {
  useEventsSocket,
  type EventRsvpUpdate,
} from '../../../src/hooks/useEventsSocket'
import { EmptyState } from '../../../src/components/EmptyState'
import { EventListSkeleton } from '../../../src/components/Skeleton'
import { LoadingBoundary } from '../../../src/components/LoadingBoundary'
import { ErrorBoundary } from '../../../src/components/ErrorBoundary'
import {
  Banner,
  BottomSheet,
  FilterChipRow,
  type FilterChip,
  Icon,
  ListRow,
  SegmentedControl,
  Text,
} from '../../../src/components/ui'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { LiveStatusPill } from '../../../src/components/match'
import {
  RsvpControl,
  type RsvpStatus,
} from '../../../src/components/home/RsvpControl'
import { Haptics } from '../../../src/utils/haptics'
import { getAppLanguage, getAppLocale } from '../../../src/i18n'
import {
  elevation,
  fonts,
  hairline,
  radius,
  space,
  TAB_BAR_CLEARANCE,
} from '../../../src/theme/tokens'

type EventScope = 'upcoming' | 'past'
type FilterType = 'ALL' | 'TRAINING' | 'MATCH' | 'OTHER'

type EventSection = {
  title: string
  data: EventFeedItem[]
  /** `reply` is the pinned outstanding-answers group; `month` is the schedule. */
  kind: 'reply' | 'month'
  /** Count badge for the reply section header. */
  count?: number
}

type ParentEventSection = {
  title: string
  data: CrossTeamEventItem[]
}

/** Below this many events, filtering costs more screen than it saves. */
const FILTER_VISIBILITY_THRESHOLD = 6

const TYPE_CHIPS: FilterChip<FilterType>[] = [
  { key: 'TRAINING', label: 'eventFilter.training' },
  { key: 'MATCH', label: 'eventFilter.match' },
  { key: 'OTHER', label: 'eventFilter.other' },
]

export default function EventsScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeRoleMode, token } = useAuth()
  const c = useClubColors()
  const [events, setEvents] = useState<EventFeedItem[]>([])
  const [fixtures, setFixtures] = useState<ImportedFixture[]>([])
  const [liveFixture, setLiveFixture] = useState<ImportedFixture | null>(null)
  const [parentEvents, setParentEvents] = useState<CrossTeamEventItem[]>([])
  const [loadedViewKey, setLoadedViewKey] = useState<string | null>(null)

  /**
   * Map a MATCH event → its imported fixture by matching kickoff time
   * (within ~5 min). Lets us route MATCH taps to the rebuilt /match-detail
   * screen instead of the legacy /event-detail modal.
   */
  const fixtureForEvent = useCallback(
    (event: EventFeedItem): ImportedFixture | null => {
      if (event.type !== 'MATCH') return null
      const eventTime = new Date(event.date).getTime()
      return (
        fixtures.find(
          (f) => Math.abs(new Date(f.kickoffAt).getTime() - eventTime) < 5 * 60 * 1000,
        ) ?? null
      )
    },
    [fixtures],
  )

  const navigateToEvent = useCallback(
    (event: EventFeedItem) => {
      const fx = fixtureForEvent(event)
      if (fx) {
        router.push({
          pathname: '/match-detail',
          params: { fixtureId: fx.id, teamId: fx.teamId },
        })
      } else {
        router.push({ pathname: '/event-detail', params: { eventId: event.id } })
      }
    },
    [fixtureForEvent],
  )
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [pendingEventIds, setPendingEventIds] = useState<Record<string, boolean>>({})
  const [filterType, setFilterType] = useState<FilterType>('ALL')
  const [scope, setScope] = useState<EventScope>('upcoming')
  // Long-press on a row opens the same three actions the detail screen has.
  const [manageTarget, setManageTarget] = useState<EventFeedItem | null>(null)

  const locale = getAppLocale(getAppLanguage())
  const resolvedRoleMode = activeRoleMode ?? (
    activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
      ? 'ADMIN'
      : activeClub?.role === 'COACH'
        ? 'COACH'
        : activeClub?.role === 'PARENT'
          ? 'PARENT'
          : 'PLAYER'
  )
  const isParent = resolvedRoleMode === 'PARENT'
  const viewKey = isParent
    ? `parent:${activeClub?.club.id ?? 'none'}`
    : `team:${activeClub?.club.id ?? 'none'}:${activeTeamId ?? 'none'}:${scope}:${filterType}`
  const isClubManager = resolvedRoleMode === 'ADMIN'
  const loadedViewKeyRef = useRef<string | null>(null)
  const currentViewKeyRef = useRef(viewKey)
  currentViewKeyRef.current = viewKey
  const markViewLoaded = useCallback((key: string) => {
    loadedViewKeyRef.current = key
    setLoadedViewKey(key)
  }, [])
  const hasCurrentData = loadedViewKey === viewKey
  const canLoadCurrentView = Boolean(activeClub && (isParent || activeTeamId || isClubManager))
  const currentViewLoading =
    canLoadCurrentView && !error && (loading || !hasCurrentData)
  const visibleEvents = hasCurrentData ? events : []
  const visibleParentEvents = hasCurrentData ? parentEvents : []
  const visibleLiveFixture = hasCurrentData ? liveFixture : null

  const canCreate = useMemo(() => {
    if (resolvedRoleMode === 'ADMIN') return Boolean(activeClub?.permissions?.EVENTS ?? true)
    return resolvedRoleMode === 'COACH'
  }, [activeClub?.permissions?.EVENTS, resolvedRoleMode])

  const fetchEvents = useCallback(async () => {
    const requestViewKey = viewKey
    const shouldBlockView = loadedViewKeyRef.current !== requestViewKey

    if (!activeClub) {
      // Without club context the list will only ever be empty — drop out of
      // the loading skeleton so the empty state renders instead.
      setError(false)
      setEvents([])
      setParentEvents([])
      setFixtures([])
      setLiveFixture(null)
      markViewLoaded(requestViewKey)
      setLoading(false)
      return
    }

    if (isParent) {
      if (shouldBlockView) setLoading(true)
      try {
        const data = await api<CrossTeamEventItem[]>('/me/children-events')
        if (currentViewKeyRef.current !== requestViewKey) return
        setError(false)
        setParentEvents(data || [])
        setEvents([])
        setFixtures([])
        setLiveFixture(null)
        markViewLoaded(requestViewKey)
      } catch {
        if (currentViewKeyRef.current !== requestViewKey) return
        if (shouldBlockView) {
          setParentEvents([])
          markViewLoaded(requestViewKey)
        }
        setError(true)
      } finally {
        if (currentViewKeyRef.current === requestViewKey) {
          setLoading(false)
        }
      }
      return
    }

    if (!activeTeamId && !isClubManager) {
      // Same idea — no team selected means nothing to fetch; surface the
      // empty state immediately rather than spinning forever.
      setError(false)
      setEvents([])
      setParentEvents([])
      setFixtures([])
      setLiveFixture(null)
      markViewLoaded(requestViewKey)
      setLoading(false)
      return
    }

    if (shouldBlockView) setLoading(true)
    try {
      const params = new URLSearchParams({
        teamId: activeTeamId ?? '',
        scope,
      })

      if (filterType !== 'ALL') {
        params.set('type', filterType)
      }

      // Managers need the club feed, not a potentially stale team selection.
      // The club endpoint also returns team badges and prevents a 403 when an
      // admin has not yet selected a team in this session. Rostered members
      // remain team-scoped to preserve tenant/team visibility.
      const eventsPath = isClubManager
        ? `/clubs/${activeClub.club.id}/events?${new URLSearchParams({
            scope,
            ...(filterType !== 'ALL' ? { type: filterType } : {}),
          }).toString()}`
        : `/clubs/${activeClub.club.id}/events?${params.toString()}`
      const [data, fetchedFixtures] = await Promise.all([
        api<EventFeedItem[]>(eventsPath),
        activeTeamId
          ? api<ImportedFixture[]>(
              `/teams/${activeTeamId}/fixtures?scope=upcoming&limit=10`,
            ).catch(() => [] as ImportedFixture[])
          : Promise.resolve([] as ImportedFixture[]),
      ])

      if (currentViewKeyRef.current !== requestViewKey) return
      setError(false)
      setEvents(data || [])
      setFixtures(fetchedFixtures ?? [])
      setLiveFixture(fetchedFixtures?.find((f) => f.status === 'live') ?? null)
      setParentEvents([])
      markViewLoaded(requestViewKey)
    } catch {
      if (currentViewKeyRef.current !== requestViewKey) return
      if (shouldBlockView) {
        setEvents([])
        setParentEvents([])
        setFixtures([])
        setLiveFixture(null)
        markViewLoaded(requestViewKey)
      }
      setError(true)
    } finally {
      if (currentViewKeyRef.current === requestViewKey) {
        setLoading(false)
      }
    }
  }, [activeClub, activeTeamId, filterType, isClubManager, isParent, markViewLoaded, scope, viewKey])

  useFocusEffect(
    useCallback(() => {
      void fetchEvents()
    }, [fetchEvents]),
  )

  // Realtime: live RSVP counts + new/changed events for the active team.
  // Parents view a cross-team feed (no single teamId), so the socket only
  // runs for the team-scoped view.
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

  const handleRsvp = async (eventId: string, status: string) => {
    if (!activeClub || pendingEventIds[eventId]) {
      return
    }

    Haptics.tap()
    setPendingEventIds((current) => ({ ...current, [eventId]: true }))
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? { ...event, myRsvp: status as EventFeedItem['myRsvp'] }
          : event,
      ),
    )

    try {
      await new Promise((resolve) => setTimeout(resolve, RSVP.DEBOUNCE_MS))
      await api(`/clubs/${activeClub.club.id}/events/${eventId}/rsvp`, {
        method: 'PUT',
        body: { status },
      })
      await fetchEvents()
    } catch {
      Alert.alert(t('common.error'), t('errors.server'))
      await fetchEvents()
    } finally {
      setPendingEventIds((current) => {
        const next = { ...current }
        delete next[eventId]
        return next
      })
    }
  }

  const typeChipOptions = useMemo(
    () =>
      TYPE_CHIPS.map((chip) => ({
        ...chip,
        label: t(chip.label),
      })),
    [t],
  )

  const handleTypeToggle = (key: FilterType) => {
    if (scope === 'past') setScope('upcoming')
    setFilterType((current) => (current === key ? 'ALL' : key))
  }

  // The hero is the next thing to prepare for, so a cancelled event never
  // takes it: it stays in the list, struck through with its reason, and the
  // next live plan moves up.
  const nextFixture =
    scope === 'upcoming' ? visibleEvents.find((event) => !event.cancelledAt) ?? null : null
  const listEvents =
    scope === 'upcoming'
      ? visibleEvents.filter((event) => event.id !== nextFixture?.id)
      : visibleEvents
  const sections = useMemo(
    () => buildSections(listEvents, locale, t, scope),
    [listEvents, locale, scope, t],
  )

  const hasListContent = sections.some((section) => section.data.length > 0)

  if (isParent) {
    return (
      <ParentEventsBoard
        clubName={activeClub?.club.name || ''}
        events={visibleParentEvents}
        loading={currentViewLoading}
        locale={locale}
        onOpenEvent={(eventId, teamId) =>
          router.push({
            pathname: '/event-detail',
            params: { eventId, teamId },
          })
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    )
  }

  const selectedFilterKey = filterType === 'ALL' ? null : filterType
  // Keep the filters visible whenever one is active, so the user can always
  // clear a filter that is currently hiding rows.
  const showTypeFilters = filterType !== 'ALL' || events.length > FILTER_VISIBILITY_THRESHOLD

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ErrorBoundary
        onRetry={() => void fetchEvents()}
        fallbackTitleKey="states.events.error.title"
        fallbackBodyKey="states.events.error.body"
        fallbackRetryKey="states.common.retry"
      >
        <LoadingBoundary
          isLoading={currentViewLoading && visibleEvents.length === 0}
          skeleton={
            <View style={{ flex: 1 }}>
              <View style={styles.headerWrap}>
                <TabScreenHeader title={t('event.screenTitle')} />
              </View>
              <EventListSkeleton />
            </View>
          }
          testID="events-loading-boundary"
        >
          <SectionList
            sections={sections}
            key={`${activeTeamId}:${scope}`}
            keyExtractor={(event) => event.id}
            renderItem={({ item, index, section }) => (
              <EventListItem
                item={item}
                locale={locale}
                scope={scope}
                pending={Boolean(pendingEventIds[item.id])}
                dayLabel={
                  section.kind === 'month' && !sameDay(section.data[index - 1]?.date, item.date)
                    ? formatSectionDate(item.date, locale, t)
                    : null
                }
                showAttendance={scope === 'past' && canCreate}
                onRsvp={(status) => handleRsvp(item.id, status)}
                onOpen={() => navigateToEvent(item)}
                onLongPress={canCreate && !item.cancelledAt ? () => setManageTarget(item) : undefined}
              />
            )}
            renderSectionHeader={({ section }) => (
              <View
                style={[
                  styles.sectionHeader,
                  section.kind === 'month' && [styles.monthHeader, { backgroundColor: c.background }],
                ]}
              >
                <Text
                  variant="caption1"
                  color={section.kind === 'reply' ? 'primary' : 'tertiary'}
                  weight="semibold"
                  style={styles.sectionHeaderText}
                >
                  {section.title}
                </Text>
                {section.kind === 'reply' && section.count ? (
                  <View
                    style={[
                      styles.sectionCount,
                      { backgroundColor: hexToRgba(c.primary, 0.12) },
                    ]}
                  >
                    <Text variant="caption2" weight="bold" tabular style={{ color: c.primary }}>
                      {section.count}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
            contentContainerStyle={styles.list}
            // Month headers stay put while the month scrolls under them; the
            // pinned reply group is small enough to scroll away.
            stickySectionHeadersEnabled
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListHeaderComponent={
              <View>
                <View style={styles.headerWrap}>
                  <TabScreenHeader
                    title={t('event.screenTitle')}
                    actionIcon={canCreate ? 'plus' : undefined}
                    onActionPress={
                      canCreate ? () => router.push('/create-event') : undefined
                    }
                    actionAccessibilityLabel={t('event.createEvent')}
                    actionColor={c.primary}
                  />
                </View>

                <View style={styles.controls}>
                  <SegmentedControl<EventScope>
                    segments={[
                      { key: 'upcoming', label: t('eventFilter.upcoming') },
                      { key: 'past', label: t('eventFilter.past') },
                    ]}
                    value={scope}
                    onChange={(next) => {
                      setScope(next)
                      if (next === 'past') setFilterType('ALL')
                    }}
                  />
                  {/* Type filters earn their row only once the list is long
                      enough to need them. Below that they were a second bar of
                      chrome pushing the first real event under the fold. */}
                  {scope === 'upcoming' && showTypeFilters ? (
                    <View style={styles.chipRow}>
                      <FilterChipRow<FilterType>
                        chips={typeChipOptions}
                        selected={selectedFilterKey}
                        onToggle={handleTypeToggle}
                        singleSelect
                      />
                    </View>
                  ) : null}
                </View>

                {visibleLiveFixture ? (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/match-detail',
                        params: {
                          fixtureId: visibleLiveFixture.id,
                          teamId: visibleLiveFixture.teamId,
                        },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${visibleLiveFixture.homeTeam} vs ${visibleLiveFixture.awayTeam} live`}
                    style={({ pressed }) => [
                      styles.liveBanner,
                      elevation.card,
                      { backgroundColor: c.primary },
                      pressed && styles.pressedScale,
                    ]}
                  >
                    <LiveStatusPill status="live" inverse />
                    <Text variant="footnote" weight="semibold" style={[styles.liveBannerText, { color: c.textInverse }]} numberOfLines={1}>
                      {visibleLiveFixture.homeTeam}{' '}
                      <Text variant="footnote" weight="semibold" style={[styles.liveScore, { color: c.textInverse }]} tabular>
                        {visibleLiveFixture.resultHome ?? 0}-{visibleLiveFixture.resultAway ?? 0}
                      </Text>{' '}
                      {visibleLiveFixture.awayTeam}
                    </Text>
                    <Icon name="chevron.right" size="sm" color={c.textInverse} />
                  </Pressable>
                ) : null}

                {nextFixture ? (
                  <NextFixtureCard
                    item={nextFixture}
                    locale={locale}
                    pending={Boolean(pendingEventIds[nextFixture.id])}
                    onRsvp={handleRsvp}
                    onOpen={() => navigateToEvent(nextFixture)}
                  />
                ) : null}
              </View>
            }
            ListEmptyComponent={
              !currentViewLoading && !error && !nextFixture && !hasListContent ? (
                <View style={styles.empty}>
                  <EmptyState
                    icon="calendar.fill"
                    illustration="emptyEvents"
                    title={t('states.events.empty.title')}
                    description={t('states.events.empty.body')}
                    actionLabel={
                      canCreate ? t('states.events.empty.cta') : undefined
                    }
                    onAction={
                      canCreate ? () => router.push('/create-event') : undefined
                    }
                  />
                </View>
              ) : null
            }
          />
        </LoadingBoundary>
        <BottomSheet visible={Boolean(manageTarget)} onClose={() => setManageTarget(null)} heightPct="auto">
          <View style={styles.sheetBody}>
            <Text variant="headline" weight="semibold" color="primary" numberOfLines={1}>
              {manageTarget?.title ?? ''}
            </Text>
            <ListRow
              title={t('event.manage.edit', { defaultValue: 'Edit' })}
              left={<Icon name="pencil" size={18} color="secondary" />}
              showChevron
              onPress={() => {
                const target = manageTarget
                setManageTarget(null)
                if (target) router.push({ pathname: '/create-event', params: { eventId: target.id } })
              }}
            />
            <ListRow
              title={t('event.manage.duplicate', { defaultValue: 'Duplicate' })}
              left={<Icon name="doc.on.doc" size={18} color="secondary" />}
              showChevron
              onPress={() => {
                const target = manageTarget
                setManageTarget(null)
                if (target)
                  router.push({ pathname: '/create-event', params: { duplicateFrom: target.id } })
              }}
            />
            <ListRow
              title={t('event.manage.cancelEvent', { defaultValue: 'Cancel event' })}
              left={<Icon name="xmark.circle" size={18} color={c.error} />}
              showChevron
              onPress={() => {
                const target = manageTarget
                setManageTarget(null)
                if (target)
                  router.push({ pathname: '/event-detail', params: { eventId: target.id, cancel: '1' } })
              }}
            />
          </View>
        </BottomSheet>

      </ErrorBoundary>
      {error && !loading ? (
        <View style={styles.bannerWrap}>
          <Banner
            tone="error"
            title={t('states.events.error.title')}
            action={{
              label: t('states.common.retry'),
              onPress: () => {
                setError(false)
                void fetchEvents()
              },
            }}
          />
        </View>
      ) : null}
    </View>
  )
}

// --- Parent view ---

function ParentEventsBoard({
  clubName,
  events,
  loading,
  locale,
  onOpenEvent,
  refreshing,
  onRefresh,
}: {
  clubName: string
  events: CrossTeamEventItem[]
  loading: boolean
  locale: string
  onOpenEvent: (eventId: string, teamId: string) => void
  refreshing: boolean
  onRefresh: () => Promise<void>
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const nextEvent = events[0] ?? null
  const sections = useMemo(
    () => buildParentSections(events.slice(1), locale, t),
    [events, locale, t],
  )
  const hasListContent = sections.some((section) => section.data.length > 0)

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <SectionList
        sections={sections}
        key={`parent:${clubName}`}
        keyExtractor={(event) => event.id}
        renderItem={({ item }) => (
          <ParentScheduleItemCard
            item={item}
            locale={locale}
            onOpen={() => onOpenEvent(item.id, item.teamId)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text variant="caption1" color="tertiary" weight="semibold" style={styles.sectionHeaderText}>
              {section.title}
            </Text>
          </View>
        )}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.headerWrap}>
              <TabScreenHeader eyebrow={clubName} title={t('parentSchedule.title')} />
            </View>

            {nextEvent ? (
              <>
                <View style={styles.featuredHeader}>
                  <Text variant="headline" color="primary" weight="semibold">
                    {t('home.nextEvent')}
                  </Text>
                </View>
                <ParentNextEventCard
                  item={nextEvent}
                  locale={locale}
                  onOpen={() => onOpenEvent(nextEvent.id, nextEvent.teamId)}
                />
              </>
            ) : loading ? (
              <EventListSkeleton />
            ) : (
              <View style={styles.bannerWrap}>
                <Banner
                  tone="info"
                  title={t('parentSchedule.emptyDescription')}
                />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading && !nextEvent && !hasListContent ? (
            <View style={styles.empty}>
              <EmptyState
                icon="calendar.fill"
                title={t('parentSchedule.empty')}
                description={t('parentSchedule.emptyDescription')}
              />
            </View>
          ) : null
        }
      />
    </View>
  )
}

function ParentNextEventCard({
  item,
  locale,
  onOpen,
}: {
  item: CrossTeamEventItem
  locale: string
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const date = new Date(item.date)
  const countdownLabel = formatCountdown(date, t)
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={formatParentEventAccessibilityLabel(item, locale)}
      style={({ pressed }) => [
        styles.heroCard,
        {
          borderColor: c.borderDefault,
          backgroundColor: c.surface,
        },
        pressed && styles.pressedScale,
      ]}
    >
      <View style={styles.heroCardTop}>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: c.primary50 },
          ]}
        >
          <Text variant="caption2" weight="semibold" color={c.primary}>
            {item.teamDisplayName || item.teamName}
          </Text>
        </View>
        <View style={styles.heroCardAction}>
          <Text variant="footnote" color="tertiary">
            {countdownLabel}
          </Text>
          <Icon name="chevron.right" size={14} color="tertiary" />
        </View>
      </View>

      <Text variant="title2" color="primary" numberOfLines={2}>
        {item.title}
      </Text>

      <View style={styles.heroMeta}>
        <View style={styles.metaRow}>
          <Icon name="clock.fill" size="sm" color="tertiary" />
          <Text variant="subheadline" color="secondary" tabular>
            {timeLabel}
          </Text>
        </View>
        {item.location ? (
          <View style={styles.metaRow}>
            <Icon name="mappin.circle.fill" size="sm" color="tertiary" />
            <Text
              variant="subheadline"
              color="secondary"
              numberOfLines={1}
              style={styles.metaText}
            >
              {item.location}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

function ParentScheduleItemCard({
  item,
  locale,
  onOpen,
}: {
  item: CrossTeamEventItem
  locale: string
  onOpen: () => void
}) {
  const c = useClubColors()
  const date = new Date(item.date)
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  const dayNumber = String(date.getDate()).padStart(2, '0')

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={formatParentEventAccessibilityLabel(item, locale)}
      style={({ pressed }) => [
        styles.compactRow,
        elevation.card,
        {
          borderColor: c.borderDefault,
          backgroundColor: c.surface,
        },
        pressed && { opacity: 0.96 },
      ]}
    >
      <View
        style={[
          styles.dayChip,
          {
            backgroundColor: c.surfaceSunken ?? c.background,
            borderColor: c.borderDefault,
          },
        ]}
      >
        <Text variant="caption2" color="secondary" style={styles.dayChipDow}>
          {dayName.toUpperCase()}
        </Text>
        <Text variant="callout" color="primary" weight="semibold" tabular style={styles.dayChipNum}>
          {dayNumber}
        </Text>
      </View>

      <View style={styles.rowBody}>
        <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
          {item.title}
        </Text>
        <Text variant="caption2" color="secondary" numberOfLines={1}>
          {time} · {item.location || item.teamDisplayName || item.teamName}
        </Text>
      </View>
      <Icon name="chevron.right" size={14} color="tertiary" />
    </Pressable>
  )
}

// --- Next Fixture Card ---

function NextFixtureCard({
  item,
  locale,
  pending,
  onRsvp,
  onOpen,
}: {
  item: EventFeedItem
  locale: string
  pending: boolean
  onRsvp: (eventId: string, status: string) => void
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const date = new Date(item.date)

  const responded = item.yesCount + item.maybeCount + item.noCount

  return (
    <Pressable
      style={({ pressed }) => [
        styles.hero,
        elevation.hero,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.96 },
      ]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      {/* Eyebrow: weekday · time in Geist Mono — the calm date stamp */}
      <Text style={[styles.heroEyebrow, { color: c.textTertiary }]}>
        {formatEyebrow(date, locale)}
      </Text>

      <Text
        variant="title2"
        color="primary"
        weight="semibold"
        numberOfLines={2}
        style={styles.heroTitle}
      >
        {item.title}
      </Text>

      {item.location ? (
        <View style={styles.metaRow}>
          <Icon name="mappin.circle" size={14} color="tertiary" />
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {item.location}
          </Text>
        </View>
      ) : null}

      {/* RSVP distribution bar + neutral counts — single status color band */}
      {responded > 0 ? (
        <View style={styles.rsvpBlock}>
          {/* One accent at three densities: this is a proportion of the same
              squad, not three unrelated alert states. */}
          <View style={[styles.rsvpBar, { backgroundColor: c.surfaceSunken }]}>
            {item.yesCount > 0 ? (
              <View style={[styles.rsvpSegment, { flex: item.yesCount, backgroundColor: c.primary }]} />
            ) : null}
            {item.maybeCount > 0 ? (
              <View
                style={[
                  styles.rsvpSegment,
                  { flex: item.maybeCount, backgroundColor: hexToRgba(c.primary, 0.4) },
                ]}
              />
            ) : null}
            {item.noCount > 0 ? (
              <View
                style={[styles.rsvpSegment, { flex: item.noCount, backgroundColor: c.borderStrong }]}
              />
            ) : null}
          </View>
          <View style={styles.rsvpCounts}>
            <RsvpCount count={item.yesCount} label={t('event.rsvpYes')} />
            <RsvpCount count={item.maybeCount} label={t('event.rsvpMaybe')} />
            <RsvpCount count={item.noCount} label={t('event.rsvpNo')} />
          </View>
        </View>
      ) : null}

      <View style={[styles.heroDivider, { backgroundColor: c.borderSubtle ?? c.borderDefault }]} />

      {/* Availability, answered in place — same control as every event row. */}
      {item.cancelledAt ? (
        <Text variant="footnote" weight="semibold" color="secondary">
          {t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}
          {item.cancelReason ? ` · ${item.cancelReason}` : ''}
        </Text>
      ) : (
        <RsvpControl
          value={item.myRsvp as RsvpStatus | null}
          onChange={(status) => onRsvp(item.id, status)}
          disabled={pending}
        />
      )}
    </Pressable>
  )
}

function RsvpCount({ count, label }: { count: number; label: string }) {
  return (
    <View style={styles.rsvpCountItem}>
      <Text variant="caption2" color="secondary" tabular weight="semibold">
        {String(count)}
      </Text>
      <Text variant="caption2" color="tertiary">
        {label}
      </Text>
    </View>
  )
}

// --- Event List Item ---

function EventListItem({
  item,
  locale,
  scope,
  pending,
  dayLabel,
  showAttendance,
  onRsvp,
  onOpen,
  onLongPress,
}: {
  item: EventFeedItem
  locale: string
  scope: EventScope
  pending: boolean
  /** Rendered above the row when it starts a new day in the month. */
  dayLabel?: string | null
  /** Managers see the attendance outcome on past rows. */
  showAttendance?: boolean
  onRsvp: (status: RsvpStatus) => void
  onOpen: () => void
  onLongPress?: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const checkIns = item.checkInCount ?? 0
  const attendanceLabel = showAttendance
    ? checkIns > 0
      ? t('event.manage.attended', {
          defaultValue: '{{count}} of {{total}} attended',
          count: checkIns,
          total: Math.max(item.yesCount ?? 0, checkIns),
        })
      : t('event.manage.noCheckIns', { defaultValue: 'No check-ins recorded' })
    : null
  const date = new Date(item.date)
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  const dayNumber = String(date.getDate()).padStart(2, '0')

  // Upcoming events are answerable where they are listed. Sending the player
  // into a detail screen and back for a one-word answer was the single
  // heaviest interaction in the app; past events have nothing left to decide.
  const isCancelled = Boolean(item.cancelledAt)
  const answerable = scope === 'upcoming' && !isCancelled

  return (
    <>
    {dayLabel ? (
      <Text variant="caption1" color="tertiary" weight="semibold" style={styles.dayLabel}>
        {dayLabel}
      </Text>
    ) : null}
    <View
      style={[
        styles.compactRow,
        answerable && styles.compactRowAnswerable,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
      ]}
    >
      <Pressable
        style={({ pressed }) => [styles.compactRowHead, pressed && { opacity: 0.96 }]}
        onPress={onOpen}
        onLongPress={onLongPress}
        delayLongPress={300}
        accessibilityRole="button"
        // The row is one accessibility element, so the cancellation has to be
        // in its label or a screen reader would announce a cancelled match as
        // if it were on.
        accessibilityLabel={
          isCancelled
            ? `${item.title}, ${t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}${
                item.cancelReason ? `, ${item.cancelReason}` : ''
              }`
            : `${item.title}, ${dayName} ${dayNumber} ${time}${attendanceLabel ? `, ${attendanceLabel}` : ''}`
        }
        accessibilityHint={
          onLongPress ? t('event.manage.rowActions', { defaultValue: 'Event actions' }) : undefined
        }
      >
        <View
          style={[
            styles.dayChip,
            {
              backgroundColor: c.surfaceSunken ?? c.background,
              borderColor: c.borderDefault,
            },
          ]}
        >
          <Text variant="caption2" color="secondary" style={styles.dayChipDow}>
            {dayName.toUpperCase()}
          </Text>
          <Text variant="callout" color="primary" weight="semibold" tabular style={styles.dayChipNum}>
            {dayNumber}
          </Text>
        </View>

        <View style={styles.rowBody}>
          <Text
            variant="callout"
            color={isCancelled ? 'tertiary' : 'primary'}
            weight="semibold"
            numberOfLines={1}
            style={isCancelled ? styles.struck : undefined}
          >
            {item.title}
          </Text>
          <Text variant="caption2" color="secondary" numberOfLines={1}>
            {isCancelled
              ? `${t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}${item.cancelReason ? ` · ${item.cancelReason}` : ''}`
              : `${time}${item.location ? ` · ${item.location}` : ` · ${t(`event.type.${item.type}`)}`}`}
          </Text>
        </View>

        {attendanceLabel && !isCancelled ? (
          <Text variant="caption1" weight="semibold" color={checkIns > 0 ? 'primary' : 'tertiary'} tabular>
            {attendanceLabel}
          </Text>
        ) : null}
        <Icon name="chevron.right" size={14} color="tertiary" />
      </Pressable>

      {answerable ? (
        <RsvpControl
          value={item.myRsvp as RsvpStatus | null}
          onChange={onRsvp}
          disabled={pending}
          size="compact"
        />
      ) : null}
    </View>
    </>
  )
}

// --- Utility functions ---

/**
 * Upcoming events, with everything still awaiting an answer pinned to the top.
 *
 * The list used to be pure chronology, which buried the only rows that needed
 * the player to do something — and marked *answered* rows with a coloured dot
 * while unanswered ones got a plain chevron, exactly backwards. Outstanding
 * replies now lead, with a count, and the schedule follows by day.
 */
function buildSections(
  events: EventFeedItem[],
  locale: string,
  t: (key: string) => string,
  scope: EventScope,
): EventSection[] {
  const needsReply = scope === 'upcoming' ? events.filter((event) => !event.myRsvp) : []
  const needsReplyIds = new Set(needsReply.map((event) => event.id))
  const scheduled = events.filter((event) => !needsReplyIds.has(event.id))

  // Month buckets, chronological inside; the day label rides on the first
  // row of each day so the month header can stay sticky without a second
  // sticky tier fighting it.
  const groups = new Map<string, EventFeedItem[]>()
  scheduled.forEach((event) => {
    const key = toDateKey(event.date)
    if (!key) return
    const monthKey = key.slice(0, 7)
    const current = groups.get(monthKey) || []
    current.push(event)
    groups.set(monthKey, current)
  })

  const daySections: EventSection[] = Array.from(groups.entries()).map(([monthKey, group]) => ({
    title: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
      new Date(`${monthKey}-01T12:00:00`),
    ),
    data: group,
    kind: 'month' as const,
  }))

  if (needsReply.length === 0) return daySections

  return [
    {
      title: t('home.player.replyQueueTitle'),
      data: needsReply,
      kind: 'reply' as const,
      count: needsReply.length,
    },
    ...daySections,
  ]
}

function sameDay(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = toDateKey(a)
  const kb = toDateKey(b)
  return Boolean(ka && kb && ka === kb)
}

function toDateKey(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function buildParentSections(
  events: CrossTeamEventItem[],
  locale: string,
  t: (key: string) => string,
): ParentEventSection[] {
  const groups = new Map<string, CrossTeamEventItem[]>()

  events.forEach((event) => {
    const key = toDateKey(event.date)
    if (!key) return
    const current = groups.get(key) || []
    current.push(event)
    groups.set(key, current)
  })

  return Array.from(groups.entries()).map(([dateKey, group]) => ({
    title: formatSectionDate(dateKey, locale, t),
    data: group,
  }))
}

function formatParentEventAccessibilityLabel(
  item: CrossTeamEventItem,
  locale: string,
) {
  const date = new Date(item.date)
  const when = Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
  const teamName = item.teamDisplayName || item.teamName

  return [item.title, teamName, when, item.location].filter(Boolean).join(', ')
}

function formatSectionDate(
  isoDate: string,
  locale: string,
  t: (key: string) => string,
) {
  const date = new Date(isoDate)
  const today = new Date()
  const todayKey = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime()
  const targetKey = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime()
  const dayDelta = Math.round((targetKey - todayKey) / 86400000)

  if (dayDelta === 0) {
    return t('event.dayHeaderToday')
  }

  if (dayDelta === 1) {
    return t('event.dayHeaderTomorrow')
  }

  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date)
}

function formatEyebrow(date: Date, locale: string): string {
  if (Number.isNaN(date.getTime())) return ''
  const dow = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return `${dow.toUpperCase()} · ${time}`
}

function formatCountdown(
  date: Date,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDelta = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / 86400000,
  )

  if (dayDelta <= 0) {
    return t('common.today')
  }

  if (dayDelta === 1) {
    return t('common.tomorrow')
  }

  return t('event.startsInDays', { count: dayDelta })
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingBottom: TAB_BAR_CLEARANCE + space.lg,
  },
  headerWrap: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  controls: {
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.lg,
    gap: space.md,
  },
  chipRow: {
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg,
  },

  featuredHeader: {
    marginHorizontal: space.lg,
    marginBottom: space.xs,
    marginTop: space.xs,
  },

  // Next-fixture hero — mirrors CoachHome's matchCard (Editorial Calm)
  hero: {
    marginHorizontal: space.lg,
    marginTop: space.xs,
    marginBottom: space.md,
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  heroEyebrow: {
    fontFamily: fonts.data,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: { letterSpacing: -0.3, marginTop: space['2xs'] },

  rsvpBlock: { gap: space.sm, marginTop: space.xs },
  rsvpBar: {
    height: 6,
    borderRadius: radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  rsvpSegment: { height: '100%' },
  rsvpCounts: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rsvpCountItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  heroDivider: { height: hairline, marginTop: space.xs },

  rsvpActionRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space['2xs'],
  },
  rsvpPill: {
    flex: 1,
    height: 44,
    borderRadius: radius.full,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero card (next fixture) — legacy, retained for parent home variant
  heroCard: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: space.md,
    gap: space.md,
  },
  heroCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  typeBadge: {
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: space.xs,
    borderRadius: radius.full,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
  },
  metaText: {
    flexShrink: 1,
  },

  // Section / day eyebrows — quiet uppercase label, generous top space
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  monthHeader: {
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  dayLabel: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    marginBottom: space.xs,
  },
  sheetBody: { gap: space.xs, paddingHorizontal: space.md, paddingBottom: space.lg },
  sectionCount: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: space.xs + 1,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderText: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  // Compact row — replaces wide-time-column row with day-chip pattern
  compactRow: {
    marginHorizontal: space.lg,
    marginBottom: space.xs,
    padding: space.sm + 2,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  compactRowAnswerable: { gap: space.sm },
  struck: { textDecorationLine: 'line-through' },
  compactRowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  dayChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipDow: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: -2,
  },
  dayChipNum: { fontFamily: fonts.data },
  rowBody: { flex: 1, gap: 1 },
  rsvpStatusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },

  bannerWrap: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },

  liveBanner: {
    marginHorizontal: space.lg,
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  liveBannerText: { flex: 1 },
  liveScore: { fontFamily: fonts.data },
  pressedScale: {
    transform: [{ scale: 0.985 }],
  },

  // Empty state
  empty: {
    paddingTop: space['2xl'],
    alignItems: 'center',
    gap: space.md,
  },
})
