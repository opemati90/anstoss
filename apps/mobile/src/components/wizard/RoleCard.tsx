/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { TEXT_WHITE } from '../../theme/colors'
import { fontSize, fonts, hairline, radius, space } from '../../theme/tokens'

export type RoleCardProps = {
  icon: string
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

export function RoleCard({ icon, title, body, onPress, selected, tint }: RoleCardProps) {
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
      {/* Soft tint wash on the right side gives the card its
          identity-moment feel while staying readable. */}
      <View
        pointerEvents="none"
        style={[
          styles.tintWash,
          { backgroundColor: withAlpha(accent, selected ? 0.16 : 0.06) },
        ]}
      />
      <View
        style={[
          styles.icon,
          {
            backgroundColor: selected ? accent : withAlpha(accent, 0.12),
          },
        ]}
      >
        <Text
          style={[
            styles.iconChar,
            { color: selected ? TEXT_WHITE : accent },
          ]}
        >
          {icon}
        </Text>
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
  tintWash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '60%',
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChar: { fontSize: 28 },
  text: { flex: 1, gap: 4 },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  body: { fontFamily: fonts.body, fontSize: fontSize.sm, opacity: 0.72, lineHeight: 19 },
})
