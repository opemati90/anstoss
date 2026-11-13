import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors, useIsDark } from '../src/context/ClubThemeContext'
import { useReducedMotion } from '../src/hooks/useReducedMotion'
import { useMatchTokens } from '../src/theme/matchTokens'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { BottomSheet, Button, Icon, IconButton, Text } from '../src/components/ui'
import {
  elevation,
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  RADIUS_INPUT,
  RADIUS_LG,
  RADIUS_SM,
  RADIUS_XL,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXS,
  SPACING_XXXL,
} from '../src/theme/tokens'
import { hexToRgba } from '../src/theme/club-theme'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import {
  FORMATIONS,
  type FormationSlot,
  type SquadPlayer,
  fairnessScore,
  suggestLineup,
} from '../src/lib/lineupFairness'
import { buildLineupShareText } from '../src/lib/lineupShareText'
import type { EventDetail, EventFeedItem, EventLineup, EventSquad } from '@anstoss/shared'
import { eventDisplayTitle } from '../src/components/events/eventFormat'
import { getAppLanguage, getAppLocale } from '../src/i18n'

// Design 14's four formation tabs, in its order.
const FORMATION_OPTIONS = ['4-2-3-1', '4-4-2', '4-3-3', '3-5-2'] as const
type FormationKey = (typeof FORMATION_OPTIONS)[number]

const withAlpha = hexToRgba

