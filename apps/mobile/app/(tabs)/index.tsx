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
  MyContributionSummary,
  MyContributionItem,
} from '@anstoss/shared'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../../src/api/client'
import { TeamSwitcher } from '../../src/components/TeamSwitcher'
import {
  Banner,
  Icon,
  Text,
  type IconName,
} from '../../src/components/ui'
import { StatusPill, type StatusPillTone } from '../../src/components/ui/StatusPill'
import { useAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../../src/i18n'
import { Haptics } from '../../src/utils/haptics'
import {
  TAB_BAR_CLEARANCE,
  elevation,
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
  const [urgentContribution, setUrgentContribution] = useState<MyContributionItem | null>(null)
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

    if (!isParent) {
      requests.push(
        api<MyContributionSummary>(
          `/clubs/${activeClub.club.id}/contributions/my`,
        )
          .then((result) => {
            if (!result.hasContributions || result.items.length === 0) {
              setUrgentContribution(null)
              return
            }
            const overdue = result.items.find((i) => i.status === 'OVERDUE')
            const pending = result.items.find((i) => i.status === 'PENDING')
            setUrgentContribution(overdue || pending || result.items[0])
          })
          .catch(() => {
            setUrgentContribution(null)
          }),
      )
    } else {
      setUrgentContribution(null)
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
          key: 'settings',
          label: t('more.title'),
          icon: 'gearshape.fill',
          route: '/(tabs)/more',
        },
      ]
    : isAdmin
      ? [
          {
            key: 'createEvent',
            label: t('home.actionCreateEvent'),
            icon: 'plus.circle.fill',
            route: '/create-event',
          },
          {
            key: 'admin',
            label: t('adminDashboard.title'),
            icon: 'gearshape.fill',
            route: '/admin-dashboard',
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
      : canManageTeam
        ? [
            {
              key: 'createEvent',
              label: t('home.actionCreateEvent'),
              icon: 'plus.circle.fill',
              route: '/create-event',
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
        : []

  const contextTitle = activeTeamAccess?.team.displayName || activeClub?.club.name

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={c.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Greeting — single warm line, no caps eyebrow */}
      <View style={styles.heroBlock}>
        <Text variant="title2" color="secondary" weight="regular">
          {greeting},
        </Text>
        <Text variant="largeTitle" color="primary" numberOfLines={1}>
          {firstName}
        </Text>
      </View>

      {/* Optional team-context chip — much smaller than before */}
      {hasMultipleTeams && !isParent ? (
        <Pressable
          style={({ pressed }) => [
            styles.contextChip,
            { backgroundColor: c.surface },
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => setTeamSwitcherOpen(true)}
          accessibilityRole="button"
        >
          <Text variant="footnote" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
            {contextTitle}
          </Text>
          <Icon name="chevron.up.chevron.down" size={14} color="tertiary" />
        </Pressable>
      ) : null}

      <TeamSwitcher
        visible={teamSwitcherOpen}
        onClose={() => setTeamSwitcherOpen(false)}
      />

      {/* Next event — sentence-case section title, no eyebrow */}
      <SectionTitle title={t('home.nextEvent')} />

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

      {/* Pending trials — keep banner */}
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

      {/* Contribution nudge */}
      {urgentContribution ? (
        <ContributionNudge item={urgentContribution} locale={locale} />
      ) : null}

      {/* Admin overview — 2x2 bento, no borders, soft elevation */}
      {isAdmin && clubStats ? (
        <>
          <SectionTitle title={t('adminDashboard.clubOverview')} />
          <View style={styles.statsBento}>
            <StatTile
              label={t('adminDashboard.members')}
              value={clubStats.memberCount}
              icon="person.2.fill"
              onPress={() => router.push('/admin-dashboard')}
            />
            <StatTile
              label={t('adminDashboard.teams')}
              value={clubStats.teamCount}
              icon="figure.soccer.fill"
              onPress={() => router.push('/admin-dashboard')}
            />
            <StatTile
              label={t('tabs.events')}
              value={clubStats.upcomingEventCount}
              icon="calendar.fill"
              onPress={() => router.push('/(tabs)/events')}
              wide
            />
          </View>
        </>
      ) : null}

      {/* Quick actions — icon tiles, not list rows */}
      {shortcuts.length > 0 ? (
        <>
          <SectionTitle title={t('home.quickActions')} />
          <View style={styles.actionGrid}>
            {shortcuts.map((shortcut) => (
              <ActionTile
                key={shortcut.key}
                label={shortcut.label}
                icon={shortcut.icon}
                badge={shortcut.badge}
                onPress={() => router.push(shortcut.route as never)}
              />
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text variant="headline" color="primary" weight="semibold" style={styles.sectionTitle}>
      {title}
    </Text>
  )
}

function StatTile({
  label,
  value,
  icon,
  onPress,
  wide,
}: {
  label: string
  value: number
  icon: IconName
  onPress?: () => void
  wide?: boolean
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label} ${value}`}
      style={({ pressed }) => [
        styles.statTile,
        wide && styles.statTileWide,
        { backgroundColor: c.surface },
        elevation.card,
        pressed && { opacity: 0.92 },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: c.primary50 }]}>
        <Icon name={icon} size={18} color="tint" />
      </View>
      <Text variant="dataLarge" color="primary" tabular style={styles.statValue}>
        {value}
      </Text>
      <Text variant="footnote" color="secondary" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function ActionTile({
  label,
  icon,
  badge,
  onPress,
}: {
  label: string
  icon: IconName
  badge?: number
  onPress: () => void
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.actionTile,
        { backgroundColor: c.surface },
        elevation.card,
        pressed && { opacity: 0.92 },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: c.primary50 }]}>
        <Icon name={icon} size={20} color="tint" />
      </View>
      <Text variant="footnote" weight="semibold" color="primary" numberOfLines={2} style={{ flex: 1 }}>
        {label}
      </Text>
      {badge ? (
        <View style={[styles.actionBadge, { backgroundColor: c.warning }]}>
          <Text variant="caption2" weight="bold" color="inverse" tabular>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

function EmptyNextEvent({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation()
  const c = useClubColors()
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.emptyCompact,
        { backgroundColor: c.surface },
        elevation.card,
        pressed && { opacity: 0.92 },
      ]}
    >
      <View style={[styles.emptyIcon, { backgroundColor: c.primary50 }]}>
        <Icon name="calendar.fill" size={22} color="tint" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="callout" color="primary" weight="semibold">
          {t('home.noUpcomingEventsTitle')}
        </Text>
        <Text variant="footnote" color="secondary" numberOfLines={2}>
          {t('home.noUpcomingEventsBody')}
        </Text>
      </View>
      <Icon name="chevron.right" size="sm" color="tertiary" />
    </Pressable>
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
        ? c.primary
        : c.textSecondary

  return (
    <Pressable
      style={({ pressed }) => [
        styles.focusCard,
        { backgroundColor: c.surface },
        elevation.card,
        pressed && { opacity: 0.95 },
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
          <Text variant="caption2" weight="semibold" color={eventTypeTone}>
            {t(`event.type.${item.type}`)}
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
          <Icon name="mappin.circle.fill" size="sm" color="tertiary" />
          <Text
            variant="footnote"
            color="secondary"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {item.location}
          </Text>
        </View>
      ) : null}

      <Text variant="footnote" color="secondary" style={styles.summaryText}>
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
                  backgroundColor: active ? toneColor : hexWithAlpha(toneColor, 0.1),
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
                size="sm"
                color={active ? c.textInverse : toneColor}
              />
              <Text
                variant="footnote"
                weight="semibold"
                color={active ? 'inverse' : toneColor}
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
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.emptyCompact,
          { backgroundColor: c.surface },
          elevation.card,
          pressed && { opacity: 0.92 },
        ]}
      >
        <View style={[styles.emptyIcon, { backgroundColor: c.primary50 }]}>
          <Icon name="calendar.fill" size={22} color="tint" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="callout" color="primary" weight="semibold">
            {t('parentSchedule.empty')}
          </Text>
          <Text variant="footnote" color="secondary" numberOfLines={2}>
            {t('parentSchedule.emptyDescription')}
          </Text>
        </View>
        <Icon name="chevron.right" size="sm" color="tertiary" />
      </Pressable>
    )
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.focusCard,
        { backgroundColor: c.surface },
        elevation.card,
        pressed && { opacity: 0.95 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <View style={styles.focusHeader}>
        <View
          style={[
            styles.focusBadge,
            { backgroundColor: c.primary50 },
          ]}
        >
          <Text variant="caption2" weight="semibold" color="tint">
            {item.teamDisplayName || item.teamName}
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
      {item.location ? (
        <View style={styles.metaRow}>
          <Icon name="mappin.circle.fill" size="sm" color="tertiary" />
          <Text
            variant="footnote"
            color="secondary"
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {item.location}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

function contributionStatusTone(status: string): StatusPillTone {
  switch (status) {
    case 'PAID':
      return 'success'
    case 'OVERDUE':
      return 'error'
    case 'PARTIAL':
      return 'warning'
    case 'PENDING':
      return 'info'
    default:
      return 'neutral'
  }
}

function formatCurrency(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

function ContributionNudge({
  item,
  locale,
}: {
  item: MyContributionItem
  locale: string
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const isOverdue = item.status === 'OVERDUE'

  return (
    <Pressable
      style={({ pressed }) => [
        styles.contributionCard,
        { backgroundColor: c.surface },
        elevation.card,
        isOverdue && { backgroundColor: c.errorBg },
        pressed && { opacity: 0.95 },
      ]}
      onPress={() => router.push('/my-contributions')}
      accessibilityRole="button"
      accessibilityLabel={t('contributions.myTitle')}
    >
      <View style={styles.contributionHeader}>
        <View style={[styles.contribIcon, { backgroundColor: isOverdue ? c.error : c.primary50 }]}>
          <Icon name="banknote" size={16} color={isOverdue ? 'inverse' : 'tint'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
            {item.planName}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('contributions.myDueOn', {
              date: new Date(item.dueDate).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'short',
              }),
            })}
          </Text>
        </View>
        <View style={styles.contribAmountWrap}>
          <Text variant="data" color="primary" tabular>
            {formatCurrency(item.amount, item.currency, locale)}
          </Text>
          <StatusPill
            label={t(`contributions.status.${item.status}`)}
            tone={contributionStatusTone(item.status)}
          />
        </View>
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
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: TAB_BAR_CLEARANCE + space.lg,
  },
  heroBlock: {
    marginBottom: space.md,
    gap: -2,
  },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: 999,
    marginBottom: space.md,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  sectionTitle: {
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  bannerWrap: {
    marginTop: space.md,
  },
  // Stats bento (2-up with one wide)
  statsBento: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  statTile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 18,
    padding: space.md,
    gap: space.xs,
  },
  statTileWide: {
    flexBasis: '100%',
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    marginTop: space.xs,
  },
  // Action grid
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  actionTile: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: 16,
    padding: space.md,
    minHeight: 64,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Focus card
  focusCard: {
    borderRadius: 20,
    padding: 18,
    gap: space.sm,
  },
  focusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  focusBadge: {
    paddingHorizontal: 10,
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
  },
  summaryText: {
    marginTop: space.xs,
  },
  rsvpRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.sm,
  },
  rsvpButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: space.xs,
  },
  // Compact empty / nudge cards
  emptyCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: 18,
    padding: space.md,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Contribution
  contributionCard: {
    borderRadius: 18,
    padding: space.md,
    marginTop: space.md,
  },
  contributionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  contribIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contribAmountWrap: {
    alignItems: 'flex-end',
    gap: space.xs,
  },
})
