import { Image, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '../../src/components/ui'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, space } from '../../src/theme/tokens'

export default function Welcome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useClubColors()
  const { t } = useTranslation()
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.surface,
          paddingTop: insets.top + space.xl,
          paddingBottom: insets.bottom + space.lg,
        },
      ]}
    >
      <View style={styles.brandRow}>
        <Text style={[styles.brand, { color: colors.textPrimary }]}>Anstoss</Text>
      </View>
      <View style={styles.heroWrap}>
        <Image
          source={require('../../assets/splash.png')}
          style={styles.hero}
          resizeMode="contain"
        />
      </View>
      <View style={styles.ctas}>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>
          {t('onboarding.welcome.tagline')}
        </Text>
        <Button
          label={t('onboarding.welcome.primary')}
          onPress={() => router.push('/(auth)/phone')}
        />
        <Button
          label={t('onboarding.welcome.secondary')}
          variant="ghost"
          onPress={() => router.push('/(auth)/sign-in')}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.lg },
  brandRow: { alignItems: 'center', paddingVertical: space.sm },
  brand: {
    fontFamily: fonts.heading,
    fontSize: fontSize['3xl'],
    lineHeight: fontSize['3xl'] * 1.25,
    fontWeight: '800',
    letterSpacing: -1,
  },
  heroWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { width: '85%', height: '85%' },
  ctas: { width: '100%', gap: space.md, paddingBottom: space.md },
  tagline: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginBottom: space.sm,
  },
})
