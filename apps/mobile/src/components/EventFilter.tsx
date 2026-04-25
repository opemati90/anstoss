import { View, TextInput, StyleSheet, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import {
  FONT_FAMILY_REGULAR,
  FONT_SIZE_BODY_SMALL,
  hairline,
  RADIUS_FULL,
  RADIUS_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../theme/tokens'
import { formatGermanDateInput } from '../utils/germanDate'
import { Icon } from './ui'
import { Text } from './ui/Text'

const EVENT_TYPES = ['ALL', 'TRAINING', 'MATCH', 'OTHER'] as const

type Props = {
  selectedType: string
  onTypeChange: (type: string) => void
  dateFrom?: string
  dateTo?: string
  onDateFromChange?: (value: string) => void
  onDateToChange?: (value: string) => void
}

export function EventFilter({
  selectedType,
  onTypeChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: Props) {
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
              accessibilityRole="button"
              accessibilityLabel={labelMap[type]}
              accessibilityState={{ selected: isActive }}
              style={[
                styles.chip,
                {
                  borderColor: c.borderDefault,
                  backgroundColor: c.surface,
                },
                isActive && {
                  backgroundColor: c.primary,
                  borderColor: c.primary,
                },
              ]}
              onPress={() => onTypeChange(type)}
            >
              <Text
                variant="footnote"
                weight="medium"
                numberOfLines={1}
                align="center"
                style={{ color: isActive ? c.textInverse : c.textSecondary }}
              >
                {labelMap[type]}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {onDateFromChange != null && onDateToChange != null ? (
        <View style={styles.filtersRow}>
          <View
            style={[
              styles.datePanel,
              { borderColor: c.borderDefault, backgroundColor: c.surface },
            ]}
          >
            <View style={styles.dateField}>
              <Icon name="calendar" size="sm" color={c.textTertiary} />
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

            <View style={[styles.dateDivider, { backgroundColor: c.borderSubtle }]} />

            <View style={styles.dateField}>
              <Icon name="calendar" size="sm" color={c.textTertiary} />
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
              accessibilityRole="button"
              accessibilityLabel={t('eventFilter.clear')}
            >
              <Text variant="footnote" color="tint" weight="medium">
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
    paddingHorizontal: SPACING_MD,
    paddingTop: SPACING_XS,
    paddingBottom: SPACING_MD,
    gap: SPACING_SM,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING_SM,
    alignItems: 'center',
  },
  chip: {
    flexBasis: '23%',
    flexGrow: 1,
    flexShrink: 0,
    minWidth: 84,
    minHeight: 44,
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_SM,
    borderRadius: RADIUS_FULL,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersRow: {
    gap: SPACING_SM,
  },
  datePanel: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: hairline,
    borderRadius: RADIUS_LG,
    overflow: 'hidden',
  },
  dateField: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
    paddingHorizontal: SPACING_MD,
  },
  dateDivider: {
    width: 1,
  },
  dateInput: {
    flex: 1,
    fontSize: FONT_SIZE_BODY_SMALL,
    fontFamily: FONT_FAMILY_REGULAR,
    paddingVertical: SPACING_SM,
  },
  clearButton: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACING_SM,
  },
})
