import { SPACING_XXS } from '../../theme/spacing';
import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

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
      onPress={onPress}
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.primary50 : colors.surfaceSunken,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.surface }]}>
        <Text style={styles.iconChar}>{icon}</Text>
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  iconChar: { fontSize: 22 },
  text: { flex: 1 },
  title: { fontFamily: fonts.heading, fontSize: fontSize.lg, fontWeight: '700' },
  body: { fontFamily: fonts.body, fontSize: fontSize.sm, marginTop: SPACING_XXS },
})
