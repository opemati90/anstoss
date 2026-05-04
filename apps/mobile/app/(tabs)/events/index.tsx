/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { SPACING_XS, SPACING_MD } from '../../../src/theme/spacing';
import { useCallback, useMemo, useState } from 'react'
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
import { api } from '../../../src/api/client'
import { EmptyState } from '../../../src/components/EmptyState'
import { EventListSkeleton } from '../../../src/components/Skeleton'
import { LoadingBoundary } from '../../../src/components/LoadingBoundary'
import { ErrorBoundary } from '../../../src/components/ErrorBoundary'
import {
  Banner,
  FilterChipRow,
  type FilterChip,
  Icon,
  IconButton,
  SegmentedControl,
  Text,
} from '../../../src/components/ui'
import { LiveStatusPill } from '../../../src/components/match'
import { Haptics } from '../../../src/utils/haptics'
import { getAppLanguage, getAppLocale } from '../../../src/i18n'
import {
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
}

type ParentEventSection = {
  title: string
  data: CrossTeamEventItem[]
}

const TYPE_CHIPS: FilterChip<FilterType>[] = [
  { key: 'TRAINING', label: 'eventFilter.training' },
  { key: 'MATCH', label: 'eventFilter.match' },
  { key: 'OTHER', label: 'eventFilter.other' },
]