export default function LineupBuilderScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId } = useAuth()
  const c = useClubColors()
  const isDark = useIsDark()
  const reduceMotion = useReducedMotion()
  const matchTokens = useMatchTokens()
  const insets = useSafeAreaInsetsSafe()
  const { height: windowHeight } = useWindowDimensions()
  const params = useLocalSearchParams<{
    eventId?: string | string[]
    teamId?: string | string[]
  }>()
  const routeEventId = typeof params.eventId === 'string' ? params.eventId : null
  const routeTeamId = typeof params.teamId === 'string' ? params.teamId : null
  const clubId = activeClub?.club.id
  // The lineup belongs to a match event. Older entry points pass only a team;
  // they get that team's next match.
  const [event, setEvent] = useState<EventDetail | null>(null)
  const eventId = event?.id ?? routeEventId
  const teamId = event?.teamId ?? routeTeamId ?? activeTeamId

  const [squad, setSquad] = useState<SquadPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formation, setFormation] = useState<FormationKey>('4-2-3-1')
  // A bench player held (long press) to put on the pitch with the next slot tap.
  const [armed, setArmed] = useState<string | null>(null)
  const [xi, setXi] = useState<Record<string, string>>({})
  const [bench, setBench] = useState<string[]>([])
  const [pickerSlot, setPickerSlot] = useState<FormationSlot | null>(null)
  const [hintDismissed, setHintDismissed] = useState(false)
  const [hint, setHint] = useState<SquadPlayer | null>(null)
  const hintScale = useRef(new Animated.Value(0.97)).current

  // Pop the fairness hint into view with a tiny scale-up so it earns
  // attention without feeling shouty.
  useEffect(() => {
    if (hint && !hintDismissed) {
      if (reduceMotion) {
        hintScale.setValue(1)
        return
      }
      hintScale.setValue(0.97)
      Animated.timing(hintScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start()
    }
  }, [hint, hintDismissed, hintScale, reduceMotion])

  const [savedLineup, setSavedLineup] = useState<EventLineup | null>(null)

  const fetchSquad = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      // 1. Resolve the match event.
      let resolvedId = routeEventId
      if (!resolvedId && (routeTeamId ?? activeTeamId)) {
        const next = await api<EventFeedItem[]>(
          `/clubs/${clubId}/events?teamId=${routeTeamId ?? activeTeamId}&type=MATCH&scope=upcoming&limit=1`,
        ).catch(() => [] as EventFeedItem[])
        resolvedId = next[0]?.id ?? null
      }
      const detail = resolvedId
        ? await api<EventDetail>(`/clubs/${clubId}/events/${resolvedId}`).catch(() => null)
        : null
      setEvent(detail)
      const squadTeamId = detail?.teamId ?? routeTeamId ?? activeTeamId
      if (!squadTeamId) {
        setSquad([])
        return
      }
      // 2. Fairness stats for the whole team, then narrow to the Kader
      //    (nominated players; before publishing, everyone who said yes).
      const [stats, kader, lineup] = await Promise.all([
        api<SquadPlayer[]>(`/clubs/${clubId}/teams/${squadTeamId}/squad-stats`).catch(
          () => [] as SquadPlayer[],
        ),
        detail
          ? api<EventSquad>(`/clubs/${clubId}/events/${detail.id}/squad`).catch(() => null)
          : Promise.resolve(null),
        detail
          ? api<EventLineup | null>(`/clubs/${clubId}/events/${detail.id}/lineup`).catch(() => null)
          : Promise.resolve(null),
      ])
      const poolIds = kader
        ? kader.nominatedUserIds.length
          ? new Set(kader.nominatedUserIds)
          : new Set(kader.candidates.filter((m) => m.rsvp === 'YES').map((m) => m.userId))
        : null
      const statsById = new Map((stats ?? []).map((player) => [player.userId, player]))
      const pool: SquadPlayer[] =
        poolIds && poolIds.size > 0
          ? Array.from(poolIds).map(
              (userId) =>
                statsById.get(userId) ?? {
                  userId,
                  name:
                    kader?.candidates.find((m) => m.userId === userId)?.name ??
                    detail?.members.find((m) => m.userId === userId)?.name ??
                    '',
                  jerseyNumber:
                    kader?.candidates.find((m) => m.userId === userId)?.jerseyNumber ?? null,
                  position: 'MID',
                  attendance: 0.5,
                  minutesShare: 0.5,
                  unavailable: false,
                },
            )
          : (stats ?? [])
      setSquad(pool.filter((player) => player.name))
      setSavedLineup(lineup ?? null)
    } catch {
      setSquad([])
    } finally {
      setLoading(false)
    }
  }, [activeTeamId, clubId, routeEventId, routeTeamId])

  useEffect(() => {
    void fetchSquad()
  }, [fetchSquad])

  const slots = FORMATIONS[formation]

  const playersById = useMemo(() => new Map(squad.map((p) => [p.userId, p])), [squad])

  const applySuggestion = useCallback(() => {
    const result = suggestLineup(formation, squad)
    if (!result) return
    setXi(result.xi)
    setBench(result.bench)
    setHint(result.rotationHint)
    setHintDismissed(false)
  }, [formation, squad])

  // Auto-fill on first load: a saved lineup wins, otherwise the fair
  // suggestion. Later formation changes are the coach's call.
  useEffect(() => {
    if (squad.length === 0 || Object.keys(xi).length > 0) return
    if (savedLineup && (FORMATION_OPTIONS as readonly string[]).includes(savedLineup.formation)) {
      const key = savedLineup.formation as FormationKey
      const restored: Record<string, string> = {}
      for (const player of savedLineup.starters) {
        if (player.slotId && player.userId && squad.some((p) => p.userId === player.userId)) {
          restored[player.slotId] = player.userId
        }
      }
      if (Object.keys(restored).length > 0) {
        setFormation(key)
        setXi(restored)
        setBench(
          savedLineup.bench
            .map((player) => player.userId)
            .filter((id): id is string => Boolean(id) && squad.some((p) => p.userId === id)),
        )
        return
      }
    }
    applySuggestion()
    // intentional partial deps
  }, [squad.length, savedLineup])

  // When formation changes, drop slots that don't exist in the new
  // formation but keep the player assignments where slot ids match.
  useEffect(() => {
    setXi((prev) => {
      const next: Record<string, string> = {}
      for (const slot of slots) {
        if (prev[slot.id]) next[slot.id] = prev[slot.id]
      }
      return next
    })
    // intentional partial deps
  }, [formation])

  const usedIds = useMemo(() => new Set(Object.values(xi)), [xi])

  const eligibleForSlot = useCallback(
    (slot: FormationSlot | null): SquadPlayer[] => {
      if (!slot) return []
      const sameSlotId = xi[slot.id]
      return squad
        .slice()
        .sort((a, b) => {
          // pinned: same-position candidates first, then fairness desc.
          const aSame = a.position === slot.position ? 1 : 0
          const bSame = b.position === slot.position ? 1 : 0
          if (aSame !== bSame) return bSame - aSame
          return fairnessScore(b) - fairnessScore(a)
        })
        .filter((p) => !usedIds.has(p.userId) || p.userId === sameSlotId)
    },
    [squad, xi, usedIds],
  )

  const assignToSlot = (slotId: string, userId: string) => {
    setXi((prev) => {
      const next = { ...prev }
      // If this player is already in another slot, swap.
      const previousSlot = Object.keys(next).find((sid) => next[sid] === userId)
      if (previousSlot) delete next[previousSlot]
      next[slotId] = userId
      return next
    })
    setBench((b) => b.filter((id) => id !== userId))
  }

  const clearSlot = (slotId: string) => {
    setXi((prev) => {
      const next = { ...prev }
      delete next[slotId]
      return next
    })
  }

  const toggleBench = (userId: string) => {
    if (usedIds.has(userId)) return
    setBench((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId].slice(0, 7),
    )
  }

  const startersFilled = Object.keys(xi).length
  const isComplete = startersFilled === 11

  const [shareSheetOpen, setShareSheetOpen] = useState(false)

  const buildShareText = useCallback(() => {
    return buildLineupShareText(
      {
        fixtureTitle: event ? eventDisplayTitle(event, t) : null,
        whenLabel: event
          ? new Intl.DateTimeFormat(getAppLocale(getAppLanguage()), {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: '2-digit', hourCycle: 'h23',
              minute: '2-digit',
            }).format(new Date(event.date))
          : null,
        formation,
        xi,
        bench,
        squad,
      },
      {
        title: t('lineup.shareTitleFallback', {
          defaultValue: 'Lineup',
        }),
        formation: t('lineup.shareFormationLabel', {
          defaultValue: 'Formation',
        }),
        startingXi: t('lineup.shareXiLabel', {
          defaultValue: 'Starting XI',
        }),
        bench: t('lineup.benchLabel', { defaultValue: 'Bench' }),
        sentFrom: t('lineup.shareSignature', {
          defaultValue: 'Sent from Anstoss',
        }),
      },
    )
  }, [formation, xi, bench, squad, t, event])

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ message: buildShareText() })
    } catch {
      // user cancelled — silent
    }
  }, [buildShareText])

  const saveAndPost = async () => {
    if (!teamId || !clubId) return
    if (!isComplete) {
      Alert.alert(
        t('lineup.incompleteTitle', { defaultValue: 'Incomplete XI' }),
        t('lineup.incompleteBody', {
          defaultValue: 'Fill all 11 starting positions before posting.',
        }),
      )
      return
    }
    setSaving(true)
    try {
      // Persist the lineup on the match event (manual matches included); the
      // API mirrors it onto the imported fixture when the event has one, so
      // the match-detail Lineup tab keeps showing it.
      if (eventId) {
        const starters = slots.flatMap((slot) => {
          const userId = xi[slot.id]
          const player = userId ? playersById.get(userId) : undefined
          return player
            ? [
                {
                  userId: player.userId,
                  number: player.jerseyNumber,
                  name: player.name,
                  position: slot.position,
                  slotId: slot.id,
                },
              ]
            : []
        })
        const benchPayload = bench.flatMap((id) => {
          const player = playersById.get(id)
          return player
            ? [
                {
                  userId: player.userId,
                  number: player.jerseyNumber,
                  name: player.name,
                  position: player.position,
                },
              ]
            : []
        })
        await api(`/clubs/${clubId}/events/${eventId}/lineup`, {
          method: 'PUT',
          body: { formation, starters, bench: benchPayload },
        })
      }

      // Posts the lineup as a pinned ANNOUNCEMENT message in team chat
      // — the API has no separate /lineups resource. The chat handler
      // (apps/api/src/chat/chat.controller.ts:107) accepts this exact
      // shape and serializes the lineup as a LINEUP message_type with
      // attachmentMeta carrying formation and, when available, fixtureId;
      // xi/bench are stringified in content. Without this swap the call
      // 404s and the coach's screen surfaces a generic save-error.
      const messageBody: {
        fixtureId?: string
        formation: FormationKey
        xi: string
      } = {
        formation,
        xi: JSON.stringify({ xi, bench }),
      }
      if (event?.fixtureId) messageBody.fixtureId = event.fixtureId
      await api(`/teams/${teamId}/messages/lineup`, {
        method: 'POST',
        body: messageBody,
      })
      // Open the share-on-success sheet — coach can broadcast wherever
      // they want (WhatsApp, iMessage, mail) on top of the team-channel
      // pin that was just created server-side.
      setShareSheetOpen(true)
    } catch {
      Alert.alert(
        t('common.error'),
        t('lineup.saveError', {
          defaultValue: 'Could not save the lineup. Try again.',
        }),
      )
    } finally {
      setSaving(false)
    }
  }

  // ── Design 13 "Aufstellung": a dark stage with the club-coloured pitch. ──
  // The stage is ink in light mode and the page background in dark mode;
  // copy on it stays light in both. Everything derives from theme tokens.
  const stageBg = isDark ? c.background : c.ink
  const stageFg = isDark ? c.textPrimary : c.onInk
  const stageMuted = c.onHeroMuted
  const stageTile = withAlpha(stageFg, 0.06)
  const stageLine = withAlpha(stageFg, 0.18)
  const pitchFg = c.onPrimary
  const pitchLine = withAlpha(pitchFg, 0.2)
  const chipBg = matchTokens.statusInverseBg
  const chipFg = matchTokens.statusInverseText

  const backLabel = t('common.back')
  const title = t('lineup.title', { defaultValue: 'Lineup' })

  if (loading || !clubId || !teamId) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <ModalHeader title={title} mode="back" onClose={() => router.back()} />
        {loading ? (
          <View style={styles.loadingWrap}>
            <Text variant="footnote" color="secondary">
              {t('common.loading')}
            </Text>
          </View>
        ) : (
          <EmptyState
            icon="person.2"
            title={t('lineup.noTeamTitle', { defaultValue: 'No team selected' })}
            description={t('lineup.noTeamBody', {
              defaultValue: 'Join a team to build and post a lineup.',
            })}
          />
        )}
      </View>
    )
  }

  // Design 14: "So 15.11. · vs. RW Köpenick III".
  const eventLocale = getAppLocale(getAppLanguage())
  const subtitle = event
    ? [
        `${new Intl.DateTimeFormat(eventLocale, { weekday: 'short' })
          .format(new Date(event.date))
          .replace('.', '')} ${new Intl.DateTimeFormat(eventLocale, {
          day: '2-digit',
          month: '2-digit',
        }).format(new Date(event.date))}`,
        event.type === 'MATCH' && event.opponent?.trim()
          ? t(`eventFlow.matchTitleShort.${event.homeAway === 'AWAY' ? 'away' : 'home'}`, {
              opponent: event.opponent.trim(),
            })
          : eventDisplayTitle(event, t),
      ].join(' · ')
    : t('eventFlow.lineup.headlineFallback')
  // Design 14 is one screen: header, tabs, the pitch filling the middle and
  // the bench. The pitch takes what is left (never smaller than 360pt).
  const pitchHeight = Math.max(
    PITCH_MIN,
    windowHeight -
      (insets.top + SPACING_MD + HEADER_ROW + SPACING_LG) -
      (FORMATION_CHIP_HEIGHT + SPACING_LG) -
      (BENCH_HEAD + SPACING_SM + SPACING_XXS + BENCH_TILE_HEIGHT + SPACING_LG) -
      (SPACING_XXXL + insets.bottom),
  )

  const benchPlayers = bench
    .map((id) => playersById.get(id))
    .filter((p): p is SquadPlayer => Boolean(p))
  const pool = squad.filter((p) => !usedIds.has(p.userId) && !bench.includes(p.userId))

  return (
    <View style={[styles.root, { backgroundColor: stageBg }]}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + SPACING_MD }]}>
        <IconButton variant="onHero" onPress={() => router.back()} accessibilityLabel={backLabel}>
          <Icon name="chevron.left" size={20} color={stageFg} />
        </IconButton>
        <View style={styles.headerCopy}>
          <Text
            variant="display"
            style={[styles.headerTitle, { color: stageFg }]}
            accessibilityRole="header"
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text variant="caption1" numberOfLines={1} style={{ color: stageMuted }}>
            {subtitle}
          </Text>
        </View>
        <Button
          label={t('lineup.postToTeam', { defaultValue: 'To the team' })}
          accessibilityLabel={
            isComplete
              ? t('lineup.saveAndPost', { defaultValue: 'Save & post lineup' })
              : t('lineup.fillFirst', {
                  defaultValue: '{{remaining}} more to fill',
                  remaining: 11 - startersFilled,
                })
          }
          variant="accent"
          size="sm"
          leftIcon={<Icon name="square.and.arrow.up" size={16} color={c.onAccent} />}
          loading={saving}
          disabled={saving}
          onPress={saveAndPost}
          style={styles.headerAction}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: SPACING_XXXL + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Formation picker */}
        <View
          style={styles.formationRow}
          accessibilityRole="tablist"
          accessibilityLabel={t('lineup.shareFormationLabel', { defaultValue: 'Formation' })}
        >
          {FORMATION_OPTIONS.map((option) => {
            const active = formation === option
            return (
              <Pressable
                key={option}
                accessibilityRole="tab"
                accessibilityLabel={option}
                accessibilityState={{ selected: active }}
                onPress={() => setFormation(option)}
                hitSlop={{ top: 3, bottom: 3 }}
                style={({ pressed }) => [
                  styles.formationChip,
                  active
                    ? { backgroundColor: stageFg }
                    : { borderWidth: 1, borderColor: stageLine },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  variant="data"
                  style={[styles.formationText, { color: active ? stageBg : stageMuted }]}
                  maxFontSizeMultiplier={1.2}
                >
                  {option}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Pitch */}
        <View style={[styles.pitch, { backgroundColor: c.primary, height: pitchHeight }]}>
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 350 480"
            preserveAspectRatio="none"
            style={StyleSheet.absoluteFill}
            fill="none"
            stroke={pitchLine}
            strokeWidth={1.5}
          >
            <Rect x={12} y={12} width={326} height={456} rx={6} />
            <Path d="M12 240h326" />
            <Circle cx={175} cy={240} r={44} />
            <Rect x={95} y={12} width={160} height={64} />
            <Rect x={140} y={12} width={70} height={22} />
            <Rect x={95} y={404} width={160} height={64} />
            <Rect x={140} y={446} width={70} height={22} />
          </Svg>

          {slots.map((slot) => {
            const userId = xi[slot.id]
            const player = userId ? playersById.get(userId) : null
            const filled = !!player
            const top = Math.min(92, Math.max(9, 96 - slot.depth * 100))
            return (
              <Pressable
                key={slot.id}
                accessibilityRole="button"
                accessibilityLabel={
                  filled
                    ? t('lineup.slotFilled', {
                        defaultValue: '{{name}} at {{slot}}',
                        name: player!.name,
                        slot: slot.id,
                      })
                    : t('lineup.slotEmpty', {
                        defaultValue: 'Empty {{slot}} · tap to assign',
                        slot: slot.id,
                      })
                }
                onPress={() => {
                  if (armed) {
                    assignToSlot(slot.id, armed)
                    setArmed(null)
                  } else {
                    setPickerSlot(slot)
                  }
                }}
                style={({ pressed }) => [
                  styles.slot,
                  { left: `${slot.lateral * 100}%`, top: `${top}%` },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View
                  style={[
                    styles.slotChip,
                    filled
                      ? [{ backgroundColor: chipBg }, elevation.card]
                      : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: withAlpha(pitchFg, 0.7) },
                  ]}
                >
                  <Text
                    variant="data"
                    style={[styles.slotNumber, { color: filled ? chipFg : pitchFg }]}
                    maxFontSizeMultiplier={1}
                  >
                    {filled
                      ? player?.jerseyNumber != null
                        ? String(player.jerseyNumber)
                        : initialsOf(player!.name)
                      : '+'}
                  </Text>
                </View>
                <Text
                  variant="caption1"
                  weight="semibold"
                  numberOfLines={1}
                  style={[styles.slotName, { color: pitchFg }]}
                  maxFontSizeMultiplier={1.2}
                >
                  {filled ? lastName(player!.name) : t('lineup.openSlot', { defaultValue: 'Open' })}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Bench */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text variant="label" style={{ color: stageMuted }}>
              {t('lineup.benchCount', {
                defaultValue: 'Bench · {{count}}',
                count: benchPlayers.length,
              })}
            </Text>
            <Text variant="caption1" style={{ color: stageMuted }}>
              {benchPlayers.length > 0
                ? armed
                  ? t('lineup.benchArmed', { defaultValue: 'Tap a spot on the pitch' })
                  : t('lineup.benchHold', { defaultValue: 'Hold and move onto the pitch' })
                : null}
            </Text>
          </View>
          {benchPlayers.length === 0 ? (
            <View style={[styles.benchEmpty, { backgroundColor: stageTile }]}>
              <Text variant="footnote" align="center" style={{ color: stageMuted }}>
                {t('lineup.benchEmpty', {
                  defaultValue: 'Tap a player below to add them to the bench.',
                })}
              </Text>
            </View>
          ) : (
            <View style={styles.benchGrid}>
              {benchPlayers.map((p) => (
                <Pressable
                  key={p.userId}
                  accessibilityRole="button"
                  accessibilityLabel={t('lineup.removeFromBench', {
                    defaultValue: 'Remove {{name}}',
                    name: p.name,
                  })}
                  accessibilityHint={t('lineup.benchHold', { defaultValue: 'Hold and move onto the pitch' })}
                  accessibilityState={{ selected: armed === p.userId }}
                  onPress={() => (armed === p.userId ? setArmed(null) : toggleBench(p.userId))}
                  onLongPress={() => setArmed(p.userId)}
                  delayLongPress={300}
                  style={({ pressed }) => [
                    styles.benchTile,
                    { backgroundColor: stageTile },
                    armed === p.userId && { borderWidth: 1.5, borderColor: c.accent },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text variant="data" style={[styles.benchNumber, { color: stageFg }]} maxFontSizeMultiplier={1}>
                    {p.jerseyNumber != null ? String(p.jerseyNumber) : initialsOf(p.name)}
                  </Text>
                  <Text
                    variant="caption1"
                    numberOfLines={1}
                    style={[styles.benchName, { color: stageMuted }]}
                    maxFontSizeMultiplier={1.2}
                  >
                    {lastName(p.name)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Below design 14's first screen: count, share, suggestion, fairness. */}
        <View style={styles.pitchActionRow}>
          <Text variant="caption1" tabular style={{ color: stageMuted }}>
            {t('lineup.startersCount', {
              defaultValue: '{{count}}/11 starters',
              count: startersFilled,
            })}
          </Text>
          <View style={styles.pitchActions}>
            {isComplete ? (
              <Button
                label={t('lineup.shareLineup', { defaultValue: 'Share lineup' })}
                variant="onHero"
                size="sm"
                onPress={handleShare}
              />
            ) : null}
            <Button
              label={t('lineup.suggest', { defaultValue: 'Suggest XI' })}
              variant="onHero"
              size="sm"
              leftIcon={<Icon name="sparkles" size={14} color={stageFg} />}
              onPress={applySuggestion}
            />
          </View>
        </View>

        {/* Fairness hint */}
        {hint && !hintDismissed ? (
          <Animated.View
            style={[
              styles.hintCard,
              { backgroundColor: stageTile, transform: [{ scale: hintScale }] },
            ]}
          >
            <View style={[styles.hintBubble, { backgroundColor: c.accent }]}>
              <Icon name="sparkles" size={14} color={c.onAccent} />
            </View>
            <View style={styles.hintCopy}>
              <Text variant="label" style={{ color: stageMuted }}>
                {t('lineup.fairnessLabel', { defaultValue: 'FAIRNESS BOOST' })}
              </Text>
              <Text variant="footnote" weight="semibold" numberOfLines={2} style={{ color: stageFg }}>
                {t('lineup.rotateInBody', {
                  defaultValue: '{{name}} only played {{pct}}% of available minutes. Rotate in?',
                  name: hint.name,
                  pct: Math.round(hint.minutesShare * 100),
                })}
              </Text>
            </View>
            <IconButton
              onPress={() => setHintDismissed(true)}
              accessibilityLabel={t('common.dismiss', { defaultValue: 'Dismiss' })}
            >
              <Icon name="xmark" size={14} color={stageMuted} />
            </IconButton>
          </Animated.View>
        ) : null}

        {/* Squad pool (people not in XI or bench) */}
        {pool.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" style={{ color: stageMuted }}>
              {t('lineup.squadLabel', { defaultValue: 'SQUAD' })}
            </Text>
            <View style={[styles.poolGroup, { backgroundColor: stageTile }]}>
              {pool.map((p, idx) => (
                <Pressable
                  key={p.userId}
                  accessibilityRole="button"
                  accessibilityLabel={t('lineup.addToBench', {
                    defaultValue: 'Add {{name}} to bench',
                    name: p.name,
                  })}
                  accessibilityState={{ disabled: p.unavailable }}
                  disabled={p.unavailable}
                  onPress={() => toggleBench(p.userId)}
                  style={({ pressed }) => [
                    styles.row,
                    idx < pool.length - 1 && {
                      borderBottomWidth: hairline,
                      borderBottomColor: stageLine,
                    },
                    pressed && { opacity: 0.6 },
                    p.unavailable && { opacity: 0.5 },
                  ]}
                >
                  <View style={[styles.avatar, { backgroundColor: stageTile }]}>
                    <Text variant="data" style={[styles.avatarText, { color: stageFg }]} maxFontSizeMultiplier={1}>
                      {p.jerseyNumber != null ? String(p.jerseyNumber) : initialsOf(p.name)}
                    </Text>
                  </View>
                  <View style={styles.rowCopy}>
                    <Text variant="subheadline" weight="semibold" numberOfLines={1} style={{ color: stageFg }}>
                      {p.name}
                    </Text>
                    <Text variant="caption1" numberOfLines={1} style={{ color: stageMuted }}>
                      {[
                        `${Math.round(p.attendance * 100)}% ${t('lineup.attendShort', { defaultValue: 'att' })}`,
                        `${Math.round(p.minutesShare * 100)}% ${t('lineup.minsShort', { defaultValue: 'mins' })}`,
                        p.position,
                        p.unavailable ? t('lineup.injuredTag', { defaultValue: 'unavailable' }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Icon name="plus" size={18} color={p.unavailable ? stageMuted : c.accent} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Text variant="caption1" align="center" style={{ color: stageMuted }}>
          {t('lineup.footer', {
            defaultValue:
              'Saving posts a pinned lineup announcement to the team channel. Players RSVP-confirm their slot from the post.',
          })}
        </Text>
      </ScrollView>

      {/* Player picker sheet */}
      <BottomSheet visible={!!pickerSlot} onClose={() => setPickerSlot(null)}>
        <View style={styles.pickerInner}>
          <ScrollView
            contentContainerStyle={styles.pickerContent}
            showsVerticalScrollIndicator={false}
          >
            <Text variant="label">
              {t('lineup.pickerEyebrow', {
                defaultValue: 'PICK A PLAYER',
              })}
            </Text>
            <Text variant="title3" color="primary" weight="bold" style={styles.sheetTitle}>
              {pickerSlot?.id} ·{' '}
              {pickerSlot
                ? t(`lineup.position.${pickerSlot.position}`, {
                    defaultValue: pickerSlot.position,
                  })
                : ''}
            </Text>
            <Text variant="footnote" color="secondary" style={styles.sheetBody}>
              {t('lineup.pickerBody', {
                defaultValue:
                  'Sorted by best fit and fairness. Tap to assign. Tap the slot again to clear.',
              })}
            </Text>

            {pickerSlot && xi[pickerSlot.id] ? (
              <Button
                label={t('lineup.clearSlot', { defaultValue: 'Clear this spot' })}
                variant="bordered"
                size="md"
                fullWidth
                leftIcon={<Icon name="xmark" size={14} color={c.error} />}
                onPress={() => {
                  if (pickerSlot) clearSlot(pickerSlot.id)
                  setPickerSlot(null)
                }}
                style={styles.sheetGap}
              />
            ) : null}

            <View style={[styles.sheetGroup, { backgroundColor: c.background }]}>
              {eligibleForSlot(pickerSlot).map((p, idx, arr) => {
                const sameSlot = pickerSlot && xi[pickerSlot.id] === p.userId
                const fits = pickerSlot?.position === p.position
                return (
                  <Pressable
                    key={p.userId}
                    accessibilityRole="button"
                    accessibilityLabel={p.name}
                    accessibilityState={{ disabled: p.unavailable, selected: !!sameSlot }}
                    disabled={p.unavailable}
                    onPress={() => {
                      if (pickerSlot) assignToSlot(pickerSlot.id, p.userId)
                      setPickerSlot(null)
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      idx < arr.length - 1 && {
                        borderBottomWidth: hairline,
                        borderBottomColor: c.borderSubtle,
                      },
                      pressed && { opacity: 0.6 },
                      p.unavailable && { opacity: 0.5 },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: c.surfaceMuted }]}>
                      <Text variant="data" style={styles.avatarText} maxFontSizeMultiplier={1}>
                        {p.jerseyNumber != null ? String(p.jerseyNumber) : initialsOf(p.name)}
                      </Text>
                    </View>
                    <View style={styles.rowCopy}>
                      <Text variant="subheadline" weight="semibold" numberOfLines={1}>
                        {p.name}
                        {sameSlot ? (
                          <Text variant="caption1" color="secondary">
                            {'  ·  '}
                            {t('lineup.currentTag', { defaultValue: 'current' })}
                          </Text>
                        ) : null}
                      </Text>
                      <Text variant="caption1" color="secondary" numberOfLines={1}>
                        {`${Math.round(p.attendance * 100)}% ${t('lineup.attendShort', { defaultValue: 'att' })} · ${Math.round(p.minutesShare * 100)}% ${t('lineup.minsShort', { defaultValue: 'mins' })}`}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.posTag,
                        { backgroundColor: fits ? c.ink : c.surfaceMuted },
                      ]}
                    >
                      <Text
                        variant="caption1"
                        weight="bold"
                        style={{ color: fits ? c.onInk : c.textSecondary }}
                      >
                        {p.position}
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>

            <Button
              label={t('common.cancel')}
              variant="plain"
              size="lg"
              fullWidth
              onPress={() => setPickerSlot(null)}
              style={styles.sheetGap}
            />
          </ScrollView>
        </View>
      </BottomSheet>

      {/* Post-save share sheet — preview text + native share + done */}
      <BottomSheet
        visible={shareSheetOpen}
        onClose={() => {
          setShareSheetOpen(false)
          router.back()
        }}
        heightPct="auto"
      >
        <View style={styles.shareSheetBody}>
          <Text variant="label">
            {t('lineup.shareSheetEyebrow', { defaultValue: 'LINEUP POSTED' })}
          </Text>
          <Text variant="title3" color="primary" weight="bold">
            {t('lineup.shareSheetTitle', {
              defaultValue: 'Pinned in #team · share anywhere?',
            })}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('lineup.shareSheetBody', {
              defaultValue:
                'The team channel already has the announcement. Send to a parents WhatsApp group, family iMessage, or wherever else.',
            })}
          </Text>

          <View style={[styles.sharePreview, { backgroundColor: c.surfaceMuted }]}>
            <Text variant="footnote" numberOfLines={14}>
              {buildShareText()}
            </Text>
          </View>

          <Button
            label={t('lineup.shareNow', { defaultValue: 'Share' })}
            variant="filled"
            size="lg"
            fullWidth
            leftIcon={<Icon name="square.and.arrow.up" size={18} color={c.onInk} />}
            onPress={async () => {
              await handleShare()
            }}
          />
          <Button
            label={t('common.done', { defaultValue: 'Done' })}
            variant="plain"
            size="lg"
            fullWidth
            onPress={() => {
              setShareSheetOpen(false)
              router.back()
            }}
          />
        </View>
      </BottomSheet>
    </View>
  )
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1] ?? name
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

const SLOT_WIDTH = 76
const SLOT_CHIP = 42
const BENCH_TILE_HEIGHT = 58
const FORMATION_CHIP_HEIGHT = 38
const HINT_BUBBLE = 32
const AVATAR = 36
// Design pitch is 350×480 on a 390pt phone.
const PITCH_MIN = 360
const HEADER_ROW = 44
const BENCH_HEAD = 16

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING_LG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: SPACING_LG,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 24 },
  headerAction: { minHeight: 44 },
  content: {
    paddingHorizontal: SCREEN_PADDING,
    gap: SPACING_LG,
  },

  formationRow: { flexDirection: 'row', gap: SPACING_XS + SPACING_XXS },
  formationChip: {
    flex: 1,
    height: FORMATION_CHIP_HEIGHT,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formationText: { fontSize: 17, lineHeight: 20 },

  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingVertical: SPACING_SM,
    paddingLeft: SPACING_LG,
    borderRadius: RADIUS_CARD,
  },
  hintBubble: {
    width: HINT_BUBBLE,
    height: HINT_BUBBLE,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintCopy: { flex: 1, gap: SPACING_XXS },

  pitch: {
    width: '100%',
    borderRadius: RADIUS_XL + SPACING_XS,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  slot: {
    position: 'absolute',
    width: SLOT_WIDTH,
    marginLeft: -SLOT_WIDTH / 2,
    marginTop: -SLOT_CHIP / 2,
    alignItems: 'center',
    gap: SPACING_XS,
  },
  slotChip: {
    width: SLOT_CHIP,
    height: SLOT_CHIP,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotNumber: { fontSize: 19, lineHeight: 22 },
  slotName: { fontSize: 11, lineHeight: 14, textAlign: 'center' },

  pitchActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING_SM,
  },
  pitchActions: { flexDirection: 'row', gap: SPACING_SM },

  section: { gap: SPACING_SM + SPACING_XXS },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING_SM,
  },
  benchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  benchTile: {
    width: '18%',
    flexGrow: 1,
    maxWidth: '19%',
    height: BENCH_TILE_HEIGHT,
    borderRadius: RADIUS_LG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING_XXS,
  },
  benchNumber: { fontSize: 19, lineHeight: 20 },
  benchName: { fontSize: 11, lineHeight: 14, paddingHorizontal: SPACING_XS },
  benchEmpty: {
    paddingVertical: SPACING_LG,
    paddingHorizontal: SPACING_LG,
    borderRadius: RADIUS_LG,
  },

  poolGroup: {
    borderRadius: RADIUS_CARD,
    paddingHorizontal: SPACING_LG,
  },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + SPACING_XXS,
    paddingVertical: SPACING_MD,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: SPACING_XXS },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, lineHeight: 18 },
  posTag: {
    paddingHorizontal: SPACING_SM,
    paddingVertical: SPACING_XS,
    borderRadius: RADIUS_SM,
    minWidth: 40,
    alignItems: 'center',
  },

  pickerInner: { flex: 1 },
  pickerContent: {
    paddingTop: SPACING_LG,
    paddingBottom: SPACING_LG,
    gap: SPACING_SM,
  },
  sheetTitle: { marginTop: SPACING_XXS },
  sheetBody: { marginBottom: SPACING_XS },
  sheetGap: { marginTop: SPACING_SM },
  sheetGroup: {
    borderRadius: RADIUS_CARD,
    paddingHorizontal: SPACING_LG,
    marginTop: SPACING_SM,
  },

  shareSheetBody: {
    paddingTop: SPACING_SM,
    paddingBottom: SPACING_LG,
    gap: SPACING_SM,
  },
  sharePreview: {
    borderRadius: RADIUS_INPUT,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_MD,
  },
})
