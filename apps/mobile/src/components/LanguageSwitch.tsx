import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { neutralColors } from '../theme/tokens'
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
      <Pressable style={styles.trigger} onPress={() => setIsOpen(true)}>
        <Text style={styles.triggerCode}>{activeOption.label}</Text>
        <Text style={styles.triggerLabel}>{getLanguageLabel(activeOption.code)}</Text>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setIsOpen(false)}>
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
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  triggerCode: {
    fontSize: 11,
    fontWeight: '700',
    color: neutralColors.textSecondary,
    letterSpacing: 0.8,
  },
  triggerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(26, 26, 24, 0.2)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 88,
    paddingRight: 24,
  },
  sheet: {
    width: 176,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    overflow: 'hidden',
  },
  option: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionActive: {
    backgroundColor: neutralColors.background,
  },
  optionCopy: {
    gap: 2,
  },
  optionCode: {
    fontSize: 11,
    fontWeight: '700',
    color: neutralColors.textSecondary,
    letterSpacing: 0.8,
  },
  optionCodeActive: {
    color: neutralColors.textPrimary,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  optionLabelActive: {
    color: neutralColors.textPrimary,
  },
  check: {
    fontSize: 20,
    lineHeight: 20,
    color: neutralColors.textPrimary,
  },
})
