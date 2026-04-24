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
import { elevation, hairline, RADIUS_MD, SPACING_SM } from '../../theme/tokens'
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
          backgroundColor: c.surfaceSunken,
          borderColor: c.borderSubtle,
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
              backgroundColor: c.surface,
              transform: [
                {
                  translateX: translate.interpolate({
                    inputRange: segments.map((_, i) => i),
                    outputRange: segments.map((_, i) => 2 + i * segmentWidth),
                  }),
                },
              ],
              ...elevation.pill,
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
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: 3,
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: RADIUS_MD - 2,
    borderCurve: 'continuous',
  },
  segment: {
    flex: 1,
    height: TRACK_HEIGHT - 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING_SM,
  },
})
