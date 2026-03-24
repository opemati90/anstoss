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
import type { EventFeedItem, ExternalTeamLink, ImportedFixture } from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { IllustratedEmptyState } from '../../src/components/IllustratedEmptyState'
import { getAppLocale } from '../../src/i18n'
import { illustrations } from '../../src/illustrations'
import { neutralColors, semanticColors } from '../../src/theme/tokens'

const RSVP_OPTIONS = [
  { status: 'YES', icon: 'checkmark', color: semanticColors.success, labelKey: 'rsvp.yes' },
  { status: 'MAYBE', icon: 'help', color: semanticColors.warning, labelKey: 'rsvp.maybe' },
  { status: 'NO', icon: 'close', color: semanticColors.error, labelKey: 'rsvp.no' },
] as const

type TeamAccessMember = {
  phase: 'FULL' | 'TRIAL'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED'
}

export default function HomeScreen() {
  const { t, i18n } = useTranslation()
  const { user, activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const theme = useClubColors()
  const [nextEvent, setNextEvent] = useState<EventFeedItem | null>(null)
  const [nextFixture, setNextFixture] = useState<ImportedFixture | null>(null)
  const [hasTeamLink, setHasTeamLink] = useState(false)
  const [pendingTrialCount, setPendingTrialCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const locale = getAppLocale(i18n.resolvedLanguage === 'en' ? 'en' : 'de')
  const hour = new Date().getHours()
  const greeting =
    hour < 12
      ? t('home.greetingMorning')
      : hour < 17
        ? t('home.greetingAfternoon')
        : t('home.greetingEvening')
  const canManageTeam =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

  const fetchDashboard = useCallback(async () => {
    if (!activeClub || !activeTeamId) {
      setNextEvent(null)
      setNextFixture(null)
      setHasTeamLink(false)
      setPendingTrialCount(0)
      return
    }

    const [eventsResult, fixturesResult, linksResult, membersResult] = await Promise.allSettled([
      api<EventFeedItem[]>(
        `/clubs/${activeClub.club.id}/events?teamId=${activeTeamId}&limit=1`,
      ),
      api<ImportedFixture[]>(
        `/teams/${activeTeamId}/fixtures?scope=upcoming&limit=1`,
      ),
      api<ExternalTeamLink[]>(
        `/integrations/fussball/team-links?teamId=${activeTeamId}`,
      ),
      canManageTeam
        ? api<TeamAccessMember[]>(
            `/clubs/${activeClub.club.id}/members?teamId=${activeTeamId}`,
          )
        : Promise.resolve([]),
    ])

    if (eventsResult.status === 'fulfilled') {
      setNextEvent(eventsResult.value?.[0] || null)
    }

    if (fixturesResult.status === 'fulfilled') {
      setNextFixture(fixturesResult.value?.[0] || null)
    }

    if (linksResult.status === 'fulfilled') {
      setHasTeamLink(linksResult.value.length > 0)
    }

    if (membersResult.status === 'fulfilled') {
      setPendingTrialCount(
        membersResult.value.filter(
          (member) => member.phase === 'TRIAL' && member.status === 'ACTIVE',
        ).length,
      )
    } else {
      setPendingTrialCount(0)
    }
  }, [activeClub, activeTeamId, canManageTeam])

  useEffect(() => {
    void fetchDashboard()
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
      // Keep the stale view visible if RSVP update fails.
    }
  }

  const clubName = activeClub?.club.name || 'Anstoss'
  const firstName = user?.name?.split(' ')[0] || t('home.fallbackName')
  const translatedRole = activeTeamAccess
    ? t(`teamRoles.${activeTeamAccess.role}`)
    : activeClub?.role
      ? t(`roles.${activeClub.role}`)
      : t('roles.PLAYER')

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
          <Image source={{ uri: activeClub.club.badgeUrl }} style={styles.badge} />
        ) : (
          <View
            style={[
              styles.badgePlaceholder,
              { backgroundColor: theme.clubPrimary },
            ]}
          >
            <Text style={styles.badgeInitial}>
              {clubName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.clubBanner, { backgroundColor: theme.clubPrimary }]}>
        <Text style={styles.clubBannerText}>{clubName}</Text>
        <Text style={styles.clubBannerRole}>
          {activeTeamAccess?.team.displayName
            ? `${activeTeamAccess.team.displayName} · ${translatedRole}`
            : translatedRole}
        </Text>
      </View>

      {canManageTeam && pendingTrialCount > 0 ? (
        <View style={styles.trialSignalCard}>
          <View style={styles.trialSignalCopy}>
            <Text style={styles.trialSignalEyebrow}>
              {t('home.pendingTrialsEyebrow')}
            </Text>
            <Text style={styles.trialSignalTitle}>
              {t('home.pendingTrialsTitle', { count: pendingTrialCount })}
            </Text>
            <Text style={styles.trialSignalBody}>
              {t('home.pendingTrialsBody')}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.trialSignalButton,
              { borderColor: theme.clubPrimary },
            ]}
            onPress={() => router.push('/(tabs)/roster')}
          >
            <Text
              style={[
                styles.trialSignalButtonText,
                { color: theme.clubPrimary },
              ]}
            >
              {t('home.reviewTrialsCta')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
              {formatDate(nextEvent.date, locale, t)}
            </Text>
          </View>
          <Text style={styles.eventTitle}>{nextEvent.title}</Text>
          {nextEvent.location ? (
            <View style={styles.eventLocationRow}>
              <Ionicons
                name="location-outline"
                size={14}
                color={neutralColors.textSecondary}
              />
              <Text style={styles.eventLocation}>{nextEvent.location}</Text>
            </View>
          ) : null}
          <View style={styles.rsvpRow}>
            {RSVP_OPTIONS.map((option) => {
              const isActive = nextEvent.myRsvp === option.status

              return (
                <TouchableOpacity
                  key={option.status}
                  style={[
                    styles.rsvpButton,
                    isActive && {
                      backgroundColor: option.color,
                      borderColor: option.color,
                    },
                  ]}
                  onPress={() => handleRsvp(nextEvent.id, option.status)}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={isActive ? '#FFF' : neutralColors.textSecondary}
                  />
                  <Text style={[styles.rsvpText, isActive && { color: '#FFF' }]}>
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

      <Text style={styles.sectionTitle}>{t('home.importedMatchTitle')}</Text>
      {nextFixture ? (
        <View style={styles.fixtureCard}>
          <View style={styles.fixtureHeader}>
            <View>
              <Text style={styles.fixtureCompetition}>{nextFixture.competition}</Text>
              <Text style={styles.fixtureKickoff}>
                {formatDate(nextFixture.kickoffAt, locale, t)}
              </Text>
            </View>
            <View style={styles.fixtureStatus}>
              <Text style={styles.fixtureStatusText}>
                {t(`fussball.status.${nextFixture.status}`)}
              </Text>
            </View>
          </View>
          <Text style={styles.fixtureTeams}>
            {nextFixture.homeTeam} vs {nextFixture.awayTeam}
          </Text>
          {nextFixture.venueName ? (
            <View style={styles.fixtureMetaRow}>
              <Ionicons
                name="football-outline"
                size={14}
                color={neutralColors.textSecondary}
              />
              <Text style={styles.fixtureMetaText}>{nextFixture.venueName}</Text>
            </View>
          ) : null}
          {nextFixture.pitchAddress ? (
            <View style={styles.fixtureMetaRow}>
              <Ionicons
                name="navigate-outline"
                size={14}
                color={neutralColors.textSecondary}
              />
              <Text style={styles.fixtureMetaText}>{nextFixture.pitchAddress}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push('/fussball-link')}
          >
            <Text style={[styles.linkRowText, { color: theme.clubPrimary }]}>
              {t('home.manageImportedMatch')}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.clubPrimary}
            />
          </TouchableOpacity>
        </View>
      ) : hasTeamLink ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('home.importedMatchPendingTitle')}</Text>
          <Text style={styles.emptyBody}>{t('home.importedMatchPendingBody')}</Text>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.clubPrimary }]}
            onPress={() => router.push('/fussball-link')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.clubPrimary }]}>
              {t('home.manageImportedMatch')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('home.importedMatchEmptyTitle')}</Text>
          <Text style={styles.emptyBody}>{t('home.importedMatchEmptyBody')}</Text>
          {canManageTeam ? (
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.clubPrimary }]}
              onPress={() => router.push('/fussball-link')}
            >
              <Text style={styles.primaryButtonText}>
                {t('home.linkFussballTeam')}
              </Text>
            </TouchableOpacity>
          ) : null}
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
          {canManageTeam && pendingTrialCount > 0 ? (
            <View style={styles.actionBadge}>
              <Text style={styles.actionBadgeText}>{pendingTrialCount}</Text>
            </View>
          ) : null}
          <Text style={styles.actionLabel}>{t('home.actionRoster')}</Text>
        </TouchableOpacity>
        {canManageTeam ? (
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/fussball-link')}
          >
            <Ionicons name="football" size={24} color={theme.clubPrimary} />
            <Text style={styles.actionLabel}>{t('home.actionFussball')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/invite')}
          >
            <Ionicons name="person-add" size={24} color={theme.clubPrimary} />
            <Text style={styles.actionLabel}>{t('home.actionInvite')}</Text>
          </TouchableOpacity>
        )}
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
  trialSignalCard: {
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${semanticColors.warning}33`,
    borderRadius: 12,
    backgroundColor: `${semanticColors.warning}10`,
    padding: 16,
    gap: 14,
  },
  trialSignalCopy: {
    gap: 6,
  },
  trialSignalEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: neutralColors.textTertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  trialSignalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  trialSignalBody: {
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  trialSignalButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialSignalButtonText: {
    fontSize: 14,
    fontWeight: '700',
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
  eventLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  eventLocation: { fontSize: 14, color: neutralColors.textSecondary, flex: 1 },
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
  fixtureCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: neutralColors.border,
    gap: 10,
  },
  fixtureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  fixtureCompetition: {
    fontSize: 12,
    fontWeight: '700',
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fixtureKickoff: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  fixtureStatus: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: neutralColors.background,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  fixtureStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: neutralColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fixtureTeams: {
    fontSize: 18,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  fixtureMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  fixtureMetaText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  linkRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkRowText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  primaryButton: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 16,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
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
    position: 'relative',
  },
  actionBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: semanticColors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: neutralColors.textInverse,
  },
  actionLabel: { fontSize: 15, fontWeight: '600', color: neutralColors.textPrimary },
})
