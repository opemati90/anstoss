
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { BottomSheet, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type EditMessageSheetProps = {
  visible: boolean
  initialContent: string
  onClose: () => void
  onSubmit: (content: string) => void | Promise<void>
}

export function EditMessageSheet({
  visible,
  initialContent,
  onClose,
  onSubmit,
}: EditMessageSheetProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const [value, setValue] = useState(initialContent)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (visible) {
      setValue(initialContent)
      setSubmitting(false)
    }
  }, [visible, initialContent])

  const trimmed = value.trim()
  const canSave = trimmed.length > 0 && trimmed !== initialContent.trim()

  const handleSave = async () => {
    if (!canSave || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightPct="auto"
      paddingBottom={insets.bottom + space.md}
    >
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text variant="headline" weight="semibold" color="primary">
            {t('chat.editMessageTitle')}
          </Text>
          <Pressable onPress={onClose} accessibilityLabel={t('chat.createGroupCancel')} hitSlop={8}>
            <Text style={[styles.action, { color: c.textSecondary }]}>{t('chat.createGroupCancel')}</Text>
          </Pressable>
        </View>
        <TextInput
          value={value}
          onChangeText={setValue}
          multiline
          autoFocus
          placeholder={t('chat.editMessagePlaceholder')}
          placeholderTextColor={c.textTertiary}
          maxLength={2000}
          style={[
            styles.input,
            {
              color: c.textPrimary,
              backgroundColor: c.surfaceSunken,
              borderColor: c.borderDefault,
            },
          ]}
        />
        <View style={styles.footer}>
          <Text variant="caption2" color="tertiary">
            {value.length}/2000
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={!canSave || submitting}
            accessibilityRole="button"
            accessibilityLabel={t('chat.editMessageSave')}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor:
                  canSave && !submitting ? c.primary : c.borderDefault,
              },
              pressed && canSave && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.saveText, { color: c.surface }]}>
              {submitting ? t('chat.saving') : t('chat.editMessageSave')}
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  action: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  input: {
    minHeight: 96,
    maxHeight: 240,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
  },
  saveBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.full,
  },
  saveText: {
    fontFamily: fonts.heading,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
