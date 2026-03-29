import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { EventFeedItem, RSVP } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import { EventFilter } from '../../../src/components/EventFilter'
import { IllustratedEmptyState } from '../../../src/components/IllustratedEmptyState'
import { TabScreenHeader } from '../../../src/components/TabScreenHeader'
import { getAppLocale } from '../../../src/i18n'
import { illustrations } from '../../../src/illustrations'
import { neutralColors, semanticColors } from '../../../src/theme/tokens'

const RSVP_OPTIONS = [
  { status: 'YES', icon: 'checkmark', color: semanticColors.success },
  { status: 'MAYBE', icon: 'help', color: semanticColors.warning },
  { status: 'NO', icon: 'close', color: semanticColors.error },
] as const

export default function EventsScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const theme = useClubColors()
  const [events, setEvents] = useState<EventFeedItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingEventIds, setPendingEventIds] = useState<Record<string, boolean>>({})
  const [filterType, setFilterType] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const locale = getAppLocale(i18n.resolvedLanguage === 'en' ? 'en' : 'de')

  const fetchEvents = useCallback(async () => {
    if (!activeClub || !activeTeamId) return
    try {
      let url = `/clubs/${activeClub.club.id}/events?teamId=${activeTeamId}`
      if (filterType !== 'ALL') url += `&type=${filterType}`
      if (dateFrom) url += `&dateFrom=${dateFrom}`
      if (dateTo) url += `&dateTo=${dateTo}`
      const data = await api<EventFeedItem[]>(url)
      setEvents(data || [])
    } catch {
      // Stale-while-revalidate.
    } finally {
      setLoading(false)
    }
  }, [activeClub, activeTeamId, filterType, dateFrom, dateTo])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchEvents()
    } finally {
      setRefreshing(false)
    }
  }

  const handleRsvp = async (eventId: string, status: string) => {
    if (!activeClub) return
    if (pendingEventIds[eventId]) return

    setPendingEventIds((current) => ({ ...current, [eventId]: true }))
    setEvents((current) =>
      current.map((event) =>
        event.id === eventId ? { ...event, myRsvp: status as EventFeedItem['myRsvp'] } : event,
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

  const renderEvent = ({ item }: { item: EventFeedItem }) => {
    const date = new Date(item.date)
    const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
    const dayNum = date.getDate()
    const month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(date)
    const time = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
    const isMatch = item.type === 'MATCH'

    return (
      <View style={styles.eventCard}>
        <View style={styles.dateColumn}>
          <Text style={styles.dateDayName}>{dayName}</Text>
          <Text style={[styles.dateDayNum, { color: theme.clubPrimary }]}>{dayNum}</Text>
          <Text style={styles.dateMonth}>{month}</Text>
        </View>

        <View style={styles.eventDetails}>
          <View style={styles.eventRow}>
            <View
              style={[
                styles.typeBadge,
                {
                  backgroundColor: isMatch
                    ? `${semanticColors.error}18`
                    : theme.clubPrimaryLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.typeText,
                  { color: isMatch ? semanticColors.error : theme.clubPrimary },
                ]}
              >
                {t(`event.type.${item.type}`)}
              </Text>
            </View>
            <Text style={styles.eventTime}>{time}</Text>
          </View>
          <Text style={styles.eventTitle}>{item.title}</Text>
          {item.location && (
            <View style={styles.locationRow}>
              <Ionicons
                name="location-outline"
                size={13}
                color={neutralColors.textTertiary}
              />
              <Text style={styles.locationText}>{item.location}</Text>
            </View>
          )}

          <View style={styles.rsvpRow}>
            {RSVP_OPTIONS.map((option) => {
              const isActive = item.myRsvp === option.status

              return (
                <TouchableOpacity
                  key={option.status}
                  style={[
                    styles.rsvpBtn,
                    {
                      backgroundColor: isActive ? option.color : 'transparent',
                      borderColor: isActive ? option.color : neutralColors.border,
                    },
                  ]}
                onPress={() => handleRsvp(item.id, option.status)}
                disabled={!!pendingEventIds[item.id]}
                >
                  <Ionicons
                    name={option.icon}
                    size={16}
                    color={isActive ? '#FFF' : neutralColors.textTertiary}
                  />
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/event-attendance',
                  params: { eventId: item.id },
                })
              }
            >
              <Text style={styles.rsvpCount}>
                {t('event.responded', { count: item.responseCount || 0 })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  const canCreate =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'
  const subtitle = activeTeamAccess?.team.displayName || activeClub?.club.name

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <TabScreenHeader
          title={t('event.screenTitle')}
          subtitle={subtitle}
        />
      </View>
      <EventFilter selectedType={filterType} onTypeChange={setFilterType} dateFrom={dateFrom} dateTo={dateTo} onDateFromChange={setDateFrom} onDateToChange={setDateTo} />
      <FlatList
        key={activeTeamId}
        data={events}
        keyExtractor={(event) => event.id}
        renderItem={renderEvent}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <IllustratedEmptyState
                illustration={illustrations.emptyEvents}
                title={t('event.emptyTitle')}
                description={canCreate ? t('event.noEventsCoach') : t('event.emptyBody')}
              />
              {canCreate && (
                <TouchableOpacity
                  style={[styles.emptyAction, { backgroundColor: theme.clubPrimary }]}
                  onPress={() => router.push('/create-event')}
                >
                  <Text style={styles.emptyActionText}>{t('event.createEvent')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null
        }
      />
      {canCreate && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.clubPrimary }]}
          onPress={() => router.push('/create-event')}
        >
          <Ionicons name="add" size={28} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  topSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: neutralColors.background,
  },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: neutralColors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  dateColumn: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: neutralColors.border,
  },
  dateDayName: {
    fontSize: 11,
    fontWeight: '600',
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
  },
  dateDayNum: { fontSize: 24, fontWeight: '700', marginVertical: 2 },
  dateMonth: {
    fontSize: 11,
    fontWeight: '500',
    color: neutralColors.textSecondary,
    textTransform: 'uppercase',
  },
  eventDetails: { flex: 1, padding: 12, gap: 6 },
  eventRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  typeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  eventTime: { fontSize: 13, color: neutralColors.textSecondary },
  eventTitle: { fontSize: 16, fontWeight: '600', color: neutralColors.textPrimary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 13, color: neutralColors.textTertiary },
  rsvpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rsvpBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  rsvpCount: { fontSize: 12, color: neutralColors.textTertiary, marginLeft: 'auto' },
  empty: { paddingTop: 72, alignItems: 'center' },
  emptyAction: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  emptyActionText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
})
