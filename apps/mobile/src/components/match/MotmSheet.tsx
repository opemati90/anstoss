/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { BottomSheet, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'
import type { RosterOpsMemberSummary } from '@anstoss/shared'

export type MotmTally = {
  fixtureId: string
  totalVotes: number
  results: Array<{ userId: string; name: string; votes: number; pct: number }>
  myVoteUserId: string | null
  closesAt: string | null
}

export type MotmSheetProps = {
  visible: boolean
  squad: RosterOpsMemberSummary[]
  tally: MotmTally | null
  onVote: (userId: string) => Promise<void>
  onClose: () => void
}

export function MotmSheet({ visible, squad, tally, onVote, onClose }: MotmSheetProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) setPendingId(null)
  }, [visible])

  // Merge squad + tally so we always show every player even if no votes yet.
  const rows = useMemo(() => {
    const tallyByUser = new Map(
      (tally?.results ?? []).map((r) => [r.userId, r]),
    )
    return squad.map((m) => {
      const t = tallyByUser.get(m.userId)
      return {
        userId: m.userId,
        name: m.name,
        avatarUrl: m.avatarUrl,
        jerseyNumber: m.jerseyNumber,
        votes: t?.votes ?? 0,
        pct: t?.pct ?? 0,
      }
    }).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
  }, [squad, tally])

  const handlePick = async (userId: string) => {
    if (pendingId) return
    setPendingId(userId)
    try {
      await onVote(userId)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct={85}
      paddingBottom={insets.bottom + space.md}
    >
      <View style={styles.body}>
        <View style={styles.head}>
          <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary">
            {t('chat.motmEyebrow', {
              count: tally?.totalVotes ?? 0,
              votes: (tally?.totalVotes ?? 0) === 1
                ? t('chat.motmVoteSingular')
                : t('chat.motmVotePlural'),
            })}
          </Text>
          <Text variant="title3" weight="bold" color="primary">
            {t('chat.motmPickTitle')}
          </Text>
          <Pressable onPress={onClose} accessibilityLabel={t('chat.motmDone')} hitSlop={8} style={styles.closeBtn}>
            <Text style={[styles.closeText, { color: c.textSecondary }]}>{t('chat.motmDone')}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {rows.map((row) => {
            const mine = row.userId === tally?.myVoteUserId
            const isPending = pendingId === row.userId
            return (
              <Pressable
                key={row.userId}
                onPress={() => handlePick(row.userId)}
                disabled={!!pendingId}
                accessibilityRole="button"
                accessibilityLabel={row.name}
                accessibilityState={{ selected: mine }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    borderColor: mine ? c.primary : c.borderDefault,
                    backgroundColor: mine ? c.primary50 : c.surface,
                  },
                  pressed && { opacity: 0.65 },
                ]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${row.pct}%`,
                      backgroundColor: mine ? c.primary50 : c.surfaceSunken,
                    },
                  ]}
                />
                <View style={styles.rowMain}>
                  <View style={[styles.numberBadge, { backgroundColor: c.primary }]}>
                    <Text style={[styles.numberText, { color: c.surface }]}>
                      {row.jerseyNumber ?? '–'}
                    </Text>
                  </View>
                  <Text variant="footnote" weight={mine ? 'semibold' : 'regular'} color="primary" style={styles.name} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text
                    variant="footnote"
                    tabular
                    weight="semibold"
                    style={{ color: mine ? c.primary : c.textSecondary }}
                  >
                    {row.votes}
                  </Text>
                </View>
                {isPending ? (
                  <Text variant="caption2" color="tertiary" style={styles.pending}>
                    {t('chat.motmVoting')}
                  </Text>
                ) : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingTop: space.sm,
    paddingHorizontal: space.md,
  },
  head: {
    paddingBottom: space.sm,
    gap: 4,
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    top: -4,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  closeText: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  list: {
    gap: space.sm,
    paddingBottom: space.md,
  },
  row: {
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  numberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontFamily: fonts.data,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  name: {
    flex: 1,
  },
  pending: { marginTop: 4 },
})