import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

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
      <TouchableOpacity style={styles.button} onPress={onUpdate}>
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
    backgroundColor: '#FAFAF8',
    padding: 32,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1917',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#6B6963',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#1A1917',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FAFAF8',
    fontSize: 16,
    fontWeight: '600',
  },
})
