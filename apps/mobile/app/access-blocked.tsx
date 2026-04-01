import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import { useAuth } from '../src/context/AuthContext'
import { neutralColors, semanticColors, fontSize, fontWeight, space, radius, fonts, lineHeight } from '../src/theme/tokens'

export default function AccessBlockedScreen() {
  const { t } = useTranslation()
  const { signOut } = useAuth()

  return (
    <View style={styles.container}>
      <ModalHeader title={t('auth.blockedTitle')} mode="back" />
      <View style={styles.cardWrap}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{t('auth.blockedEyebrow')}</Text>
        <Text style={styles.title}>{t('auth.blockedTitle')}</Text>
        <Text style={styles.body}>{t('auth.blockedBody')}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityLabel={t('more.signOut')}
        >
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
    color: semanticColors.warning,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  body: {
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontFamily: fonts.body,
    color: neutralColors.textSecondary,
  },
  button: {
    marginTop: space.sm,
    minHeight: 48,
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
