import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { io, type Socket } from 'socket.io-client'
import type {
  EventDetail,
  EventSquadMember,
  MatchLiveEventDto,
  MatchLiveStateDto,
  MatchLiveStatus,
  RecordMatchLiveEvent,
} from '@anstoss/shared'
import { api } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useClubColors } from '../../context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../../utils/useSafeAreaInsetsSafe'
import { Haptics } from '../../utils/haptics'
import { BottomSheet, Button, Icon, Screen, SegmentedControl, Text, type IconName } from '../ui'
import { ErrorState } from '../ErrorState'
import { ModalHeader } from '../ModalHeader'
import { MatchHero } from './MatchHero'
import { TimelineItem, type TimelineEventKind } from './TimelineItem'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_LG,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
  SPACING_XXXL,
} from '../../theme/tokens'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3002'

/** Next clock step and its button label key for each status. */
const NEXT_STEP: Partial<Record<MatchLiveStatus, { status: Exclude<MatchLiveStatus, 'NOT_STARTED'>; key: string; fallback: string }>> = {
  NOT_STARTED: { status: 'FIRST_HALF', key: 'matchLive.record.kickoff', fallback: 'Kick-off' },
  FIRST_HALF: { status: 'HALF_TIME', key: 'matchLive.record.halfTime', fallback: 'Half time' },
  HALF_TIME: { status: 'SECOND_HALF', key: 'matchLive.record.secondHalf', fallback: 'Second half' },
  SECOND_HALF: { status: 'FINISHED', key: 'matchLive.record.fullTime', fallback: 'Full time' },
}

type Picker =
  | { step: 'scorer' }
  | { step: 'card'; colour: 'YELLOW' | 'RED' }
  | { step: 'subOff' }
  | { step: 'subOn'; off: EventSquadMember }

/**
 * Live match recorded by the coach (screen 14), for a MATCH event without a
 * fussball.de feed. Coaches get Tor / Gegentor / Karte / Wechsel and the clock
 * button; everyone else watches the score and timeline update live.
 */
