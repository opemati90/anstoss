import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native'
import { type CrossTeamEventItem, EventFeedItem, RSVP } from '@anstoss/shared'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import { EmptyState } from '../../../src/components/EmptyState'
import { EventListSkeleton } from '../../../src/components/Skeleton'
import {
  Banner,
  FilterChipRow,
  type FilterChip,
  Icon,
  IconButton,
  SegmentedControl,
  Text,
} from '../../../src/components/ui'
import { Haptics } from '../../../src/utils/haptics'
import { getAppLanguage, getAppLocale } from '../../../src/i18n'
import {
  card,
  elevation,
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
  { key: 'TRAINING', label: 'eventFilter.training', icon: 'figure.soccer.fill' },
  { key: 'MATCH', label: 'eventFilter.match', icon: 'flag.fill' },
  { key: 'OTHER', label: 'eventFilter.other', icon: 'star.fill' },
]

export default function EventsScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const [events, setEvents] = useState<EventFeedItem[]>([])
  const [parentEvents, setParentEvents] = useState<CrossTeamEventItem[]>([])
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

      const data = await api<EventFeedItem[]>(
        `/clubs/${activeClub.club.id}/events?${params.toString()}`,
      )

      setError(false)
      setEvents(data || [])
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

  if (loading && events.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={styles.hero}>
          <Text variant="largeTitle" color="primary">
            {t('event.screenTitle')}
          </Text>
        </View>
        <EventListSkeleton />
      </View>
    )
  }

  const selectedFilterKey = filterType === 'ALL' ? null : filterType

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <SectionList
        sections={sections}
        key={`${activeTeamId}:${scope}`}
        keyExtractor={(event) => event.id}
        renderItem={({ item }) => (
          <EventListItem item={item} locale={locale} scope={scope} />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text variant="footnote" color="secondary" weight="semibold">
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

            {nextFixture ? (
              <>
                <View style={styles.featuredHeader}>
                  <Text variant="headline" color="primary" weight="semibold">
                    {t('event.upcoming')}
                  </Text>
                </View>
                <NextFixtureCard
                  item={nextFixture}
                  locale={locale}
                  pending={Boolean(pendingEventIds[nextFixture.id])}
                  onRsvp={handleRsvp}
                />
              </>
            ) : null}

            {error && !loading ? (
              <View style={styles.bannerWrap}>
                <Banner
                  tone="error"
                  title={t('common.loadError')}
                  action={{
                    label: t('common.retry'),
                    onPress: () => {
                      setError(false)
                      void fetchEvents()
                    },
                  }}
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !loading && !nextFixture && !hasListContent ? (
            <View style={styles.empty}>
              <EmptyState
                icon="calendar.fill"
                title={scope === 'past' ? t('event.past') : t('event.emptyTitle')}
                description={
                  scope === 'past'
                    ? t('event.noPastEvents')
                    : t('event.emptyBody')
                }
              />
            </View>
          ) : null
        }
      />
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
            <Text variant="footnote" color="secondary" weight="semibold">
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
          ...elevation.card,
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

  return (
    <View
      style={[
        styles.listItem,
        {
          borderColor: c.borderDefault,
          backgroundColor: c.surface,
        },
      ]}
    >
      <View style={styles.listItemDate}>
        <Text variant="caption1" color="secondary" weight="medium">
          {dayName}
        </Text>
        <Text variant="data" color={c.primary} tabular>
          {time}
        </Text>
      </View>

      <View style={styles.listItemBody}>
        <Text variant="headline" color="primary" numberOfLines={2}>
          {item.title}
        </Text>
        <Text variant="subheadline" color="secondary" numberOfLines={1}>
          {item.location || item.teamDisplayName || item.teamName}
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
}: {
  item: EventFeedItem
  locale: string
  pending: boolean
  onRsvp: (eventId: string, status: string) => void
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
        styles.heroCard,
        {
          borderColor: c.borderDefault,
          backgroundColor: c.surface,
          ...elevation.card,
        },
        pressed && { opacity: 0.92 },
      ]}
      onPress={() =>
        router.push({ pathname: '/event-detail', params: { eventId: item.id } })
      }
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.heroCardTop}>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: hexWithAlpha(typeTint, 0.12) },
          ]}
        >
          <Text variant="caption2" weight="semibold" color={typeTint}>
            {t(`event.type.${item.type}`)}
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

      <View style={styles.rsvpRow}>
        {rsvpOptions.map((option) => {
          const isActive = item.myRsvp === option.status
          const bg = isActive ? option.color : hexWithAlpha(option.color, 0.12)
          const fg = isActive ? c.textInverse : option.color
          return (
            <Pressable
              key={option.status}
              onPress={() => onRsvp(item.id, option.status)}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityHint={t('event.rsvpHint')}
              accessibilityState={{ selected: isActive, disabled: pending }}
              style={({ pressed }) => [
                styles.rsvpButton,
                { backgroundColor: bg },
                pressed && { opacity: 0.85 },
                pending && { opacity: 0.6 },
              ]}
            >
              <Text variant="subheadline" weight="semibold" color={fg}>
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {item.yesCount > 0 || item.maybeCount > 0 || item.noCount > 0 ? (
        <View style={styles.rsvpSummaryRow}>
          <Text variant="footnote" color="secondary" tabular>
            <Text variant="footnote" weight="bold" color="primary" tabular>
              {item.yesCount}
            </Text>
            {` ${t('event.rsvpYes').toLowerCase()}  ·  `}
            <Text variant="footnote" weight="bold" color="primary" tabular>
              {item.maybeCount}
            </Text>
            {` ${t('event.rsvpMaybe').toLowerCase()}  ·  `}
            <Text variant="footnote" weight="bold" color="primary" tabular>
              {item.noCount}
            </Text>
            {` ${t('event.rsvpNo').toLowerCase()}`}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

// --- Event List Item ---

function EventListItem({
  item,
  locale,
  scope,
}: {
  item: EventFeedItem
  locale: string
  scope: EventScope
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const date = new Date(item.date)
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

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
        styles.listItem,
        {
          borderColor: c.borderDefault,
          backgroundColor: c.surface,
        },
        pressed && { opacity: 0.9 },
      ]}
      onPress={() =>
        router.push({ pathname: '/event-detail', params: { eventId: item.id } })
      }
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.listItemDate}>
        <Text variant="caption1" color="secondary" weight="medium">
          {dayName}
        </Text>
        <Text variant="data" color={c.primary} tabular>
          {time}
        </Text>
      </View>

      <View style={styles.listItemBody}>
        <Text variant="headline" color="primary" numberOfLines={2}>
          {item.title}
        </Text>
        <Text variant="subheadline" color="secondary" numberOfLines={1}>
          {item.location || t(`event.type.${item.type}`)}
        </Text>
      </View>

      {scope === 'upcoming' ? (
        <View style={[styles.rsvpDot, { backgroundColor: rsvpColor }]} />
      ) : null}
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

function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#')) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
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
    paddingTop: space.md,
    paddingBottom: space.xs,
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

  // Hero card (next fixture)
  heroCard: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: card.padding,
    gap: space.md,
  },
  heroCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: 4,
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
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // RSVP summary line on hero card
  rsvpSummaryRow: {
    paddingTop: space['2xs'],
  },

  // Section headers
  sectionHeader: {
    paddingHorizontal: space.md,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },

  // List items
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.md,
    marginBottom: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
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

  // Empty state
  empty: {
    paddingTop: space['2xl'],
    alignItems: 'center',
    gap: space.md,
  },
})
