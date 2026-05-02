/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../theme/tokens'

export type PollOption = {
  id: string
  label: string
  votes: number
}

export type PollSheetProps = {
  visible: boolean
  question: string
  options: PollOption[]
  totalVotes: number
  myVoteOptionId: string | null
  closesAt: string | null
  /** Called when the user picks an option. Should return after server ack. */
  onVote: (optionId: string) => Promise<void>
  onClose: () => void
}

export function PollSheet({
  visible,
  question,
  options,
  totalVotes,
  myVoteOptionId,
  closesAt,
  onVote,
  onClose,
}: PollSheetProps) {
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) setPendingId(null)
  }, [visible])

  const closesLabel = useMemo(() => {
    if (!closesAt) return null
    const ms = new Date(closesAt).getTime() - Date.now()
    if (ms <= 0) return 'Closed'
    const hours = Math.floor(ms / 3_600_000)
    if (hours >= 1) return `Closes in ${hours}h`
    const minutes = Math.max(1, Math.round(ms / 60_000))
    return `Closes in ${minutes}m`
  }, [closesAt])

  const handlePick = async (optionId: string) => {
    if (pendingId) return
    setPendingId(optionId)
    try {
      await onVote(optionId)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close poll" />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: c.surface,
            borderColor: c.borderDefault,
            paddingBottom: insets.bottom + space.md,
          },
        ]}
      >
        <View style={styles.head}>
          <Text variant="caption2" tracking="wide" weight="semibold" color="tertiary">
            POLL · {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
            {closesLabel ? ` · ${closesLabel}` : ''}
          </Text>
          <Text variant="title3" weight="bold" color="primary" style={styles.question}>
            {question}
          </Text>
        </View>

        <View style={styles.list}>
          {options.map((opt) => {
            const pct = totalVotes === 0 ? 0 : Math.round((opt.votes / totalVotes) * 100)
            const mine = opt.id === myVoteOptionId
            const isPending = pendingId === opt.id
            return (
              <Pressable
                key={opt.id}
                onPress={() => handlePick(opt.id)}
                disabled={!!pendingId}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: mine }}
                style={({ pressed }) => [
                  styles.option,
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
                    { width: `${pct}%`, backgroundColor: mine ? c.primary50 : c.surfaceSunken },
                  ]}
                />
                <View style={styles.optionRow}>
                  <Text
                    variant="footnote"
                    weight={mine ? 'semibold' : 'medium'}
                    color="primary"
                    style={styles.optionLabel}
                    numberOfLines={2}
                  >
                    {opt.label}
                  </Text>
                  <Text
                    variant="footnote"
                    tabular
                    weight="semibold"
                    style={{ color: mine ? c.primary : c.textSecondary }}
                  >
                    {pct}%
                  </Text>
                </View>
                {isPending ? (
                  <Text variant="caption2" color="tertiary" style={styles.pending}>
                    Voting…
                  </Text>
                ) : null}
              </Pressable>
            )
          })}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,17,22,0.42)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: space.md,
    paddingHorizontal: space.md,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: hairline,
    gap: space.sm,
  },
  head: {
    paddingBottom: space.sm,
    gap: 4,
  },
  question: {
    fontFamily: fonts.heading,
    letterSpacing: -0.3,
  },
  list: {
    gap: space.sm,
    paddingBottom: space.md,
  },
  option: {
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
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  optionLabel: { flex: 1 },
  pending: { marginTop: 4 },
})