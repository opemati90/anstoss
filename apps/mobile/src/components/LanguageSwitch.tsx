import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { neutralColors, fontSize, fontWeight, space, radius, fonts, lineHeight } from '../theme/tokens'
import { getLanguageLabel, type AppLanguage } from '../i18n'
import { useState } from 'react'

type Props = {
  value: AppLanguage
  onChange: (language: AppLanguage) => void
}

const OPTIONS: Array<{ code: AppLanguage; label: string }> = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'pt', label: 'PT' },
  { code: 'it', label: 'IT' },
]

export function LanguageSwitch({ value, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const activeOption = OPTIONS.find((option) => option.code === value) || OPTIONS[0]

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setIsOpen(true)} accessibilityRole="button" accessibilityLabel={`Language: ${getLanguageLabel(activeOption.code)}`}>
        <Text style={styles.triggerCode}>{activeOption.label}</Text>
        <Text style={styles.triggerLabel}>{getLanguageLabel(activeOption.code)}</Text>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setIsOpen(false)} accessibilityRole="button" accessibilityLabel="Close language selector">
          <Pressable style={styles.sheet}>
            {OPTIONS.map((option) => {
              const isActive = option.code === value

              return (
                <Pressable
                  key={option.code}
                  onPress={() => {
                    setIsOpen(false)
                    onChange(option.code)
                  }}
                  style={[styles.option, isActive && styles.optionActive]}
                  accessibilityRole="button"
                  accessibilityLabel={getLanguageLabel(option.code)}
                >
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionCode, isActive && styles.optionCodeActive]}>
                      {option.label}
                    </Text>
                    <Text
                      style={[styles.optionLabel, isActive && styles.optionLabelActive]}
                    >
                      {getLanguageLabel(option.code)}
                    </Text>
                  </View>
                  {isActive ? <Text style={styles.check}>•</Text> : null}
                </Pressable>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 44,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  triggerCode: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textSecondary,
    letterSpacing: 0.8,
  },
  triggerLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(26, 26, 24, 0.2)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 88,
    paddingRight: space.lg,
  },
  sheet: {
    width: 176,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    overflow: 'hidden',
  },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  optionActive: {
    backgroundColor: neutralColors.background,
  },
  optionCopy: {
    gap: space['2xs'],
  },
  optionCode: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textSecondary,
    letterSpacing: 0.8,
  },
  optionCodeActive: {
    color: neutralColors.textPrimary,
  },
  optionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  optionLabelActive: {
    color: neutralColors.textPrimary,
  },
  check: {
    fontSize: fontSize.xl,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
    color: neutralColors.textPrimary,
  },
})
