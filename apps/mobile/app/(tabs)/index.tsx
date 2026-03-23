import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { neutralColors, semanticColors } from '../../src/theme/tokens'

type Event = {
  id: string
  title: string
  type: string
  startTime: string
  location: string | null
  _count: { rsvps: number }
  myRsvp?: string | null
}

export default function HomeScreen() {
  const { user, activeClub } = useAuth()
  const theme = useClubColors()
  const [nextEvent, setNextEvent] = useState<Event | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchDashboard = useCallback(async () => {
    if (!activeClub) return
    try {
      const events = await api<Event[]>(
        `/clubs/${activeClub.club.id}/events?limit=1`,
      )
      setNextEvent(events?.[0] || null)
    } catch {
      // Silently fail — dashboard is stale-while-revalidate
    }
  }, [activeClub])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchDashboard()
    setRefreshing(false)
  }

  const handleRsvp = async (eventId: string, status: string) => {
    if (!activeClub) return
    try {
      await api(`/clubs/${activeClub.club.id}/events/${eventId}/rsvp`, {
        method: 'PUT',
        body: { status },
      })
      await fetchDashboard()
    } catch {}
  }

  const clubName = activeClub?.club.name || 'Anstoss'
  const greeting = getGreeting()

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header with club branding */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.userName}>
            {user?.firstName || 'Player'}
          </Text>
        </View>
        {activeClub?.club.badgeUrl ? (
          <Image
            source={{ uri: activeClub.club.badgeUrl }}
            style={styles.badge}
          />
        ) : (
          <View style={[styles.badgePlaceholder, { backgroundColor: theme.clubPrimary }]}>
            <Text style={styles.badgeInitial}>
              {clubName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* Club name banner */}
      <View style={[styles.clubBanner, { backgroundColor: theme.clubPrimary }]}>
        <Text style={styles.clubBannerText}>{clubName}</Text>
        <Text style={styles.clubBannerRole}>{activeClub?.role || 'PLAYER'}</Text>
      </View>

      {/* Next event card */}
      <Text style={styles.sectionTitle}>Next Event</Text>
      {nextEvent ? (
        <View style={styles.eventCard}>
          <View style={styles.eventHeader}>
            <View
              style={[
                styles.eventTypeBadge,
                { backgroundColor: theme.clubPrimaryLight },
              ]}
            >
              <Text style={[styles.eventTypeText, { color: theme.clubPrimary }]}>
                {nextEvent.type}
              </Text>
            </View>
            <Text style={styles.eventDate}>
              {formatDate(nextEvent.startTime)}
            </Text>
          </View>
          <Text style={styles.eventTitle}>{nextEvent.title}</Text>
          {nextEvent.location && (
            <View style={styles.eventLocationRow}>
              <Ionicons name="location-outline" size={14} color={neutralColors.textSecondary} />
              <Text style={styles.eventLocation}>{nextEvent.location}</Text>
            </View>
          )}
          <View style={styles.rsvpRow}>
            {['YES', 'MAYBE', 'NO'].map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.rsvpButton,
                  nextEvent.myRsvp === status && {
                    backgroundColor: status === 'YES'
                      ? semanticColors.success
                      : status === 'MAYBE'
                        ? semanticColors.warning
                        : semanticColors.error,
                  },
                ]}
                onPress={() => handleRsvp(nextEvent.id, status)}
              >
                <Ionicons
                  name={
                    status === 'YES' ? 'checkmark' : status === 'MAYBE' ? 'help' : 'close'
                  }
                  size={18}
                  color={nextEvent.myRsvp === status ? '#FFF' : neutralColors.textSecondary}
                />
                <Text
                  style={[
                    styles.rsvpText,
                    nextEvent.myRsvp === status && { color: '#FFF' },
                  ]}
                >
                  {status === 'YES' ? 'In' : status === 'MAYBE' ? 'Maybe' : 'Out'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={32} color={neutralColors.textTertiary} />
          <Text style={styles.emptyText}>No upcoming events</Text>
          <Text style={styles.emptyHint}>
            Events will appear here when your coach schedules them.
          </Text>
        </View>
      )}

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionGrid}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/events')}
        >
          <Ionicons name="calendar" size={24} color={theme.clubPrimary} />
          <Text style={styles.actionLabel}>Events</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/chat')}
        >
          <Ionicons name="chatbubbles" size={24} color={theme.clubPrimary} />
          <Text style={styles.actionLabel}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/roster')}
        >
          <Ionicons name="people" size={24} color={theme.clubPrimary} />
          <Text style={styles.actionLabel}>Squad</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/invite')}
        >
          <Ionicons name="person-add" size={24} color={theme.clubPrimary} />
          <Text style={styles.actionLabel}>Invite</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.ceil(diff / 86400000)

  if (days === 0) return 'Today, ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Tomorrow, ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: 20, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting: { fontSize: 14, color: neutralColors.textSecondary },
  userName: { fontSize: 24, fontWeight: '700', color: neutralColors.textPrimary },
  badge: { width: 48, height: 48, borderRadius: 24 },
  badgePlaceholder: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  badgeInitial: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  clubBanner: { borderRadius: 12, padding: 16, marginBottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clubBannerText: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  clubBannerRole: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: neutralColors.textPrimary, marginBottom: 12 },
  eventCard: { backgroundColor: neutralColors.surface, borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: neutralColors.border },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  eventTypeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  eventTypeText: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  eventDate: { fontSize: 13, color: neutralColors.textSecondary },
  eventTitle: { fontSize: 18, fontWeight: '600', color: neutralColors.textPrimary, marginBottom: 4 },
  eventLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  eventLocation: { fontSize: 14, color: neutralColors.textSecondary },
  rsvpRow: { flexDirection: 'row', gap: 8 },
  rsvpButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 8, borderWidth: 1, borderColor: neutralColors.border, backgroundColor: neutralColors.surface },
  rsvpText: { fontSize: 14, fontWeight: '600', color: neutralColors.textSecondary },
  emptyCard: { backgroundColor: neutralColors.surface, borderRadius: 12, padding: 32, marginBottom: 24, alignItems: 'center', borderWidth: 1, borderColor: neutralColors.border },
  emptyText: { fontSize: 16, fontWeight: '600', color: neutralColors.textPrimary, marginTop: 12 },
  emptyHint: { fontSize: 14, color: neutralColors.textSecondary, marginTop: 4, textAlign: 'center' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { width: '47%', backgroundColor: neutralColors.surface, borderRadius: 12, padding: 20, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: neutralColors.border },
  actionLabel: { fontSize: 14, fontWeight: '500', color: neutralColors.textPrimary },
})
