import { useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useTranslation } from 'react-i18next'
import { useClubColors, useIsDark } from '../../../context/ClubThemeContext'
import { BottomSheet, Button, Text } from '../../../components/ui'
import { SPACING_LG, SPACING_SM } from '../../../theme/tokens'
import { currentLocale } from '../format'

/**
 * Date-only picker: a sheet with the native spinner on iOS, the system
 * dialog on Android. `footer` renders under the picker (e.g. the
 * Wechselperiode hint for the chosen date).
 */
export function DatePickerSheet({
  visible,
  title,
  value,
  minimumDate,
  maximumDate,
  onClose,
  onConfirm,
  onClear,
  footer,
}: {
  visible: boolean
  title: string
  value: Date | null
  minimumDate?: Date
  maximumDate?: Date
  onClose: () => void
  onConfirm: (date: Date) => void
  onClear?: () => void
  footer?: (date: Date) => React.ReactNode
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const isDark = useIsDark()
  const [draft, setDraft] = useState<Date>(value ?? new Date())

  useEffect(() => {
    if (visible) setDraft(value ?? new Date())
  }, [visible, value])

  if (Platform.OS !== 'ios') {
    if (!visible) return null
    return (
      <DateTimePicker
        value={draft}
        mode="date"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={(event: DateTimePickerEvent, picked?: Date) => {
          if (event.type === 'set' && picked) onConfirm(picked)
          else onClose()
        }}
      />
    )
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <View style={styles.body}>
        <Text variant="title3" weight="bold" color="primary">
          {title}
        </Text>
        <DateTimePicker
          value={draft}
          mode="date"
          display="spinner"
          locale={currentLocale()}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          themeVariant={isDark ? 'dark' : 'light'}
          accentColor={c.primary}
          textColor={c.textPrimary}
          onChange={(_event: DateTimePickerEvent, picked?: Date) => {
            if (picked) setDraft(picked)
          }}
        />
        {footer ? footer(draft) : null}
        <Button label={t('common.done')} onPress={() => onConfirm(draft)} fullWidth />
        {onClear ? (
          <Button label={t('wechsel.clearDate')} variant="plain" onPress={onClear} fullWidth />
        ) : null}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: SPACING_LG, paddingBottom: SPACING_SM },
})
