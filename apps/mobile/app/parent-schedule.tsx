import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import type { CrossTeamEventItem } from '@anstoss/shared'
import { RSVP } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { EventListSkeleton } from '../src/components/Skeleton'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { ModalHeader } from '../src/components/ModalHeader'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { neutralColors, radius, space, fontSize, fontWeight, semanticColors, fonts } from '../src/theme/tokens'

const RSVP_OPTIONS = [
  { status: 'YES', icon: 'checkmark-circle' as const, color: semanticColors.success },
  { status: 'MAYBE', icon: 'help-circle' as const, color: semanticColors.warning },
  { status: 'NO', icon: 'close-circle' as const, color: semanticColors.error },
]

export default function ParentScheduleScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const theme = useClubColors()
  const [events, setEvents] = useState<CrossTeamEventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [rsvpPending, setRsvpPending] = useState(false)
  const rsvpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const locale = getAppLocale(getAppLanguage())
  const clubId = activeClub?.club.id

  const handleChildRsvp = (eventId: string, childUserId: string, childName: string, status: string) => {
    if (!clubId || rsvpPending) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    // Optimistic update
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, childRsvp: status as any } : e,
      ),
    )

    if (rsvpTimer.current) clearTimeout(rsvpTimer.current)
    rsvpTimer.current = setTimeout(async () => {
      setRsvpPending(true)
      try {
        await api(`/clubs/${clubId}/events/${eventId}/rsvp-proxy`, {
          method: 'PUT',
          body: { status, childUserId },
        })
      } catch {
        Alert.alert(t('common.error'), t('errors.server'))
        await fetchEvents()
      } finally {
        setRsvpPending(false)
      }
    }, RSVP.DEBOUNCE_MS)
  }

  const fetchEvents = useCallback(async () => {
    try {
      const data = await api<CrossTeamEventItem[]>('/me/children-events')
      setEvents(data || [])
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const typeColor: Record<string, string> = {
    TRAINING: semanticColors.info,
    MATCH: semanticColors.success,
    OTHER: semanticColors.warning,
  }

  const renderEvent = ({ item }: { item: CrossTeamEventItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: (typeColor[item.type] || semanticColors.info) + '15' },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.typeBadgeText,
              { color: typeColor[item.type] || semanticColors.info },
            ]}
          >
            {t(`event.type.${item.type}`)}
          </Text>
        </View>
        <View style={[styles.teamBadge, { backgroundColor: theme.clubPrimary + '15' }]}>
          <Text
            numberOfLines={1}
            style={[styles.teamBadgeText, { color: theme.clubPrimary }]}
          >
            {item.teamDisplayName || item.teamName}
          </Text>
        </View>
      </View>
      <Text numberOfLines={2} style={styles.eventTitle}>
        {item.title}
      </Text>
      <Text style={styles.eventDate}>{formatDate(item.date)}</Text>
      {item.location && (
        <Text numberOfLines={1} style={styles.eventLocation}>
          {item.location}
        </Text>
      )}
      {item.childUserId ? (
        <View style={styles.rsvpSection}>
          {item.childName ? (
            <Text style={styles.rsvpLabel}>
              {t('parentRsvp.rsvpFor', { name: item.childName })}
            </Text>
          ) : null}
          <View style={styles.rsvpRow}>
            {RSVP_OPTIONS.map((opt) => {
              const isSelected = item.childRsvp === opt.status
              return (
                <TouchableOpacity
                  key={opt.status}
                  style={[
                    styles.rsvpButton,
                    isSelected && { backgroundColor: opt.color + '20', borderColor: opt.color },
                  ]}
                  onPress={() =>
                    handleChildRsvp(item.id, item.childUserId!, item.childName || '', opt.status)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t(`event.rsvp${opt.status.charAt(0) + opt.status.slice(1).toLowerCase()}`)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={isSelected ? opt.color : neutralColors.textTertiary}
                  />
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ) : null}
    </View>
  )

  if (loading) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('parentSchedule.title')} />
        <EventListSkeleton />
      </View>
    )
  }

  if (!loading && error) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('parentSchedule.title')} />
        <ErrorState onRetry={fetchEvents} />
      </View>
    )
  }

  if (!loading && events.length === 0) {
    return (
      <View style={styles.container}>
        <ModalHeader title={t('parentSchedule.title')} />
        <EmptyState
          icon="calendar-outline"
          title={t('parentSchedule.empty')}
          description={t('parentSchedule.emptyDescription')}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ModalHeader title={t('parentSchedule.title')} />
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  heading: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    padding: space.md,
  },
  list: {
    paddingHorizontal: space.md,
    gap: space.sm,
    paddingBottom: space['2xl'],
  },
  card: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.sm,
  },
  typeBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.sm,
  },
  typeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  teamBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space['2xs'],
    borderRadius: radius.sm,
    flexShrink: 1,
    maxWidth: '100%',
  },
  teamBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    flexShrink: 1,
  },
  eventTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  eventDate: {
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
    color: neutralColors.textSecondary,
    marginTop: space['2xs'],
  },
  eventLocation: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textTertiary,
    marginTop: space['2xs'],
  },
  rsvpSection: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: neutralColors.border,
  },
  rsvpLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    color: neutralColors.textSecondary,
    marginBottom: space.xs,
  },
  rsvpRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  rsvpButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
