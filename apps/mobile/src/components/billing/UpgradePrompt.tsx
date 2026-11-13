import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { PlanFeature } from '@anstoss/shared'
import { useClubColors } from '../../context/ClubThemeContext'
import { Icon, Text } from '../ui'
import { RADIUS_LG, SPACING_LG, SPACING_MD, SPACING_XXS } from '../../theme/tokens'

export interface UpgradePromptProps {
  /** The gated feature the reader touched; picks the explanatory line. */
  feature: PlanFeature
  testID?: string
}

const ICON_WELL = 40
const ICON_WELL_RADIUS = 12

/**
 * Inline upgrade prompt (REVAMP_HANDOFF "Plans and pricing"): shown where a
 * Kostenlos club touches a Verein feature. Explains what is locked and links
 * to the Abo screen; existing data stays visible read-only. Never use it for
 * child consent or safety features, which are never gated.
 */
export function UpgradePrompt({ feature, testID = 'upgrade-prompt' }: UpgradePromptProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const title = t('clubPlan.upgrade.title')
  const body = t(`clubPlan.upgrade.${feature}`)
  return (
    <Pressable
      onPress={() => router.push('/abo' as never)}
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${body} ${t('clubPlan.upgrade.cta')}`}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: c.surfaceMuted },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.well, { backgroundColor: c.accent }]}>
        <Icon name="lock.fill" size="md" color={c.onAccent} />
      </View>
      <View style={styles.text}>
        <Text variant="body" weight="semibold" color="primary">
          {title}
        </Text>
        <Text variant="footnote" color="secondary">
          {body}
        </Text>
        <Text variant="footnote" weight="bold" color="primary">
          {t('clubPlan.upgrade.cta')}
        </Text>
      </View>
      <Icon name="chevron.right" size="md" color="secondary" />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    padding: SPACING_LG,
    borderRadius: RADIUS_LG,
  },
  pressed: { opacity: 0.85 },
  well: {
    width: ICON_WELL,
    height: ICON_WELL,
    borderRadius: ICON_WELL_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: SPACING_XXS },
})
