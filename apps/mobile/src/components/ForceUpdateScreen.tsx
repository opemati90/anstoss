import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { neutralColors, fontSize, fontWeight, space, radius, fonts } from '../theme/tokens'

interface ForceUpdateScreenProps {
  onUpdate: () => void
}

/**
 * Full-screen blocker when API returns 426 Upgrade Required.
 * No way to dismiss — user must update.
 */
export function ForceUpdateScreen({ onUpdate }: ForceUpdateScreenProps) {
  const { t } = useTranslation()

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔄</Text>
      <Text style={styles.title}>{t('update.required')}</Text>
      <Text style={styles.body}>{t('update.requiredBody')}</Text>
      <TouchableOpacity style={styles.button} onPress={onUpdate} accessibilityRole="button" accessibilityLabel={t('update.openStore')}>
        <Text style={styles.buttonText}>{t('update.openStore')}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: neutralColors.background,
    padding: space.xl,
  },
  icon: {
    fontSize: fontSize['3xl'],
    marginBottom: space.md,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
    marginBottom: space.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: space.xl,
  },
  button: {
    backgroundColor: neutralColors.textPrimary,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: {
    color: neutralColors.textInverse,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
  },
})
