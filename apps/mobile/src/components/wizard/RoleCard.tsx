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
}

export function RoleCard({ icon, title, body, onPress, selected }: RoleCardProps) {
  const colors = useClubColors()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface,
          borderColor: selected ? colors.textPrimary : colors.borderDefault,
          borderWidth: selected ? 2 : hairline,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor: selected ? colors.primary : colors.surfaceSunken,
          },
        ]}
      >
        <Text style={selected ? [styles.iconChar, { color: TEXT_WHITE }] : styles.iconChar}>
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
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChar: { fontSize: 18 },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.heading, fontSize: fontSize.md, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: fontSize.sm, opacity: 0.7, lineHeight: 18 },
})