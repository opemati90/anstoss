import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { RSVP } from '@anstoss/shared'
import type {
  ClubAggregateStats,
  CrossTeamEventItem,
  EventFeedItem,
} from '@anstoss/shared'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../src/api/client'
import { TeamSwitcher } from '../../src/components/TeamSwitcher'
import {
  Banner,
  Button,
  Icon,
  ListRow,
  SectionGroup,
  StatCard,
  StatGrid,
  Text,
  type IconName,
} from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../../src/i18n'
import { Haptics } from '../../src/utils/haptics'
import {
  TAB_BAR_CLEARANCE,
  card,
  elevation,
  hairline,
  space,
} from '../../src/theme/tokens'

type TeamAccessMember = {
  phase: 'FULL' | 'TRIAL'
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED'
}

type Shortcut = {
  key: string
  label: string
  icon: IconName
  route:
    | string
    | {
        pathname: string
        params?: Record<string, string>
      }
  badge?: number
}

const RSVP_OPTIONS = [
  {
    status: 'YES',
    icon: 'checkmark' as IconName,
    tone: 'success' as const,
    labelKey: 'rsvp.yes',
  },
  {
    status: 'MAYBE',
    icon: 'exclamationmark.circle' as IconName,
    tone: 'warning' as const,
    labelKey: 'rsvp.maybe',
  },
  {
    status: 'NO',
    icon: 'xmark' as IconName,
    tone: 'error' as const,
    labelKey: 'rsvp.no',
  },
] as const

