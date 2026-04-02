import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  RefreshControl,
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

type EventSection = {
  title: string
  data: EventFeedItem[]
}

type ParentEventSection = {
  title: string
  data: CrossTeamEventItem[]
}

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
  const [filterType, setFilterType] = useState('ALL')
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

  const nextFixture = scope === 'upcoming' ? events[0] ?? null : null
  const listEvents = scope === 'upcoming' ? events.slice(1) : events
  const sections = useMemo(
    () => buildSections(listEvents, locale, t),
    [listEvents, locale, t],
  )

  const subtitle = activeTeamAccess?.team.displayName || activeClub?.club.name
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
        <TabScreenHeader
          title={t('event.screenTitle')}
          subtitle={subtitle}
        />
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
          <ScheduleItemCard
            item={item}
            locale={locale}
            scope={scope}
            pending={Boolean(pendingEventIds[item.id])}
            onRsvp={handleRsvp}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
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
                subtitle={subtitle}
                actionIcon={canCreate ? 'add' : undefined}
                actionAccessibilityLabel={canCreate ? t('event.createEvent') : undefined}
                onActionPress={canCreate ? () => router.push('/create-event') : undefined}
              />

              <View style={styles.scopeRow}>
                <ScopeChip
                  label={t('event.upcoming')}
                  active={scope === 'upcoming'}
                  onPress={() => setScope('upcoming')}
                  color={theme.clubPrimary}
                />
                <ScopeChip
                  label={t('event.past')}
                  active={scope === 'past'}
                  onPress={() => setScope('past')}
                  color={theme.clubPrimary}
                />
              </View>

              {nextFixture ? (
                <NextFixtureCard
                  item={nextFixture}
                  locale={locale}
                  pending={Boolean(pendingEventIds[nextFixture.id])}
                  onRsvp={handleRsvp}
                />
              ) : (
                <View style={styles.scheduleCard}>
                  <Text style={styles.scheduleEyebrow}>
                    {scope === 'past' ? t('event.past') : t('event.scheduleBoard')}
                  </Text>
                  <Text style={styles.scheduleBody}>
                    {scope === 'past'
                      ? t('event.noPastEvents')
                      : t('event.scheduleHint')}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.filterRow}>
              {(['ALL', 'TRAINING', 'MATCH', 'OTHER'] as const).map((type) => {
                const isActive = filterType === type
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.filterChip,
                      isActive && { backgroundColor: theme.clubPrimary, borderColor: theme.clubPrimary },
                    ]}
                    onPress={() => setFilterType(type)}
                    accessibilityRole="button"
                    accessibilityLabel={t(`eventFilter.${type.toLowerCase()}`)}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.filterChipText, isActive && { color: neutralColors.textInverse }]}
                    >
                      {t(`eventFilter.${type.toLowerCase()}`)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

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
            <Text style={styles.sectionCount}>{section.data.length}</Text>
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
              eyebrow={t('event.scheduleBoard')}
            />

            {nextEvent ? (
              <ParentNextEventCard item={nextEvent} locale={locale} />
            ) : (
              <View style={styles.scheduleCard}>
                <Text style={styles.scheduleEyebrow}>{t('parentSchedule.title')}</Text>
                <Text style={styles.scheduleBody}>{t('parentSchedule.emptyDescription')}</Text>
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
  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
    .format(date)
    .toUpperCase()
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return (
    <TouchableOpacity
      style={styles.fixtureCard}
      onPress={() => router.push('/parent-schedule')}
      accessibilityRole="button"
      accessibilityLabel={t('parentSchedule.viewAll')}
    >
      <View style={styles.fixtureHeader}>
        <Text style={styles.fixtureEyebrow}>{t('parentSchedule.nextEvent')}</Text>
        <Text style={styles.fixtureCountdown}>{countdownLabel}</Text>
      </View>

      <View style={styles.fixtureBody}>
        <View style={styles.fixtureCopy}>
          <View
            style={[
              styles.parentTeamBadge,
              { backgroundColor: theme.clubPrimaryLight },
            ]}
          >
            <Text style={[styles.parentTeamBadgeText, { color: theme.clubPrimary }]}>
              {item.teamDisplayName || item.teamName}
            </Text>
          </View>
          <Text style={styles.fixtureTitle}>{item.title}</Text>
          {item.location ? (
            <View style={styles.fixtureLocationRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color={neutralColors.textTertiary}
              />
              <Text style={styles.fixtureLocation}>{item.location}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.timeCard}>
          <Text style={[styles.timeCardValue, { color: theme.clubPrimary }]}>
            {timeLabel}
          </Text>
          <Text style={styles.timeCardLabel}>{dayLabel}</Text>
        </View>
      </View>

      <View style={styles.fixtureFooter}>
        <Text style={styles.fixtureFooterText}>{t('parentSchedule.viewAll')}</Text>
        <Ionicons
          name="chevron-forward"
          size={16}
          color={neutralColors.textTertiary}
        />
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
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return (
    <View style={styles.eventCard}>
      <View style={styles.eventLead}>
        <Text style={[styles.eventTime, { color: theme.clubPrimary }]}>{time}</Text>
        <Text style={styles.eventType}>{item.teamDisplayName || item.teamName}</Text>
      </View>

      <View style={styles.eventBody}>
        <Text style={styles.eventTitle}>{item.title}</Text>
        {item.location ? (
          <View style={styles.eventLocationRow}>
            <Ionicons
              name="location-outline"
              size={13}
              color={neutralColors.textTertiary}
            />
            <Text style={styles.eventLocation}>{item.location}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

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
  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })
    .format(date)
    .toUpperCase()
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return (
    <TouchableOpacity
      style={styles.fixtureCard}
      activeOpacity={0.7}
      onPress={() =>
        router.push({ pathname: '/event-detail', params: { eventId: item.id } })
      }
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.fixtureHeader}>
        <Text style={styles.fixtureEyebrow}>{t('event.nextFixture')}</Text>
        <Text style={styles.fixtureCountdown}>{countdownLabel}</Text>
      </View>

      <View style={styles.fixtureBody}>
        <View style={styles.fixtureCopy}>
          <Text style={styles.fixtureMeta}>{t(`event.type.${item.type}`)}</Text>
          <Text style={styles.fixtureTitle}>{item.title}</Text>
          {item.location ? (
            <View style={styles.fixtureLocationRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color={neutralColors.textTertiary}
              />
              <Text style={styles.fixtureLocation}>{item.location}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.timeCard}>
          <Text style={[styles.timeCardValue, { color: theme.clubPrimary }]}>
            {timeLabel}
          </Text>
          <Text style={styles.timeCardLabel}>{dayLabel}</Text>
        </View>
      </View>

      <View style={styles.fixtureRsvpRow}>
        {RSVP_OPTIONS.map((option) => {
          const isActive = item.myRsvp === option.status

          return (
            <TouchableOpacity
              key={option.status}
              style={[
                styles.fixtureRsvpButton,
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
                  styles.fixtureRsvpText,
                  isActive && styles.fixtureRsvpTextActive,
                ]}
              >
                {getRsvpLabel(option.status, t)}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

    </TouchableOpacity>
  )
}

function ScheduleItemCard({
  item,
  locale,
  pending,
  scope,
  onRsvp,
}: {
  item: EventFeedItem
  locale: string
  pending: boolean
  scope: EventScope
  onRsvp: (eventId: string, status: string) => void
}) {
  const { t } = useTranslation()
  const theme = useClubColors()
  const date = new Date(item.date)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return (
    <TouchableOpacity
      style={styles.eventCard}
      activeOpacity={0.7}
      onPress={() =>
        router.push({ pathname: '/event-detail', params: { eventId: item.id } })
      }
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.eventLead}>
        <Text style={[styles.eventTime, { color: theme.clubPrimary }]}>{time}</Text>
        <Text style={styles.eventType}>{t(`event.type.${item.type}`)}</Text>
      </View>

      <View style={styles.eventBody}>
        <Text style={styles.eventTitle}>{item.title}</Text>
        {item.location ? (
          <View style={styles.eventLocationRow}>
            <Ionicons
              name="location-outline"
              size={13}
              color={neutralColors.textTertiary}
            />
            <Text style={styles.eventLocation}>{item.location}</Text>
          </View>
        ) : null}

        <View style={styles.eventFooter}>
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/event-attendance',
                params: { eventId: item.id },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={t('event.viewAttendance')}
          >
            <Text style={styles.eventAttendance}>
              {t('event.attendanceSummary', {
                yes: item.yesCount || 0,
                maybe: item.maybeCount || 0,
                no: item.noCount || 0,
              })}
            </Text>
          </TouchableOpacity>

          {scope === 'upcoming' ? (
            <View style={styles.inlineRsvpRow}>
              {RSVP_OPTIONS.map((option) => {
                const isActive = item.myRsvp === option.status

                return (
                  <TouchableOpacity
                    key={option.status}
                    style={[
                      styles.inlineRsvpButton,
                      isActive && {
                        borderColor: option.color,
                        backgroundColor: `${option.color}14`,
                      },
                    ]}
                    onPress={() => onRsvp(item.id, option.status)}
                    disabled={pending}
                    accessibilityRole="button"
                    accessibilityLabel={getRsvpLabel(option.status, t)}
                  >
                    <Ionicons
                      name={option.icon}
                      size={14}
                      color={isActive ? option.color : neutralColors.textTertiary}
                    />
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  )
}

function ScopeChip({
  label,
  active,
  onPress,
  color,
}: {
  label: string
  active: boolean
  onPress: () => void
  color: string
}) {
  return (
    <TouchableOpacity
      style={[
        styles.scopeChip,
        active && { backgroundColor: color, borderColor: color },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={[styles.scopeChipText, active && styles.scopeChipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

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
  scopeRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  filterChip: {
    flexBasis: '23%',
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 84,
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
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
    textAlign: 'center',
  },
  scopeChip: {
    minHeight: 44,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  scopeChipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  scopeChipTextActive: {
    color: neutralColors.textInverse,
  },
  scheduleCard: {
    marginBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.xs,
  },
  scheduleEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  scheduleBody: {
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  fixtureCard: {
    marginBottom: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    padding: space.md,
    gap: space.md,
  },
  fixtureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  fixtureEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: neutralColors.textPrimary,
  },
  fixtureCountdown: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.data,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
  },
  fixtureBody: {
    flexDirection: 'row',
    gap: space.md,
  },
  fixtureCopy: {
    flex: 1,
    gap: space.sm,
  },
  parentTeamBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  parentTeamBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    textTransform: 'uppercase',
  },
  fixtureMeta: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  fixtureTitle: {
    fontSize: fontSize['3xl'],
    lineHeight: lineHeight['3xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    letterSpacing: -0.6,
  },
  fixtureLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  fixtureLocation: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  timeCard: {
    width: 92,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    paddingHorizontal: space.sm,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  timeCardValue: {
    fontSize: fontSize.xl,
    fontFamily: fonts.data,
    fontWeight: fontWeight.bold,
  },
  timeCardLabel: {
    fontSize: fontSize['2xs'],
    color: neutralColors.textSecondary,
    fontFamily: fonts.data,
    textAlign: 'center',
  },
  fixtureRsvpRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  fixtureRsvpButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  fixtureRsvpText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
    textTransform: 'uppercase',
  },
  fixtureRsvpTextActive: {
    color: neutralColors.textInverse,
  },
  fixtureFooter: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
    paddingTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  fixtureFooterText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  sectionCount: {
    minWidth: space.xl,
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: neutralColors.textSecondary,
  },
  eventCard: {
    flexDirection: 'row',
    marginHorizontal: space.md,
    marginBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    overflow: 'hidden',
  },
  eventLead: {
    width: 84,
    paddingHorizontal: space.sm,
    paddingVertical: space.md,
    borderRightWidth: 1,
    borderRightColor: neutralColors.border,
    justifyContent: 'center',
    gap: space.xs,
  },
  eventTime: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.data,
  },
  eventType: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  eventBody: {
    flex: 1,
    padding: space.md,
    gap: space.sm,
  },
  eventTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  eventLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  eventLocation: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  eventAttendance: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: neutralColors.textSecondary,
  },
  inlineRsvpRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  inlineRsvpButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutralColors.background,
  },
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
