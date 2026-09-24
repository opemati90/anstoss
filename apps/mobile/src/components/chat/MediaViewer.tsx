import { useEffect, useState } from 'react'
import { Image, Modal, Pressable, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsetsSafe } from '../../utils/useSafeAreaInsetsSafe'
import { space } from '../../theme/tokens'
import { Icon, Text } from '../ui'

export type ViewerMedia = { kind: 'image' | 'video'; url: string; caption?: string | null; width?: number; height?: number }

type Props = {
  media: ViewerMedia | null
  onClose: () => void
}

/** Media viewers always sit on black, in both themes (photo convention). */
const VIEWER_BACKDROP = 'black'
const VIEWER_FOREGROUND = 'white'

/** expo-video loads lazily so a binary without it degrades to "cannot play". */
function loadVideo(): typeof import('expo-video') | null {
  try {
    return require('expo-video') as typeof import('expo-video')
  } catch {
    return null
  }
}

function VideoBody({ url }: { url: string }) {
  const Video = loadVideo()
  const { t } = useTranslation()
  if (!Video) {
    return (
      <Text variant="body" color={VIEWER_FOREGROUND}>
        {t('chatThread.media.videoUnavailable')}
      </Text>
    )
  }
  return <VideoPlayerView Video={Video} url={url} />
}

function VideoPlayerView({ Video, url }: { Video: typeof import('expo-video'); url: string }) {
  const player = Video.useVideoPlayer(url, (p) => {
    p.play()
  })
  return <Video.VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />
}

/**
 * Full-screen photo/video viewer: pinch to zoom, pan while zoomed, swipe
 * down to dismiss. Hardware back closes it (Modal onRequestClose).
 */
export function MediaViewer({ media, onClose }: Props) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsetsSafe()
  const { width, height } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(!!media)
    scale.value = 1
    savedScale.value = 1
    translateX.value = 0
    translateY.value = 0
  }, [media, savedScale, scale, translateX, translateY])

  const close = () => {
    setVisible(false)
    onClose()
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(4, savedScale.value * e.scale))
    })
    .onEnd(() => {
      savedScale.value = scale.value
      if (scale.value <= 1.01) {
        translateX.value = withTiming(0)
        translateY.value = withTiming(0)
      }
    })

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = e.translationX
        translateY.value = e.translationY
      } else {
        translateY.value = Math.max(0, e.translationY)
      }
    })
    .onEnd((e) => {
      if (savedScale.value <= 1 && (e.translationY > 120 || e.velocityY > 900)) {
        runOnJS(close)()
        return
      }
      if (savedScale.value <= 1) translateY.value = withTiming(0, { duration: reduceMotion ? 0 : 180 })
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = savedScale.value > 1 ? 1 : 2
      scale.value = withTiming(next, { duration: reduceMotion ? 0 : 180 })
      savedScale.value = next
      if (next === 1) {
        translateX.value = withTiming(0)
        translateY.value = withTiming(0)
      }
    })

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap)

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: savedScale.value > 1 ? 1 : Math.max(0.35, 1 - translateY.value / 400),
  }))

  const aspect =
    media?.width && media?.height && media.height > 0 ? media.width / media.height : null
  const imageHeight = aspect ? Math.min(height, width / aspect) : height * 0.7

  return (
    <Modal visible={visible && !!media} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={close} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[styles.fill, { backgroundColor: VIEWER_BACKDROP }, backdropStyle]} />
        <View style={styles.center} pointerEvents="box-none">
          {media?.kind === 'image' ? (
            <GestureDetector gesture={gesture}>
              <Animated.View style={[{ width, height: imageHeight }, imageStyle]}>
                <Image
                  source={{ uri: media.url }}
                  style={styles.fill}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                  accessibilityLabel={media.caption || t('chatThread.media.photo')}
                />
              </Animated.View>
            </GestureDetector>
          ) : media?.kind === 'video' ? (
            <View style={{ width, height: height * 0.8 }}>
              <VideoBody url={media.url} />
            </View>
          ) : null}
        </View>
        {media?.caption ? (
          <View style={[styles.caption, { paddingBottom: insets.bottom + space.md }]} pointerEvents="none">
            <Text variant="body" color={VIEWER_FOREGROUND}>
              {media.caption}
            </Text>
          </View>
        ) : null}
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={8}
          style={[styles.close, { top: insets.top + space.sm }]}
          testID="chat-media-viewer-close"
        >
          <Icon name="xmark" size={24} color={VIEWER_FOREGROUND} />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.md },
  close: {
    position: 'absolute',
    right: space.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