export default function HomeScreen() {
  const { t } = useTranslation()
  const {
    user,
    activeClub,
    activeTeamAccess,
    activeTeamId,
    teamsForActiveClub,
  } = useAuth()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  const [teamSwitcherOpen, setTeamSwitcherOpen] = useState(false)
  const [nextEvent, setNextEvent] = useState<EventFeedItem | null>(null)
  const [parentNextEvent, setParentNextEvent] =
    useState<CrossTeamEventItem | null>(null)
  const [clubStats, setClubStats] = useState<ClubAggregateStats | null>(null)
  const [pendingTrialCount, setPendingTrialCount] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [rsvpPending, setRsvpPending] = useState(false)

  const rsvpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rsvpScale = useRef(new Animated.Value(1)).current

  const hour = new Date().getHours()
  const greeting =
    hour < 12
      ? t('home.greetingMorning')
      : hour < 17
        ? t('home.greetingAfternoon')
        : t('home.greetingEvening')

  const isParent = activeClub?.role === 'PARENT'
  const isAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
  const hasMultipleTeams = teamsForActiveClub.length > 1
  const canManageTeam =
    activeClub?.permissions?.EVENTS === true ||
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN' ||
    activeClub?.role === 'COACH' ||
    activeTeamAccess?.role === 'HEAD_COACH' ||
    activeTeamAccess?.role === 'ASSISTANT_COACH'

  const clubRoleLabel = activeClub?.role ? t(`roles.${activeClub.role}`) : null
  const teamRoleLabel = activeTeamAccess?.role
    ? t(`teamRoles.${activeTeamAccess.role}`)
    : null
  const translatedRole = isAdmin
    ? clubRoleLabel || teamRoleLabel || t('roles.PLAYER')
    : teamRoleLabel || clubRoleLabel || t('roles.PLAYER')
  const firstName = user?.name?.split(' ')[0] || t('home.fallbackName')

  const fetchDashboard = useCallback(async () => {
    if (!activeClub) {
      setNextEvent(null)
      setParentNextEvent(null)
      setClubStats(null)
      setPendingTrialCount(0)
      return
    }

    const requests: Promise<unknown>[] = []

    if (isParent) {
      requests.push(
        api<CrossTeamEventItem[]>('/me/children-events?limit=1')
          .then((events) => {
            setParentNextEvent(events?.[0] || null)
          })
          .catch(() => {
            setParentNextEvent(null)
          }),
      )
      setNextEvent(null)
      setPendingTrialCount(0)
    } else if (activeTeamId) {
      requests.push(
        api<EventFeedItem[]>(
          `/clubs/${activeClub.club.id}/events?teamId=${activeTeamId}&scope=upcoming`,
        )
          .then((events) => {
            setNextEvent(events?.[0] || null)
          })
          .catch(() => {
            setNextEvent(null)
          }),
      )

      if (canManageTeam) {
        requests.push(
          api<TeamAccessMember[]>(
            `/clubs/${activeClub.club.id}/members?teamId=${activeTeamId}`,
          )
            .then((members) => {
              setPendingTrialCount(
                members.filter(
                  (member) =>
                    member.phase === 'TRIAL' && member.status === 'ACTIVE',
                ).length,
              )
            })
            .catch(() => {
              setPendingTrialCount(0)
            }),
        )
      } else {
        setPendingTrialCount(0)
      }

      setParentNextEvent(null)
    } else {
      setNextEvent(null)
      setParentNextEvent(null)
      setPendingTrialCount(0)
    }

    if (isAdmin) {
      requests.push(
        api<ClubAggregateStats>(`/clubs/${activeClub.club.id}/stats`)
          .then((stats) => {
            setClubStats(stats)
          })
          .catch(() => {
            setClubStats(null)
          }),
      )
    } else {
      setClubStats(null)
    }

    await Promise.all(requests)
  }, [activeClub, activeTeamId, canManageTeam, isAdmin, isParent])

  useFocusEffect(
    useCallback(() => {
      void fetchDashboard()
    }, [fetchDashboard]),
  )

  useEffect(() => {
    void fetchDashboard()
  }, [fetchDashboard])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await fetchDashboard()
    } finally {
      setRefreshing(false)
    }
  }

  const handleRsvp = (eventId: string, status: string) => {
    if (!activeClub || rsvpPending) {
      return
    }

    Haptics.tap()
    Animated.sequence([
      Animated.timing(rsvpScale, {
        toValue: 0.97,
        duration: 60,
        useNativeDriver: true,
      }),
      Animated.spring(rsvpScale, {
        toValue: 1,
        useNativeDriver: true,
      }),
    ]).start()

    setNextEvent((current) =>
      current && current.id === eventId
        ? { ...current, myRsvp: status as EventFeedItem['myRsvp'] }
        : current,
    )

    if (rsvpTimer.current) {
      clearTimeout(rsvpTimer.current)
    }

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

  const shortcuts: Shortcut[] = isParent
    ? [
        {
          key: 'schedule',
          label: t('parentSchedule.title'),
          icon: 'calendar.fill',
          route: '/(tabs)/events',
        },
        {
          key: 'chat',
          label: t('home.actionChat'),
          icon: 'bubble.fill',
          route: '/(tabs)/chat',
        },
        {
          key: 'settings',
          label: t('more.title'),
          icon: 'ellipsis.circle.fill',
          route: '/(tabs)/more',
        },
      ]
    : isAdmin
      ? [
          {
            key: 'schedule',
            label: t('home.actionEvents'),
            icon: 'calendar.fill',
            route: '/(tabs)/events',
          },
          {
            key: 'roster',
            label: t('home.actionRoster'),
            icon: 'person.2.fill',
            route: '/(tabs)/roster',
            badge: pendingTrialCount > 0 ? pendingTrialCount : undefined,
          },
          {
            key: 'chat',
            label: t('home.actionChat'),
            icon: 'bubble.fill',
            route: '/(tabs)/chat',
          },
        ]
      : canManageTeam
        ? [
            {
              key: 'schedule',
              label: t('home.actionEvents'),
              icon: 'calendar.fill',
              route: '/(tabs)/events',
            },
            {
              key: 'roster',
              label: t('home.actionRoster'),
              icon: 'person.2.fill',
              route: '/(tabs)/roster',
              badge: pendingTrialCount > 0 ? pendingTrialCount : undefined,
            },
            {
              key: 'invite',
              label: t('home.actionInvite'),
              icon: 'person.circle.fill',
              route: {
                pathname: '/invite',
                params: { returnTo: '/(tabs)' },
              },
            },
          ]
        : [
            {
              key: 'schedule',
              label: t('home.actionEvents'),
              icon: 'calendar.fill',
              route: '/(tabs)/events',
            },
            {
              key: 'chat',
              label: t('home.actionChat'),
              icon: 'bubble.fill',
              route: '/(tabs)/chat',
            },
            {
              key: 'team',
              label: t('home.actionMyTeam'),
              icon: 'person.2.fill',
              route: '/my-team',
            },
          ]

  const contextTitle = activeTeamAccess?.team.displayName || activeClub?.club.name
  const contextSubtitle =
    activeTeamAccess?.team.displayName && translatedRole
      ? translatedRole
      : clubRoleLabel || null

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={c.clubPrimary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Greeting hero — large title style */}
      <View style={styles.heroBlock}>
        <Text
          variant="caption2"
          color="tertiary"
          tracking="wide"
          style={styles.greetingEyebrow}
        >
          {greeting.toUpperCase()}
        </Text>
        <Text variant="largeTitle" color="primary" numberOfLines={1}>
          {firstName}
        </Text>
        {translatedRole ? (
          <Text variant="subheadline" color="secondary" style={styles.rolePill}>
            {translatedRole}
          </Text>
        ) : null}
      </View>

      {hasMultipleTeams && !isParent ? (
        <Pressable
          style={[
            styles.contextCard,
            {
              backgroundColor: c.surface,
              borderColor: c.border,
            },
          ]}
          onPress={hasMultipleTeams ? () => setTeamSwitcherOpen(true) : undefined}
          disabled={!hasMultipleTeams}
          accessibilityRole={hasMultipleTeams ? 'button' : undefined}
        >
          <View style={styles.contextCopy}>
            <Text variant="headline" color="primary" numberOfLines={1}>
              {contextTitle}
            </Text>
            {contextSubtitle ? (
              <Text variant="subheadline" color="secondary" numberOfLines={1}>
                {contextSubtitle}
              </Text>
            ) : null}
          </View>
          <Icon name="chevron.up.chevron.down" size="sm" color="tertiary" />
        </Pressable>
      ) : null}

      <TeamSwitcher
        visible={teamSwitcherOpen}
        onClose={() => setTeamSwitcherOpen(false)}
      />

      {/* Next event section */}
      <Text
        variant="caption2"
        color="tertiary"
        tracking="wide"
        style={styles.sectionLabel}
      >
        {t('home.nextEvent').toUpperCase()}
      </Text>

      {isParent ? (
        <ParentFocusCard
          item={parentNextEvent}
          locale={locale}
          onPress={() => router.push('/(tabs)/events')}
        />
      ) : nextEvent ? (
        <EventFocusCard
          item={nextEvent}
          locale={locale}
          pending={rsvpPending}
          scale={rsvpScale}
          onRsvp={handleRsvp}
        />
      ) : (
        <EmptyNextEvent onOpen={() => router.push('/(tabs)/events')} />
      )}

      {/* Needs review banner (replaces beige review box) */}
      {canManageTeam && pendingTrialCount > 0 ? (
        <View style={styles.bannerWrap}>
          <Banner
            tone="warning"
            title={t('home.pendingTrialsTitle', { count: pendingTrialCount })}
            description={t('home.pendingTrialsBody')}
            action={{
              label: t('home.reviewTrialsCta'),
              onPress: () => router.push('/(tabs)/roster'),
            }}
          />
        </View>
      ) : null}

      {/* Admin club overview stat grid */}
      {isAdmin && clubStats ? (
        <>
          <Text
            variant="caption2"
            color="tertiary"
            tracking="wide"
            style={styles.sectionLabel}
          >
            {t('adminDashboard.clubOverview').toUpperCase()}
          </Text>
          <Pressable
            onPress={() => router.push('/admin-dashboard')}
            accessibilityRole="button"
            accessibilityLabel={t('adminDashboard.title')}
            style={styles.statsWrap}
          >
            <StatGrid columns={3}>
              <StatCard
                icon="person.2.fill"
                label={t('adminDashboard.members')}
                value={clubStats.memberCount}
              />
              <StatCard
                icon="figure.soccer.fill"
                label={t('adminDashboard.teams')}
                value={clubStats.teamCount}
              />
              <StatCard
                icon="calendar.fill"
                label={t('tabs.events')}
                value={clubStats.upcomingEventCount}
              />
            </StatGrid>
          </Pressable>
        </>
      ) : null}

      {/* Quick actions */}
      <Text
        variant="caption2"
        color="tertiary"
        tracking="wide"
        style={styles.sectionLabel}
      >
        {t('home.quickActions').toUpperCase()}
      </Text>
      <SectionGroup>
        {shortcuts.map((shortcut) => (
          <ListRow
            key={shortcut.key}
            title={shortcut.label}
            left={
              <View
                style={[
                  styles.shortcutIconWrap,
                  { backgroundColor: c.clubPrimaryLight },
                ]}
              >
                <Icon name={shortcut.icon} size="md" color="tint" />
              </View>
            }
            right={
              shortcut.badge ? (
                <View
                  style={[
                    styles.shortcutBadge,
                    { backgroundColor: c.warning },
                  ]}
                >
                  <Text variant="caption2" weight="bold" color="inverse" tabular>
                    {shortcut.badge}
                  </Text>
                </View>
              ) : undefined
            }
            onPress={() => router.push(shortcut.route as never)}
            showChevron
            style={styles.shortcutRow}
          />
        ))}
      </SectionGroup>
    </ScrollView>
  )
}

