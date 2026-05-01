import { useEffect, useRef } from 'react'
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type MatchSegment = {
  key: string
  label: string
}

export type MatchSegmentControlProps = {
  segments: MatchSegment[]
  value: string
  onChange: (key: string) => void
}

export function MatchSegmentControl({ segments, value, onChange }: MatchSegmentControlProps) {
  const colors = useClubColors()
  const widthRef = useRef(0)
  const indicatorX = useRef(new Animated.Value(0)).current
  const activeIndex = Math.max(
    0,
    segments.findIndex((s) => s.key === value),
  )

  useEffect(() => {
    if (!widthRef.current) return
    const segmentWidth = widthRef.current / segments.length
    Animated.spring(indicatorX, {
      toValue: activeIndex * segmentWidth,
      useNativeDriver: true,
      friction: 9,
      tension: 80,
    }).start()
  }, [activeIndex, segments.length, indicatorX])

  function handleLayout(e: LayoutChangeEvent) {
    widthRef.current = e.nativeEvent.layout.width
    const segmentWidth = widthRef.current / segments.length
    indicatorX.setValue(activeIndex * segmentWidth)
  }

  return (
    <View
      onLayout={handleLayout}
      style={[styles.row, { backgroundColor: colors.surfaceSunken }]}
    >
      <Animated.View
        style={[
          styles.indicator,
          {
            backgroundColor: colors.textPrimary,
            width: `${100 / segments.length}%`,
            transform: [{ translateX: indicatorX }],
          },
        ]}
      />
      {segments.map((seg) => {
        const active = seg.key === value
        return (
          <Pressable
            key={seg.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(seg.key)}
            style={styles.segment}
          >
            <Text
              style={[
                styles.label,
                { color: active ? colors.surface : colors.textSecondary },
              ]}
            >
              {seg.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: radius.full,
    padding: 4,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: radius.full,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
  },
  label: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    letterSpacing: -0.1,
  },
})