export function RecordedMatchLive({ eventId }: { eventId: string }) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const { activeClub, getToken } = useAuth()
  const clubId = activeClub?.club.id ?? null

  const [state, setState] = useState<MatchLiveStateDto | null>(null)
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<Picker | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const canRecordRef = useRef(false)

  const base = clubId ? `/clubs/${clubId}/events/${eventId}` : null

  const load = useCallback(async () => {
    if (!base) {
      setError(true)
      setLoading(false)
      return
    }
    setError(false)
    try {
      const [live, detail] = await Promise.all([
        api<MatchLiveStateDto>(`${base}/live`),
        api<EventDetail>(base),
      ])
      canRecordRef.current = live.canRecord
      setState(live)
      setEvent(detail)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  // Live updates from other devices (a second coach, or viewers).
  useEffect(() => {
    let socket: Socket | null = null
    let cancelled = false
    void (async () => {
      const token = await getToken().catch(() => null)
      if (cancelled || !token) return
      socket = io(`${API_URL}/live`, { auth: { token }, transports: ['websocket'] })
      socket.emit('live:join', { eventId })
      socket.on('live:match', (next: MatchLiveStateDto) => {
        if (next?.eventId !== eventId) return
        // The broadcast never carries anyone's rights; keep our own.
        setState({ ...next, canRecord: canRecordRef.current })
      })
    })()
    return () => {
      cancelled = true
      socket?.disconnect()
    }
  }, [eventId, getToken])

  // The running minute ticks locally from the recorded clock.
  useEffect(() => {
    if (state?.status !== 'FIRST_HALF' && state?.status !== 'SECOND_HALF') return
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [state?.status])

  const apply = useCallback(
    async (request: () => Promise<MatchLiveStateDto>) => {
      if (busy) return
      setBusy(true)
      try {
        const next = await request()
        canRecordRef.current = next.canRecord
        setState(next)
        setNow(Date.now())
      } catch {
        Alert.alert(
          t('matchLive.record.failedTitle', { defaultValue: 'Not saved' }),
          t('matchLive.record.failedBody', { defaultValue: 'Check your connection and try again.' }),
        )
      } finally {
        setBusy(false)
      }
    },
    [busy, t],
  )

  const record = useCallback(
    (body: RecordMatchLiveEvent) => {
      if (!base) return
      Haptics.success()
      setPicker(null)
      void apply(() => api<MatchLiveStateDto>(`${base}/live/events`, { method: 'POST', body }))
    },
    [apply, base],
  )

  const moveClock = useCallback(
    (status: Exclude<MatchLiveStatus, 'NOT_STARTED'>) => {
      if (!base) return
      const send = () => {
        Haptics.tapMedium()
        void apply(() => api<MatchLiveStateDto>(`${base}/live`, { method: 'PATCH', body: { status } }))
      }
      if (status === 'FINISHED') {
        Alert.alert(
          t('matchLive.record.confirmFullTime', { defaultValue: 'Blow the final whistle?' }),
          t('matchLive.record.confirmFullTimeBody', { defaultValue: 'The team gets the final score.' }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('matchLive.record.fullTime', { defaultValue: 'Full time' }), onPress: send },
          ],
        )
        return
      }
      send()
    },
    [apply, base, t],
  )

  const undo = useCallback(
    (entry: MatchLiveEventDto) => {
      if (!base || !state?.canRecord) return
      Alert.alert(
        t('matchLive.record.undoTitle', { defaultValue: 'Remove this entry?' }),
        undefined,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('matchLive.record.undo', { defaultValue: 'Remove' }),
            style: 'destructive',
            onPress: () =>
              void apply(() =>
                api<MatchLiveStateDto>(`${base}/live/events/${entry.id}`, { method: 'DELETE' }),
              ),
          },
        ],
      )
    },
    [apply, base, state?.canRecord, t],
  )

  // Lineup players first, then the rest of the active squad.
  const players = useMemo<EventSquadMember[]>(() => {
    if (!event) return []
    const lineupIds = new Set(
      [...(event.lineup?.starters ?? []), ...(event.lineup?.bench ?? [])]
        .map((p) => p.userId)
        .filter(Boolean) as string[],
    )
    return [...event.members].sort(
      (a, b) => Number(lineupIds.has(b.userId)) - Number(lineupIds.has(a.userId)) || a.name.localeCompare(b.name),
    )
  }, [event])

  if (loading) {
    return (
      <Screen scroll={false} padded={false} header={<ModalHeader mode="back" onClose={() => router.back()} />}>
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
        </View>
      </Screen>
    )
  }

  if (error || !state || !event) {
    return (
      <Screen scroll={false} padded={false} header={<ModalHeader mode="back" onClose={() => router.back()} />}>
        <ErrorState
          message={t('matchLive.unavailableTitle', { defaultValue: 'Match unavailable' })}
          onRetry={() => {
            setLoading(true)
            void load()
          }}
          fillContainer
        />
      </Screen>
    )
  }

  // Design 15 names the club ("SV Spreewiese"), not the squad.
  const ourName = activeClub?.club.name || event.team?.name || ''
  const theirName = state.opponent ?? event.opponent ?? ''
  const homeAway = state.homeAway ?? event.homeAway ?? null
  const ownSide: 'home' | 'away' = homeAway === 'AWAY' ? 'away' : 'home'
  // Same score from our side, mapped by the event's home/away when the live
  // state does not carry it.
  const scoreHome = ownSide === 'away' ? state.goalsAgainst : state.goalsFor
  const scoreAway = ownSide === 'away' ? state.goalsFor : state.goalsAgainst
  const [homeName, awayName] = ownSide === 'away' ? [theirName, ourName] : [ourName, theirName]
  const theirColor = state.opponentColor ?? null
  const heroStatus =
    state.status === 'NOT_STARTED' ? 'scheduled' : state.status === 'FINISHED' ? 'final' : 'live'
  const minute = liveMinute(state, now)
  const running = state.status !== 'NOT_STARTED' && state.status !== 'FINISHED'
  const next = NEXT_STEP[state.status]
  const canRecord = state.canRecord
  const showFooter = canRecord && Boolean(next)

  const timeline = state.events.map((entry) => toTimeline(entry, ownSide, theirName, t))

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: (showFooter ? SPACING_XXXL * 3 : SPACING_XXXL) + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <MatchHero
          home={{ name: homeName, color: ownSide === 'away' ? theirColor : null }}
          away={{ name: awayName, color: ownSide === 'away' ? null : theirColor }}
          status={heroStatus}
          scoreHome={scoreHome}
          scoreAway={scoreAway}
          minute={running ? minute ?? undefined : undefined}
          stage={
            state.status === 'HALF_TIME'
              ? t('matchLive.record.halfTimeShort', { defaultValue: 'Half time' })
              : undefined
          }
          onBack={() => router.back()}
        />

        <View style={styles.body}>
          {canRecord && state.status !== 'NOT_STARTED' ? (
            <View style={styles.actions} testID="live-actions">
              <ActionTile
                title={t('matchLive.record.goal', { defaultValue: 'Goal' })}
                subtitle={t('matchLive.record.forUs', { defaultValue: 'for us' })}
                tone="accent"
                disabled={busy}
                onPress={() => setPicker({ step: 'scorer' })}
                testID="live-goal"
              />
              <ActionTile
                title={t('matchLive.kind.conceded', { defaultValue: 'Goal against' })}
                subtitle={t('matchLive.record.forThem', { defaultValue: 'for the opponent' })}
                tone="outline"
                disabled={busy}
                onPress={() => record({ kind: 'CONCEDED' })}
                testID="live-conceded"
              />
              <ActionTile
                title={t('matchLive.record.card', { defaultValue: 'Card' })}
                tone="outline"
                compact
                disabled={busy}
                onPress={() => setPicker({ step: 'card', colour: 'YELLOW' })}
                testID="live-card"
              />
              <ActionTile
                title={t('matchLive.kind.sub', { defaultValue: 'Substitution' })}
                icon="arrow.left.arrow.right"
                tone="outline"
                compact
                disabled={busy}
                onPress={() => setPicker({ step: 'subOff' })}
                testID="live-sub"
              />
            </View>
          ) : null}

          <Text variant="label" accessibilityRole="header">
            {t('matchLive.timeline', { defaultValue: 'Match events' })}
          </Text>
          <View style={[styles.group, { backgroundColor: c.surface }]}>
            {timeline.length === 0 ? (
              <View style={styles.empty}>
                <Text variant="footnote" color="secondary" align="center">
                  {state.status === 'NOT_STARTED'
                    ? t('matchLive.notStarted', { defaultValue: 'Kick-off hasn’t happened yet. Check back at match time.' })
                    : state.status === 'FINISHED'
                      ? t('matchLive.ended', { defaultValue: 'Full time. No live events were recorded.' })
                      : t('matchLive.waiting', { defaultValue: 'Waiting for the next event…' })}
                </Text>
              </View>
            ) : (
              timeline.map((item, i) => (
                <Pressable
                  key={item.entry.id}
                  disabled={!canRecord}
                  onLongPress={() => undo(item.entry)}
                  accessibilityRole={canRecord ? 'button' : undefined}
                  accessibilityLabel={`${item.entry.minute}'. ${item.player}`}
                  accessibilityHint={
                    canRecord ? t('matchLive.record.undoHint', { defaultValue: 'Long press to remove' }) : undefined
                  }
                >
                  <TimelineItem
                    minute={item.entry.minute}
                    kind={item.kind}
                    player={item.player}
                    detail={item.detail}
                    side={item.side}
                    ownSide={ownSide}
                    isLast={i === timeline.length - 1}
                  />
                </Pressable>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {showFooter && next ? (
        <View
          style={[
            styles.footer,
            { backgroundColor: c.background, borderTopColor: c.borderDefault, paddingBottom: SPACING_XL + insets.bottom / 2 },
          ]}
        >
          <Button
            label={t(next.key, { defaultValue: next.fallback })}
            variant={state.status === 'NOT_STARTED' ? 'accent' : 'filled'}
            size="lg"
            fullWidth
            loading={busy}
            onPress={() => moveClock(next.status)}
            testID="live-clock"
          />
        </View>
      ) : null}

      <BottomSheet visible={picker !== null} onClose={() => setPicker(null)} heightPct={70}>
        {picker ? (
          <PlayerPicker
            picker={picker}
            players={players}
            onColour={(colour) => setPicker({ step: 'card', colour })}
            onPick={(player) => {
              if (picker.step === 'scorer') {
                record(player ? { kind: 'GOAL', playerUserId: player.userId } : { kind: 'GOAL' })
              } else if (picker.step === 'card') {
                if (player) record({ kind: picker.colour, playerUserId: player.userId })
              } else if (picker.step === 'subOff') {
                if (player) setPicker({ step: 'subOn', off: player })
              } else if (player) {
                record({ kind: 'SUB', playerUserId: player.userId, relatedUserId: picker.off.userId })
              }
            }}
          />
        ) : null}
      </BottomSheet>
    </Screen>
  )
}

function ActionTile({
  title,
  subtitle,
  icon,
  tone,
  compact,
  disabled,
  onPress,
  testID,
}: {
  title: string
  subtitle?: string
  icon?: IconName
  tone: 'accent' | 'outline'
  compact?: boolean
  disabled?: boolean
  onPress: () => void
  testID?: string
}) {
  const c = useClubColors()
  const accent = tone === 'accent'
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.tile,
        compact ? styles.tileCompact : styles.tileLarge,
        accent
          ? { backgroundColor: c.accent }
          : { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.borderStrong },
        (pressed || disabled) && { opacity: 0.7 },
      ]}
    >
      <View style={styles.tileTitle}>
        {icon ? <Icon name={icon} size={18} color={c.textPrimary} /> : null}
        <Text
          variant="callout"
          weight="bold"
          color={accent ? c.onAccent : c.textPrimary}
          style={subtitle ? styles.tileTitleLarge : undefined}
        >
          {title}
        </Text>
      </View>
      {subtitle ? (
        <Text variant="caption1" weight="medium" color={accent ? c.onAccent : c.textSecondary}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  )
}

function PlayerPicker({
  picker,
  players,
  onPick,
  onColour,
}: {
  picker: Picker
  players: EventSquadMember[]
  onPick: (player: EventSquadMember | null) => void
  onColour: (colour: 'YELLOW' | 'RED') => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const title =
    picker.step === 'scorer'
      ? t('matchLive.record.whoScored', { defaultValue: 'Who scored?' })
      : picker.step === 'card'
        ? t('matchLive.record.whoBooked', { defaultValue: 'Who got the card?' })
        : picker.step === 'subOff'
          ? t('matchLive.record.whoOff', { defaultValue: 'Who comes off?' })
          : t('matchLive.record.whoOn', { defaultValue: 'Who comes on for {{name}}?', name: picker.off.name })
  const list = picker.step === 'subOn' ? players.filter((p) => p.userId !== picker.off.userId) : players

  return (
    <View style={styles.sheet}>
      <Text variant="title3" accessibilityRole="header">
        {title}
      </Text>
      {picker.step === 'card' ? (
        <SegmentedControl
          segments={[
            { key: 'YELLOW', label: t('matchLive.kind.yellow', { defaultValue: 'Yellow' }) },
            { key: 'RED', label: t('matchLive.kind.red', { defaultValue: 'Red' }) },
          ]}
          value={picker.colour}
          onChange={(key) => onColour(key as 'YELLOW' | 'RED')}
        />
      ) : null}
      <ScrollView style={styles.sheetList} contentContainerStyle={{ gap: SPACING_XS }}>
        {picker.step === 'scorer' ? (
          <PickerRow label={t('matchLive.record.noScorer', { defaultValue: 'Without a name' })} onPress={() => onPick(null)} muted />
        ) : null}
        {list.map((player) => (
          <PickerRow
            key={player.userId}
            label={player.name}
            number={player.jerseyNumber ?? null}
            onPress={() => onPick(player)}
          />
        ))}
        {list.length === 0 ? (
          <Text variant="footnote" color="secondary">
            {t('homeHub.coach.squadEmpty', { defaultValue: 'No players in the squad yet' })}
          </Text>
        ) : null}
      </ScrollView>
      <View style={[styles.sheetDivider, { backgroundColor: c.borderSubtle }]} />
    </View>
  )
}

function PickerRow({
  label,
  number,
  muted,
  onPress,
}: {
  label: string
  number?: number | null
  muted?: boolean
  onPress: () => void
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.pickRow, { backgroundColor: pressed ? c.surfaceMuted : c.surface }]}
    >
      <Text variant="data" color={c.textSecondary} style={styles.pickNumber}>
        {number != null ? String(number) : ''}
      </Text>
      <Text variant="subheadline" weight="semibold" color={muted ? 'secondary' : 'primary'} style={styles.pickName}>
        {label}
      </Text>
    </Pressable>
  )
}

/** The running minute, ticking locally between server updates. */
export function liveMinute(state: MatchLiveStateDto, now: number): number | null {
  const since = (iso: string | null) =>
    iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) + 1 : 0
  if (state.status === 'FIRST_HALF') return Math.min(130, since(state.kickoffAt))
  if (state.status === 'SECOND_HALF') return Math.min(130, 45 + since(state.secondHalfAt))
  return state.minute
}