function EmptyNextEvent({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <View
      style={[
        styles.emptyCard,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
        },
      ]}
    >
      <View
        style={[
          styles.emptyIconTile,
          { backgroundColor: c.clubPrimaryLight },
        ]}
      >
        <Icon name="calendar.fill" size={48} color="tint" />
      </View>
      <Text variant="title3" color="primary" align="center">
        {t('home.noUpcomingEventsTitle')}
      </Text>
      <Text
        variant="subheadline"
        color="secondary"
        align="center"
        style={styles.emptyBody}
      >
        {t('home.noUpcomingEventsBody')}
      </Text>
      <Button
        label={t('tabs.events')}
        variant="tinted"
        size="md"
        onPress={onOpen}
      />
    </View>
  )
}

function EventFocusCard({
  item,
  locale,
  pending,
  scale,
  onRsvp,
}: {
  item: EventFeedItem
  locale: string
  pending: boolean
  scale: Animated.Value
  onRsvp: (eventId: string, status: string) => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const eventTypeTone =
    item.type === 'TRAINING'
      ? c.info
      : item.type === 'MATCH'
        ? c.clubPrimary
        : c.textSecondary

  return (
    <Pressable
      style={[
        styles.focusCard,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
        },
      ]}
      onPress={() =>
        router.push({ pathname: '/event-detail', params: { eventId: item.id } })
      }
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.focusHeader}>
        <View
          style={[
            styles.focusBadge,
            { backgroundColor: hexWithAlpha(eventTypeTone, 0.12) },
          ]}
        >
          <Text
            variant="caption2"
            weight="semibold"
            tracking="wide"
            color={eventTypeTone}
          >
            {t(`event.type.${item.type}`).toUpperCase()}
          </Text>
        </View>
        <Text variant="footnote" color="secondary" numberOfLines={1}>
          {formatDate(item.date, locale, t)}
        </Text>
      </View>

      <Text variant="title2" color="primary" style={styles.focusTitle}>
        {item.title}
      </Text>

      {item.location ? (
        <View style={styles.metaRow}>
          <Icon name="mappin.circle.fill" size="sm" color="tint" />
          <Text
            variant="subheadline"
            color="secondary"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {item.location}
          </Text>
        </View>
      ) : null}

      <Text variant="subheadline" color="secondary" style={styles.summaryText}>
        {t('event.attendanceSummary', {
          yes: item.yesCount || 0,
          maybe: item.maybeCount || 0,
          no: item.noCount || 0,
        })}
      </Text>

      <Animated.View style={[styles.rsvpRow, { transform: [{ scale }] }]}>
        {RSVP_OPTIONS.map((option) => {
          const active = item.myRsvp === option.status
          const toneColor =
            option.tone === 'success'
              ? c.success
              : option.tone === 'warning'
                ? c.warning
                : c.error

          return (
            <Pressable
              key={option.status}
              style={[
                styles.rsvpButton,
                {
                  borderColor: c.border,
                  backgroundColor: c.background,
                },
                active && {
                  backgroundColor: toneColor,
                  borderColor: toneColor,
                },
              ]}
              onPress={() => onRsvp(item.id, option.status)}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel={t(option.labelKey)}
              accessibilityHint={t('event.rsvpHint')}
              accessibilityState={{ selected: active, disabled: pending }}
            >
              <Icon
                name={option.icon}
                size="md"
                color={active ? c.textInverse : toneColor}
              />
              <Text
                variant="subheadline"
                weight="semibold"
                color={active ? 'inverse' : 'primary'}
              >
                {t(option.labelKey)}
              </Text>
            </Pressable>
          )
        })}
      </Animated.View>
    </Pressable>
  )
}

