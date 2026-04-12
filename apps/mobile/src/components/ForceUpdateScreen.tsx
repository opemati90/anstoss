import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { fontSize, space, radius, fonts, lineHeight } from '../theme/tokens'

interface ForceUpdateScreenProps {
  onUpdate: () => void
}

/**
 * Full-screen blocker when API returns 426 Upgrade Required.
 * No way to dismiss — user must update.
 */
export function ForceUpdateScreen({ onUpdate }: ForceUpdateScreenProps) {
  const { t } = useTranslation()
  const c = useClubColors()

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={styles.icon}>🔄</Text>
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('update.required')}</Text>
      <Text style={[styles.body, { color: c.textSecondary }]}>{t('update.requiredBody')}</Text>
      <Pressable
        style={[styles.button, { backgroundColor: c.textPrimary }]}
        onPress={onUpdate}
        accessibilityRole="button"
        accessibilityLabel={t('update.openStore')}
      >
        <Text style={[styles.buttonText, { color: c.textInverse }]}>{t('update.openStore')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.xl,
  },
  icon: {
    fontSize: fontSize['3xl'],
    marginBottom: space.md,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontFamily: fonts.heading,
    marginBottom: space.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    textAlign: 'center',
    lineHeight: lineHeight.md,
    marginBottom: space.xl,
  },
  button: {
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
})
