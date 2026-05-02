/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, fontSize, radius } from '../../theme/tokens'
import type { ChatReactionAggregate } from '../../hooks/useChat'

export type ReactionRowProps = {
  reactions: ChatReactionAggregate[]
  myUserId: string
  onToggle: (emoji: string, mine: boolean) => void
  inverse?: boolean
}

export function ReactionRow({
  reactions,
  myUserId,
  onToggle,
  inverse,
}: ReactionRowProps) {
  const c = useClubColors()
  if (!reactions || reactions.length === 0) return null
  return (
    <View style={styles.row}>
      {reactions.map((r) => {
        const mine = r.userIds.includes(myUserId)
        return (
          <Pressable
            key={r.emoji}
            accessibilityRole="button"
            accessibilityLabel={`${r.emoji} ${r.count}`}
            onPress={() => onToggle(r.emoji, mine)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: mine
                  ? inverse
                    ? 'rgba(255,255,255,0.22)'
                    : c.primary50
                  : inverse
                    ? 'rgba(255,255,255,0.12)'
                    : c.surfaceSunken,
                borderColor: mine
                  ? inverse
                    ? 'rgba(255,255,255,0.45)'
                    : c.primary
                  : 'transparent',
              },
              pressed && { opacity: 0.65 },
            ]}
            hitSlop={4}
          >
            <Text style={styles.emoji}>{r.emoji}</Text>
            <Text
              style={[
                styles.count,
                { color: inverse ? c.surface : c.textPrimary },
              ]}
            >
              {r.count}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  emoji: { fontSize: fontSize.sm },
  count: {
    fontFamily: fonts.data,
    fontSize: fontSize['2xs'],
    fontWeight: '600',
  },
})