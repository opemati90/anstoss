/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'

export type ConfettiBurstProps = {
  /** How many sprites to draw. Default 22. */
  count?: number
  /** Total burst duration in ms. Default 900. */
  durationMs?: number
  /** Hex colors to randomize across. Falls back to a default palette. */
  colors?: string[]
}

const DEFAULT_PALETTE = [
  '#1E3A5F', // navy
  '#1F5C42', // forest
  '#A8642A', // amber
  '#A8364E', // rose
  '#E04338', // live red
  '#F4C84A', // gold
]

/**
 * Lightweight Animated-only confetti burst. Spawns small colored
 * squares from center, scales them in then translates them outward
 * along a random unit vector, fades out at the end. No native deps.
 *
 * Position: parent must position this absolutely / give it a known
 * size — the sprites are anchored at center.
 */
export function ConfettiBurst({
  count = 22,
  durationMs = 900,
  colors = DEFAULT_PALETTE,
}: ConfettiBurstProps) {
  // Pre-compute each sprite's destination + colour once so re-renders
  // don't shuffle them mid-animation.
  const sprites = useRef(
    Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4
      const distance = 80 + Math.random() * 80
      return {
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance - 20,
        color: colors[i % colors.length],
        rotation: Math.random() * 360,
        scale: 0.7 + Math.random() * 0.6,
        progress: new Animated.Value(0),
      }
    }),
  ).current

  useEffect(() => {
    const animations = sprites.map((sprite) =>
      Animated.timing(sprite.progress, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    )
    Animated.stagger(15, animations).start()
  }, [sprites, durationMs])

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {sprites.map((sprite, i) => {
        const tx = sprite.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, sprite.dx],
        })
        const ty = sprite.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, sprite.dy],
        })
        const opacity = sprite.progress.interpolate({
          inputRange: [0, 0.7, 1],
          outputRange: [0, 1, 0],
        })
        return (
          <Animated.View
            key={i}
            style={[
              styles.sprite,
              {
                backgroundColor: sprite.color,
                transform: [
                  { translateX: tx },
                  { translateY: ty },
                  { rotate: `${sprite.rotation}deg` },
                  { scale: sprite.scale },
                ],
                opacity,
              },
            ]}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  sprite: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 10,
    height: 14,
    borderRadius: 2,
    marginLeft: -5,
    marginTop: -7,
  },
})
