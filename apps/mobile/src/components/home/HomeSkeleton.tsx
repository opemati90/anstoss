import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '../Skeleton'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'

export type HomeSkeletonVariant = 'player' | 'coach' | 'parent'

/**
 * Loading state shaped like the home it replaces, so the only thing that
 * changes when data lands is the content: the hero with its time block and
 * reply pills (player), the readiness bar and two actions (coach), or one
 * card per child (parent), then a section header and list rows.
 */
export function HomeSkeleton({ variant = 'player' }: { variant?: HomeSkeletonVariant }) {
  const c = useClubColors()
  const { t } = useTranslation()
  const surface = { backgroundColor: c.surface, borderColor: c.borderDefault }

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
      <View style={[styles.card, surface]}>
        <View style={styles.body}>
          <View style={styles.chipRow}>
            <Skeleton width={72} height={26} style={styles.pill} />
            <Skeleton width={64} height={26} style={styles.pill} />
          </View>
          <Skeleton width="70%" height={26} />
          {variant === 'coach' ? (
            <>
              <Skeleton width="45%" height={16} />
              <Skeleton width="100%" height={8} style={styles.pill} />
              <Skeleton width="85%" height={14} />
            </>
          ) : (
            <View style={styles.timeRow}>
              <View style={styles.timeCol}>
                <Skeleton width="40%" height={13} />
                <Skeleton width="60%" height={32} />
                <Skeleton width="50%" height={14} />
              </View>
              <View style={styles.timeCol}>
                <Skeleton width="40%" height={13} />
                <Skeleton width="60%" height={32} />
                <Skeleton width="70%" height={14} />
              </View>
            </View>
          )}
        </View>
        <View style={[styles.actionZone, { borderTopColor: c.borderSubtle }]}>
          {variant === 'coach' ? (
            <View style={styles.pillRow}>
              <Skeleton height={50} style={{ ...styles.pill, ...styles.flex2 }} />
              <Skeleton height={50} style={{ ...styles.pill, ...styles.flex1 }} />
            </View>
          ) : (
            <View style={styles.pillRow}>
              <Skeleton height={44} style={{ ...styles.pill, ...styles.flex1 }} />
              <Skeleton height={44} style={{ ...styles.pill, ...styles.flex1 }} />
              <Skeleton height={44} style={{ ...styles.pill, ...styles.flex1 }} />
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Skeleton width="30%" height={13} />
        <View style={[styles.card, surface]}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.row,
                i > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
              ]}
            >
              <View style={styles.rowText}>
                <Skeleton width="55%" height={16} />
                <Skeleton width="75%" height={14} />
              </View>
              <Skeleton width={44} height={16} />
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  body: { padding: space.md, gap: space.sm + 4 },
  chipRow: { flexDirection: 'row', gap: space.sm },
  pill: { borderRadius: radius.full },
  timeRow: { flexDirection: 'row', gap: space.md },
  timeCol: { flex: 1, gap: space.xs + 2 },
  actionZone: {
    borderTopWidth: hairline,
    padding: space.md,
  },
  pillRow: { flexDirection: 'row', gap: space.sm },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  section: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md - 2,
    minHeight: 60,
  },
  rowText: { flex: 1, gap: space.sm },
})