function toTimeline(
  entry: MatchLiveEventDto,
  ownSide: 'home' | 'away',
  opponent: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): { entry: MatchLiveEventDto; kind: TimelineEventKind; player: string; detail?: string; side: 'home' | 'away' } {
  const theirSide = ownSide === 'home' ? 'away' : 'home'
  const anonymous = t('matchLive.record.unnamed', { defaultValue: 'Unknown player' })
  switch (entry.kind) {
    case 'GOAL':
      return {
        entry,
        kind: 'goal',
        player: entry.playerName ?? anonymous,
        side: ownSide,
      }
    case 'CONCEDED':
      return { entry, kind: 'goal', player: opponent || anonymous, side: theirSide }
    case 'YELLOW':
      return { entry, kind: 'yellow', player: entry.playerName ?? anonymous, side: ownSide }
    case 'RED':
      return { entry, kind: 'red', player: entry.playerName ?? anonymous, side: ownSide }
    case 'SUB':
      return {
        entry,
        kind: 'sub',
        player: entry.playerName ?? anonymous,
        detail: entry.relatedName
          ? t('matchLive.record.subFor', { defaultValue: 'for {{name}}', name: entry.relatedName })
          : undefined,
        side: ownSide,
      }
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: SCREEN_PADDING, paddingTop: SPACING_XL, gap: SPACING_MD },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM + 2, marginBottom: SPACING_SM },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  tileLarge: { minHeight: 64, borderRadius: RADIUS_CARD },
  tileTitle: { flexDirection: 'row', alignItems: 'center', gap: SPACING_SM },
  // Design 15: "Tor" / "Gegentor" 16/700 over a 12pt line.
  tileTitleLarge: { fontSize: 16 },
  tileCompact: { minHeight: 52, borderRadius: RADIUS_LG },
  group: { borderRadius: RADIUS_CARD, borderCurve: 'continuous', paddingHorizontal: SPACING_LG },
  empty: { paddingVertical: SPACING_XL },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: SPACING_MD,
    borderTopWidth: hairline,
  },
  sheet: { gap: SPACING_MD, flex: 1 },
  sheetList: { flexGrow: 0 },
  sheetDivider: { height: hairline },
  pickRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SPACING_LG,
    borderRadius: RADIUS_LG,
    borderCurve: 'continuous',
  },
  pickNumber: { width: 32 },
  pickName: { flex: 1 },
})
