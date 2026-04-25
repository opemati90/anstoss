import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { Button } from './ui/Button'
import { Text } from './ui/Text'
import { SPACING_MD, SPACING_SM, SPACING_XL } from '../theme/tokens'

interface ForceUpdateScreenProps {
  onUpdate: () => void
}

export function ForceUpdateScreen({ onUpdate }: ForceUpdateScreenProps) {
  const { t } = useTranslation()
  const c = useClubColors()

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Text style={styles.icon}>🔄</Text>
      <Text variant="title1" color="primary" align="center" style={styles.title}>
        {t('update.required')}
      </Text>
      <Text variant="body" color="secondary" align="center" style={styles.body}>
        {t('update.requiredBody')}
      </Text>
      <Button
        label={t('update.openStore')}
        onPress={onUpdate}
        variant="filled"
        size="md"
        style={styles.button}
        accessibilityLabel={t('update.openStore')}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING_XL,
  },
  icon: {
    fontSize: 48,
    marginBottom: SPACING_MD,
  },
  title: {
    marginBottom: SPACING_SM,
  },
  body: {
    marginBottom: SPACING_XL,
    maxWidth: 320,
  },
  button: {
    minWidth: 220,
  },
})
