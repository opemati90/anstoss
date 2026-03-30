import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { neutralColors, semanticColors, space, fontSize, fontWeight, radius } from '../src/theme/tokens'

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

const STATUS_CONFIG = {
  YES: { icon: 'checkmark-circle' as const, color: semanticColors.success, label: 'event.rsvpYes' },
  MAYBE: { icon: 'help-circle' as const, color: semanticColors.warning, label: 'event.rsvpMaybe' },
  NO: { icon: 'close-circle' as const, color: semanticColors.error, label: 'event.rsvpNo' },
}

export default function EventAttendanceScreen() {
  const { t } = useTranslation()
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchEvent = useCallback(async () => {
    if (!activeClub || !eventId) return
    try {
      const data = await api<EventDetail>(
        `/clubs/${activeClub.club.id}/events/${eventId}`,
      )
      setEvent(data)
    } catch {
      // silent
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={neutralColors.textTertiary} />
      </View>
    )
  }

  if (!event) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{t('common.error')}</Text>
      </View>
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
    <View style={styles.container}>
      <ModalHeader title={t('eventAttendance.title')} />

      {/* Event Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventDate}>{formattedDate}</Text>
        {event.location && (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color={neutralColors.textTertiary} />
            <Text style={styles.locationText}>{event.location}</Text>
          </View>
        )}
      </View>

      {/* Summary Counts */}
      <View style={styles.countsRow}>
        {(['YES', 'MAYBE', 'NO'] as const).map((status) => {
          const config = STATUS_CONFIG[status]
          return (
            <View key={status} style={styles.countChip}>
              <Ionicons name={config.icon} size={18} color={config.color} />
              <Text style={[styles.countNumber, { color: config.color }]}>
                {grouped[status].length}
              </Text>
              <Text style={styles.countLabel}>{t(config.label)}</Text>
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
          const config = STATUS_CONFIG[item._section]
          const prevSection =
            index > 0 ? allRsvps[index - 1]._section : null
          const showHeader = item._section !== prevSection

          return (
            <>
              {showHeader && (
                <View style={styles.sectionHeader}>
                  <Ionicons name={config.icon} size={16} color={config.color} />
                  <Text style={[styles.sectionTitle, { color: config.color }]}>
                    {t(config.label)} ({grouped[item._section].length})
                  </Text>
                </View>
              )}
              <View style={styles.rsvpRow}>
                <View style={[styles.avatar, { backgroundColor: theme.clubPrimaryLight }]}>
                  <Text style={[styles.avatarText, { color: theme.clubPrimary }]}>
                    {item.user.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.userName}>{item.user.name}</Text>
                <Ionicons name={config.icon} size={20} color={config.color} />
              </View>
            </>
          )
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={neutralColors.textTertiary} />
            <Text style={styles.emptyText}>{t('eventAttendance.noResponses')}</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  loadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: neutralColors.background,
  },
  errorText: { fontSize: fontSize.md, color: neutralColors.textTertiary },
  summaryCard: {
    marginHorizontal: space.md, marginBottom: space.sm,
    padding: space.md, backgroundColor: neutralColors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: neutralColors.border,
  },
  eventTitle: {
    fontSize: fontSize.lg, fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary, marginBottom: 4,
  },
  eventDate: {
    fontSize: fontSize.sm, color: neutralColors.textSecondary, marginBottom: 4,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: fontSize.sm, color: neutralColors.textTertiary },
  countsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginHorizontal: space.md, marginBottom: space.md,
    padding: space.sm, backgroundColor: neutralColors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: neutralColors.border,
  },
  countChip: { alignItems: 'center', gap: 2 },
  countNumber: { fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  countLabel: { fontSize: fontSize['2xs'], color: neutralColors.textTertiary },
  list: { paddingHorizontal: space.md, paddingBottom: 40 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: space.md, paddingBottom: space.xs,
  },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  rsvpRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1,
    borderBottomColor: neutralColors.border, gap: space.sm,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  userName: {
    flex: 1, fontSize: fontSize.md,
    color: neutralColors.textPrimary, fontWeight: fontWeight.medium,
  },
  emptyContainer: {
    alignItems: 'center', paddingTop: 60, gap: space.sm,
  },
  emptyText: { fontSize: fontSize.md, color: neutralColors.textTertiary },
})
