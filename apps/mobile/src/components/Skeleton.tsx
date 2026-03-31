import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native'
import { neutralColors, radius, space } from '../theme/tokens'

type SkeletonShape = 'line' | 'circle' | 'card' | 'stat'

type Props = {
  shape?: SkeletonShape
  width?: ViewStyle['width']
  height?: number
  style?: ViewStyle
}

const PULSE_COLORS = {
  from: neutralColors.border,
  to: neutralColors.background,
}

function SkeletonItem({ shape = 'line', width, height, style }: Props) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [opacity])

  const shapeStyle = getShapeStyle(shape, width, height)

  return (
    <Animated.View
      style={[
        styles.base,
        shapeStyle,
        { opacity },
        style,
      ]}
    />
  )
}

function getShapeStyle(
  shape: SkeletonShape,
  width?: ViewStyle['width'],
  height?: number,
): ViewStyle {
  switch (shape) {
    case 'circle':
      return {
        width: width ?? 40,
        height: height ?? 40,
        borderRadius: radius.full,
      }
    case 'card':
      return {
        width: width ?? '100%',
        height: height ?? 120,
        borderRadius: radius.lg,
      }
    case 'stat':
      return {
        width: width ?? 80,
        height: height ?? 32,
        borderRadius: radius.md,
      }
    case 'line':
    default:
      return {
        width: width ?? '100%',
        height: height ?? 16,
        borderRadius: radius.sm,
      }
  }
}

/**
 * Dashboard skeleton: hero event card + quick actions + stats.
 */
export function DashboardSkeleton() {
  return (
    <View style={skeletons.container}>
      <SkeletonItem shape="card" height={160} />
      <View style={skeletons.row}>
        <SkeletonItem shape="stat" width={100} />
        <SkeletonItem shape="stat" width={100} />
        <SkeletonItem shape="stat" width={100} />
      </View>
      <SkeletonItem shape="line" width="60%" height={20} />
      <SkeletonItem shape="card" height={80} />
      <SkeletonItem shape="card" height={80} />
    </View>
  )
}

/**
 * Event list skeleton: repeating event cards.
 */
export function EventListSkeleton() {
  return (
    <View style={skeletons.container}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={skeletons.eventCard}>
          <SkeletonItem shape="line" width="40%" height={12} />
          <SkeletonItem shape="line" width="70%" height={18} />
          <SkeletonItem shape="line" width="50%" height={14} />
          <View style={skeletons.row}>
            <SkeletonItem shape="stat" width={60} height={28} />
            <SkeletonItem shape="stat" width={60} height={28} />
            <SkeletonItem shape="stat" width={60} height={28} />
          </View>
        </View>
      ))}
    </View>
  )
}

/**
 * Roster skeleton: list of member rows.
 */
export function RosterSkeleton() {
  return (
    <View style={skeletons.container}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={skeletons.memberRow}>
          <SkeletonItem shape="circle" width={40} height={40} />
          <View style={skeletons.memberInfo}>
            <SkeletonItem shape="line" width="60%" height={16} />
            <SkeletonItem shape="line" width="40%" height={12} />
          </View>
        </View>
      ))}
    </View>
  )
}

/**
 * Admin stats skeleton: stat cards grid.
 */
export function AdminStatsSkeleton() {
  return (
    <View style={skeletons.container}>
      <View style={skeletons.statsGrid}>
        <SkeletonItem shape="card" width="48%" height={90} />
        <SkeletonItem shape="card" width="48%" height={90} />
        <SkeletonItem shape="card" width="48%" height={90} />
        <SkeletonItem shape="card" width="48%" height={90} />
      </View>
      <SkeletonItem shape="line" width="50%" height={20} />
      <SkeletonItem shape="card" height={60} />
      <SkeletonItem shape="card" height={60} />
    </View>
  )
}

export { SkeletonItem as Skeleton }

const styles = StyleSheet.create({
  base: {
    backgroundColor: PULSE_COLORS.from,
  },
})

const skeletons = StyleSheet.create({
  container: {
    padding: space.md,
    gap: space.md,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  eventCard: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
    gap: space.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  memberInfo: {
    flex: 1,
    gap: space.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    justifyContent: 'space-between',
  },
})
