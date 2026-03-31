import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { neutralColors, semanticColors, fontSize, space, radius, fonts, fontWeight } from '../src/theme/tokens'

export default function PendingApprovalScreen() {
  const { t } = useTranslation()
  const { ageGate, signOut } = useAuth()

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{t('auth.pendingApprovalEyebrow')}</Text>
        <Text style={styles.title}>{t('auth.pendingApprovalTitle')}</Text>
        <Text style={styles.body}>
          {t('auth.pendingApprovalBody', {
            email: ageGate?.guardianEmail || 'dein Elternteil',
          })}
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => void signOut()} accessibilityRole="button" accessibilityLabel={t('more.signOut')}>
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
    padding: space.lg,
    backgroundColor: neutralColors.background,
  },
  card: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.lg,
    backgroundColor: neutralColors.surface,
    padding: space.lg,
    gap: space.sm,
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: semanticColors.info,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: 24,
    color: neutralColors.textSecondary,
  },
  button: {
    marginTop: space.sm,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neutralColors.textPrimary,
  },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textInverse,
  },
})
