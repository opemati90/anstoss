import { Pressable, StyleSheet, View } from 'react-native'
import { Icon, Text, type IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { elevation, fonts, fontSize, hairline, radius, space } from '../../theme/tokens'

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

export function RoleCard({ iconName, title, body, onPress, selected }: RoleCardProps) {
  const c = useClubColors()
  const accent = c.primary
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected ? withAlpha(accent, 0.06) : c.surface,
          borderColor: selected ? accent : c.borderDefault,
          borderWidth: selected ? 1.5 : hairline,
        },
        (pressed || selected) && elevation.card,
        pressed && { opacity: 0.97 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: withAlpha(accent, 0.1) }]}>
        <Icon name={iconName} size={20} color={accent} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
        <Text style={[styles.body, { color: c.textSecondary }]} numberOfLines={2}>
          {body}
        </Text>
      </View>
      <Icon name="chevron.right" size={15} color="tertiary" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  body: { fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18 },
})
