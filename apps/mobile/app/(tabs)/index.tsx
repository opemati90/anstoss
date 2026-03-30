import { useCallback, useEffect, useRef, useState } from 'react'
import {
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
import { IllustratedEmptyState } from '../../src/components/IllustratedEmptyState'
import { TeamSwitcher } from '../../src/components/TeamSwitcher'
import { TabScreenHeader } from '../../src/components/TabScreenHeader'
import { getAppLanguage, getAppLocale } from '../../src/i18n'
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

  const handleRsvp = (eventId: string, status: string) => {
    if (!activeClub || rsvpPending) return

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
  const translatedRole = activeTeamAccess
    ? t(`teamRoles.${activeTeamAccess.role}`)
    : activeClub?.role
      ? t(`roles.${activeClub.role}`)
      : t('roles.PLAYER')
  const teamSummary = activeTeamAccess?.team.displayName
    ? `${activeTeamAccess.team.displayName} · ${translatedRole}`
    : translatedRole
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
      : canManageTeam
        ? [
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
              key: 'matches',
              label: t('matches.title'),
              icon: 'football',
              route: '/team-matches',
            },
            {
              key: 'more',
              label: t('tabs.more'),
              icon: 'ellipsis-horizontal',
              route: '/(tabs)/more',
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
            {activeTeamAccess?.team.displayName
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
            <IllustratedEmptyState
              illustration={illustrations.emptyEvents}
              title={t('parentSchedule.empty')}
              description={t('parentSchedule.emptyDescription')}
            />
          </View>
        )
      ) : nextEvent ? (
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
          <Text style={styles.eventAttendanceSummary}>
            {t('event.attendanceSummary', {
              yes: nextEvent.yesCount || 0,
              maybe: nextEvent.maybeCount || 0,
              no: nextEvent.noCount || 0,
            })}
          </Text>
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
                  disabled={rsvpPending}
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
  content: { padding: 20, paddingTop: 20, paddingBottom: 110 },
  clubBanner: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clubBannerContent: { flex: 1 },
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
  eventAttendanceSummary: {
    fontSize: 12,
    color: neutralColors.textSecondary,
    marginBottom: 12,
  },
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
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionCard: {
    width: '48%',
    minHeight: 116,
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
  actionLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: neutralColors.textPrimary,
    textAlign: 'center',
  },
  parentScheduleCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: neutralColors.border,
    gap: 12,
  },
  parentScheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  parentScheduleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  parentScheduleEvent: {
    gap: 4,
  },
  parentScheduleTeamBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 2,
  },
  parentScheduleTeamText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  parentScheduleEventTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  parentScheduleEventDate: {
    fontSize: 13,
    color: neutralColors.textSecondary,
  },
  parentScheduleEmpty: {
    fontSize: 14,
    color: neutralColors.textSecondary,
  },
  parentScheduleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  parentScheduleViewAll: {
    fontSize: 14,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    minHeight: 92,
    backgroundColor: neutralColors.surface,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: neutralColors.border,
  },
  statValue: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    fontFamily: 'GeistMono_400Regular',
    color: neutralColors.textPrimary,
  },
  statLabel: {
    width: '100%',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: neutralColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 6,
    textAlign: 'center',
  },
})
