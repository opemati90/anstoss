import { useEffect, useRef } from 'react'
import { Animated, type ImageSourcePropType, StyleSheet, View } from 'react-native'

export type KenBurnsImageProps = {
  source: ImageSourcePropType
  durationMs?: number
}

export function KenBurnsImage({ source, durationMs = 12000 }: KenBurnsImageProps) {
  const scale = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: durationMs, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: durationMs, useNativeDriver: true }),
      ]),
    ).start()
  }, [scale, durationMs])
  return (
    <View style={styles.root}>
      <Animated.Image source={source} resizeMode="cover" style={[styles.img, { transform: [{ scale }] }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
})
