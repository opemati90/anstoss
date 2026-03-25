import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { CrossTeamEventItem } from '@anstoss/shared'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { IllustratedEmptyState } from '../src/components/IllustratedEmptyState'
import { illustrations } from '../src/illustrations'
import { getAppLocale } from '../src/i18n'
import { neutralColors, radius, space, fontSize, fontWeight, semanticColors } from '../src/theme/tokens'

export default function ParentScheduleScreen() {
  const { t, i18n } = useTranslation()
  const theme = useClubColors()
  const [events, setEvents] = useState<CrossTeamEventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const locale = getAppLocale(i18n.resolvedLanguage === 'en' ? 'en' : 'de')

  const fetchEvents = useCallback(async () => {
    try {
      const data = await api<CrossTeamEventItem[]>('/me/children-events')
      setEvents(data || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchEvents()
    setRefreshing(false)
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
            style={[
              styles.typeBadgeText,
              { color: typeColor[item.type] || semanticColors.info },
            ]}
          >
            {item.type}
          </Text>
        </View>
        <View style={[styles.teamBadge, { backgroundColor: theme.clubPrimary + '15' }]}>
          <Text style={[styles.teamBadgeText, { color: theme.clubPrimary }]}>
            {item.teamDisplayName || item.teamName}
          </Text>
        </View>
      </View>
      <Text style={styles.eventTitle}>{item.title}</Text>
      <Text style={styles.eventDate}>{formatDate(item.date)}</Text>
      {item.location && (
        <Text style={styles.eventLocation}>{item.location}</Text>
      )}
    </View>
  )

  if (!loading && events.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>{t('parentSchedule.title')}</Text>
        <IllustratedEmptyState
          illustration={illustrations.emptyEvents}
          title={t('parentSchedule.empty')}
          description={t('parentSchedule.emptyDescription')}
        />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('parentSchedule.title')}</Text>
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
    gap: space.sm,
    marginBottom: space.sm,
  },
  typeBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  typeBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  teamBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  teamBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  eventTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  eventDate: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    marginTop: 2,
  },
  eventLocation: {
    fontSize: fontSize.sm,
    color: neutralColors.textTertiary,
    marginTop: 2,
  },
})
