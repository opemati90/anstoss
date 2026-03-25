import { Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { neutralColors, radius, space, fontSize, fontWeight } from '../theme/tokens'

const EVENT_TYPES = ['ALL', 'TRAINING', 'MATCH', 'OTHER'] as const

type Props = {
  selectedType: string
  onTypeChange: (type: string) => void
}

export function EventFilter({ selectedType, onTypeChange }: Props) {
  const { t } = useTranslation()
  const theme = useClubColors()

  const labelMap: Record<string, string> = {
    ALL: t('eventFilter.all'),
    TRAINING: t('eventFilter.training'),
    MATCH: t('eventFilter.match'),
    OTHER: t('eventFilter.other'),
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {EVENT_TYPES.map((type) => {
        const isActive = selectedType === type
        return (
          <TouchableOpacity
            key={type}
            style={[
              styles.chip,
              isActive && { backgroundColor: theme.clubPrimary, borderColor: theme.clubPrimary },
            ]}
            onPress={() => onTypeChange(type)}
          >
            <Text
              style={[
                styles.chipText,
                isActive && { color: neutralColors.textInverse },
              ]}
            >
              {labelMap[type]}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: neutralColors.textSecondary,
  },
})
