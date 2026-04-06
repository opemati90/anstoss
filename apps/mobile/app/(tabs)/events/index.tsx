import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { type CrossTeamEventItem, EventFeedItem, RSVP } from '@anstoss/shared'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import { EmptyState } from '../../../src/components/EmptyState'
import { EventListSkeleton } from '../../../src/components/Skeleton'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { getAppLanguage, getAppLocale } from '../../../src/i18n'
import {
  fonts,
  fontSize,
  fontWeight,
  lineHeight,
  neutralColors,
  radius,
  semanticColors,
  space,
} from '../../../src/theme/tokens'

const RSVP_OPTIONS = [
  { status: 'YES', icon: 'checkmark-circle', color: semanticColors.success },
  { status: 'MAYBE', icon: 'help-circle', color: semanticColors.warning },
  { status: 'NO', icon: 'close-circle', color: semanticColors.error },
] as const

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

const FILTER_OPTIONS: { scope?: EventScope; type?: FilterType; key: string }[] = [
  { scope: 'upcoming', key: 'upcoming' },
  { scope: 'past', key: 'past' },
  { type: 'TRAINING', key: 'training' },
  { type: 'MATCH', key: 'match' },
  { type: 'OTHER', key: 'other' },
]

export default function EventsScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const theme = useClubColors()
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
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

  const handleFilterPress = (option: (typeof FILTER_OPTIONS)[number]) => {
    if (option.scope) {
      setScope(option.scope)
      setFilterType('ALL')
    } else if (option.type) {
      if (scope === 'past') setScope('upcoming')
      setFilterType(filterType === option.type ? 'ALL' : option.type)
    }
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
      <View style={styles.container}>
        <View style={styles.topSection}>
          <TabScreenHeader title={t('event.screenTitle')} compact />
        </View>
        <EventListSkeleton />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        key={`${activeTeamId}:${scope}`}
        keyExtractor={(event) => event.id}
        renderItem={({ item }) => (
          <EventListItem
            item={item}
            locale={locale}
            scope={scope}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <>
            <View style={styles.topSection}>
              <TabScreenHeader
                title={t('event.screenTitle')}
                actionIcon={canCreate ? 'add' : undefined}
                actionAccessibilityLabel={canCreate ? t('event.createEvent') : undefined}
                onActionPress={canCreate ? () => router.push('/create-event') : undefined}
                compact
              />

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterBar}
              >
                {FILTER_OPTIONS.map((option) => {
                  const isActive = option.scope
                    ? scope === option.scope && filterType === 'ALL'
                    : filterType === option.type && scope === 'upcoming'
                  const isScopeActive = option.scope ? scope === option.scope : false

                  return (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        styles.filterChip,
                        (isActive || isScopeActive) && {
                          backgroundColor: theme.clubPrimary,
                          borderColor: theme.clubPrimary,
                        },
                      ]}
                      onPress={() => handleFilterPress(option)}
                      accessibilityRole="button"
                      accessibilityLabel={t(`eventFilter.${option.key}`)}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.filterChipText,
                          (isActive || isScopeActive) && { color: neutralColors.textInverse },
                        ]}
                      >
                        {t(`eventFilter.${option.key}`)}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>

            {nextFixture ? (
              <NextFixtureCard
                item={nextFixture}
                locale={locale}
                pending={Boolean(pendingEventIds[nextFixture.id])}
                onRsvp={handleRsvp}
              />
            ) : scope === 'upcoming' && !hasListContent && !loading ? null : (
              scope === 'past' && !hasListContent && !loading ? null : null
            )}

            {error && !loading && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{t('common.loadError')}</Text>
                <TouchableOpacity onPress={() => { setError(false); fetchEvents() }} style={styles.retryButton}>
                  <Text style={styles.retryText}>{t('common.retry')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !loading && !nextFixture && !hasListContent ? (
            <View style={styles.empty}>
              <EmptyState
                icon="calendar-outline"
                title={scope === 'past' ? t('event.past') : t('event.emptyTitle')}
                description={
                  scope === 'past'
                    ? t('event.noPastEvents')
                    : canCreate
                      ? t('event.noEventsCoach')
                      : t('event.emptyBody')
                }
              />
              {canCreate && scope === 'upcoming' ? (
                <TouchableOpacity
                  style={[styles.emptyAction, { backgroundColor: theme.clubPrimary }]}
                  onPress={() => router.push('/create-event')}
                  accessibilityRole="button"
                  accessibilityLabel={t('event.createEvent')}
                >
                  <Text style={styles.emptyActionText}>{t('event.createEvent')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null
        }
      />
    </View>
  )
}

// --- Parent view (unchanged) ---

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
  const nextEvent = events[0] ?? null
  const sections = useMemo(
    () => buildParentSections(events.slice(1), locale, t),
    [events, locale, t],
  )
  const hasListContent = sections.some((section) => section.data.length > 0)

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        key={`parent:${clubName}`}
        keyExtractor={(event) => event.id}
        renderItem={({ item }) => (
          <ParentScheduleItemCard item={item} locale={locale} />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.topSection}>
            <TabScreenHeader
              title={t('parentSchedule.title')}
              subtitle={clubName}
              compact
            />

            {nextEvent ? (
              <ParentNextEventCard item={nextEvent} locale={locale} />
            ) : (
              <View style={styles.placeholderCard}>
                <Text style={styles.placeholderText}>{t('parentSchedule.emptyDescription')}</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          !loading && !nextEvent && !hasListContent ? (
            <View style={styles.empty}>
              <EmptyState
                icon="calendar-outline"
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
  const theme = useClubColors()
  const date = new Date(item.date)
  const countdownLabel = formatCountdown(date, t)
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return (
    <TouchableOpacity
      style={styles.heroCard}
      onPress={() => router.push('/parent-schedule')}
      accessibilityRole="button"
      accessibilityLabel={t('parentSchedule.viewAll')}
    >
      <View style={styles.heroTop}>
        <View style={[styles.typeBadge, { backgroundColor: theme.clubPrimaryLight }]}>
          <Text style={[styles.typeBadgeText, { color: theme.clubPrimary }]}>
            {item.teamDisplayName || item.teamName}
          </Text>
        </View>
        <Text style={styles.heroCountdown}>{countdownLabel}</Text>
      </View>

      <Text style={styles.heroTitle} numberOfLines={1}>{item.title}</Text>

      <View style={styles.heroMeta}>
        <Ionicons name="time-outline" size={14} color={neutralColors.textTertiary} />
        <Text style={styles.heroMetaText}>{timeLabel}</Text>
        {item.location ? (
          <>
            <Ionicons name="location-outline" size={14} color={neutralColors.textTertiary} style={{ marginLeft: space.md }} />
            <Text style={styles.heroMetaText} numberOfLines={1}>{item.location}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.heroFooterLink}>
        <Text style={styles.heroFooterText}>{t('parentSchedule.viewAll')}</Text>
        <Ionicons name="chevron-forward" size={16} color={neutralColors.textTertiary} />
      </View>
    </TouchableOpacity>
  )
}

function ParentScheduleItemCard({
  item,
  locale,
}: {
  item: CrossTeamEventItem
  locale: string
}) {
  const theme = useClubColors()
  const date = new Date(item.date)
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return (
    <View style={styles.listItem}>
      <View style={styles.listItemDate}>
        <Text style={styles.listItemDay}>{dayName}</Text>
        <Text style={[styles.listItemTime, { color: theme.clubPrimary }]}>{time}</Text>
      </View>

      <View style={styles.listItemBody}>
        <Text style={styles.listItemTitle} numberOfLines={1}>{item.title}</Text>
        {item.location ? (
          <Text style={styles.listItemSub} numberOfLines={1}>{item.location}</Text>
        ) : (
          <Text style={styles.listItemSub} numberOfLines={1}>{item.teamDisplayName || item.teamName}</Text>
        )}
      </View>
    </View>
  )
}

// --- Simplified Next Fixture Card ---

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
  const theme = useClubColors()
  const date = new Date(item.date)
  const countdownLabel = formatCountdown(date, t)
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  const typeColor =
    item.type === 'TRAINING'
      ? semanticColors.info
      : item.type === 'MATCH'
        ? semanticColors.success
        : neutralColors.textTertiary

  return (
    <TouchableOpacity
      style={styles.heroCard}
      activeOpacity={0.7}
      onPress={() =>
        router.push({ pathname: '/event-detail', params: { eventId: item.id } })
      }
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.heroTop}>
        <View style={[styles.typeBadge, { backgroundColor: `${typeColor}18` }]}>
          <Text style={[styles.typeBadgeText, { color: typeColor }]}>
            {t(`event.type.${item.type}`)}
          </Text>
        </View>
        <Text style={styles.heroCountdown}>{countdownLabel}</Text>
      </View>

      <Text style={styles.heroTitle} numberOfLines={1}>{item.title}</Text>

      <View style={styles.heroMeta}>
        <Ionicons name="time-outline" size={14} color={neutralColors.textTertiary} />
        <Text style={styles.heroMetaText}>{timeLabel}</Text>
        {item.location ? (
          <>
            <Ionicons name="location-outline" size={14} color={neutralColors.textTertiary} style={{ marginLeft: space.md }} />
            <Text style={[styles.heroMetaText, { flex: 1 }]} numberOfLines={1}>{item.location}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.rsvpRow}>
        {RSVP_OPTIONS.map((option) => {
          const isActive = item.myRsvp === option.status

          return (
            <TouchableOpacity
              key={option.status}
              style={[
                styles.rsvpButton,
                isActive && {
                  backgroundColor: option.color,
                  borderColor: option.color,
                },
              ]}
              onPress={() => onRsvp(item.id, option.status)}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel={getRsvpLabel(option.status, t)}
            >
              <Ionicons
                name={option.icon}
                size={16}
                color={isActive ? neutralColors.textInverse : option.color}
              />
              <Text
                style={[
                  styles.rsvpText,
                  isActive && styles.rsvpTextActive,
                ]}
              >
                {getRsvpLabel(option.status, t)}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* RSVP Summary Counts */}
      {(item.yesCount > 0 || item.maybeCount > 0 || item.noCount > 0) && (
        <View style={styles.rsvpSummaryRow}>
          {([
            { count: item.yesCount, color: semanticColors.success, label: t('event.rsvpYes') },
            { count: item.maybeCount, color: semanticColors.warning, label: t('event.rsvpMaybe') },
            { count: item.noCount, color: semanticColors.error, label: t('event.rsvpNo') },
          ] as const).map((group) =>
            group.count > 0 ? (
              <View key={group.label} style={styles.rsvpSummaryChip}>
                <View style={[styles.rsvpSummaryDot, { backgroundColor: group.color }]} />
                <Text style={[styles.rsvpSummaryCount, { color: group.color }]}>{group.count}</Text>
                <Text style={styles.rsvpSummaryLabel}>{group.label}</Text>
              </View>
            ) : null,
          )}
        </View>
      )}
    </TouchableOpacity>
  )
}

// --- Simplified Event List Item (no sidebar, no inline RSVP) ---

function EventListItem({
  item,
  locale,
  scope,
}: {
  item: EventFeedItem
  locale: string
  scope: EventScope
}) {
  const theme = useClubColors()
  const date = new Date(item.date)
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  const rsvpColor =
    item.myRsvp === 'YES'
      ? semanticColors.success
      : item.myRsvp === 'MAYBE'
        ? semanticColors.warning
        : item.myRsvp === 'NO'
          ? semanticColors.error
          : neutralColors.border

  return (
    <TouchableOpacity
      style={styles.listItem}
      activeOpacity={0.7}
      onPress={() =>
        router.push({ pathname: '/event-detail', params: { eventId: item.id } })
      }
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.listItemDate}>
        <Text style={styles.listItemDay}>{dayName}</Text>
        <Text style={[styles.listItemTime, { color: theme.clubPrimary }]}>{time}</Text>
      </View>

      <View style={styles.listItemBody}>
        <Text style={styles.listItemTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.listItemSub} numberOfLines={1}>
          {item.location || item.type}
        </Text>
      </View>

      {scope === 'upcoming' && (
        <View style={[styles.rsvpDot, { backgroundColor: rsvpColor }]} />
      )}
    </TouchableOpacity>
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

function formatCountdown(date: Date, t: (key: string, options?: Record<string, unknown>) => string) {
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

function getRsvpLabel(
  status: (typeof RSVP_OPTIONS)[number]['status'],
  t: (key: string) => string,
) {
  switch (status) {
    case 'YES':
      return t('event.rsvpYes')
    case 'MAYBE':
      return t('event.rsvpMaybe')
    default:
      return t('event.rsvpNo')
  }
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  list: {
    paddingBottom: space['2xl'],
  },
  topSection: {
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: neutralColors.background,
  },

  // Unified filter bar
  filterBar: {
    flexDirection: 'row',
    gap: space.sm,
    paddingBottom: space.md,
  },
  filterChip: {
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textSecondary,
  },

  // Hero card (next fixture)
  heroCard: {
    marginHorizontal: space.md,
    marginBottom: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.sm,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.sm,
  },
  typeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroCountdown: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.data,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  heroMetaText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  heroFooterLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.xs,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
  },
  heroFooterText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },

  // RSVP buttons (hero card only)
  rsvpRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  rsvpButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  rsvpText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  rsvpTextActive: {
    color: neutralColors.textInverse,
  },

  // RSVP summary on hero card
  rsvpSummaryRow: {
    flexDirection: 'row',
    gap: space.md,
    paddingTop: space.xs,
  },
  rsvpSummaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2xs'],
  },
  rsvpSummaryDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  rsvpSummaryCount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.data,
  },
  rsvpSummaryLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    color: neutralColors.textTertiary,
  },

  // Section headers
  sectionHeader: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },

  // List items (compact, no sidebar)
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.md,
  },
  listItemDate: {
    width: 48,
    alignItems: 'center',
    gap: space['2xs'],
  },
  listItemDay: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
  },
  listItemTime: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.data,
  },
  listItemBody: {
    flex: 1,
    gap: space['2xs'],
  },
  listItemTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.body,
    color: neutralColors.textPrimary,
  },
  listItemSub: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  rsvpDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },

  // Placeholder card
  placeholderCard: {
    marginBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    padding: space.md,
  },
  placeholderText: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },

  // Empty state
  empty: {
    paddingTop: space['2xl'],
    alignItems: 'center',
  },
  emptyAction: {
    marginTop: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
  emptyActionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },

  // Error
  errorCard: {
    margin: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semanticColors.error,
    backgroundColor: neutralColors.surface,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  errorText: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    textAlign: 'center' as const,
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  retryText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
})
