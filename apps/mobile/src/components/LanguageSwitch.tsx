import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { fontSize, space, radius, fonts, lineHeight,
  hairline } from '../theme/tokens'
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
  const c = useClubColors()
  const [isOpen, setIsOpen] = useState(false)
  const activeOption = OPTIONS.find((option) => option.code === value) || OPTIONS[0]

  return (
    <>
      <Pressable
        style={[styles.trigger, { borderColor: c.border, backgroundColor: c.surface }]}
        onPress={() => setIsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Language: ${getLanguageLabel(activeOption.code)}`}
      >
        <Text style={[styles.triggerCode, { color: c.textSecondary }]}>{activeOption.label}</Text>
        <Text style={[styles.triggerLabel, { color: c.textPrimary }]}>{getLanguageLabel(activeOption.code)}</Text>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setIsOpen(false)} accessibilityRole="button" accessibilityLabel="Close language selector">
          <Pressable style={[styles.sheet, { borderColor: c.border, backgroundColor: c.surface }]}>
            {OPTIONS.map((option) => {
              const isActive = option.code === value

              return (
                <Pressable
                  key={option.code}
                  onPress={() => {
                    setIsOpen(false)
                    onChange(option.code)
                  }}
                  style={[styles.option, isActive && { backgroundColor: c.background }]}
                  accessibilityRole="button"
                  accessibilityLabel={getLanguageLabel(option.code)}
                >
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionCode, { color: isActive ? c.textPrimary : c.textSecondary }]}>
                      {option.label}
                    </Text>
                    <Text style={[styles.optionLabel, { color: c.textPrimary }]}>
                      {getLanguageLabel(option.code)}
                    </Text>
                  </View>
                  {isActive ? <Text style={[styles.check, { color: c.textPrimary }]}>•</Text> : null}
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
    borderWidth: hairline,
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  triggerCode: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  triggerLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
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
    borderWidth: hairline,
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
  optionCopy: {
    gap: space['2xs'],
  },
  optionCode: {
    fontSize: fontSize['2xs'],
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  optionLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  check: {
    fontSize: fontSize.xl,
    fontFamily: fonts.body,
    lineHeight: lineHeight.sm,
  },
})
