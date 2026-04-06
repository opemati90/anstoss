import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { RSVP } from '@anstoss/shared'
import type {
  EventFeedItem,
  ExternalTeamLink,
  ImportedFixture,
  CrossTeamEventItem,
  ClubAggregateStats,
} from '@anstoss/shared'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { staleWhileRevalidate } from '../../src/utils/cache'
import { EmptyState } from '../../src/components/EmptyState'
import { TeamSwitcher } from '../../src/components/TeamSwitcher'
import { TabScreenHeader } from '../../src/components/TabScreenHeader'
import { getAppLanguage, getAppLocale } from '../../src/i18n'
import { neutralColors, semanticColors, fonts, fontSize, space, radius, fontWeight, lineHeight, TAB_BAR_CLEARANCE } from '../../src/theme/tokens'

const RSVP_OPTIONS = [
  { status: 'YES', icon: 'checkmark', color: semanticColors.success, labelKey: 'rsvp.yes' },
  { status: 'MAYBE', icon: 'help', color: semanticColors.warning, labelKey: 'rsvp.maybe' },
  { status: 'NO', icon: 'close', color: semanticColors.error, labelKey: 'rsvp.no' },
] as const

type TeamAccessMember = {
  phase: 'FULL' | 'TRIAL'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED'
}

type QuickAction = {
  key: string
  label: string
  icon: keyof typeof Ionicons.glyphMap
  route:
    | string
    | {
        pathname: string
        params?: Record<string, string>
      }
  badge?: number
}