function ParentFocusCard({
  item,
  locale,
  onPress,
}: {
  item: CrossTeamEventItem | null
  locale: string
  onPress: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()

  if (!item) {
    return (
      <View
        style={[
          styles.emptyCard,
          {
            backgroundColor: c.surface,
            borderColor: c.border,
          },
        ]}
      >
        <View
          style={[
            styles.emptyIconTile,
            { backgroundColor: c.clubPrimaryLight },
          ]}
        >
          <Icon name="calendar.fill" size={48} color="tint" />
        </View>
        <Text variant="title3" color="primary" align="center">
          {t('parentSchedule.empty')}
        </Text>
        <Text
          variant="subheadline"
          color="secondary"
          align="center"
          style={styles.emptyBody}
        >
          {t('parentSchedule.emptyDescription')}
        </Text>
        <Button
          label={t('tabs.schedule')}
          variant="tinted"
          size="md"
          onPress={onPress}
        />
      </View>
    )
  }

  return (
    <Pressable
      style={[
        styles.focusCard,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.focusHeader}>
        <View
          style={[
            styles.focusBadge,
            { backgroundColor: c.clubPrimaryLight },
          ]}
        >
          <Text
            variant="caption2"
            weight="semibold"
            tracking="wide"
            color="tint"
          >
            {(item.teamDisplayName || item.teamName).toUpperCase()}
          </Text>
        </View>
        <Text variant="footnote" color="secondary" numberOfLines={1}>
          {formatDate(item.date, locale, t)}
        </Text>
      </View>
      <Text
        variant="title2"
        color="primary"
        style={styles.focusTitle}
        numberOfLines={2}
      >
        {item.title}
      </Text>
      <View
        style={[
          styles.focusMetaPanel,
          {
            backgroundColor: c.background,
            borderColor: c.border,
          },
        ]}
      >
        <View style={styles.focusDetailRow}>
          <Icon name="calendar.fill" size="sm" color="tint" />
          <Text
            variant="subheadline"
            color="primary"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {formatDate(item.date, locale, t)}
          </Text>
        </View>
        {item.location ? (
          <View style={styles.focusDetailRow}>
            <Icon name="mappin.circle.fill" size="sm" color="tint" />
            <Text
              variant="subheadline"
              color="secondary"
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {item.location}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={[
          styles.focusFooter,
          { borderTopColor: c.border },
        ]}
      >
        <Text variant="subheadline" weight="semibold" color="tint">
          {t('tabs.schedule')}
        </Text>
        <Icon name="chevron.right" size="sm" color="tint" />
      </View>
    </Pressable>
  )
}

function hexWithAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function formatDate(
  iso: string,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const date = new Date(iso)
  const today = new Date()
  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  )
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )
  const days = Math.round(
    (dateStart.getTime() - todayStart.getTime()) / 86400000,
  )
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  if (days === 0) {
    return t('home.dateToday', { time })
  }
  if (days === 1) {
    return t('home.dateTomorrow', { time })
  }

  return `${new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)}, ${time}`
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  heroBlock: {
    marginBottom: space.lg,
    gap: 2,
  },
  greetingEyebrow: {
    marginBottom: 2,
  },
  rolePill: {
    marginTop: 2,
  },
  contextCard: {
    minHeight: 56,
    borderRadius: card.radius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: card.padding,
    paddingVertical: space.md,
    marginBottom: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  contextCopy: {
    flex: 1,
    gap: 2,
  },
  sectionLabel: {
    marginTop: space.md,
    marginBottom: space.sm,
    marginLeft: space.xs,
  },
  statsWrap: {
    marginBottom: space.md,
  },
  bannerWrap: {
    marginBottom: space.md,
  },
  focusCard: {
    borderRadius: card.heroRadius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: card.paddingHero,
    marginBottom: space.md,
    gap: space.sm,
    ...elevation.card,
  },
  focusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  focusBadge: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: 999,
  },
  focusTitle: {
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: 2,
  },
  summaryText: {
    marginTop: space.xs,
  },
  rsvpRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  rsvpButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  emptyCard: {
    borderRadius: card.radius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: card.padding,
    marginBottom: space.md,
    alignItems: 'center',
    gap: space.sm,
  },
  emptyIconTile: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyBody: {
    maxWidth: 320,
    marginBottom: space.xs,
  },
  shortcutIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutRow: {
    minHeight: 62,
    paddingHorizontal: card.padding,
    paddingVertical: space.sm + 2,
  },
  shortcutBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: space.xs,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusMetaPanel: {
    marginTop: space.xs,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: card.paddingCompact,
    gap: space.xs,
  },
  focusDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  focusFooter: {
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
