import { StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { radius, space } from '../../theme/tokens'

export type HomeRoleChipProps = {
  label: string
}

export function HomeRoleChip({ label }: HomeRoleChipProps) {
  const c = useClubColors()
  return (
    <View style={[styles.chip, { backgroundColor: c.surfaceSunken ?? c.surface }]}>
      <Text variant="caption2" weight="semibold" color="secondary" style={styles.label}>
        {label.toUpperCase()}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  label: {
    letterSpacing: 0.6,
  },
})
