import { Pressable, StyleSheet, Text, View } from 'react-native'
import { neutralColors } from '../theme/tokens'
import type { AppLanguage } from '../i18n'

type Props = {
  value: AppLanguage
  onChange: (language: AppLanguage) => void
}

const OPTIONS: Array<{ code: AppLanguage; label: string }> = [
  { code: 'de', label: 'DE' },
  { code: 'en', label: 'EN' },
]

export function LanguageSwitch({ value, onChange }: Props) {
  return (
    <View style={styles.container}>
      {OPTIONS.map((option) => {
        const isActive = option.code === value

        return (
          <Pressable
            key={option.code}
            onPress={() => onChange(option.code)}
            style={[styles.option, isActive && styles.optionActive]}
          >
            <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.surface,
    padding: 2,
  },
  option: {
    minWidth: 46,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  optionActive: {
    backgroundColor: neutralColors.textPrimary,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '700',
    color: neutralColors.textSecondary,
    letterSpacing: 0.8,
  },
  optionTextActive: {
    color: neutralColors.textInverse,
  },
})
