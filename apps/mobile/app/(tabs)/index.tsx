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
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { IllustratedEmptyState } from '../../src/components/IllustratedEmptyState'
import { getAppLocale } from '../../src/i18n'
import { illustrations } from '../../src/illustrations'
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

const RSVP_OPTIONS = [
  { status: 'YES', icon: 'checkmark', color: semanticColors.success, labelKey: 'rsvp.yes' },
  { status: 'MAYBE', icon: 'help', color: semanticColors.warning, labelKey: 'rsvp.maybe' },
  { status: 'NO', icon: 'close', color: semanticColors.error, labelKey: 'rsvp.no' },
] as const

export default function HomeScreen() {
  const { t, i18n } = useTranslation()
  const { user, activeClub, activeTeamId } = useAuth()
  const theme = useClubColors()
  const [nextEvent, setNextEvent] = useState<Event | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const locale = getAppLocale(i18n.resolvedLanguage === 'en' ? 'en' : 'de')
  const hour = new Date().getHours()
  const greeting =
    hour < 12
      ? t('home.greetingMorning')
      : hour < 17
        ? t('home.greetingAfternoon')
        : t('home.greetingEvening')

  const fetchDashboard = useCallback(async () => {
    if (!activeClub || !activeTeamId) return
    try {
      const events = await api<Event[]>(
        `/clubs/${activeClub.club.id}/events?teamId=${activeTeamId}&limit=1`,
      )
      setNextEvent(events?.[0] || null)
    } catch {
      // Silently fail — dashboard is stale-while-revalidate.
    }
  }, [activeClub, activeTeamId])

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
    } catch {
      // Ignore here and leave the current state visible.
    }
  }

  const clubName = activeClub?.club.name || 'Anstoss'
  const firstName = user?.name?.split(' ')[0] || t('home.fallbackName')
  const translatedRole = activeClub?.role ? t(`roles.${activeClub.role}`) : t('roles.PLAYER')

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.userName}>{firstName}</Text>
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

      <View style={[styles.clubBanner, { backgroundColor: theme.clubPrimary }]}>
        <Text style={styles.clubBannerText}>{clubName}</Text>
        <Text style={styles.clubBannerRole}>{translatedRole}</Text>
      </View>

      <Text style={styles.sectionTitle}>{t('home.nextEvent')}</Text>
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
                {t(`event.type.${nextEvent.type}`)}
              </Text>
            </View>
            <Text style={styles.eventDate}>
              {formatDate(nextEvent.startTime, locale, t)}
            </Text>
          </View>
          <Text style={styles.eventTitle}>{nextEvent.title}</Text>
          {nextEvent.location && (
            <View style={styles.eventLocationRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color={neutralColors.textSecondary}
              />
              <Text style={styles.eventLocation}>{nextEvent.location}</Text>
            </View>
          )}
          <View style={styles.rsvpRow}>
            {RSVP_OPTIONS.map((option) => {
              const isActive = nextEvent.myRsvp === option.status

              return (
                <TouchableOpacity
                  key={option.status}
                  style={[
                    styles.rsvpButton,
                    isActive && { backgroundColor: option.color, borderColor: option.color },
                  ]}
                  onPress={() => handleRsvp(nextEvent.id, option.status)}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={isActive ? '#FFF' : neutralColors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.rsvpText,
                      isActive && { color: '#FFF' },
                    ]}
                  >
                    {t(option.labelKey)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <IllustratedEmptyState
            illustration={illustrations.emptyHome}
            title={t('home.noUpcomingEventsTitle')}
            description={t('home.noUpcomingEventsBody')}
          />
        </View>
      )}

      <Text style={styles.sectionTitle}>{t('home.quickActions')}</Text>
      <View style={styles.actionGrid}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/events')}
        >
          <Ionicons name="calendar" size={24} color={theme.clubPrimary} />
          <Text style={styles.actionLabel}>{t('home.actionEvents')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/chat')}
        >
          <Ionicons name="chatbubbles" size={24} color={theme.clubPrimary} />
          <Text style={styles.actionLabel}>{t('home.actionChat')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/roster')}
        >
          <Ionicons name="people" size={24} color={theme.clubPrimary} />
          <Text style={styles.actionLabel}>{t('home.actionRoster')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/invite')}
        >
          <Ionicons name="person-add" size={24} color={theme.clubPrimary} />
          <Text style={styles.actionLabel}>{t('home.actionInvite')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function formatDate(
  iso: string,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const date = new Date(iso)
  const today = new Date()
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((dateStart.getTime() - todayStart.getTime()) / 86400000)
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  if (days === 0) return t('home.dateToday', { time })
  if (days === 1) return t('home.dateTomorrow', { time })

  return `${new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)}, ${time}`
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 110 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: { fontSize: 14, color: neutralColors.textSecondary },
  userName: { fontSize: 24, fontWeight: '700', color: neutralColors.textPrimary },
  badge: { width: 48, height: 48, borderRadius: 24 },
  badgePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeInitial: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  clubBanner: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clubBannerText: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  clubBannerRole: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    marginBottom: 12,
  },
  eventCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  eventTypeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  eventTypeText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  eventDate: { flexShrink: 1, fontSize: 13, color: neutralColors.textSecondary },
  eventTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: neutralColors.textPrimary,
    marginBottom: 4,
  },
  eventLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  eventLocation: { fontSize: 14, color: neutralColors.textSecondary },
  rsvpRow: { flexDirection: 'row', gap: 8 },
  rsvpButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  rsvpText: { fontSize: 14, fontWeight: '600', color: neutralColors.textSecondary },
  emptyCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    paddingVertical: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: {
    width: '47%',
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  actionLabel: { fontSize: 15, fontWeight: '600', color: neutralColors.textPrimary },
})
