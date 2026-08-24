import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ImportedFixture } from '@anstoss/shared'
import { RSVP } from '@anstoss/shared'
import { api, API_URL } from '../../api/client'
import { useEventsSocket, type EventRsvpUpdate } from '../../hooks/useEventsSocket'
import { Icon, Text } from '../ui'
import { LiveStatusPill } from '../match'
import { useClubColors } from '../../context/ClubThemeContext'
import { useAuth } from '../../context/AuthContext'
import { hexToRgba } from '../../theme/club-theme'
import { TEXT_WHITE } from '../../theme/colors'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { elevation, fonts, hairline, radius, space } from '../../theme/tokens'
import { findFixtureForEvent } from '../../lib/matchFixtureLink'
import { HomePulse } from './HomePulse'

type EventItem = {
  id: string
  type: string
  title: string
  date: string
  location?: string | null
  myRsvp: 'YES' | 'MAYBE' | 'NO' | null
  yesCount: number
  maybeCount: number
  noCount: number
  team?: { id: string; name: string } | null
}

type Announcement = { id: string; title: string; body: string }

type ChannelMessage = {
  id: string
  senderName: string
  contentPreview: string
  messageType: string
  createdAt: string
}

type ChannelItem = {
  id: string
  clubId: string
  teamId: string | null
  slug: string
  kind: string
  name: string
  description: string | null
  visibility: string
  canWrite: boolean
  unreadCount: number
  lastMessage: ChannelMessage | null
  createdAt: string
  updatedAt: string
}

export type PlayerHomeProps = {
  clubId: string
  teamId: string | null
}

