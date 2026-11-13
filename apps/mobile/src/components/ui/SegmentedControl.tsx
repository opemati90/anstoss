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
import { INK, RADIUS_LG, RADIUS_MD, SPACING_SM } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import { Text } from './Text'

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
      speed: 30,
      bounciness: 0,
    }).start()
  }, [selectedIndex, reduceMotion, translate])

  const n = segments.length
  const segmentWidth =
    n > 0 ? (trackWidth - TRACK_PAD * 2 - SEG_GAP * (n - 1)) / n : 0

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
          backgroundColor: c.surfaceSunken,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
      accessibilityRole="tablist"
    >
      {trackWidth > 0 && segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              width: segmentWidth,
              backgroundColor: c.surface,
              transform: [
                {
                  translateX: translate.interpolate({
                    inputRange: segments.map((_, i) => i),
                    outputRange: segments.map((_, i) => TRACK_PAD + i * (segmentWidth + SEG_GAP)),
                  }),
                },
              ],
              ...thumbShadow,
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
              weight="semibold"
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

// 44pt segments inside a 4pt-padded track (52pt overall).
const SEGMENT_HEIGHT = 44
const TRACK_PAD = 4
const SEG_GAP = 4
const TRACK_HEIGHT = SEGMENT_HEIGHT + TRACK_PAD * 2

const thumbShadow = {
  shadowColor: INK,
  shadowOpacity: 0.12,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
}

const styles = StyleSheet.create({
  track: {
    height: TRACK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SEG_GAP,
    borderRadius: RADIUS_LG,
    borderCurve: 'continuous',
    padding: TRACK_PAD,
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    top: TRACK_PAD,
    bottom: TRACK_PAD,
    left: 0,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
  },
  segment: {
    flex: 1,
    height: SEGMENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING_SM,
  },
})
