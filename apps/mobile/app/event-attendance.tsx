import { useCallback, useEffect, useState } from 'react'
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, Button, Text, Icon} from '../src/components/ui'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { space, fontSize, radius, fonts, lineHeight, iconSize ,
  hairline} from '../src/theme/tokens'

type RsvpUser = {
  id: string
  status: 'YES' | 'MAYBE' | 'NO'
  updatedAt: string
  user: { id: string; name: string; avatarUrl?: string | null }
}

type EventDetail = {
  id: string
  title: string
  type: 'TRAINING' | 'MATCH' | 'OTHER'
  date: string
  location: string | null
  notes: string | null
  rsvps: RsvpUser[]
  team?: { id: string; name: string }
}

const STATUS_ICONS = {
  YES: 'checkmark.circle.fill',
  MAYBE: 'questionmark.circle.fill',
  NO: 'xmark.circle.fill',
} as const

const STATUS_LABELS = {
  YES: 'event.rsvpYes',
  MAYBE: 'event.rsvpMaybe',
  NO: 'event.rsvpNo',
}

export default function EventAttendanceScreen() {
  const { t } = useTranslation()
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)

  const statusColors = {
    YES: c.success,
    MAYBE: c.warning,
    NO: c.error,
  }

  const fetchEvent = useCallback(async () => {
    if (!activeClub || !eventId) return
    try {
      const data = await api<EventDetail>(
        `/clubs/${activeClub.club.id}/events/${eventId}`,
      )
      setError(false)
      setEvent(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [activeClub, eventId])

  useEffect(() => {
    fetchEvent()
  }, [fetchEvent])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchEvent()
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <Screen header={<ModalHeader title={t('eventAttendance.title')} />} padded={false}>
        <View style={styles.state}>
          <ActivityIndicator size="large" color={c.clubPrimary} />
        </View>
      </Screen>
    )
  }

  if (!event) {
    return (
      <Screen header={<ModalHeader title={t('eventAttendance.title')} />} padded={false}>
        <View style={styles.state}>
          {error ? (
            <View style={[styles.errorCard, { borderColor: c.error, backgroundColor: c.surface }]}>
              <Text style={[styles.errorText, { color: c.textSecondary }]}>{t('common.loadError')}</Text>
              <Button
                label={t('common.retry')}
                variant="secondary"
                size="md"
                onPress={() => { setError(false); setLoading(true); fetchEvent() }}
              />
            </View>
          ) : (
            <Text style={[styles.fallbackText, { color: c.textTertiary }]}>{t('common.error')}</Text>
          )}
        </View>
      </Screen>
    )
  }

  const date = new Date(event.date)
  const formattedDate = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  const grouped = {
    YES: event.rsvps.filter((r) => r.status === 'YES'),
    MAYBE: event.rsvps.filter((r) => r.status === 'MAYBE'),
    NO: event.rsvps.filter((r) => r.status === 'NO'),
  }

  const sections: { status: 'YES' | 'MAYBE' | 'NO'; items: RsvpUser[] }[] = [
    { status: 'YES', items: grouped.YES },
    { status: 'MAYBE', items: grouped.MAYBE },
    { status: 'NO', items: grouped.NO },
  ]

  const allRsvps = sections.flatMap((s) =>
    s.items.map((item) => ({ ...item, _section: s.status })),
  )

  return (
    <Screen header={<ModalHeader title={t('eventAttendance.title')} />} padded={false}>
      {/* Event Summary */}
      <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.eventTitle, { color: c.textPrimary }]}>{event.title}</Text>
        <Text style={[styles.eventDate, { color: c.textSecondary }]}>{formattedDate}</Text>
        {event.location && (
          <View style={styles.locationRow}>
            <Icon name="mappin.circle" size="sm" color={c.textTertiary} />
            <Text style={[styles.locationText, { color: c.textTertiary }]}>{event.location}</Text>
          </View>
        )}
      </View>

      {/* Summary Counts */}
      <View style={[styles.countsRow, { backgroundColor: c.surface, borderColor: c.border }]}>
        {(['YES', 'MAYBE', 'NO'] as const).map((status) => {
          const color = statusColors[status]
          return (
            <View key={status} style={styles.countChip}>
              <Icon name={STATUS_ICONS[status]} size="md" color={color} />
              <Text style={[styles.countNumber, { color }]}>
                {grouped[status].length}
              </Text>
              <Text style={[styles.countLabel, { color: c.textTertiary }]}>{t(STATUS_LABELS[status])}</Text>
            </View>
          )
        })}
      </View>

      {/* RSVP List */}
      <FlatList
        data={allRsvps}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item, index }) => {
          const color = statusColors[item._section]
          const prevSection =
            index > 0 ? allRsvps[index - 1]._section : null
          const showHeader = item._section !== prevSection

          return (
            <>
              {showHeader && (
                <View style={styles.sectionHeader}>
                  <Icon name={STATUS_ICONS[item._section]} size="sm" color={color} />
                  <Text style={[styles.sectionTitle, { color }]}>
                    {t(STATUS_LABELS[item._section])} ({grouped[item._section].length})
                  </Text>
                </View>
              )}
              <View style={[styles.rsvpRow, { borderBottomColor: c.border }]}>
                <View style={[styles.avatar, { backgroundColor: c.clubPrimaryLight }]}>
                  <Text style={[styles.avatarText, { color: c.clubPrimary }]}>
                    {item.user.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.userName, { color: c.textPrimary }]}>{item.user.name}</Text>
                <Icon name={STATUS_ICONS[item._section]} size="lg" color={color} />
              </View>
            </>
          )
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="person.2" size="md" color={c.textTertiary} />
            <Text style={[styles.emptyText, { color: c.textTertiary }]}>{t('eventAttendance.noResponses')}</Text>
          </View>
        }
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  state: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.xl,
  },
  fallbackText: { fontSize: fontSize.md, fontFamily: fonts.body, lineHeight: lineHeight.md },
  errorCard: {
    margin: space.md,
    padding: space.md + 2,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center' as const,
    gap: space.sm,
  },
  errorText: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    textAlign: 'center' as const,
  },
  summaryCard: {
    marginHorizontal: space.md, marginBottom: space.sm,
    padding: space.md + 2,
    borderRadius: radius.lg, borderWidth: hairline,
  },
  eventTitle: {
    fontSize: fontSize.lg, fontFamily: fonts.heading,
    marginBottom: space.xs,
  },
  eventDate: {
    fontSize: fontSize.sm, fontFamily: fonts.data, marginBottom: space.xs,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  locationText: { fontSize: fontSize.sm, fontFamily: fonts.body },
  countsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginHorizontal: space.md, marginBottom: space.md,
    padding: space.md,
    borderRadius: radius.lg, borderWidth: hairline,
  },
  countChip: { alignItems: 'center', gap: space.xs, flex: 1 },
  countNumber: { fontSize: fontSize.lg, fontFamily: fonts.data },
  countLabel: { fontSize: fontSize['2xs'], fontFamily: fonts.label },
  list: { paddingHorizontal: space.md, paddingBottom: space['2xl'] },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingTop: space.lg, paddingBottom: space.sm,
  },
  sectionTitle: { fontSize: fontSize.sm, fontFamily: fonts.heading },
  rsvpRow: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: 52, paddingVertical: space.sm, borderBottomWidth: hairline,
    gap: space.sm,
  },
  avatar: {
    width: 40, height: 40, borderRadius: radius.full,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: fontSize.sm, fontFamily: fonts.heading },
  userName: {
    flex: 1, fontSize: fontSize.md, fontFamily: fonts.label,
  },
  emptyContainer: {
    alignItems: 'center', paddingTop: space['3xl'], gap: space.sm,
  },
  emptyText: { fontSize: fontSize.md, fontFamily: fonts.body },
})
