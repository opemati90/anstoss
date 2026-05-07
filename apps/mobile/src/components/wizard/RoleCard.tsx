/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { Pressable, StyleSheet, View } from 'react-native'
import { Icon, Text, type IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { TEXT_WHITE } from '../../theme/colors'
import { hairline, radius, space, fontSize, fonts } from '../../theme/tokens'

export type RoleCardProps = {
  /** Icon glyph name from the app's `IconName` set (e.g. 'football',
   * 'shield', 'heart', 'search'). Replaces the previous emoji-string
   * API — the role picker is the first user-facing decision and
   * emoji-as-design read AI-generated. */
  iconName: IconName
  title: string
  body: string
  onPress: () => void
  selected?: boolean
  /** Hex tint that washes the card on press. Used to give each role
   * its own identity moment. Falls back to the club primary. */
  tint?: string
}

function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function RoleCard({ iconName, title, body, onPress, selected, tint }: RoleCardProps) {
  const colors = useClubColors()
  const accent = tint ?? colors.primary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? withAlpha(accent, 0.1) : colors.surface,
          borderColor: selected ? accent : colors.borderDefault,
          borderWidth: selected ? 1.5 : hairline,
        },
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
      ]}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor: selected ? accent : withAlpha(accent, 0.12),
          },
        ]}
      >
        <Icon
          name={iconName}
          size={24}
          color={selected ? TEXT_WHITE : accent}
        />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={2}>
          {body}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md + 4,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 4 },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  body: { fontFamily: fonts.body, fontSize: fontSize.sm, opacity: 0.72, lineHeight: 19 },
})
