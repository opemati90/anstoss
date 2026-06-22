import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, fontSize, hairline, radius, space } from '../../theme/tokens'
import type { ChatReactionAggregate } from '../../hooks/useChat'

// On-primary fills for reaction chips sitting inside an own (tinted) bubble.
const onPrimaryFillActive = 'rgba(255,255,255,0.22)'
const onPrimaryFillIdle = 'rgba(255,255,255,0.12)'
const onPrimaryBorder = 'rgba(255,255,255,0.45)'

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
                    ? onPrimaryFillActive
                    : c.primary50
                  : inverse
                    ? onPrimaryFillIdle
                    : c.surfaceSunken,
                borderColor: mine
                  ? inverse
                    ? onPrimaryBorder
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
    gap: space.xs + 2,
    marginTop: space.xs + 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: hairline,
  },
  emoji: { fontSize: fontSize.sm },
  count: {
    fontFamily: fonts.data,
    fontSize: fontSize['2xs'],
    fontWeight: '600',
  },
})