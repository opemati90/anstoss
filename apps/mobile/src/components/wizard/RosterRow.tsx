import { Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type RosterRowProps = {
  name: string
  position?: string
  claimed: boolean
  onPress: () => void
}

export function RosterRow({ name, position, claimed, onPress }: RosterRowProps) {
  const colors = useClubColors()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={claimed}
      style={[
        styles.row,
        { borderColor: colors.border, opacity: claimed ? 0.5 : 1 },
      ]}
    >
      <View style={styles.text}>
        <Text style={[styles.name, { color: colors.textPrimary }]}>{name}</Text>
        {position && <Text style={[styles.pos, { color: colors.textSecondary }]}>{position}</Text>}
      </View>
      {claimed && (
        <View style={[styles.pill, { backgroundColor: colors.surfaceSunken }]}>
          <Text style={[styles.pillText, { color: colors.textSecondary }]}>Claimed</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
  },
  text: { flex: 1 },
  name: { fontFamily: fonts.heading, fontSize: fontSize.md, fontWeight: '600' },
  pos: { fontFamily: fonts.data, fontSize: fontSize.xs, marginTop: 2 },
  pill: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.full },
  pillText: { fontFamily: fonts.body, fontSize: fontSize.xs, fontWeight: '600' },
})
