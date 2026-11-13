import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../Skeleton'
import { useClubColors } from '../../context/ClubThemeContext'
import {
  RADIUS_CARD,
  RADIUS_HERO,
  RADIUS_MD,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
  SPACING_XXS,
  space,
} from '../../theme/tokens'

export type HomeSkeletonVariant = 'player' | 'coach' | 'parent'

/**
 * Loading state shaped like the home it replaces (redesign screen 27): the
 * hero block at its real height and radius, a section label, and a row group
 * of icon well + two lines. Parents get their child chips above the hero.
 */
export function HomeSkeleton({ variant = 'player' }: { variant?: HomeSkeletonVariant }) {
  const c = useClubColors()
  const { t } = useTranslation()

  return (
    <View
      style={styles.root}
      // One announcement ("Lädt …") for the whole placeholder; the grey
      // shapes themselves are not content.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading', { defaultValue: 'Loading ...' })}
      accessibilityState={{ busy: true }}
      testID="home-skeleton"
    >
      {variant === 'parent' ? (
        <View style={styles.chips}>
          <Skeleton width={120} height={36} style={styles.chip} />
          <Skeleton width={140} height={36} style={styles.chip} />
        </View>
      ) : null}
      <Skeleton width="100%" height={232} style={styles.hero} />
      <View style={styles.section}>
        <Skeleton width={110} height={10} />
        <View style={[styles.group, { backgroundColor: c.surface }]}>
          {[0, 1, 2].map((key) => (
            <View key={key} style={styles.row}>
              <Skeleton width={40} height={40} style={styles.well} />
              <View style={styles.lines}>
                <Skeleton width="70%" height={12} />
                <Skeleton width="45%" height={10} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  chips: { flexDirection: 'row', gap: SPACING_SM },
  chip: { borderRadius: RADIUS_CARD },
  hero: { borderRadius: RADIUS_HERO },
  section: { gap: SPACING_MD },
  group: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_SM,
    gap: SPACING_LG + SPACING_XXS,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING_MD + SPACING_XXS, paddingVertical: SPACING_SM },
  well: { borderRadius: RADIUS_MD },
  lines: { flex: 1, gap: SPACING_XS + SPACING_XXS },
})
