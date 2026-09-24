import { useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useTranslation } from 'react-i18next'
import { useClubColors, useClubTheme } from '../../context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { Icon, Text } from '../ui'
import { hairline, radius, space } from '../../theme/tokens'
import { formatWeekdayDay } from './format'

type DateFieldProps = {
  label: string
  value: Date | null
  onChange: (next: Date | null) => void
  /** Shown when no date is set, e.g. "Offen". */
  emptyLabel: string
  minimumDate?: Date
  testID?: string
}

/**
 * An optional date ("bis …"). One row: label on the left, the date (or
 * "Offen") on the right, a clear button once set. iOS uses the compact
 * native picker inline; Android opens the system dialog on tap.
 */
export function DateField({
  label,
  value,
  onChange,
  emptyLabel,
  minimumDate,
  testID,
}: DateFieldProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const { isDark } = useClubTheme()
  const locale = getAppLocale(getAppLanguage())
  const [androidOpen, setAndroidOpen] = useState(false)
  // iOS compact picker needs a value to render; until the user picks, it
  // shows a neutral "set a date" button instead.
  const [iosEditing, setIosEditing] = useState(false)

  const pick = (_event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setAndroidOpen(false)
    if (_event.type === 'dismissed') return
    if (picked) onChange(picked)
  }

  const showIosPicker = Platform.OS === 'ios' && (value != null || iosEditing)

  return (
    <View
      testID={testID}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
    >
      <Text variant="body" color="primary" style={styles.label}>
        {label}
      </Text>

      {showIosPicker ? (
        <DateTimePicker
          value={value ?? minimumDate ?? new Date()}
          mode="date"
          display="compact"
          minimumDate={minimumDate}
          locale={locale}
          themeVariant={isDark ? 'dark' : 'light'}
          accentColor={c.primary}
          onChange={pick}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? formatWeekdayDay(value.toISOString(), locale) : emptyLabel}`}
          onPress={() => {
            if (Platform.OS === 'ios') {
              setIosEditing(true)
              if (!value) onChange(minimumDate ?? new Date())
            } else {
              setAndroidOpen(true)
            }
          }}
          hitSlop={8}
          android_ripple={{ color: c.borderSubtle }}
          style={({ pressed }) => [
            styles.valuePill,
            { backgroundColor: c.surfaceSunken },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text variant="subheadline" color={value ? 'primary' : 'secondary'} tabular>
            {value ? formatWeekdayDay(value.toISOString(), locale) : emptyLabel}
          </Text>
        </Pressable>
      )}

      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('kader.date.clear')}
          onPress={() => {
            setIosEditing(false)
            onChange(null)
          }}
          hitSlop={10}
          style={styles.clear}
        >
          <Icon name="xmark.circle.fill" size={20} color="tertiary" />
        </Pressable>
      ) : null}

      {Platform.OS === 'android' && androidOpen ? (
        <DateTimePicker
          value={value ?? minimumDate ?? new Date()}
          mode="date"
          minimumDate={minimumDate}
          onChange={pick}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: space.xs,
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md + 2,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  label: { flexGrow: 1, flexShrink: 1, flexBasis: 120 },
  valuePill: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.sm + 4,
    borderRadius: radius.md,
    borderCurve: 'continuous',
  },
  clear: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
