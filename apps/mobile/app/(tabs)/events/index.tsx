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
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { api } from '../../../src/api/client'
import { neutralColors, semanticColors } from '../../../src/theme/tokens'

type Event = {
  id: string
  title: string
  type: string
  startTime: string
  location: string | null
  description: string | null
  _count: { rsvps: number }
  myRsvp?: string | null
}

export default function EventsScreen() {
  const { activeClub, activeTeamId } = useAuth()
  const theme = useClubColors()
  const [events, setEvents] = useState<Event[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchEvents = useCallback(async () => {
    if (!activeClub || !activeTeamId) return
    try {
      const data = await api<Event[]>(
        `/clubs/${activeClub.club.id}/events?teamId=${activeTeamId}`,
      )
      setEvents(data || [])
    } catch {
      // Stale-while-revalidate
    } finally {
      setLoading(false)
    }
  }, [activeClub, activeTeamId])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchEvents()
    setRefreshing(false)
  }

  const handleRsvp = async (eventId: string, status: string) => {
    if (!activeClub) return
    try {
      await api(`/clubs/${activeClub.club.id}/events/${eventId}/rsvp`, {
        method: 'PUT',
        body: { status },
      })
      await fetchEvents()
    } catch (err: any) {
      Alert.alert('Error', err.message)
    }
  }

  const renderEvent = ({ item }: { item: Event }) => {
    const d = new Date(item.startTime)
    const dayName = d.toLocaleDateString([], { weekday: 'short' })
    const dayNum = d.getDate()
    const month = d.toLocaleDateString([], { month: 'short' })
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    return (
      <View style={styles.eventCard}>
        {/* Date column */}
        <View style={styles.dateColumn}>
          <Text style={styles.dateDayName}>{dayName}</Text>
          <Text style={[styles.dateDayNum, { color: theme.clubPrimary }]}>{dayNum}</Text>
          <Text style={styles.dateMonth}>{month}</Text>
        </View>

        {/* Event details */}
        <View style={styles.eventDetails}>
          <View style={styles.eventRow}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: item.type === 'MATCH' ? semanticColors.error + '20' : theme.clubPrimaryLight },
              ]}
            >
              <Text
                style={[
                  styles.typeText,
                  { color: item.type === 'MATCH' ? semanticColors.error : theme.clubPrimary },
                ]}
              >
                {item.type}
              </Text>
            </View>
            <Text style={styles.eventTime}>{time}</Text>
          </View>
          <Text style={styles.eventTitle}>{item.title}</Text>
          {item.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color={neutralColors.textTertiary} />
              <Text style={styles.locationText}>{item.location}</Text>
            </View>
          )}

          {/* RSVP buttons */}
          <View style={styles.rsvpRow}>
            {(['YES', 'MAYBE', 'NO'] as const).map((status) => {
              const isActive = item.myRsvp === status
              const bg = isActive
                ? status === 'YES' ? semanticColors.success
                : status === 'MAYBE' ? semanticColors.warning
                : semanticColors.error
                : 'transparent'

              return (
                <TouchableOpacity
                  key={status}
                  style={[styles.rsvpBtn, { backgroundColor: bg, borderColor: isActive ? bg : neutralColors.border }]}
                  onPress={() => handleRsvp(item.id, status)}
                >
                  <Ionicons
                    name={status === 'YES' ? 'checkmark' : status === 'MAYBE' ? 'help' : 'close'}
                    size={16}
                    color={isActive ? '#FFF' : neutralColors.textTertiary}
                  />
                </TouchableOpacity>
              )
            })}
            <Text style={styles.rsvpCount}>
              {item._count?.rsvps || 0} responded
            </Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Events</Text>
      </View>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        renderItem={renderEvent}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={neutralColors.textTertiary} />
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptyText}>
                Your coach will create training sessions and matches here.
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: neutralColors.textPrimary },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  eventCard: {
    flexDirection: 'row', backgroundColor: neutralColors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: neutralColors.border, marginBottom: 12, overflow: 'hidden',
  },
  dateColumn: {
    width: 64, alignItems: 'center', justifyContent: 'center', paddingVertical: 16,
    borderRightWidth: 1, borderRightColor: neutralColors.border,
  },
  dateDayName: { fontSize: 11, fontWeight: '600', color: neutralColors.textTertiary, textTransform: 'uppercase' },
  dateDayNum: { fontSize: 24, fontWeight: '700', marginVertical: 2 },
  dateMonth: { fontSize: 11, fontWeight: '500', color: neutralColors.textSecondary, textTransform: 'uppercase' },
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
    width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  rsvpCount: { fontSize: 12, color: neutralColors.textTertiary, marginLeft: 'auto' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: neutralColors.textPrimary, marginTop: 16 },
  emptyText: { fontSize: 14, color: neutralColors.textSecondary, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
})
