import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RSVP, type EventFeedItem } from '@anstoss/shared'
import { api, ApiError } from '../../api/client'
import { useAdminInbox } from '../admin/useAdminInbox'
import { Button, Icon, PressableScale, Text } from '../ui'
import { useClubColors, useIsDark } from '../../context/ClubThemeContext'
import { RADIUS_FULL, SPACING_MD, SPACING_XL, SPACING_XS, SPACING_XXS, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import type { AbsenceDetail, RsvpStatus } from '../events/RsvpControl'
import { HeroRsvp, HeroSurface, heroKickoff, useHeroColors, type RsvpSplit } from './HomeHero'
import {
  EmptyCard,
  HomeCard,
  HomeRow,
  HomeSection,
  InlineError,
  formatCountdown,
  matchKindLabel,
} from './HomeKit'
import { HomeSkeleton } from './HomeSkeleton'
import { useHomeLocale } from './useHomeLocale'
import type { Hat } from './useHeldHats'

export type CombinedHomeProps = {
  clubId: string
  teamId: string | null
  hats: Hat[]
  onRefreshStateChange?: (state: { refresh: () => void; refreshing: boolean }) => void
}

/**
 * One home for a person with several roles (board 28, "hats, not modes"):
 * the player hero with their own answer and the team's bar when they play,
 * then "Als Trainer und Kapitän" (chase replies, lineup) and "Als Vorstand"
 * (join requests, open dues). Every held role is active at once; nothing
 * switches.
 */
export function CombinedHome({ clubId, teamId, hats, onRefreshStateChange }: CombinedHomeProps) {
  const { t } = useTranslation()
  const locale = useHomeLocale()
  const plays = hats.includes('PLAYER')
  const coaches = hats.includes('COACH')
  const captain = hats.includes('CAPTAIN')
  const board = hats.includes('BOARD')

  const [events, setEvents] = useState<EventFeedItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [pending, setPending] = useState(false)
  const [nudging, setNudging] = useState(false)
  const [nudgedCount, setNudgedCount] = useState<number | null>(null)
  const seq = useRef(0)
  const inbox = useAdminInbox(board ? clubId : null)

  const load = useCallback(async () => {
    const mine = ++seq.current
    if (!teamId) {
      setLoaded(true)
      setRefreshing(false)
      return
    }
    const list = await api<EventFeedItem[]>(
      `/clubs/${clubId}/events?teamId=${teamId}&scope=upcoming&limit=10`,
    ).catch(() => null)
    if (mine !== seq.current) return
    if (list === null) setError(true)
    else {
      setError(false)
      setEvents(Array.isArray(list) ? list : [])
    }
    setLoaded(true)
    setRefreshing(false)
  }, [clubId, teamId])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const refresh = useCallback(() => {
    setRefreshing(true)
    void load()
    if (board) void inbox.refresh()
  }, [board, inbox, load])

  useEffect(() => {
    onRefreshStateChange?.({ refresh, refreshing })
  }, [onRefreshStateChange, refresh, refreshing])

  const nextMatch = useMemo(
    () => events.find((event) => event.type === 'MATCH' && !event.cancelledAt) ?? null,
    [events],
  )
  const split: RsvpSplit | null = useMemo(() => {
    if (!nextMatch) return null
    const yes = nextMatch.yesCount ?? 0
    const maybe = nextMatch.maybeCount ?? 0
    const no = nextMatch.noCount ?? 0
    const squad = nextMatch.readiness?.metrics.squadSize ?? nextMatch.squadSize ?? 0
    const open = nextMatch.readiness?.metrics.pendingCount ?? Math.max(0, squad - yes - maybe - no)
    return { yes, maybe, no, open }
  }, [nextMatch])

  const answer = useCallback(
    async (status: RsvpStatus, absence?: AbsenceDetail) => {
      if (!nextMatch || pending) return
      const previous = nextMatch.myRsvp
      const patch = (value: RsvpStatus | null) =>
        setEvents((list) => list.map((e) => (e.id === nextMatch.id ? { ...e, myRsvp: value } : e)))
      setPending(true)
      patch(status)
      try {
        await new Promise((resolve) => setTimeout(resolve, RSVP.DEBOUNCE_MS))
        await api(`/clubs/${clubId}/events/${nextMatch.id}/rsvp`, {
          method: 'PUT',
          body: { status, ...(status === 'NO' ? absence : {}) },
        })
        Haptics.success()
      } catch {
        patch(previous)
        Haptics.fail()
        Alert.alert(
          t('event.rsvpFailedTitle', { defaultValue: 'RSVP not saved' }),
          t('event.rsvpFailedBody', {
            defaultValue: 'Could not save your reply. Tap again when you have a connection.',
          }),
        )
      } finally {
        setPending(false)
      }
    },
    [clubId, nextMatch, pending, t],
  )

  const remind = useCallback(async () => {
    if (!nextMatch || nudging) return
    setNudging(true)
    try {
      const result = await api<{ sent: number }>(
        `/clubs/${clubId}/events/${nextMatch.id}/remind-rsvp`,
        { method: 'POST' },
      )
      setNudgedCount(result?.sent ?? split?.open ?? 0)
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setNudgedCount(split?.open ?? 0)
      else
        Alert.alert(
          t('common.errorTitle', { defaultValue: 'Something went wrong' }),
          t('event.rsvpReminderError', { defaultValue: 'Could not send reminders. Please try again.' }),
        )
    } finally {
      setNudging(false)
    }
  }, [clubId, nextMatch, nudging, split?.open, t])

  if (!loaded) return <HomeSkeleton variant={plays ? 'player' : 'coach'} />

  if (error && events.length === 0) {
    return (
      <View style={styles.root}>
        <InlineError
          title={t('homeHub.coach.loadError', { defaultValue: "Couldn't load your team's week" })}
          body={t('states.home.error.body', {
            defaultValue: 'Check your connection and pull down to try again.',
          })}
          onRetry={refresh}
        />
      </View>
    )
  }

  const teamHeader =
    coaches && captain
      ? t('homeHub.combined.asCoachCaptain', { defaultValue: 'As coach and captain' })
      : coaches
        ? t('homeHub.combined.asCoach', { defaultValue: 'As coach' })
        : t('homeHub.combined.asCaptain', { defaultValue: 'As captain' })
  const openCount = split?.open ?? 0
  const draft = nextMatch?.lineupDraft ?? null
  const joinCount = inbox.inbox?.joinRequests.count ?? 0
  const duesCount = inbox.inbox?.overdueDues.count ?? 0

  return (
    <View style={styles.root}>
      {nextMatch && split ? (
        <CombinedHero
          event={nextMatch}
          split={split}
          locale={locale}
          plays={plays}
          pending={pending}
          onRsvp={(status, absence) => void answer(status, absence)}
        />
      ) : (
        <EmptyCard
          icon="calendar"
          title={t('homeHub.coach.emptyTitle', { defaultValue: 'Nothing planned yet' })}
          body={t('homeHub.coach.emptyBody', {
            defaultValue: 'Add a training or a match. Your team sees it straight away and can reply.',
          })}
        />
      )}

      {(coaches || captain) && nextMatch ? (
        <HomeSection title={teamHeader}>
          <HomeCard>
            <NudgeRow
              title={
                nudgedCount != null
                  ? t('homeHub.combined.reminded', {
                      defaultValue: 'Reminder sent to {{count}}',
                      count: nudgedCount,
                    })
                  : openCount > 0
                    ? t('homeHub.coach.openReplies', {
                        defaultValue: "{{count}} haven't replied yet",
                        count: openCount,
                      })
                    : t('homeHub.coach.allReplied', { defaultValue: 'Everyone has replied' })
              }
              canRemind={openCount > 0 && nudgedCount == null}
              loading={nudging}
              onRemind={() => void remind()}
            />
            {coaches ? (
              <HomeRow
                icon="square.grid.3x3"
                title={t('homeHub.coach.setLineup', { defaultValue: 'Set the lineup' })}
                detail={
                  draft?.mySlot
                    ? t('homeHub.combined.mySlot', {
                        defaultValue: "You're in the lineup yourself as {{slot}}",
                        slot: draft.mySlot,
                      })
                    : draft
                      ? t('homeHub.coach.lineupDraft', {
                          defaultValue: 'Draft {{formation}} · {{filled}} of {{slots}}',
                          formation: draft.formation,
                          filled: draft.filled,
                          slots: draft.slots,
                        })
                      : null
                }
                onPress={() =>
                  router.push({ pathname: '/lineup-builder', params: { eventId: nextMatch.id } } as never)
                }
                showDivider
              />
            ) : null}
          </HomeCard>
        </HomeSection>
      ) : null}

      {board ? (
        <HomeSection title={t('homeHub.combined.asBoard', { defaultValue: 'As board member' })}>
          <HomeCard>
            <HomeRow
              icon="person.2"
              title={t('homeHub.combined.joinRequests', {
                defaultValue: '{{count}} join requests',
                count: joinCount,
              })}
              onPress={() => router.push('/notifications' as never)}
            />
            <HomeRow
              icon="creditcard"
              title={t('homeHub.combined.duesOpen', {
                defaultValue: '{{count}} fees open',
                count: duesCount,
              })}
              onPress={() => router.push('/admin-billing' as never)}
              showDivider
            />
          </HomeCard>
        </HomeSection>
      ) : null}
    </View>
  )
}

/** Hero of board 28: kicker with countdown, "Du als Spieler" reply, team bar. */
function CombinedHero({
  event,
  split,
  locale,
  plays,
  pending,
  onRsvp,
}: {
  event: EventFeedItem
  split: RsvpSplit
  locale: string
  plays: boolean
  pending: boolean
  onRsvp: (status: RsvpStatus, absence?: AbsenceDetail) => void
}) {
  const { t } = useTranslation()
  const hero = useHeroColors()
  const venue = event.homeAway
    ? event.homeAway === 'HOME'
      ? t('homeHub.home', { defaultValue: 'Home' })
      : t('homeHub.away', { defaultValue: 'Away' })
    : null
  const countdown = formatCountdown(event.date, Date.now(), locale, t)
  const kicker = [matchKindLabel(event.matchKind, t), venue, countdown].filter(Boolean).join(' · ')
  const versus = event.opponent
    ? t('eventFlow.matchTitleShort.home', { defaultValue: 'vs. {{opponent}}', opponent: event.opponent })
    : event.title
  const segments = [
    { key: 'yes', flex: split.yes, color: hero.fg },
    { key: 'maybe', flex: split.maybe, color: hero.tint(0.45) },
    { key: 'open', flex: split.open, color: hero.tint(0.16) },
  ].filter((segment) => segment.flex > 0)
  const teamLine = t('homeHub.combined.teamLine', {
    defaultValue: 'Team: {{yes}} going · {{maybe}} maybe · {{open}} no reply',
    yes: split.yes,
    maybe: split.maybe,
    open: split.open,
  })
  return (
    <HeroSurface style={styles.hero}>
      <PressableScale
        onPress={() => router.push({ pathname: '/event-detail', params: { eventId: event.id } } as never)}
        accessibilityRole="button"
        accessibilityLabel={[kicker, heroKickoff(event.date, locale), versus].join(', ')}
        haptic="tapLight"
        style={styles.heroBody}
      >
        <Text variant="footnote" weight="semibold" numberOfLines={1} style={{ color: hero.muted }}>
          {kicker}
        </Text>
        <Text variant="display" numberOfLines={1} adjustsFontSizeToFit style={[styles.kickoff, { color: hero.fg }]}>
          {heroKickoff(event.date, locale)}
        </Text>
        <Text variant="headline" weight="semibold" numberOfLines={2} style={[styles.versus, { color: hero.fg }]}>
          {versus}
        </Text>
      </PressableScale>
      {plays ? (
        <View style={styles.block}>
          <Text variant="caption1" weight="semibold" style={{ color: hero.muted }}>
            {t('homeHub.combined.asPlayer', { defaultValue: 'You as a player' })}
          </Text>
          <HeroRsvp
            value={event.myRsvp}
            onChange={onRsvp}
            disabled={pending}
            contextLabel={`${heroKickoff(event.date, locale).split(' ')[0]} ${versus}`}
            accessibilityLabel={t('homeHub.hero.yourReply', { defaultValue: 'Your reply' })}
            testID="combined-hero-rsvp"
          />
        </View>
      ) : null}
      <View style={styles.block} accessible accessibilityLabel={teamLine}>
        <View style={[styles.bar, segments.length === 0 && { backgroundColor: hero.tint(0.16) }]}>
          {segments.map((segment) => (
            <View key={segment.key} style={{ flex: segment.flex, backgroundColor: segment.color }} />
          ))}
        </View>
        <Text variant="footnote" style={{ color: hero.muted }}>
          {teamLine}
        </Text>
      </View>
    </HeroSurface>
  )
}

function NudgeRow({
  title,
  canRemind,
  loading,
  onRemind,
}: {
  title: string
  canRemind: boolean
  loading: boolean
  onRemind: () => void
}) {
  const c = useClubColors()
  const isDark = useIsDark()
  const { t } = useTranslation()
  return (
    <View style={styles.nudgeRow}>
      <View style={[styles.well, { backgroundColor: c.surfaceMuted }]}>
        <Icon name="bubble" size={18} color={c.textPrimary} />
      </View>
      <Text variant="subheadline" weight="semibold" color="primary" style={styles.nudgeTitle}>
        {title}
      </Text>
      {canRemind ? (
        <Button
          label={t('homeHub.coach.remindShort', { defaultValue: 'Remind' })}
          onPress={onRemind}
          loading={loading}
          variant="accent"
          size="sm"
          testID="combined-remind"
        />
      ) : (
        <Icon name="checkmark" size={20} color={isDark ? c.accent : c.primary} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Board 28: 20pt between blocks.
  root: { gap: SPACING_XL },
  hero: { gap: space.md + 2 },
  heroBody: { gap: SPACING_XS + SPACING_XXS },
  kickoff: { fontSize: 50 },
  versus: { fontSize: 16 },
  block: { gap: space.sm },
  bar: { flexDirection: 'row', height: 6, borderRadius: RADIUS_FULL, overflow: 'hidden', gap: SPACING_XXS },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + SPACING_XXS,
    paddingVertical: SPACING_MD,
    minHeight: 60,
  },
  well: {
    width: 40,
    height: 40,
    borderRadius: SPACING_MD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeTitle: { flex: 1, fontSize: 15 },
})