export function PlayerHome({ clubId, teamId }: PlayerHomeProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const { activeClub, token } = useAuth()
  const locale = getAppLocale(getAppLanguage())
  const [upcomingEvents, setUpcomingEvents] = useState<EventItem[]>([])
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [fixtures, setFixtures] = useState<ImportedFixture[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [teamChannel, setTeamChannel] = useState<ChannelItem | null>(null)
  const [rsvpPending, setRsvpPending] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const load = useCallback(async () => {
    if (!teamId) return
    const [evs, anns, channels] = await Promise.all([
      // mine=1 with no teamId → backend returns events from ALL user's active
      // teams in this club (up to 4, chronological, with team badge metadata)
      api<EventItem[]>(`/clubs/${clubId}/events?scope=upcoming&mine=1&limit=4`).catch(() => []),
      api<Announcement[]>(`/clubs/${clubId}/announcements?limit=3`).catch(() => []),
      api<ChannelItem[]>(`/teams/${teamId}/channels`).catch(() => []),
    ])
    const events = evs ?? []
    const fixtureTeamIds = Array.from(
      new Set(
        [teamId, ...events.map((event) => event.team?.id ?? teamId)]
          .filter((id): id is string => Boolean(id)),
      ),
    )
    const fixtureGroups = await Promise.all(
      fixtureTeamIds.flatMap((id) => [
        api<ImportedFixture[]>(`/teams/${id}/fixtures?scope=upcoming&limit=5`).catch(
          () => [] as ImportedFixture[],
        ),
        api<ImportedFixture[]>(`/teams/${id}/fixtures?scope=recent&limit=5`).catch(
          () => [] as ImportedFixture[],
        ),
      ]),
    )
    setUpcomingEvents(events)
    setEventsLoaded(true)
    setFixtures(uniqueFixturesById(fixtureGroups.flat()))
    setAnnouncements(anns ?? [])
    const team = channels?.find((ch) => ch.kind === 'TEAM') ?? null
    setTeamChannel(team)
  }, [clubId, teamId])

  useEffect(() => {
    void load()
  }, [load])

  // Realtime: patch live RSVP counts onto the "Your week" cards and refetch
  // when an event is created/changed for this team.
  useEventsSocket({
    teamId,
    token,
    apiUrl: API_URL,
    onRsvpUpdate: useCallback((update: EventRsvpUpdate) => {
      setUpcomingEvents((prev) =>
        prev.map((e) =>
          e.id === update.eventId
            ? {
                ...e,
                yesCount: update.yesCount,
                maybeCount: update.maybeCount,
                noCount: update.noCount,
              }
            : e,
        ),
      )
    }, []),
    onEventUpsert: useCallback(() => {
      void load()
    }, [load]),
  })

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // For the single-event hero card, use the first upcoming event
  const event = upcomingEvents[0] ?? null
  const eventWithTeam =
    event && !event.team && teamId ? { ...event, team: { id: teamId, name: '' } } : event
  const linkedFixture = findFixtureForEvent(eventWithTeam, fixtures)
  const liveFixture = fixtures.find((f) => f.status === 'live') ?? null
  const playerAction = event
    ? getPlayerActionState(event, linkedFixture, nowMs)
    : null
  const liveActionOwnsHero =
    playerAction?.target === 'match' && linkedFixture?.status === 'live'
  const linkedUpcomingIsLive = linkedFixture?.status === 'live'

  // Determine if all upcoming events belong to the same team
  const allSameTeam =
    upcomingEvents.length === 0 ||
    upcomingEvents.every((e) => e.team?.id === upcomingEvents[0].team?.id)

  const onRsvp = useCallback(
    async (status: 'YES' | 'MAYBE' | 'NO') => {
      if (!event || rsvpPending) return
      setRsvpPending(true)
      const previousRsvp = event.myRsvp
      setUpcomingEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, myRsvp: status } : e)),
      )
      try {
        // Debounce 500ms (mirrors the events tab / EventNextActionPanel path).
        // The button is disabled via rsvpPending above for the whole call, so
        // rapid taps can't fire overlapping requests.
        await new Promise((resolve) => setTimeout(resolve, RSVP.DEBOUNCE_MS))
        await api(`/clubs/${clubId}/events/${event.id}/rsvp`, {
          method: 'PUT',
          body: { status },
        })
      } catch {
        // Revert optimistic state and notify so the UI doesn't lie about
        // the user's RSVP. Alert is intentionally lightweight here; a
        // toast component would be a future polish.
        setUpcomingEvents((prev) =>
          prev.map((e) => (e.id === event.id ? { ...e, myRsvp: previousRsvp } : e)),
        )
        Alert.alert(
          t('event.rsvpFailedTitle', { defaultValue: 'RSVP not saved' }),
          t('event.rsvpFailedBody', {
            defaultValue: 'Could not save your reply. Tap again when you have a connection.',
          }),
        )
      } finally {
        setRsvpPending(false)
      }
    },
    [clubId, event, rsvpPending, t],
  )

  const eventDate = event ? new Date(event.date) : null
  const eyebrow = event
    ? [event.type.toUpperCase(), formatRelativeShort(eventDate!, t)].filter(Boolean).join(' · ')
    : ''
  const kickoffLine = eventDate
    ? new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
      }).format(eventDate)
    : ''

  const rsvpOptions: Array<{ status: 'YES' | 'MAYBE' | 'NO'; label: string }> = [
    { status: 'YES', label: t('event.rsvpYes', { defaultValue: 'Yes' }) },
    { status: 'MAYBE', label: t('event.rsvpMaybe', { defaultValue: 'Maybe' }) },
    { status: 'NO', label: t('event.rsvpNo', { defaultValue: 'No' }) },
  ]

  const openEvent = useCallback(() => {
    if (!event) return
    router.push({ pathname: '/event-detail', params: { eventId: event.id } })
  }, [event])

  const openLinkedMatch = useCallback(() => {
    if (!linkedFixture) {
      openEvent()
      return
    }
    router.push({
      pathname: '/match-detail',
      params: { fixtureId: linkedFixture.id, teamId: linkedFixture.teamId },
    })
  }, [linkedFixture, openEvent])

  const openTeamChat = useCallback(() => {
    router.push('/(tabs)/chat' as never)
  }, [])

  const openEventOrMatch = useCallback(
    (targetEvent: EventItem) => {
      const matchFixture = findFixtureForEvent(
        targetEvent && !targetEvent.team && teamId
          ? { ...targetEvent, team: { id: teamId, name: '' } }
          : targetEvent,
        fixtures,
      )
      if (matchFixture) {
        router.push({
          pathname: '/match-detail',
          params: { fixtureId: matchFixture.id, teamId: matchFixture.teamId },
        })
        return
      }
      router.push({ pathname: '/event-detail', params: { eventId: targetEvent.id } })
    },
    [fixtures, teamId],
  )

  const handlePlayerAction = useCallback(() => {
    if (!playerAction) return
    if (playerAction.target === 'match') {
      openLinkedMatch()
      return
    }
    if (playerAction.target === 'chat') {
      openTeamChat()
      return
    }
    openEvent()
  }, [openEvent, openLinkedMatch, openTeamChat, playerAction])

  return (
    <View style={styles.root}>
      <HomePulse />
      {playerAction && event && !liveActionOwnsHero ? (
        <View
          style={[
            styles.nextActionPanel,
            elevation.card,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          <View style={styles.nextActionHeader}>
            <View
              style={[
                styles.nextActionIcon,
                { backgroundColor: hexToRgba(c.primary, 0.12) },
              ]}
            >
              <Icon name={playerAction.icon} size={16} color="tint" />
            </View>
            <Text style={[styles.nextActionEyebrow, { color: c.textTertiary }]}>
              {t('home.player.nextActionEyebrow', { defaultValue: 'NEXT ACTION' })}
            </Text>
          </View>
          <Text
            variant="title3"
            weight="semibold"
            color="primary"
            numberOfLines={2}
            style={styles.nextActionTitle}
          >
            {t(playerAction.titleKey, playerAction.titleOptions)}
          </Text>

          {playerAction.showRsvp ? (
            <View style={styles.rsvpRow}>
              {rsvpOptions.map((option) => {
                const isActive = event.myRsvp === option.status
                return (
                  <Pressable
                    key={option.status}
                    disabled={rsvpPending}
                    onPress={() => void onRsvp(option.status)}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected: isActive, disabled: rsvpPending }}
                    style={({ pressed }) => [
                      styles.actionRsvpPill,
                      {
                        backgroundColor: isActive ? c.primary : c.surface,
                        borderColor: isActive ? c.primary : c.borderStrong,
                      },
                      (pressed || rsvpPending) && { opacity: 0.72 },
                    ]}
                  >
                    <Text
                      variant="footnote"
                      weight="semibold"
                      style={{ color: isActive ? c.textInverse : c.textPrimary }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ) : (
            <View style={styles.nextActionFooter}>
              <Pressable
                onPress={handlePlayerAction}
                accessibilityRole="button"
                accessibilityLabel={t(playerAction.ctaKey, playerAction.ctaOptions)}
                style={({ pressed }) => [
                  styles.nextActionButton,
                  { backgroundColor: c.primary },
                  pressed && { opacity: 0.86 },
                ]}
              >
                <Text style={[styles.nextActionButtonText, { color: c.textInverse }]}>
                  {t(playerAction.ctaKey, playerAction.ctaOptions)}
                </Text>
                <Icon name="chevron.right" size={14} color="inverse" />
              </Pressable>
              {teamChannel ? (
                <Pressable
                  onPress={openTeamChat}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.teamChat', { defaultValue: 'Team chat' })}
                  style={({ pressed }) => [
                    styles.nextActionGhost,
                    { borderColor: c.borderDefault },
                    pressed && { opacity: 0.72 },
                  ]}
                >
                  <Icon name="message" size={14} color={c.textPrimary} />
                  <Text style={[styles.nextActionGhostText, { color: c.textPrimary }]}>
                    {t('home.teamChat', { defaultValue: 'Team chat' })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : null}

      {/* Today panel — surfaces live fixture if any */}
      {liveFixture ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/match-detail',
              params: { fixtureId: liveFixture.id, teamId: liveFixture.teamId },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`${liveFixture.homeTeam} vs ${liveFixture.awayTeam} live`}
          style={({ pressed }) => [
            styles.liveCard,
            elevation.hero,
            { backgroundColor: c.primary },
            pressed && { opacity: 0.92 },
          ]}
        >
          <View style={styles.liveHead}>
            <LiveStatusPill status="live" inverse />
            <Text variant="caption2" tracking="wide" weight="semibold" style={{ color: hexToRgba(TEXT_WHITE, 0.7) }}>
              {liveFixture.competition.toUpperCase()}
            </Text>
          </View>
          <View style={styles.liveScoreRow}>
            <Text variant="footnote" weight="semibold" style={[styles.liveTeam, { color: TEXT_WHITE }]} numberOfLines={1}>
              {liveFixture.homeTeam}
            </Text>
            <Text variant="largeTitle" tabular weight="bold" style={{ color: TEXT_WHITE }}>
              {liveFixture.resultHome ?? 0}-{liveFixture.resultAway ?? 0}
            </Text>
            <Text variant="footnote" weight="semibold" style={[styles.liveTeam, { color: TEXT_WHITE, textAlign: 'right' }]} numberOfLines={1}>
              {liveFixture.awayTeam}
            </Text>
          </View>
          {liveActionOwnsHero || !linkedUpcomingIsLive ? (
            <View
              style={[
                styles.liveFooter,
                { borderTopColor: hexToRgba(TEXT_WHITE, 0.2) },
              ]}
            >
              <Text variant="footnote" weight="semibold" style={{ color: TEXT_WHITE }}>
                {t('home.player.openLive', { defaultValue: 'Open live match' })}
              </Text>
              <Icon name="chevron.right" size={14} color="inverse" />
            </View>
          ) : null}
        </Pressable>
      ) : null}

      {/* Match hero — single team: club primary background card with RSVP
          Multi-team: compact chronological list with team badge chips */}
      {!eventsLoaded ? null : upcomingEvents.length === 0 ? (
        liveFixture ? null : (
          <View
            style={[
              styles.welcomeCard,
              elevation.card,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
            accessibilityRole="none"
          >
            <Text style={styles.welcomeIcon}>⚽</Text>
            <Text variant="title3" weight="semibold" color="primary" style={styles.welcomeTitle}>
              {t('home.welcome.title', {
                defaultValue: 'Welcome to {{clubName}}!',
                clubName: activeClub?.club?.name ?? '',
              })}
            </Text>
            <Text variant="footnote" color="secondary" style={styles.welcomeSubtitle}>
              {t('home.welcome.subtitle', {
                defaultValue:
                  'Your upcoming matches will appear here. Ask your coach to schedule your first event.',
              })}
            </Text>
          </View>
        )
      ) : linkedUpcomingIsLive ? null : upcomingEvents.length === 1 || allSameTeam ? (
        // Single-team hero card (unchanged behaviour)
        <Pressable
          onPress={() => {
            // For MATCH events linked to an imported fixture, route to the
            // rebuilt match-detail screen (MatchHero + Time Line/Lineup/Stats).
            openEventOrMatch(event!)
          }}
          accessibilityRole="button"
          accessibilityLabel={event!.title}
          style={({ pressed }) => [
            styles.matchHero,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.92 },
          ]}
        >
          <Text
            variant="caption2"
            tracking="wide"
            weight="semibold"
            style={{ color: c.primary }}
          >
            {eyebrow}
          </Text>
          <Text
            variant="title2"
            weight="bold"
            numberOfLines={2}
            style={[styles.matchTitle, { color: c.textPrimary }]}
          >
            {event!.title}
          </Text>
          <View style={[styles.matchKickoffRule, { borderTopColor: c.borderDefault }]}>
            <Text variant="footnote" color="secondary">
              {kickoffLine}
              {event!.location ? `  ·  ${event!.location}` : ''}
            </Text>
          </View>

          {(event!.yesCount + event!.maybeCount + event!.noCount) > 0 ? (
            <Text
              variant="caption2"
              tabular
              color="secondary"
              style={styles.rsvpSummary}
            >
              {t('home.player.rsvpSummary', {
                defaultValue: '{{yes}} in · {{maybe}} maybe · {{no}} out',
                yes: event!.yesCount,
                maybe: event!.maybeCount,
                no: event!.noCount,
              })}
            </Text>
          ) : null}
        </Pressable>
      ) : (
        // Multi-team week list — events from different teams with badge chips
        <View style={[styles.weekList, elevation.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary" style={styles.weekListLabel}>
            {t('home.yourWeek', { defaultValue: 'Your week' }).toUpperCase()}
          </Text>
          {upcomingEvents.map((ev, i) => {
            const evDate = new Date(ev.date)
            const dateLabel = new Intl.DateTimeFormat(locale, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            }).format(evDate)
            const teamLabel = ev.team?.name.slice(0, 3).toUpperCase() ?? ev.type.slice(0, 3)
            return (
              <Pressable
                key={ev.id}
                onPress={() => openEventOrMatch(ev)}
                accessibilityRole="button"
                accessibilityLabel={ev.title}
                style={({ pressed }) => [
                  styles.weekItem,
                  i > 0 && { borderTopWidth: hairline, borderTopColor: c.borderDefault },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.teamBadge, { backgroundColor: c.primary }]}>
                  <Text style={[styles.teamBadgeText, { color: TEXT_WHITE }]}>{teamLabel}</Text>
                </View>
                <View style={styles.weekItemContent}>
                  <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
                    {ev.title}
                  </Text>
                  <Text variant="caption1" color="secondary" style={styles.weekItemDate}>
                    {dateLabel}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      )}

      {/* Team chat preview */}
      {teamChannel && (
        <Pressable
          onPress={() => {
            router.push('/(tabs)/chat')
          }}
          accessibilityRole="button"
          accessibilityLabel={t('home.teamChat', { defaultValue: 'Team chat' })}
          style={({ pressed }) => [
            styles.chatRow,
            elevation.card,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
            pressed && { opacity: 0.7 },
          ]}
        >
          <View style={styles.chatRowLeft}>
            <Text style={styles.chatIcon}>💬</Text>
            <View style={styles.chatRowText}>
              <Text variant="callout" weight="semibold" color="primary">
                {t('home.teamChat', { defaultValue: 'Team chat' })}
              </Text>
              <Text
                variant="footnote"
                color="secondary"
                numberOfLines={1}
              >
                {teamChannel.lastMessage
                  ? `${teamChannel.lastMessage.senderName}: ${teamChannel.lastMessage.contentPreview}`.slice(0, 60)
                  : t('home.teamChatEmpty', { defaultValue: 'Say hi to your teammates →' })}
              </Text>
            </View>
          </View>
          {teamChannel.unreadCount > 0 && (
            <View style={[styles.badge, { backgroundColor: c.primary }]}>
              <Text variant="caption2" weight="semibold" tabular style={{ color: c.textInverse }}>
                {teamChannel.unreadCount > 99 ? '99+' : teamChannel.unreadCount}
              </Text>
            </View>
          )}
        </Pressable>
      )}

      {/* Announcements feed */}
      <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary" style={styles.sectionLabel}>
        {t('home.announcements', { defaultValue: 'Announcements' }).toUpperCase()}
      </Text>
      {announcements.length === 0 ? (
        <View style={[styles.emptyRow, { borderTopColor: c.borderDefault }]}>
          <Text variant="footnote" color="tertiary">
            {t('announcements.empty', { defaultValue: 'No announcements.' })}
          </Text>
        </View>
      ) : (
        <View>
          {announcements.map((a, i) => (
            <View
              key={a.id}
              style={[
                styles.feedRow,
                i === 0 && { borderTopWidth: 0 },
                { borderTopColor: c.borderDefault },
              ]}
            >
              <View style={styles.feedBody}>
                <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
                  {a.title}
                </Text>
                <Text variant="footnote" color="secondary" numberOfLines={2} style={styles.feedMeta}>
                  {a.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

function formatRelativeShort(date: Date, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const diffMs = date.getTime() - Date.now()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return t('home.today', { defaultValue: 'Today' })
  if (diffDays === 1) return t('home.tomorrow', { defaultValue: 'Tomorrow' })
  if (diffDays > 1 && diffDays <= 7) return t('home.inNDays', { defaultValue: 'In {{n}} days', n: diffDays })
  if (diffDays < 0) return t('home.past', { defaultValue: 'Past' })
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
}

type PlayerActionState = {
  icon: string
  target: 'event' | 'match' | 'chat'
  showRsvp: boolean
  titleKey: string
  titleOptions: Record<string, unknown>
  bodyKey: string
  bodyOptions: Record<string, unknown>
  ctaKey: string
  ctaOptions: Record<string, unknown>
}

function getPlayerActionState(
  event: EventItem,
  linkedFixture: ImportedFixture | null,
  nowMs: number,
): PlayerActionState {
  if (!event.myRsvp) {
    return {
      icon: 'hand.raised.fill',
      target: 'event',
      showRsvp: true,
      titleKey: 'home.player.replyTitle',
      titleOptions: {
        defaultValue: 'Reply to {{title}}',
        title: event.title,
      },
      bodyKey: 'home.player.replyBody',
      bodyOptions: { defaultValue: 'Your coach is planning the squad. Tap your availability.' },
      ctaKey: 'home.player.replyNow',
      ctaOptions: { defaultValue: 'Reply now' },
    }
  }

  if (isCheckInWindow(event.date, nowMs) && event.myRsvp === 'YES') {
    return {
      icon: 'checkmark.circle.fill',
      target: 'event',
      showRsvp: false,
      titleKey: 'home.player.checkInTitle',
      titleOptions: { defaultValue: 'Check in when you arrive' },
      bodyKey: 'home.player.checkInBody',
      bodyOptions: { defaultValue: 'Open the event at the pitch and confirm you are there.' },
      ctaKey: 'home.player.openCheckIn',
      ctaOptions: { defaultValue: 'Open check-in' },
    }
  }

  if (linkedFixture?.status === 'live') {
    return {
      icon: 'dot.radiowaves.left.and.right',
      target: 'match',
      showRsvp: false,
      titleKey: 'home.player.liveTitle',
      titleOptions: { defaultValue: 'Match is live' },
      bodyKey: 'home.player.liveBody',
      bodyOptions: { defaultValue: 'Follow the score, lineup, and match updates.' },
      ctaKey: 'home.player.openLive',
      ctaOptions: { defaultValue: 'Open live match' },
    }
  }

  if (event.myRsvp === 'YES') {
    return {
      icon: 'checkmark.circle.fill',
      target: 'event',
      showRsvp: false,
      titleKey: 'home.player.readyTitle',
      titleOptions: { defaultValue: 'You are marked in' },
      bodyKey: 'home.player.readyBody',
      bodyOptions: { defaultValue: 'We will surface check-in here when the arrival window opens.' },
      ctaKey: 'home.player.viewEvent',
      ctaOptions: { defaultValue: 'View event' },
    }
  }

  if (event.myRsvp === 'MAYBE') {
    return {
      icon: 'clock.fill',
      target: 'event',
      showRsvp: false,
      titleKey: 'home.player.maybeTitle',
      titleOptions: { defaultValue: 'You are marked maybe' },
      bodyKey: 'home.player.maybeBody',
      bodyOptions: { defaultValue: 'Update your answer as soon as you know.' },
      ctaKey: 'home.player.updateReply',
      ctaOptions: { defaultValue: 'Update reply' },
    }
  }

  return {
    icon: 'xmark.circle.fill',
    target: 'event',
    showRsvp: false,
    titleKey: 'home.player.outTitle',
    titleOptions: { defaultValue: 'You are marked out' },
    bodyKey: 'home.player.outBody',
    bodyOptions: { defaultValue: 'Open the event if your availability changes.' },
    ctaKey: 'home.player.updateReply',
    ctaOptions: { defaultValue: 'Update reply' },
  }
}

function isCheckInWindow(eventDate: string, nowMs: number): boolean {
  const eventMs = new Date(eventDate).getTime()
  if (!Number.isFinite(eventMs)) return false
  return nowMs >= eventMs - 2 * 60 * 60 * 1000 && nowMs <= eventMs + 3 * 60 * 60 * 1000
}

function uniqueFixturesById(fixtures: ImportedFixture[]): ImportedFixture[] {
  const seen = new Set<string>()
  return fixtures.filter((fixture) => {
    if (seen.has(fixture.id)) return false
    seen.add(fixture.id)
    return true
  })
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  nextActionPanel: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: space.md,
    gap: space.sm,
  },
  nextActionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  nextActionIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextActionEyebrow: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  nextActionTitle: {
    letterSpacing: -0.2,
    marginTop: space['2xs'],
  },
  nextActionFooter: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  nextActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  nextActionButtonText: {
    fontFamily: fonts.label,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  nextActionGhost: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  nextActionGhostText: {
    fontFamily: fonts.label,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  chatRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
  },
  chatIcon: {
    fontSize: 20,
    lineHeight: 26,
  },
  chatRowText: {
    flex: 1,
    gap: space['2xs'],
  },
  badge: {
    minWidth: 28,
    height: 24,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.xs + 2,
    marginLeft: space.sm,
  },
  liveCard: {
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    gap: space.sm,
  },
  liveHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  liveScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  liveTeam: { flex: 1 },
  liveFooter: {
    borderTopWidth: hairline,
    paddingTop: space.sm,
    marginTop: space['2xs'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchHero: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.xs,
  },
  matchTitle: { letterSpacing: -0.4, marginTop: space['2xs'] },
  matchKickoffRule: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    borderStyle: 'dashed',
  },
  rsvpRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.sm,
  },
  rsvpSummary: {
    marginTop: space.xs,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  actionRsvpPill: {
    flex: 1,
    minHeight: 44,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeCard: {
    padding: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    gap: space.sm,
  },
  welcomeIcon: {
    fontSize: 32,
    lineHeight: 40,
  },
  welcomeTitle: {
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  welcomeSubtitle: {
    textAlign: 'center',
    lineHeight: 18,
  },
  weekList: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  weekListLabel: {
    letterSpacing: 1.4,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  weekItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  teamBadge: {
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    paddingHorizontal: space.xs + 2,
    paddingVertical: space['2xs'] + 1,
    minWidth: 36,
    alignItems: 'center',
  },
  teamBadgeText: {
    fontFamily: fonts.label,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  weekItemContent: {
    flex: 1,
    gap: space['2xs'],
  },
  weekItemDate: {
    letterSpacing: 0.2,
  },
  sectionLabel: {
    letterSpacing: 1.4,
    marginTop: space.xs,
    marginBottom: -space.xs,
  },
  emptyRow: { paddingVertical: space.md, borderTopWidth: hairline },
  feedRow: {
    paddingVertical: space.md,
    borderTopWidth: hairline,
  },
  feedBody: { gap: space['2xs'] },
  feedMeta: { lineHeight: 18 },
})
