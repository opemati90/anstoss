import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import { BottomSheet, Button, Text } from '../ui'
import { radius, space } from '../../theme/tokens'

type PaywallSheetProps = {
  visible: boolean
  onClose: () => void
  /** Retained for callers; plan details are resolved on the subscription screen. */
  triggerFeature?: string
  onUpgradeStarted?: () => void
}

/** Explains the gate without granting access or duplicating the plan catalogue. */
export function PaywallSheet({ visible, onClose }: PaywallSheetProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const c = useClubColors()

  function viewPlans() {
    onClose()
    // Browsing plans is not a purchase. /abo owns permissions, availability,
    // store prices and verified entitlement refresh for this club/session.
    router.push('/abo')
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <View style={[styles.hero, { backgroundColor: c.primary }]}>
          <Text variant="title2" weight="bold" style={{ color: c.textInverse }}>
            {t('storeBilling.title')}
          </Text>
          <Text variant="body" style={{ color: c.textInverse }}>
            {t('storeBilling.details')}
          </Text>
        </View>
        <Button
          label={t('storeBilling.viewPlans')}
          variant="filled"
          size="lg"
          fullWidth
          onPress={viewPlans}
        />
        <Pressable
          onPress={onClose}
          style={styles.skipBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('paywall.skip', { defaultValue: 'Maybe later' })}
        >
          <Text variant="footnote" color="secondary" align="center">
            {t('paywall.skip', { defaultValue: 'Maybe later' })}
          </Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  container: { paddingTop: space.md, paddingBottom: space.xl },
  hero: {
    padding: space.lg,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    gap: space.md,
    marginBottom: space.lg,
  },
  skipBtn: { minHeight: 44, justifyContent: 'center', paddingVertical: space.md },
})
