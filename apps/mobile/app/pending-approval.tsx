import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import { useAuth } from '../src/context/AuthContext'
import { neutralColors, semanticColors, fontSize, space, radius, fonts, fontWeight, lineHeight } from '../src/theme/tokens'

export default function PendingApprovalScreen() {
  const { t } = useTranslation()
  const { ageGate, signOut, refreshUser } = useAuth()

  return (
    <View style={styles.container}>
      <ModalHeader title={t('auth.pendingApprovalTitle')} mode="back" />
      <View style={styles.cardWrap}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{t('auth.pendingApprovalEyebrow')}</Text>
        <Text style={styles.title}>{t('auth.pendingApprovalTitle')}</Text>
        <Text style={styles.body}>
          {t('auth.pendingApprovalBody', {
            email: ageGate?.guardianEmail || t('auth.guardianFallback'),
          })}
        </Text>
        <TouchableOpacity style={styles.refreshButton} onPress={() => void refreshUser()} accessibilityRole="button" accessibilityLabel={t('auth.checkStatus')}>
          <Text style={styles.refreshButtonText}>{t('auth.checkStatus')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => void signOut()} accessibilityRole="button" accessibilityLabel={t('more.signOut')}>
          <Text style={styles.buttonText}>{t('more.signOut')}</Text>
        </TouchableOpacity>
      </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  cardWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: space.lg,
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
    lineHeight: lineHeight.md,
    color: neutralColors.textSecondary,
  },
  refreshButton: {
    marginTop: space.sm,
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
  },
  refreshButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
  button: {
    minHeight: 52,
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
