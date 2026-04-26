import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '../../src/components/ui'
import { KenBurnsImage } from '../../src/components/wizard/KenBurnsImage'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { fontSize, fonts, space } from '../../src/theme/tokens'

export default function Welcome() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useClubColors()
  const { t } = useTranslation()
  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <KenBurnsImage source={require('../../assets/illustrations/onboarding-hero.png')} />
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg },
        ]}
      >
        <Text style={[styles.brand, { color: colors.surface }]}>Anstoss</Text>
        <View style={styles.ctas}>
          <Text style={[styles.tagline, { color: colors.surface }]}>
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
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: space.lg,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  brand: {
    fontFamily: fonts.heading,
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    letterSpacing: -1,
  },
  ctas: { width: '100%', gap: space.md },
  tagline: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginBottom: space.sm,
  },
})
