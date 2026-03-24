import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { neutralColors, semanticColors } from '../src/theme/tokens'

export default function AccessBlockedScreen() {
  const { t } = useTranslation()
  const { signOut } = useAuth()

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{t('auth.blockedEyebrow')}</Text>
        <Text style={styles.title}>{t('auth.blockedTitle')}</Text>
        <Text style={styles.body}>{t('auth.blockedBody')}</Text>
        <TouchableOpacity style={styles.button} onPress={() => void signOut()}>
          <Text style={styles.buttonText}>{t('more.signOut')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: neutralColors.background,
  },
  card: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 12,
    backgroundColor: neutralColors.surface,
    padding: 24,
    gap: 12,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semanticColors.warning,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: neutralColors.textSecondary,
  },
  button: {
    marginTop: 8,
    height: 52,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutralColors.textPrimary,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: neutralColors.textInverse,
  },
})