export default function EventsScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const [events, setEvents] = useState<EventFeedItem[]>([])
  const [fixtures, setFixtures] = useState<ImportedFixture[]>([])
  const [liveFixture, setLiveFixture] = useState<ImportedFixture | null>(null)
  const [parentEvents, setParentEvents] = useState<CrossTeamEventItem[]>([])

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

  const locale = getAppLocale(getAppLanguage())
  const isParent = activeClub?.role === 'PARENT'

  const canCreate = useMemo(() => {
    if (activeClub?.permissions?.EVENTS != null) {
      return Boolean(activeClub.permissions.EVENTS)
    }

    return (
      activeClub?.role === 'OWNER' ||
      activeClub?.role === 'ADMIN' ||
      activeClub?.role === 'COACH' ||
      activeTeamAccess?.role === 'HEAD_COACH' ||
      activeTeamAccess?.role === 'ASSISTANT_COACH'
    )
  }, [activeClub, activeTeamAccess])

  const fetchEvents = useCallback(async () => {
    if (!activeClub) {
      // Without club context the list will only ever be empty — drop out of
      // the loading skeleton so the empty state renders instead.
      setLoading(false)
      return
    }

    if (isParent) {
      try {
        const data = await api<CrossTeamEventItem[]>('/me/children-events')
        setError(false)
        setParentEvents(data || [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
      return
    }

    if (!activeTeamId) {
      // Same idea — no team selected means nothing to fetch; surface the
      // empty state immediately rather than spinning forever.
      setLoading(false)
      return
    }

    try {
      const params = new URLSearchParams({
        teamId: activeTeamId,
        scope,
      })

      if (filterType !== 'ALL') {
        params.set('type', filterType)
      }

      const [data, fetchedFixtures] = await Promise.all([
        api<EventFeedItem[]>(
          `/clubs/${activeClub.club.id}/events?${params.toString()}`,
        ),
        api<ImportedFixture[]>(
          `/teams/${activeTeamId}/fixtures?scope=upcoming&limit=10`,
        ).catch(() => [] as ImportedFixture[]),
      ])

      setError(false)
      setEvents(data || [])
      setFixtures(fetchedFixtures ?? [])
      setLiveFixture(fetchedFixtures?.find((f) => f.status === 'live') ?? null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeClub, activeTeamId, filterType, isParent, scope])

  useFocusEffect(
    useCallback(() => {
      void fetchEvents()
    }, [fetchEvents]),
  )

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

  const nextFixture = scope === 'upcoming' ? events[0] ?? null : null
  const listEvents = scope === 'upcoming' ? events.slice(1) : events
  const sections = useMemo(
    () => buildSections(listEvents, locale, t),
    [listEvents, locale, t],
  )

  const hasListContent = sections.some((section) => section.data.length > 0)

  if (isParent) {
    return (
      <ParentEventsBoard
        clubName={activeClub?.club.name || ''}
        events={parentEvents}
        loading={loading}
        locale={locale}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    )
  }

  const selectedFilterKey = filterType === 'ALL' ? null : filterType

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ErrorBoundary
        onRetry={() => void fetchEvents()}
        fallbackTitleKey="states.events.error.title"
        fallbackBodyKey="states.events.error.body"
        fallbackRetryKey="states.common.retry"
      >
        <LoadingBoundary
          isLoading={loading && events.length === 0}
          skeleton={
            <View style={{ flex: 1 }}>
              <View style={styles.hero}>
                <Text variant="largeTitle" color="primary">
                  {t('event.screenTitle')}
                </Text>
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
            renderItem={({ item }) => (
              <EventListItem
                item={item}
                locale={locale}
                scope={scope}
                onOpen={() => navigateToEvent(item)}
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
                <View style={styles.hero}>
                  <View style={styles.heroRow}>
                    <Text
                      variant="largeTitle"
                      color="primary"
                      style={styles.heroTitle}
                    >
                      {t('event.screenTitle')}
                    </Text>
                    {canCreate ? (
                      <IconButton
                        onPress={() => router.push('/create-event')}
                        accessibilityLabel={t('event.createEvent')}
                      >
                        <Icon name="plus" size="lg" color="tint" />
                      </IconButton>
                    ) : null}
                  </View>
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
                  {scope === 'upcoming' ? (
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

                {liveFixture ? (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/match-detail',
                        params: {
                          fixtureId: liveFixture.id,
                          teamId: liveFixture.teamId,
                        },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${liveFixture.homeTeam} vs ${liveFixture.awayTeam} live`}
                    style={({ pressed }) => [
                      styles.liveBanner,
                      { backgroundColor: c.primary },
                      pressed && { opacity: 0.92 },
                    ]}
                  >
                    <LiveStatusPill status="live" inverse />
                    <Text variant="footnote" weight="semibold" style={[styles.liveBannerText, { color: c.textInverse }]} numberOfLines={1}>
                      {liveFixture.homeTeam} {liveFixture.resultHome ?? 0}–
                      {liveFixture.resultAway ?? 0} {liveFixture.awayTeam}
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
              !loading && !error && !nextFixture && !hasListContent ? (
                <View style={styles.empty}>
                  <EmptyState
                    icon="calendar.fill"
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
  refreshing,
  onRefresh,
}: {
  clubName: string
  events: CrossTeamEventItem[]
  loading: boolean
  locale: string
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
          <ParentScheduleItemCard item={item} locale={locale} />
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
            <View style={styles.hero}>
              <Text variant="footnote" color="secondary">
                {clubName}
              </Text>
              <Text variant="largeTitle" color="primary">
                {t('parentSchedule.title')}
              </Text>
            </View>

            {nextEvent ? (
              <>
                <View style={styles.featuredHeader}>
                  <Text variant="headline" color="primary" weight="semibold">
                    {t('home.nextEvent')}
                  </Text>
                </View>
                <ParentNextEventCard item={nextEvent} locale={locale} />
              </>
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
}: {
  item: CrossTeamEventItem
  locale: string
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
    <View
      style={[
        styles.heroCard,
        {
          borderColor: c.borderDefault,
          backgroundColor: c.surface,
        },
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
        <Text variant="footnote" color="tertiary">
          {countdownLabel}
        </Text>
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
    </View>
  )
}

function ParentScheduleItemCard({
  item,
  locale,
}: {
  item: CrossTeamEventItem
  locale: string
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
    <View
      style={[
        styles.compactRow,
        {
          borderColor: c.borderDefault,
          backgroundColor: c.surface,
        },
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
        <Text variant="callout" color="primary" weight="semibold" tabular>
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
    </View>
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
  const countdownLabel = formatCountdown(date, t)
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  const typeTint =
    item.type === 'TRAINING'
      ? c.info
      : item.type === 'MATCH'
        ? c.success
        : c.textTertiary

  const rsvpOptions: Array<{
    status: 'YES' | 'MAYBE' | 'NO'
    label: string
    color: string
  }> = [
    { status: 'YES', label: t('event.rsvpYes'), color: c.success },
    { status: 'MAYBE', label: t('event.rsvpMaybe'), color: c.warning },
    { status: 'NO', label: t('event.rsvpNo'), color: c.error },
  ]

  return (
    <Pressable
      style={({ pressed }) => [
        styles.editorialHero,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.85 },
      ]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.editorialEyebrowRow}>
        <Text variant="caption2" tracking="wide" color={typeTint} weight="semibold">
          {t(`event.type.${item.type}`).toUpperCase()}
        </Text>
        <Text variant="caption2" color="tertiary">
          {`· ${countdownLabel}`}
        </Text>
      </View>

      <Text variant="title1" color="primary" weight="semibold" numberOfLines={2} style={styles.editorialTitle}>
        {item.title}
      </Text>

      <Text variant="footnote" color="secondary" style={styles.editorialMeta} numberOfLines={1}>
        <Text variant="footnote" weight="semibold" color="primary" tabular>
          {timeLabel}
        </Text>
        {item.location ? `  ·  ${item.location}` : ''}
      </Text>

      <View style={styles.ghostRsvpRow}>
        {rsvpOptions.map((option) => {
          const isActive = item.myRsvp === option.status
          return (
            <Pressable
              key={option.status}
              onPress={(e) => {
                ;(e as unknown as { stopPropagation?: () => void }).stopPropagation?.()
                onRsvp(item.id, option.status)
              }}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityHint={t('event.rsvpHint')}
              accessibilityState={{ selected: isActive, disabled: pending }}
              style={({ pressed }) => [
                styles.ghostRsvpPill,
                {
                  borderColor: isActive ? option.color : c.borderDefault,
                  backgroundColor: isActive ? option.color : 'transparent',
                },
                pressed && { opacity: 0.55 },
                pending && { opacity: 0.5 },
              ]}
            >
              <Text
                variant="footnote"
                weight={isActive ? 'semibold' : 'regular'}
                color={isActive ? c.textInverse : 'primary'}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {item.yesCount > 0 || item.maybeCount > 0 || item.noCount > 0 ? (
        <Text variant="caption2" color="tertiary" tabular style={styles.editorialCount}>
          {`${item.yesCount} · ${item.maybeCount} · ${item.noCount}`}
        </Text>
      ) : null}
    </Pressable>
  )
}

// --- Event List Item ---

function EventListItem({
  item,
  locale,
  scope,
  onOpen,
}: {
  item: EventFeedItem
  locale: string
  scope: EventScope
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const date = new Date(item.date)
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  const dayNumber = String(date.getDate()).padStart(2, '0')

  const rsvpColor =
    item.myRsvp === 'YES'
      ? c.success
      : item.myRsvp === 'MAYBE'
        ? c.warning
        : item.myRsvp === 'NO'
          ? c.error
          : c.borderDefault

  return (
    <Pressable
      style={({ pressed }) => [
        styles.compactRow,
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.96 },
      ]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={item.title}
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
        <Text variant="callout" color="primary" weight="semibold" tabular>
          {dayNumber}
        </Text>
      </View>

      <View style={styles.rowBody}>
        <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
          {item.title}
        </Text>
        <Text variant="caption2" color="secondary" numberOfLines={1}>
          {time}
          {item.location ? ` · ${item.location}` : ` · ${t(`event.type.${item.type}`)}`}
        </Text>
      </View>

      {scope === 'upcoming' && item.myRsvp ? (
        <View style={[styles.rsvpStatusDot, { backgroundColor: rsvpColor }]} />
      ) : (
        <Icon name="chevron.right" size={14} color="tertiary" />
      )}
    </Pressable>
  )
}

// --- Utility functions ---

function buildSections(
  events: EventFeedItem[],
  locale: string,
  t: (key: string) => string,
): EventSection[] {
  const groups = new Map<string, EventFeedItem[]>()

  events.forEach((event) => {
    const key = new Date(event.date).toISOString().slice(0, 10)
    const current = groups.get(key) || []
    current.push(event)
    groups.set(key, current)
  })

  return Array.from(groups.entries()).map(([dateKey, group]) => ({
    title: formatSectionDate(dateKey, locale, t),
    data: group,
  }))
}

function buildParentSections(
  events: CrossTeamEventItem[],
  locale: string,
  t: (key: string) => string,
): ParentEventSection[] {
  const groups = new Map<string, CrossTeamEventItem[]>()

  events.forEach((event) => {
    const key = new Date(event.date).toISOString().slice(0, 10)
    const current = groups.get(key) || []
    current.push(event)
    groups.set(key, current)
  })

  return Array.from(groups.entries()).map(([dateKey, group]) => ({
    title: formatSectionDate(dateKey, locale, t),
    data: group,
  }))
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
  hero: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space['2xs'],
    gap: space['2xs'],
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  heroTitle: {
    flex: 1,
  },
  controls: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.sm,
  },
  chipRow: {
    marginHorizontal: -space.md,
    paddingHorizontal: space.md,
  },

  featuredHeader: {
    marginHorizontal: space.md,
    marginBottom: space.xs,
    marginTop: space.xs,
  },

  // Editorial hero — clean card with subtle border + soft shadow
  editorialHero: {
    marginHorizontal: space.md,
    marginTop: space.sm,
    marginBottom: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.sm,
    borderRadius: 20,
    borderWidth: hairline,
    // eslint-disable-next-line no-restricted-syntax -- TODO subtle drop shadow not tokenized yet
    shadowColor: '#0F1116',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  editorialEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  editorialTitle: { marginTop: space.xs },
  editorialMeta: { marginTop: 2 },
  editorialCount: { marginTop: space.xs },
  ghostRsvpRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.sm,
  },
  ghostRsvpPill: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Editorial list rows — softly bordered card with subtle shadow
  editorialRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: space.md,
    marginBottom: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
    borderRadius: 16,
    borderWidth: hairline,
    // eslint-disable-next-line no-restricted-syntax -- TODO subtle drop shadow not tokenized yet
    shadowColor: '#0F1116',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  editorialRowTime: {
    width: 60,
    alignItems: 'flex-start',
    gap: 2,
  },
  editorialRowBody: {
    flex: 1,
    gap: 2,
  },
  editorialRowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },

  // Hero card (next fixture) — legacy, retained for parent home variant
  heroCard: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: space.md,
    gap: space.md,
  },
  heroCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: SPACING_XS,
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

  // RSVP buttons (hero card only)
  rsvpRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  rsvpButton: {
    flex: 1,
    height: 44,
    borderRadius: SPACING_MD,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // RSVP summary line on hero card
  rsvpSummaryRow: {
    paddingTop: space['2xs'],
  },

  // Section headers — uppercase mono with tight tracking
  sectionHeader: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  sectionHeaderText: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  // Compact row — replaces wide-time-column row with day-chip pattern
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.md,
    marginBottom: space.xs,
    padding: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: hairline,
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
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: -2,
  },
  rowBody: { flex: 1, gap: 1 },
  rsvpStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // List items
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: space.md,
    gap: space.md,
  },
  listItemDate: {
    width: 64,
    alignItems: 'center',
    gap: space['2xs'],
  },
  listItemBody: {
    flex: 1,
    gap: space['2xs'],
  },
  rsvpDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },

  bannerWrap: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },

  liveBanner: {
    marginHorizontal: space.md,
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

  // Empty state
  empty: {
    paddingTop: space['2xl'],
    alignItems: 'center',
    gap: space.md,
  },
})