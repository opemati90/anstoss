import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import { useReducedMotion } from '../hooks/useReducedMotion'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  RADIUS_MD,
  RADIUS_SM,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../theme/tokens'

type SkeletonShape = 'line' | 'circle' | 'card' | 'stat'

type Props = {
  shape?: SkeletonShape
  width?: ViewStyle['width']
  height?: number
  style?: ViewStyle
}

function SkeletonItem({ shape = 'line', width, height, style }: Props) {
  const c = useClubColors()
  const opacity = useRef(new Animated.Value(0.35)).current
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    if (prefersReducedMotion) {
      opacity.setValue(0.55)
      return
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [opacity, prefersReducedMotion])

  const shapeStyle = getShapeStyle(shape, width, height)

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          backgroundColor: c.borderSubtle,
          overflow: 'hidden' as const,
          borderCurve: 'continuous' as const,
        },
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
        borderRadius: RADIUS_FULL,
      }
    case 'card':
      return {
        width: width ?? '100%',
        height: height ?? 120,
        borderRadius: RADIUS_CARD,
      }
    case 'stat':
      return {
        width: width ?? 80,
        height: height ?? 32,
        borderRadius: RADIUS_MD,
      }
    case 'line':
    default:
      return {
        width: width ?? '100%',
        height: height ?? 16,
        borderRadius: RADIUS_SM,
      }
  }
}

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

export function EventListSkeleton() {
  const c = useClubColors()
  return (
    <View style={skeletons.container}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            skeletons.eventCard,
            { backgroundColor: c.surface, borderColor: c.borderDefault },
          ]}
        >
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

const skeletons = StyleSheet.create({
  container: {
    padding: SPACING_MD,
    gap: SPACING_MD,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING_SM,
  },
  eventCard: {
    borderRadius: RADIUS_CARD,
    borderWidth: hairline,
    padding: SPACING_MD,
    gap: SPACING_SM,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD,
    paddingVertical: SPACING_SM,
  },
  memberInfo: {
    flex: 1,
    gap: SPACING_XS,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING_SM,
    justifyContent: 'space-between',
  },
})
