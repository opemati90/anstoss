import { StyleSheet, View } from 'react-native'
import { Skeleton } from '../Skeleton'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'

/**
 * Loading state shaped like the screen it replaces — identity row, hero with
 * an action zone, then two grouped surfaces. A generic spinner here caused the
 * layout to snap into place on arrival; matching the real geometry means the
 * only thing that changes on load is the content.
 */
export function PlayerHomeSkeleton() {
  const c = useClubColors()
  const surface = { backgroundColor: c.surface, borderColor: c.borderDefault }

  return (
    <View style={styles.root} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.identity}>
        <View style={styles.identityText}>
          <Skeleton width="55%" height={22} />
          <Skeleton width="35%" height={13} />
        </View>
        <Skeleton shape="circle" height={40} />
      </View>

      <View style={[styles.card, surface]}>
        <View style={styles.cardBody}>
          <Skeleton width="30%" height={11} />
          <Skeleton width="80%" height={26} />
          <Skeleton width="60%" height={14} />
        </View>
        <View style={[styles.actionZone, { borderTopColor: c.borderSubtle }]}>
          <Skeleton width="100%" height={48} />
        </View>
      </View>

      <View style={styles.section}>
        <Skeleton width="28%" height={11} />
        <View style={styles.tileRow}>
          <Skeleton style={styles.tile} height={104} />
          <Skeleton style={styles.tile} height={104} />
          <Skeleton style={styles.tile} height={104} />
        </View>
      </View>

      <View style={styles.section}>
        <Skeleton width="32%" height={11} />
        <View style={[styles.card, surface]}>
          <View style={styles.row}>
            <Skeleton shape="circle" height={32} />
            <View style={styles.rowText}>
              <Skeleton width="40%" height={15} />
              <Skeleton width="70%" height={13} />
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.lg },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  identityText: { flex: 1, gap: space.sm },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  cardBody: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
  },
  actionZone: {
    borderTopWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  section: { gap: space.sm },
  tileRow: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  rowText: { flex: 1, gap: space.sm },
})
