import React, { useRef, useEffect } from 'react'
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { hairline, radius, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { Text } from './Text'

/**
 * iOS-style segmented control. Single-select only. Use for mutually
 * exclusive filter tabs (e.g. Upcoming / Past). For multi-select use
 * FilterChipRow.
 *
 * Example:
 *   <SegmentedControl
 *     segments={[
 *       { key: 'upcoming', label: 'Upcoming' },
 *       { key: 'past',     label: 'Past'     },
 *     ]}
 *     value={tab}
 *     onChange={setTab}
 *   />
 */
export interface SegmentedControlSegment<T extends string = string> {
  key: T
  label: string
  testID?: string
}

export interface SegmentedControlProps<T extends string = string> {
  segments: SegmentedControlSegment<T>[]
  value: T
  onChange: (key: T) => void
  fullWidth?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function SegmentedControl<T extends string = string>({
  segments,
  value,
  onChange,
  fullWidth = true,
  style,
  testID,
}: SegmentedControlProps<T>) {
  const c = useClubColors()
  const reduceMotion = useReducedMotion()
  const [trackWidth, setTrackWidth] = React.useState(0)
  const selectedIndex = Math.max(
    0,
    segments.findIndex((s) => s.key === value),
  )
  const translate = useRef(new Animated.Value(selectedIndex)).current

  useEffect(() => {
    if (reduceMotion) {
      translate.setValue(selectedIndex)
      return
    }
    Animated.spring(translate, {
      toValue: selectedIndex,
      useNativeDriver: true,
      speed: 24,
      bounciness: 4,
    }).start()
  }, [selectedIndex, reduceMotion, translate])

  const segmentWidth = segments.length > 0 ? trackWidth / segments.length : 0

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width)
  }

  const handlePress = (key: T) => {
    if (key === value) return
    Haptics.select()
    onChange(key)
  }

  return (
    <View
      onLayout={handleLayout}
      testID={testID}
      style={[
        styles.track,
        {
          backgroundColor: c.background,
          borderColor: c.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      accessibilityRole="tablist"
    >
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: segmentWidth - 4,
              backgroundColor: c.surfaceElevated,
              transform: [
                {
                  translateX: translate.interpolate({
                    inputRange: segments.map((_, i) => i),
                    outputRange: segments.map((_, i) => 2 + i * segmentWidth),
                  }),
                },
              ],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.12,
              shadowRadius: 4,
              elevation: 3,
            },
          ]}
        />
      ) : null}
      {segments.map((segment) => {
        const selected = segment.key === value
        return (
          <Pressable
            key={segment.key}
            onPress={() => handlePress(segment.key)}
            style={styles.segment}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            testID={segment.testID}
            hitSlop={4}
          >
            <Text
              variant="subheadline"
              weight={selected ? 'semibold' : 'medium'}
              color={selected ? 'primary' : 'secondary'}
              numberOfLines={1}
            >
              {segment.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const TRACK_HEIGHT = 38

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: 3,
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: radius.md - 2,
    borderCurve: 'continuous',
  },
  segment: {
    flex: 1,
    height: TRACK_HEIGHT - 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
})
