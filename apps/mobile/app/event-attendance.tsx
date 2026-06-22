import { useCallback, useEffect, useState } from 'react'
import { View, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { elevation, hairline, radius, space } from '../src/theme/tokens'

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
      const data = await api<EventDetail>(`/clubs/${activeClub.club.id}/events/${eventId}`)
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
      <Screen header={<ModalHeader mode="back" title={t('eventAttendance.title')} />} padded={false}>
        <View style={styles.state}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </Screen>
    )
  }

  if (!event) {
    return (
      <Screen header={<ModalHeader mode="back" title={t('eventAttendance.title')} />} padded={false}>
        <View style={styles.state}>
          {error ? (
            <View
              style={[
                styles.errorCard,
                { borderColor: c.borderDefault, backgroundColor: c.surface, ...elevation.card },
              ]}
            >
              <Text variant="body" color="secondary" style={styles.center}>
                {t('common.loadError')}
              </Text>
              <Button
                label={t('common.retry')}
                variant="secondary"
                size="md"
                onPress={() => {
                  setError(false)
                  setLoading(true)
                  fetchEvent()
                }}
              />
            </View>
          ) : (
            <Text variant="body" color="tertiary">
              {t('common.error')}
            </Text>
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

  const allRsvps = sections.flatMap((s) => s.items.map((item) => ({ ...item, _section: s.status })))

  return (
    <Screen header={<ModalHeader mode="back" title={t('eventAttendance.title')} />} padded={false}>
      {/* Event Summary */}
      <View
        style={[
          styles.summaryCard,
          { backgroundColor: c.surface, borderColor: c.borderDefault, ...elevation.card },
        ]}
      >
        <Text variant="headline" weight="semibold" color="primary">
          {event.title}
        </Text>
        <Text variant="footnote" color="secondary" tabular style={styles.summaryDate}>
          {formattedDate}
        </Text>
        {event.location && (
          <View style={styles.locationRow}>
            <Icon name="mappin.circle" size="sm" color="tertiary" />
            <Text variant="footnote" color="tertiary" numberOfLines={2}>
              {event.location}
            </Text>
          </View>
        )}
      </View>

      {/* Summary Counts */}
      <View
        style={[
          styles.countsRow,
          { backgroundColor: c.surface, borderColor: c.borderDefault, ...elevation.card },
        ]}
      >
        {(['YES', 'MAYBE', 'NO'] as const).map((status) => {
          const color = statusColors[status]
          return (
            <View key={status} style={styles.countChip}>
              <Icon name={STATUS_ICONS[status]} size="md" color={color} />
              <Text variant="title3" weight="bold" tabular style={{ color }}>
                {String(grouped[status].length)}
              </Text>
              <Text variant="caption2" color="tertiary">
                {t(STATUS_LABELS[status])}
              </Text>
            </View>
          )
        })}
      </View>

      {/* RSVP List */}
      <FlatList
        data={allRsvps}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item, index }) => {
          const color = statusColors[item._section]
          const prevSection = index > 0 ? allRsvps[index - 1]._section : null
          const showHeader = item._section !== prevSection

          return (
            <>
              {showHeader && (
                <View style={styles.sectionHeader}>
                  <Icon name={STATUS_ICONS[item._section]} size="sm" color={color} />
                  <Text variant="caption1" weight="semibold" tracking="wide" style={{ color }}>
                    {`${t(STATUS_LABELS[item._section]).toUpperCase()} · ${grouped[item._section].length}`}
                  </Text>
                </View>
              )}
              <View style={[styles.rsvpRow, { borderBottomColor: c.borderDefault }]}>
                <View style={[styles.avatar, { backgroundColor: c.primary50 }]}>
                  <Text variant="footnote" weight="bold" style={{ color: c.primary }}>
                    {item.user.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text variant="body" color="primary" numberOfLines={1} style={styles.userName}>
                  {item.user.name}
                </Text>
                <Icon name={STATUS_ICONS[item._section]} size="lg" color={color} />
              </View>
            </>
          )
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="person.2" size="md" color="tertiary" />
            <Text variant="body" color="tertiary">
              {t('eventAttendance.noResponses')}
            </Text>
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
  center: { textAlign: 'center' },
  errorCard: {
    margin: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    gap: space.sm,
  },
  summaryCard: {
    marginHorizontal: space.md,
    marginBottom: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.xs,
  },
  summaryDate: { marginTop: space['2xs'] },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space['2xs'] },
  countsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: space.md,
    marginBottom: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  countChip: { alignItems: 'center', gap: space.xs, flex: 1 },
  list: { paddingHorizontal: space.md, paddingBottom: space['2xl'] },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  rsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: space.sm,
    borderBottomWidth: hairline,
    gap: space.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: space['3xl'],
    gap: space.sm,
  },
})
