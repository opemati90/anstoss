import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { neutralColors, radius, space, fontSize, fontWeight, fonts } from '../theme/tokens'
import { formatGermanDateInput } from '../utils/germanDate'

const EVENT_TYPES = ['ALL', 'TRAINING', 'MATCH', 'OTHER'] as const

type Props = {
  selectedType: string
  onTypeChange: (type: string) => void
  dateFrom?: string
  dateTo?: string
  onDateFromChange?: (value: string) => void
  onDateToChange?: (value: string) => void
}

export function EventFilter({ selectedType, onTypeChange, dateFrom, dateTo, onDateFromChange, onDateToChange }: Props) {
  const { t } = useTranslation()
  const theme = useClubColors()
  const hasDateFilter = Boolean(dateFrom || dateTo)

  const labelMap: Record<string, string> = {
    ALL: t('eventFilter.all'),
    TRAINING: t('eventFilter.training'),
    MATCH: t('eventFilter.match'),
    OTHER: t('eventFilter.other'),
  }

  return (
    <View style={styles.container}>
      <View style={styles.typeRow}>
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
                numberOfLines={1}
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
      </View>

      {onDateFromChange != null && onDateToChange != null ? (
        <View style={styles.filtersRow}>
          <View style={styles.datePanel}>
            <View style={styles.dateField}>
              <Ionicons
                name="calendar-outline"
                size={16}
                color={neutralColors.textTertiary}
              />
              <TextInput
                style={styles.dateInput}
                placeholder={t('eventFilter.dateFrom')}
                placeholderTextColor={neutralColors.textTertiary}
                value={dateFrom}
                onChangeText={(value) => onDateFromChange(formatGermanDateInput(value))}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={styles.dateDivider} />

            <View style={styles.dateField}>
              <Ionicons
                name="calendar-outline"
                size={16}
                color={neutralColors.textTertiary}
              />
              <TextInput
                style={styles.dateInput}
                placeholder={t('eventFilter.dateTo')}
                placeholderTextColor={neutralColors.textTertiary}
                value={dateTo}
                onChangeText={(value) => onDateToChange(formatGermanDateInput(value))}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {hasDateFilter ? (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={() => {
                onDateFromChange('')
                onDateToChange('')
              }}
            >
              <Text style={[styles.clearButtonText, { color: theme.clubPrimary }]}>
                {t('eventFilter.clear')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.md,
    gap: space.sm,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    alignItems: 'center',
  },
  chip: {
    flexBasis: '23%',
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 84,
    minHeight: 40,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  },
  filtersRow: {
    gap: space.sm,
  },
  datePanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    overflow: 'hidden',
  },
  dateField: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  dateDivider: {
    width: 1,
    backgroundColor: neutralColors.border,
  },
  dateInput: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
    color: neutralColors.textPrimary,
    paddingVertical: space.sm,
  },
  clearButton: {
    alignSelf: 'flex-end',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  clearButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
  },
})
