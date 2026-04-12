import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { radius, space, fontSize, fonts, lineHeight,
  hairline } from '../theme/tokens'
import { formatGermanDateInput } from '../utils/germanDate'
import { Icon } from './ui'

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
  const c = useClubColors()
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
            <Pressable
              key={type}
              style={[
                styles.chip,
                { borderColor: c.border, backgroundColor: c.surface },
                isActive && { backgroundColor: c.clubPrimary, borderColor: c.clubPrimary },
              ]}
              onPress={() => onTypeChange(type)}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.chipText,
                  { color: c.textSecondary },
                  isActive && { color: c.textInverse },
                ]}
              >
                {labelMap[type]}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {onDateFromChange != null && onDateToChange != null ? (
        <View style={styles.filtersRow}>
          <View style={[styles.datePanel, { borderColor: c.border, backgroundColor: c.surface }]}>
            <View style={styles.dateField}>
              <Icon
                name="calendar"
                size="sm"
                color={c.textTertiary}
              />
              <TextInput
                style={[styles.dateInput, { color: c.textPrimary }]}
                placeholder={t('eventFilter.dateFrom')}
                placeholderTextColor={c.textTertiary}
                value={dateFrom}
                onChangeText={(value) => onDateFromChange(formatGermanDateInput(value))}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>

            <View style={[styles.dateDivider, { backgroundColor: c.border }]} />

            <View style={styles.dateField}>
              <Icon
                name="calendar"
                size="sm"
                color={c.textTertiary}
              />
              <TextInput
                style={[styles.dateInput, { color: c.textPrimary }]}
                placeholder={t('eventFilter.dateTo')}
                placeholderTextColor={c.textTertiary}
                value={dateTo}
                onChangeText={(value) => onDateToChange(formatGermanDateInput(value))}
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {hasDateFilter ? (
            <Pressable
              style={styles.clearButton}
              onPress={() => {
                onDateFromChange('')
                onDateToChange('')
              }}
            >
              <Text style={[styles.clearButtonText, { color: c.clubPrimary }]}>
                {t('eventFilter.clear')}
              </Text>
            </Pressable>
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
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    lineHeight: lineHeight.sm,
    textAlign: 'center',
  },
  filtersRow: {
    gap: space.sm,
  },
  datePanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: hairline,
    borderRadius: radius.lg,
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
  },
  dateInput: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.data,
    paddingVertical: space.sm,
  },
  clearButton: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  clearButtonText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
})
