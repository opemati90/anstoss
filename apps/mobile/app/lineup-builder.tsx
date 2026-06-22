import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { useMatchTokens } from '../src/theme/matchTokens'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { BottomSheet, Button, Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'
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

const FORMATION_OPTIONS = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '5-3-2'] as const
type FormationKey = (typeof FORMATION_OPTIONS)[number]

const PITCH_ASPECT = 0.78
const TOKEN_SIZE = 36

const withAlpha = hexToRgba

function lastNameInitial(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 3)
  return parts[parts.length - 1].slice(0, 6)
}

export default function LineupBuilderScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId } = useAuth()
  const c = useClubColors()
  const matchTokens = useMatchTokens()
  const insets = useSafeAreaInsetsSafe()
  const params = useLocalSearchParams<{
    fixtureId?: string | string[]
    teamId?: string | string[]
  }>()
  const fixtureId =
    typeof params.fixtureId === 'string' ? params.fixtureId : null
  const routeTeamId =
    typeof params.teamId === 'string' ? params.teamId : null
  const clubId = activeClub?.club.id
  const teamId = routeTeamId ?? activeTeamId

  const [squad, setSquad] = useState<SquadPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formation, setFormation] = useState<FormationKey>('4-3-3')
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
      hintScale.setValue(0.97)
      Animated.timing(hintScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start()
    }
  }, [hint, hintDismissed, hintScale])

  const fetchSquad = useCallback(async () => {
    if (!clubId || !teamId) {
      setLoading(false)
      return
    }
    try {
      const data = await api<SquadPlayer[]>(
        `/clubs/${clubId}/teams/${teamId}/squad-stats`,
      )
      setSquad(data ?? [])
    } catch {
      setSquad([])
    } finally {
      setLoading(false)
    }
  }, [clubId, teamId])

  useEffect(() => {
    void fetchSquad()
  }, [fetchSquad])

  const slots = FORMATIONS[formation]

  const playersById = useMemo(
    () => new Map(squad.map((p) => [p.userId, p])),
    [squad],
  )

  const applySuggestion = useCallback(() => {
    const result = suggestLineup(formation, squad)
    if (!result) return
    setXi(result.xi)
    setBench(result.bench)
    setHint(result.rotationHint)
    setHintDismissed(false)
  }, [formation, squad])

  // Auto-fill XI on first squad load. Subsequent formation changes are
  // handled by the user (or via the explicit "Suggest XI" button).
  useEffect(() => {
    if (squad.length > 0 && Object.keys(xi).length === 0) {
      applySuggestion()
    }
    // intentional partial deps
  }, [squad.length])

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
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId].slice(0, 7),
    )
  }

  const startersFilled = Object.keys(xi).length
  const isComplete = startersFilled === 11

  const [shareSheetOpen, setShareSheetOpen] = useState(false)

  const buildShareText = useCallback(() => {
    return buildLineupShareText(
      {
        fixtureTitle: null,
        whenLabel: null,
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
  }, [formation, xi, bench, squad, t])

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
      // Persist the lineup per-fixture so it shows on the match-detail Lineup
      // tab (fussball.de has no structured amateur lineups → coach-built is the
      // source). Starters are emitted in formation-slot order so the server can
      // place them on the pitch.
      if (fixtureId) {
        const starters = slots.flatMap((slot) => {
          const userId = xi[slot.id]
          const player = userId ? playersById.get(userId) : undefined
          return player
            ? [
                {
                  number: player.jerseyNumber,
                  name: player.name,
                  position: slot.position,
                },
              ]
            : []
        })
        const benchPayload = bench.flatMap((id) => {
          const player = playersById.get(id)
          return player
            ? [
                {
                  number: player.jerseyNumber,
                  name: player.name,
                  position: player.position,
                },
              ]
            : []
        })
        await api(`/fixtures/${fixtureId}/lineup`, {
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
      if (fixtureId) messageBody.fixtureId = fixtureId
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

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <ModalHeader
          title={t('lineup.title', { defaultValue: 'Build XI' })}
          mode="back"
          onClose={() => router.back()}
        />
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      </View>
    )
  }

  if (!clubId || !teamId) {
    return (
      <View style={[styles.root, { backgroundColor: c.background }]}>
        <ModalHeader
          title={t('lineup.title', { defaultValue: 'Build XI' })}
          mode="back"
          onClose={() => router.back()}
        />
        <EmptyState
          icon="person.2"
          title={t('lineup.noTeamTitle', { defaultValue: 'No team selected' })}
          description={t('lineup.noTeamBody', { defaultValue: 'Join a team to build and post a lineup.' })}
        />
      </View>
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('lineup.title', { defaultValue: 'Build XI' })}
        mode="back"
        onClose={() => router.back()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
          {t('lineup.eyebrow', { defaultValue: 'LINEUP · COACH' })}
        </Text>
        <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
          {t('lineup.headline', { defaultValue: "Saturday's starting XI" })}
        </Text>
        <Text variant="footnote" color="secondary" style={styles.subtitle}>
          {t('lineup.body', {
            defaultValue:
              'Tap any spot to pick a player. Suggested XI rotates fairly across attendance and minutes played.',
          })}
        </Text>

        {/* Formation segmented pills */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
          {t('lineup.formationLabel', { defaultValue: 'FORMATION' })}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.formationRow}
        >
          {FORMATION_OPTIONS.map((option) => {
            const active = formation === option
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityLabel={option}
                accessibilityState={{ selected: active }}
                onPress={() => setFormation(option)}
                style={[
                  styles.formationChip,
                  active
                    ? { backgroundColor: c.textPrimary, borderColor: c.textPrimary }
                    : { borderColor: c.borderStrong, backgroundColor: c.surface },
                ]}
              >
                <Text
                  style={[
                    styles.formationChipText,
                    { color: active ? c.textInverse : c.textPrimary },
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* Fairness hint banner — entrance pop + club-color left accent */}
        {hint && !hintDismissed ? (
          <Animated.View
            style={[
              styles.hintCard,
              {
                backgroundColor: withAlpha(c.primary, 0.08),
                borderColor: withAlpha(c.primary, 0.3),
                transform: [{ scale: hintScale }],
              },
            ]}
          >
            <View style={[styles.hintAccent, { backgroundColor: c.primary }]} />
            <View style={[styles.hintBubble, { backgroundColor: c.primary }]}>
              <Icon name="sparkles" size={14} color="inverse" />
            </View>
            <View style={styles.hintCopy}>
              <Text style={[styles.hintLabel, { color: c.primary }]}>
                {t('lineup.fairnessLabel', { defaultValue: 'FAIRNESS BOOST' })}
              </Text>
              <Text variant="footnote" color="primary" weight="semibold" numberOfLines={2}>
                {t('lineup.rotateInBody', {
                  defaultValue:
                    '{{name}} only played {{pct}}% of available minutes — rotate in?',
                  name: hint.name,
                  pct: Math.round(hint.minutesShare * 100),
                })}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.dismiss', { defaultValue: 'Dismiss' })}
              onPress={() => setHintDismissed(true)}
              hitSlop={8}
              style={({ pressed }) => [pressed && { opacity: 0.5 }]}
            >
              <Icon name="xmark" size={14} color={c.textSecondary} />
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Pitch */}
        <View
          style={[
            styles.pitch,
            {
              backgroundColor: matchTokens.pitchFill,
              borderColor: c.borderDefault,
            },
          ]}
        >
          {/* halfway + center circle decorations */}
          <View style={[styles.halfwayLine, { backgroundColor: matchTokens.heroLineStrong }]} />
          <View style={[styles.centerCircle, { borderColor: matchTokens.heroLineStrong }]} />
          <View style={[styles.penaltyArea, styles.penaltyTop, { borderColor: matchTokens.heroLineStrong }]} />
          <View style={[styles.penaltyArea, styles.penaltyBottom, { borderColor: matchTokens.heroLineStrong }]} />

          {slots.map((slot) => {
            const userId = xi[slot.id]
            const player = userId ? playersById.get(userId) : null
            const filled = !!player
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
                        defaultValue: 'Empty {{slot}} — tap to assign',
                        slot: slot.id,
                      })
                }
                onPress={() => setPickerSlot(slot)}
                style={({ pressed }) => [
                  styles.token,
                  {
                    left: `${slot.lateral * 100}%`,
                    bottom: `${slot.depth * 100}%`,
                    backgroundColor: filled ? c.primary : matchTokens.tokenEmptyFill,
                    borderColor: filled ? c.primary : matchTokens.tokenEmptyBorder,
                    transform: [
                      { translateX: -TOKEN_SIZE / 2 },
                      { translateY: TOKEN_SIZE / 2 },
                    ],
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.tokenNumber,
                    { color: filled ? matchTokens.tokenText : matchTokens.tokenEmptyText },
                  ]}
                >
                  {filled
                    ? player?.jerseyNumber != null
                      ? String(player.jerseyNumber)
                      : '·'
                    : slot.id.replace(/[^A-Z]/g, '').slice(0, 3) || '+'}
                </Text>
                {filled ? (
                  <Text
                    style={[
                      styles.tokenName,
                      {
                        color: matchTokens.tokenText,
                        textShadowColor: matchTokens.pitchLabelShadow,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {lastNameInitial(player!.name)}
                  </Text>
                ) : null}
              </Pressable>
            )
          })}
        </View>

        <View style={styles.pitchActionRow}>
          <View style={styles.pitchStatus}>
            <Text variant="caption2" color="tertiary" tabular>
              {t('lineup.startersCount', {
                defaultValue: '{{count}}/11 starters',
                count: startersFilled,
              })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={applySuggestion}
            style={({ pressed }) => [
              styles.suggestBtn,
              { borderColor: c.borderStrong, backgroundColor: c.surface },
              pressed && { opacity: 0.5 },
            ]}
          >
            <Icon name="sparkles" size={12} color={c.textPrimary} />
            <Text style={[styles.suggestBtnText, { color: c.textPrimary }]}>
              {t('lineup.suggest', { defaultValue: 'Suggest XI' })}
            </Text>
          </Pressable>
        </View>

        {/* Bench */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
          {t('lineup.benchLabel', { defaultValue: 'BENCH' })}
          {'  '}
          <Text style={[styles.countTag, { color: c.textTertiary }]}>
            {String(bench.length)}/7
          </Text>
        </Text>
        {bench.length === 0 ? (
          <View
            style={[
              styles.emptyBench,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <Text variant="footnote" color="secondary">
              {t('lineup.benchEmpty', {
                defaultValue: 'Tap a player below to add them to the bench.',
              })}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.list,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            {bench.map((id, idx) => {
              const p = playersById.get(id)
              if (!p) return null
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={t('lineup.removeFromBench', {
                    defaultValue: 'Remove {{name}}',
                    name: p.name,
                  })}
                  onPress={() => toggleBench(id)}
                  style={({ pressed }) => [
                    styles.row,
                    idx > 0 && {
                      borderTopWidth: hairline,
                      borderTopColor: c.borderDefault,
                    },
                    pressed && { backgroundColor: c.surfaceSunken ?? c.background },
                  ]}
                >
                  <PlayerAvatar player={p} c={c} />
                  <View style={styles.rowCopy}>
                    <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <PlayerStatsLine player={p} t={t} c={c} />
                  </View>
                  <View
                    style={[
                      styles.removePill,
                      { borderColor: withAlpha(c.error, 0.4) },
                    ]}
                  >
                    <Icon name="xmark" size={11} color={c.error} />
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}

        {/* Squad pool (people not in XI or bench) */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
          {t('lineup.squadLabel', { defaultValue: 'SQUAD' })}
        </Text>
        <View
          style={[
            styles.list,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
          {squad
            .filter((p) => !usedIds.has(p.userId) && !bench.includes(p.userId))
            .map((p, idx) => (
              <Pressable
                key={p.userId}
                accessibilityRole="button"
                accessibilityLabel={t('lineup.addToBench', {
                  defaultValue: 'Add {{name}} to bench',
                  name: p.name,
                })}
                disabled={p.unavailable}
                onPress={() => toggleBench(p.userId)}
                style={({ pressed }) => [
                  styles.row,
                  idx > 0 && {
                    borderTopWidth: hairline,
                    borderTopColor: c.borderDefault,
                  },
                  pressed && { backgroundColor: c.surfaceSunken ?? c.background },
                  p.unavailable && { opacity: 0.55 },
                ]}
              >
                <PlayerAvatar player={p} c={c} />
                <View style={styles.rowCopy}>
                  <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                    {p.name}
                    {p.unavailable ? (
                      <Text variant="caption2" color="secondary">
                        {'  '}·{'  '}
                        {t('lineup.injuredTag', { defaultValue: 'unavailable' })}
                      </Text>
                    ) : null}
                  </Text>
                  <PlayerStatsLine player={p} t={t} c={c} />
                </View>
                <Icon name="plus" size={14} color={p.unavailable ? c.textTertiary : c.primary} />
              </Pressable>
            ))}
        </View>

        <Text style={[styles.footnote, { color: c.textTertiary }]}>
          {t('lineup.footer', {
            defaultValue:
              'Saving posts a pinned lineup announcement to the team channel. Players RSVP-confirm their slot from the post.',
          })}
        </Text>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: c.background, borderTopColor: c.borderDefault, paddingBottom: space.lg + insets.bottom },
        ]}
      >
        <Button
          label={
            isComplete
              ? t('lineup.saveAndPost', {
                  defaultValue: 'Save & post lineup',
                })
              : t('lineup.fillFirst', {
                  defaultValue: '{{remaining}} more to fill',
                  remaining: 11 - startersFilled,
                })
          }
          variant="filled"
          size="lg"
          fullWidth
          loading={saving}
          disabled={saving || !isComplete}
          onPress={saveAndPost}
        />
        {isComplete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('lineup.shareLineup', {
              defaultValue: 'Share lineup',
            })}
            onPress={handleShare}
            style={({ pressed }) => [
              styles.shareGhost,
              { borderColor: c.borderStrong, backgroundColor: c.surface },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Icon name="square.and.arrow.up" size={12} color={c.textPrimary} />
            <Text style={[styles.shareGhostText, { color: c.textPrimary }]}>
              {t('lineup.shareLineup', { defaultValue: 'Share lineup' })}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Player picker sheet */}
      <BottomSheet visible={!!pickerSlot} onClose={() => setPickerSlot(null)}>
          <View style={styles.pickerInner}>
            <ScrollView
              contentContainerStyle={styles.pickerContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
                {t('lineup.pickerEyebrow', {
                  defaultValue: 'PICK A PLAYER',
                })}
              </Text>
              <Text variant="title2" color="primary" weight="semibold" style={styles.title}>
                {pickerSlot?.id} ·{' '}
                {pickerSlot
                  ? t(`lineup.position.${pickerSlot.position}`, {
                      defaultValue: pickerSlot.position,
                    })
                  : ''}
              </Text>
              <Text variant="footnote" color="secondary" style={styles.subtitle}>
                {t('lineup.pickerBody', {
                  defaultValue:
                    'Sorted by best fit and fairness. Tap to assign. Tap the slot again to clear.',
                })}
              </Text>

              {pickerSlot && xi[pickerSlot.id] ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (pickerSlot) clearSlot(pickerSlot.id)
                    setPickerSlot(null)
                  }}
                  style={({ pressed }) => [
                    styles.clearBtn,
                    { borderColor: withAlpha(c.error, 0.4) },
                    pressed && { opacity: 0.5 },
                  ]}
                >
                  <Icon name="xmark" size={12} color={c.error} />
                  <Text style={[styles.clearBtnText, { color: c.error }]}>
                    {t('lineup.clearSlot', { defaultValue: 'Clear this spot' })}
                  </Text>
                </Pressable>
              ) : null}

              <View
                style={[
                  styles.list,
                  { backgroundColor: c.surface, borderColor: c.borderDefault, marginTop: space.sm },
                ]}
              >
                {eligibleForSlot(pickerSlot).map((p, idx) => {
                  const sameSlot =
                    pickerSlot && xi[pickerSlot.id] === p.userId
                  return (
                    <Pressable
                      key={p.userId}
                      accessibilityRole="button"
                      accessibilityLabel={p.name}
                      disabled={p.unavailable}
                      onPress={() => {
                        if (pickerSlot) assignToSlot(pickerSlot.id, p.userId)
                        setPickerSlot(null)
                      }}
                      style={({ pressed }) => [
                        styles.row,
                        idx > 0 && {
                          borderTopWidth: hairline,
                          borderTopColor: c.borderDefault,
                        },
                        pressed && { backgroundColor: c.surfaceSunken ?? c.background },
                        p.unavailable && { opacity: 0.55 },
                        sameSlot && { backgroundColor: withAlpha(c.primary, 0.08) },
                      ]}
                    >
                      <PlayerAvatar player={p} c={c} />
                      <View style={styles.rowCopy}>
                        <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                          {p.name}
                          {sameSlot ? (
                            <Text variant="caption2" color="primary">
                              {'  '}·{'  '}
                              {t('lineup.currentTag', { defaultValue: 'current' })}
                            </Text>
                          ) : null}
                        </Text>
                        <PlayerStatsLine player={p} t={t} c={c} />
                      </View>
                      <View
                        style={[
                          styles.posBadge,
                          {
                            borderColor:
                              pickerSlot?.position === p.position
                                ? c.primary
                                : c.borderDefault,
                            backgroundColor:
                              pickerSlot?.position === p.position
                                ? withAlpha(c.primary, 0.12)
                                : 'transparent',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.posBadgeText,
                            {
                              color:
                                pickerSlot?.position === p.position
                                  ? c.primary
                                  : c.textSecondary,
                            },
                          ]}
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
                variant="ghost"
                size="lg"
                fullWidth
                onPress={() => setPickerSlot(null)}
                style={{ marginTop: space.md }}
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
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('lineup.shareSheetEyebrow', { defaultValue: 'LINEUP POSTED' })}
          </Text>
          <Text variant="title2" color="primary" weight="semibold" style={styles.title}>
            {t('lineup.shareSheetTitle', {
              defaultValue: 'Pinned in #team — share anywhere?',
            })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('lineup.shareSheetBody', {
              defaultValue:
                'The team channel already has the announcement. Send to a parents WhatsApp group, family iMessage, or wherever else.',
            })}
          </Text>

          <View
            style={[
              styles.sharePreview,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <Text
              style={[styles.sharePreviewText, { color: c.textPrimary }]}
              numberOfLines={14}
            >
              {buildShareText()}
            </Text>
          </View>

          <Button
            label={t('lineup.shareNow', { defaultValue: 'Share' })}
            variant="filled"
            size="lg"
            fullWidth
            onPress={async () => {
              await handleShare()
            }}
          />
          <Button
            label={t('common.done', { defaultValue: 'Done' })}
            variant="ghost"
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

function PlayerAvatar({
  player,
  c,
}: {
  player: SquadPlayer
  c: ReturnType<typeof useClubColors>
}) {
  const initials = player.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: c.surfaceSunken ?? c.background,
          borderColor: c.borderDefault,
        },
      ]}
    >
      {player.jerseyNumber != null ? (
        <Text style={[styles.avatarText, { color: c.textPrimary }]} tabular>
          {String(player.jerseyNumber)}
        </Text>
      ) : (
        <Text style={[styles.avatarText, { color: c.textPrimary }]}>{initials}</Text>
      )}
    </View>
  )
}

function PlayerStatsLine({
  player,
  t,
  c,
}: {
  player: SquadPlayer
  t: ReturnType<typeof useTranslation>['t']
  c: ReturnType<typeof useClubColors>
}) {
  return (
    <View style={styles.statsLine}>
      <Text variant="caption2" color="tertiary" tabular>
        {Math.round(player.attendance * 100)}%{' '}
        {t('lineup.attendShort', { defaultValue: 'att' })}
      </Text>
      <Text style={[styles.statsDot, { color: c.textTertiary }]}>·</Text>
      <Text variant="caption2" color="tertiary" tabular>
        {Math.round(player.minutesShare * 100)}%{' '}
        {t('lineup.minsShort', { defaultValue: 'mins' })}
      </Text>
      <Text style={[styles.statsDot, { color: c.textTertiary }]}>·</Text>
      <Text variant="caption2" color="tertiary">
        {player.position}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'] * 3,
    gap: space.sm,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },

  eyebrow: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: space['2xs'] },
  subtitle: { marginTop: space.xs, lineHeight: 18 },

  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: space.xs,
    marginBottom: -space.xs,
  },
  countTag: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },

  formationRow: {
    paddingVertical: space.xs + space['2xs'],
    paddingRight: space.md,
    gap: space.sm,
  },
  formationChip: {
    paddingHorizontal: space.md - space['2xs'],
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  formationChipText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space['2xs'],
    padding: space.sm + space['2xs'],
    paddingLeft: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginTop: space.xs,
    overflow: 'hidden',
  },
  hintAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  hintBubble: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintCopy: { flex: 1, gap: space['2xs'] },
  hintLabel: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.2,
    fontWeight: '700',
  },

  pitch: {
    width: '100%',
    aspectRatio: PITCH_ASPECT,
    borderRadius: radius.lg,
    borderWidth: hairline,
    overflow: 'hidden',
    position: 'relative',
    marginTop: space.sm,
  },
  halfwayLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
  },
  centerCircle: {
    position: 'absolute',
    width: '22%',
    aspectRatio: 1,
    borderRadius: radius.full,
    borderWidth: 1,
    left: '39%',
    top: '46%',
  },
  penaltyArea: {
    position: 'absolute',
    left: '20%',
    width: '60%',
    height: '14%',
    borderWidth: 1,
  },
  penaltyTop: { top: 0, borderTopWidth: 0 },
  penaltyBottom: { bottom: 0, borderBottomWidth: 0 },
  token: {
    position: 'absolute',
    width: TOKEN_SIZE,
    height: TOKEN_SIZE,
    borderRadius: TOKEN_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenNumber: {
    fontSize: 12,
    fontFamily: fonts.data,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tokenName: {
    position: 'absolute',
    top: TOKEN_SIZE,
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
    width: 60,
    textAlign: 'center',
    textShadowRadius: 2,
  },

  pitchActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
    gap: space.sm + space['2xs'],
  },
  pitchStatus: { flexDirection: 'row', alignItems: 'center', gap: space.xs + space['2xs'] },
  suggestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + space['2xs'],
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  suggestBtnText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  list: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
    marginTop: space.sm,
  },
  emptyBench: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    marginTop: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space['2xs'],
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space['2xs'],
  },
  rowCopy: { flex: 1, gap: space['2xs'] },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontFamily: fonts.data,
    fontWeight: '700',
  },
  statsLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs + space['2xs'] },
  statsDot: { fontSize: 12, fontFamily: fonts.label },

  removePill: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posBadge: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    minWidth: 38,
    alignItems: 'center',
  },
  posBadgeText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  footnote: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },

  footer: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: hairline,
    gap: space.sm,
  },
  shareGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + space['2xs'],
    paddingVertical: space.sm + space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  shareGhostText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  shareSheetBody: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: space.sm,
  },
  sharePreview: {
    borderRadius: radius.md,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
  },
  sharePreviewText: {
    fontSize: 12,
    fontFamily: fonts.data,
    lineHeight: 18,
  },

  pickerInner: { flex: 1 },
  pickerContent: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + space['2xs'],
    paddingVertical: space.sm + space['2xs'],
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: space.sm,
  },
  clearBtnText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
})