export default function HomeScreen() {
  const { t } = useTranslation()
  const { user, activeClub, activeTeamId, activeTeamAccess, teamsForActiveClub } = useAuth()
  const [teamSwitcherOpen, setTeamSwitcherOpen] = useState(false)
  const hasMultipleTeams = teamsForActiveClub.length > 1
  const theme = useClubColors()
  const [nextEvent, setNextEvent] = useState<EventFeedItem | null>(null)
  const [nextFixture, setNextFixture] = useState<ImportedFixture | null>(null)
  const [hasTeamLink, setHasTeamLink] = useState(false)
  const [teamLinkStatus, setTeamLinkStatus] =
    useState<ExternalTeamLink['status'] | null>(null)
  const [pendingTrialCount, setPendingTrialCount] = useState(0)
  const [parentNextEvent, setParentNextEvent] = useState<CrossTeamEventItem | null>(null)
  const [clubStats, setClubStats] = useState<ClubAggregateStats | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const locale = getAppLocale(getAppLanguage())
  const hour = new Date().getHours()
  const greeting =
    hour < 12
      ? t('home.greetingMorning')
      : hour < 17
        ? t('home.greetingAfternoon')
        : t('home.greetingEvening')
  const canManageTeam =
    activeClub?.permissions?.EVENTS === true ||
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'
  const isParent = activeClub?.role === 'PARENT'
  const isAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
  const clubRoleLabel = activeClub?.role ? t(`roles.${activeClub.role}`) : null
  const teamRoleLabel = activeTeamAccess
    ? t(`teamRoles.${activeTeamAccess.role}`)
    : null

  const fetchDashboard = useCallback(async (options?: { skipCache?: boolean }) => {
    if (!activeClub || !activeTeamId) {
      setNextEvent(null)
      setNextFixture(null)
      setHasTeamLink(false)
      setTeamLinkStatus(null)
      setPendingTrialCount(0)
      setParentNextEvent(null)
      setClubStats(null)
      return
    }

    const teamKey = `${activeClub.club.id}:${activeTeamId}`
    const fetch = options?.skipCache
      ? <T,>(key: string, fetcher: () => Promise<T>) => fetcher()
      : staleWhileRevalidate

    const eventsRequest = fetch<EventFeedItem[]>(
      `dashboard:${teamKey}:events`,
      () => api<EventFeedItem[]>(
        `/clubs/${activeClub.club.id}/events?teamId=${activeTeamId}&scope=upcoming`,
      ),
    )
      .then((data) => {
        setNextEvent(data?.[0] || null)
        return data
      })
      .catch(() => {
        setNextEvent(null)
        return []
      })

    const fixturesRequest = fetch<ImportedFixture[]>(
      `dashboard:${teamKey}:fixtures`,
      () => api<ImportedFixture[]>(
        `/teams/${activeTeamId}/fixtures?scope=upcoming&limit=1`,
      ),
    )
      .then((data) => {
        setNextFixture(data?.[0] || null)
        return data
      })
      .catch(() => {
        setNextFixture(null)
        return []
      })

    const linksRequest = fetch<ExternalTeamLink[]>(
      `dashboard:${teamKey}:links`,
      () => api<ExternalTeamLink[]>(
        `/integrations/fussball/team-links?teamId=${activeTeamId}`,
      ),
    )
      .then((data) => {
        const activeLink = data?.[0] || null
        setHasTeamLink(Boolean(activeLink))
        setTeamLinkStatus(activeLink?.status || null)
        return data
      })
      .catch(() => {
        setHasTeamLink(false)
        setTeamLinkStatus(null)
        return []
      })

    const membersRequest = (canManageTeam
      ? fetch<TeamAccessMember[]>(
          `dashboard:${teamKey}:members`,
          () => api<TeamAccessMember[]>(
            `/clubs/${activeClub.club.id}/members?teamId=${activeTeamId}`,
          ),
        )
      : Promise.resolve([] as TeamAccessMember[]))
      .then((members) => {
        setPendingTrialCount(
          members.filter(
            (member) => member.phase === 'TRIAL' && member.status === 'ACTIVE',
          ).length,
        )
        return members
      })
      .catch(() => {
        setPendingTrialCount(0)
        return []
      })

    const parentEventsRequest = (isParent
      ? fetch<CrossTeamEventItem[]>(
          `dashboard:${activeClub.club.id}:parentEvents`,
          () => api<CrossTeamEventItem[]>(`/me/children-events?limit=1`),
        )
      : Promise.resolve([] as CrossTeamEventItem[]))
      .then((events) => {
        setParentNextEvent(events?.[0] || null)
        return events
      })
      .catch(() => {
        setParentNextEvent(null)
        return []
      })

    const statsRequest = (isAdmin
      ? fetch<ClubAggregateStats>(
          `dashboard:${activeClub.club.id}:stats`,
          () => api<ClubAggregateStats>(`/clubs/${activeClub.club.id}/stats`),
        )
      : Promise.resolve(null as ClubAggregateStats | null))
      .then((stats) => {
        setClubStats(stats)
        return stats
      })
      .catch(() => {
        setClubStats(null)
        return null
      })

    await Promise.allSettled([
      eventsRequest,
      fixturesRequest,
      linksRequest,
      membersRequest,
      parentEventsRequest,
      statsRequest,
    ])
  }, [activeClub, activeTeamId, canManageTeam])

  useFocusEffect(
    useCallback(() => {
      void fetchDashboard({ skipCache: true })
    }, [fetchDashboard]),
  )

  useEffect(() => {
    void fetchDashboard()
  }, [fetchDashboard])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchDashboard({ skipCache: true })
    } finally {
      setRefreshing(false)
    }
  }

  const [rsvpPending, setRsvpPending] = useState(false)
  const rsvpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rsvpScale = useRef(new Animated.Value(1)).current

  const handleRsvp = (eventId: string, status: string) => {
    if (!activeClub || rsvpPending) return

    // Haptic + scale pulse
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Animated.sequence([
      Animated.timing(rsvpScale, { toValue: 0.95, duration: 50, useNativeDriver: true }),
      Animated.spring(rsvpScale, { toValue: 1, useNativeDriver: true }),
    ]).start()

    // Optimistic UI
    setNextEvent((prev) =>
      prev && prev.id === eventId ? { ...prev, myRsvp: status as EventFeedItem['myRsvp'] } : prev,
    )

    // Debounce
    if (rsvpTimer.current) clearTimeout(rsvpTimer.current)
    rsvpTimer.current = setTimeout(async () => {
      setRsvpPending(true)
      try {
        await api(`/clubs/${activeClub.club.id}/events/${eventId}/rsvp`, {
          method: 'PUT',
          body: { status },
        })
        await fetchDashboard()
      } catch {
        Alert.alert(t('common.error'), t('errors.server'))
        await fetchDashboard()
      } finally {
        setRsvpPending(false)
      }
    }, RSVP.DEBOUNCE_MS)
  }

  const clubName = activeClub?.club.name || 'Anstoss'
  const firstName = user?.name?.split(' ')[0] || t('home.fallbackName')
  const translatedRole =
    isAdmin
      ? clubRoleLabel || teamRoleLabel || t('roles.PLAYER')
      : teamRoleLabel || clubRoleLabel || t('roles.PLAYER')
  const teamSummary =
    isAdmin || !activeTeamAccess?.team.displayName
      ? translatedRole
      : `${activeTeamAccess.team.displayName} · ${translatedRole}`
  const quickActions: QuickAction[] = isParent
    ? [
        {
          key: 'schedule',
          label: t('parentSchedule.title'),
          icon: 'people',
          route: '/parent-schedule',
        },
        {
          key: 'events',
          label: t('home.actionEvents'),
          icon: 'calendar',
          route: '/(tabs)/events',
        },
        {
          key: 'chat',
          label: t('home.actionChat'),
          icon: 'chatbubbles',
          route: '/(tabs)/chat',
        },
        {
          key: 'more',
          label: t('tabs.more'),
          icon: 'ellipsis-horizontal',
          route: '/(tabs)/more',
        },
      ]
    : isAdmin
      ? [
          {
            key: 'events',
            label: t('home.actionEvents'),
            icon: 'calendar',
            route: '/(tabs)/events',
          },
          {
            key: 'matches',
            label: t('matches.title'),
            icon: 'football',
            route: '/team-matches',
          },
          {
            key: 'roster',
            label: t('home.actionRoster'),
            icon: 'people',
            route: '/(tabs)/roster',
            badge: pendingTrialCount > 0 ? pendingTrialCount : undefined,
          },
          {
            key: 'club',
            label: t('adminDashboard.title'),
            icon: 'settings',
            route: '/admin-dashboard',
          },
        ]
      : canManageTeam
        ? [
            {
              key: 'events',
              label: t('home.actionEvents'),
              icon: 'calendar',
              route: '/(tabs)/events',
            },
            {
              key: 'matches',
              label: t('matches.title'),
              icon: 'football',
              route: '/team-matches',
            },
            {
              key: 'roster',
              label: t('home.actionRoster'),
              icon: 'people',
              route: '/(tabs)/roster',
              badge: pendingTrialCount > 0 ? pendingTrialCount : undefined,
            },
            {
              key: 'invite',
              label: t('home.actionInvite'),
              icon: 'person-add',
              route: {
                pathname: '/invite',
                params: { returnTo: '/(tabs)' },
              },
            },
          ]
        : [
            {
              key: 'events',
              label: t('home.actionEvents'),
              icon: 'calendar',
              route: '/(tabs)/events',
            },
            {
              key: 'chat',
              label: t('home.actionChat'),
              icon: 'chatbubbles',
              route: '/(tabs)/chat',
            },
            {
              key: 'myTeam',
              label: t('home.actionMyTeam'),
              icon: 'people',
              route: '/my-team',
            },
            {
              key: 'matches',
              label: t('matches.title'),
              icon: 'football',
              route: '/team-matches',
            },
          ]

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <TabScreenHeader
        eyebrow={greeting}
        title={firstName}
        subtitle={teamSummary}
      />

      <Pressable
        style={[styles.clubBanner, { backgroundColor: theme.clubPrimary }]}
        onPress={hasMultipleTeams ? () => setTeamSwitcherOpen(true) : undefined}
      >
        <View style={styles.clubBannerContent}>
          <Text style={styles.clubBannerText}>{clubName}</Text>
          <Text style={styles.clubBannerRole}>
            {!isAdmin && activeTeamAccess?.team.displayName
              ? `${activeTeamAccess.team.displayName} · ${translatedRole}`
              : translatedRole}
          </Text>
        </View>
        {hasMultipleTeams ? (
          <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.7)" />
        ) : null}
      </Pressable>

      <TeamSwitcher
        visible={teamSwitcherOpen}
        onClose={() => setTeamSwitcherOpen(false)}
      />

      {isParent ? (
        <TouchableOpacity
          style={styles.parentScheduleCard}
          onPress={() => router.push('/parent-schedule')}
        >
          <View style={styles.parentScheduleHeader}>
            <Ionicons name="people" size={20} color={theme.clubPrimary} />
            <Text style={styles.parentScheduleTitle}>
              {t('parentSchedule.title')}
            </Text>
          </View>
          {parentNextEvent ? (
            <View style={styles.parentScheduleEvent}>
              <View
                style={[
                  styles.parentScheduleTeamBadge,
                  { backgroundColor: theme.clubPrimaryLight },
                ]}
              >
                <Text style={[styles.parentScheduleTeamText, { color: theme.clubPrimary }]}>
                  {parentNextEvent.teamName}
                </Text>
              </View>
              <Text style={styles.parentScheduleEventTitle}>
                {parentNextEvent.title}
              </Text>
              <Text style={styles.parentScheduleEventDate}>
                {formatDate(parentNextEvent.date, locale, t)}
              </Text>
            </View>
          ) : (
            <Text style={styles.parentScheduleEmpty}>
              {t('parentSchedule.empty')}
            </Text>
          )}
          <View style={styles.parentScheduleFooter}>
            <Text style={[styles.parentScheduleViewAll, { color: theme.clubPrimary }]}>
              {t('parentSchedule.viewAll')}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={theme.clubPrimary} />
          </View>
        </TouchableOpacity>
      ) : null}

      {(activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN') && clubStats ? (
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{clubStats.memberCount}</Text>
            <Text numberOfLines={2} style={styles.statLabel}>
              {t('clubStats.members')}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{clubStats.teamCount}</Text>
            <Text numberOfLines={2} style={styles.statLabel}>
              {t('clubStats.teams')}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{clubStats.upcomingEventCount}</Text>
            <Text numberOfLines={2} style={styles.statLabel}>
              {t('clubStats.upcomingEvents')}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.statCard, { borderColor: theme.clubPrimary }]}
            onPress={() => router.push('/club-stats')}
          >
            <Text style={[styles.statValue, { color: theme.clubPrimary }]}>
              {clubStats.overallRsvpRate != null ? `${Math.round(clubStats.overallRsvpRate)}%` : '—'}
            </Text>
            <Text numberOfLines={2} style={styles.statLabel}>
              {t('clubStats.rsvpRate')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

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

      <Text style={styles.sectionTitle}>
        {isParent ? t('parentSchedule.nextEvent') : t('home.nextEvent')}
      </Text>
      {isParent ? (
        parentNextEvent ? (
          <TouchableOpacity
            style={styles.eventCard}
            onPress={() => router.push('/parent-schedule')}
          >
            <View style={styles.eventHeader}>
              <View
                style={[
                  styles.eventTypeBadge,
                  { backgroundColor: theme.clubPrimaryLight },
                ]}
              >
                <Text style={[styles.eventTypeText, { color: theme.clubPrimary }]}>
                  {parentNextEvent.teamDisplayName || parentNextEvent.teamName}
                </Text>
              </View>
              <Text style={styles.eventDate}>
                {formatDate(parentNextEvent.date, locale, t)}
              </Text>
            </View>
            <Text style={styles.eventTitle}>{parentNextEvent.title}</Text>
            {parentNextEvent.location ? (
              <View style={styles.eventLocationRow}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={neutralColors.textSecondary}
                />
                <Text style={styles.eventLocation}>{parentNextEvent.location}</Text>
              </View>
            ) : null}
            <View style={styles.linkRow}>
              <Text style={[styles.linkRowText, { color: theme.clubPrimary }]}>
                {t('parentSchedule.viewAll')}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={theme.clubPrimary}
              />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.emptyCard}>
            <EmptyState
              icon="calendar-outline"
              title={t('parentSchedule.empty')}
              description={t('parentSchedule.emptyDescription')}
            />
          </View>
        )
      ) : nextEvent ? (
        <TouchableOpacity
          style={styles.eventCard}
          activeOpacity={0.7}
          onPress={() =>
            router.push({ pathname: '/event-detail', params: { eventId: nextEvent.id } })
          }
        >
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
          <Text style={styles.eventAttendanceSummary}>
            {t('event.attendanceSummary', {
              yes: nextEvent.yesCount || 0,
              maybe: nextEvent.maybeCount || 0,
              no: nextEvent.noCount || 0,
            })}
          </Text>
          <Animated.View style={[styles.rsvpRow, { transform: [{ scale: rsvpScale }] }]}>
            {RSVP_OPTIONS.map((option) => {
              const isActive = nextEvent.myRsvp === option.status

              return (
                <TouchableOpacity
                  key={option.status}
                  accessibilityRole="button"
                  accessibilityLabel={t(option.labelKey)}
                  style={[
                    styles.rsvpButton,
                    isActive && {
                      backgroundColor: option.color,
                      borderColor: option.color,
                    },
                  ]}
                  onPress={() => handleRsvp(nextEvent.id, option.status)}
                  disabled={rsvpPending}
                >
                  <Ionicons
                    name={option.icon}
                    size={18}
                    color={isActive ? neutralColors.textInverse : neutralColors.textSecondary}
                  />
                  <Text style={[styles.rsvpText, isActive && { color: neutralColors.textInverse }]}>
                    {t(option.labelKey)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </Animated.View>
        </TouchableOpacity>
      ) : (
        <View style={styles.emptyCard}>
          <EmptyState
            icon="calendar-outline"
            title={t('home.noUpcomingEventsTitle')}
            description={t('home.noUpcomingEventsBody')}
          />
        </View>
      )}

      {!isParent ? (
        <>
          <TouchableOpacity onPress={() => router.push('/team-matches')} activeOpacity={0.8}>
            <Text style={styles.sectionTitle}>{t('home.importedMatchTitle')}</Text>
          </TouchableOpacity>
          {nextFixture ? (
            <TouchableOpacity
              style={styles.fixtureCard}
              onPress={() =>
                router.push({
                  pathname: '/match-detail',
                  params: { fixtureId: nextFixture.id, teamId: nextFixture.teamId },
                })
              }
              activeOpacity={0.7}
            >
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
                onPress={() => router.push('/team-matches')}
              >
                <Text style={[styles.linkRowText, { color: theme.clubPrimary }]}>
                  {t('matches.title')}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={theme.clubPrimary}
                />
              </TouchableOpacity>
            </TouchableOpacity>
          ) : hasTeamLink && teamLinkStatus === 'ERROR' ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t('home.importedMatchErrorTitle')}</Text>
              <Text style={styles.emptyBody}>{t('home.importedMatchErrorBody')}</Text>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme.clubPrimary }]}
                onPress={() => router.push('/fussball-link')}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.clubPrimary }]}>
                  {t('home.manageImportedMatch')}
                </Text>
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
        </>
      ) : null}

      <Text style={styles.sectionTitle}>{t('home.quickActions')}</Text>
      <View style={styles.actionGrid}>
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.actionCard}
            onPress={() => router.push(action.route as never)}
          >
            <Ionicons name={action.icon} size={24} color={theme.clubPrimary} />
            {action.badge ? (
              <View style={styles.actionBadge}>
                <Text style={styles.actionBadgeText}>{action.badge}</Text>
              </View>
            ) : null}
            <Text numberOfLines={2} style={styles.actionLabel}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
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
  content: { padding: space.lg, paddingTop: space.lg, paddingBottom: TAB_BAR_CLEARANCE },
  clubBanner: {
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clubBannerContent: { flex: 1 },
  clubBannerText: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, fontFamily: fonts.heading, color: neutralColors.textInverse },
  clubBannerRole: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: 'rgba(255,255,255,0.78)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  trialSignalCard: {
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: `${semanticColors.warning}33`,
    borderRadius: radius.lg,
    backgroundColor: `${semanticColors.warning}10`,
    padding: space.md,
    gap: space.md,
  },
  trialSignalCopy: {
    gap: space.sm,
  },
  trialSignalEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textTertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  trialSignalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  trialSignalBody: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  trialSignalButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: neutralColors.surface,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialSignalButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    marginBottom: space.sm,
  },
  eventCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
    gap: space.sm,
  },
  eventTypeBadge: { paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.md },
  eventTypeText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, fontFamily: fonts.heading, textTransform: 'uppercase' },
  eventDate: { flexShrink: 1, fontSize: fontSize.sm, fontFamily: fonts.data, color: neutralColors.textSecondary },
  eventTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    marginBottom: space.xs,
  },
  eventLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: space.sm,
  },
  eventLocation: { fontSize: fontSize.sm, fontFamily: fonts.body, color: neutralColors.textSecondary, flex: 1 },
  eventAttendanceSummary: {
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
    color: neutralColors.textSecondary,
    marginBottom: space.sm,
  },
  rsvpRow: { flexDirection: 'row', gap: space.sm },
  rsvpButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  rsvpText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, fontFamily: fonts.label, color: neutralColors.textSecondary },
  fixtureCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    gap: space.sm,
  },
  fixtureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  fixtureCompetition: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fixtureKickoff: {
    marginTop: space.sm,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.data,
    color: neutralColors.textPrimary,
  },
  fixtureStatus: {
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    backgroundColor: neutralColors.background,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  fixtureStatusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fixtureTeams: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  fixtureMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  fixtureMetaText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  linkRow: {
    marginTop: space.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkRowText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  emptyCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  emptyBody: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textSecondary,
  },
  primaryButton: {
    marginTop: space.md,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  primaryButtonText: {
    color: neutralColors.textInverse,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  secondaryButton: {
    marginTop: space.md,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  secondaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  actionCard: {
    width: '48%',
    minHeight: 116,
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderColor: neutralColors.border,
    position: 'relative',
  },
  actionBadge: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    minWidth: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: semanticColors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  actionBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },
  actionLabel: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  parentScheduleCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    gap: space.sm,
  },
  parentScheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  parentScheduleTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  parentScheduleEvent: {
    gap: space.xs,
  },
  parentScheduleTeamBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.md,
    marginBottom: space['2xs'],
  },
  parentScheduleTeamText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    textTransform: 'uppercase',
  },
  parentScheduleEventTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  parentScheduleEventDate: {
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
    color: neutralColors.textSecondary,
  },
  parentScheduleEmpty: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  parentScheduleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  parentScheduleViewAll: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: space.lg,
  },
  statCard: {
    width: '48%',
    minHeight: 92,
    backgroundColor: neutralColors.surface,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  statValue: {
    fontSize: fontSize['2xl'],
    lineHeight: lineHeight.xl,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.data,
    color: neutralColors.textPrimary,
  },
  statLabel: {
    width: '100%',
    fontSize: fontSize.xs,
    lineHeight: lineHeight['2xs'],
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: space.sm,
    textAlign: 'center',
  },
})
