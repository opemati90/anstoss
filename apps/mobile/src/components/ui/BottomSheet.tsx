/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef } from 'react'
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { space } from '../../theme/tokens'

export type BottomSheetProps = {
  visible: boolean
  onClose: () => void
  /**
   * Sheet height as % of the screen, or 'auto' to size to content.
   * Defaults to 88.
   */
  heightPct?: number | 'auto'
  /** Optional override for inner padding-bottom (default: space['2xl']). */
  paddingBottom?: number
  /** Whether tapping the dimmed overlay closes the sheet. Default true. */
  dismissOnBackdrop?: boolean
  /** Inner content. */
  children: React.ReactNode
  contentStyle?: ViewStyle
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window')
const DRAG_THRESHOLD = 80
const VELOCITY_THRESHOLD = 0.55

/**
 * Sleek bottom sheet with a drag-down-to-dismiss gesture.
 *
 * The PanResponder lives on a thin top "drag bar" that contains the
 * grabber. Anything below that (ScrollViews, lists, inputs) stays
 * fully interactive — only dragging the bar/grabber dismisses.
 *
 * Built on RN's native Animated API + PanResponder so we don't have
 * to pull in react-native-reanimated.
 */
export function BottomSheet({
  visible,
  onClose,
  heightPct = 88,
  paddingBottom,
  dismissOnBackdrop = true,
  children,
  contentStyle,
}: BottomSheetProps) {
  const c = useClubColors()
  const sheetHeight =
    heightPct === 'auto'
      ? SCREEN_HEIGHT * 0.7
      : (SCREEN_HEIGHT * heightPct) / 100
  // Start fully off-screen so we can run our own slide-up animation when
  // visible flips true. The Modal itself uses animationType="none" so
  // there are no competing animations.
  const translateY = useRef(new Animated.Value(sheetHeight)).current

  useEffect(() => {
    if (visible) {
      translateY.setValue(sheetHeight)
      Animated.spring(translateY, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start()
    }
  }, [visible, translateY, sheetHeight])

  // Keep onClose / sheetHeight refs current so the PanResponder closure
  // (created once at mount) always sees the latest values.
  const onCloseRef = useRef(onClose)
  const sheetHeightRef = useRef(sheetHeight)
  useEffect(() => {
    onCloseRef.current = onClose
    sheetHeightRef.current = sheetHeight
  }, [onClose, sheetHeight])

  const animateClose = useRef(() => {
    Animated.timing(translateY, {
      toValue: sheetHeightRef.current,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onCloseRef.current()
    })
  }).current

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        // Only allow dragging downward; clamp upward drags to 0.
        translateY.setValue(Math.max(0, gesture.dy))
      },
      onPanResponderRelease: (_, gesture) => {
        const shouldClose =
          gesture.dy > DRAG_THRESHOLD || gesture.vy > VELOCITY_THRESHOLD
        if (shouldClose) {
          // Animate the rest of the way down, then notify the parent.
          // Critically: do NOT reset translateY before onClose — that
          // would briefly snap the sheet back to its open position
          // before the Modal unmounts, producing a visible flicker.
          // The next time visible flips true, our open effect resets
          // translateY to sheetHeight and replays the spring-up.
          animateClose()
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            tension: 60,
            friction: 9,
            useNativeDriver: true,
          }).start()
        }
      },
    }),
  ).current

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: c.surfaceOverlay,
              opacity: translateY.interpolate({
                inputRange: [0, sheetHeight],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
        {dismissOnBackdrop ? (
          <View
            style={StyleSheet.absoluteFill}
            onTouchEnd={animateClose}
            accessibilityElementsHidden
          />
        ) : null}
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: c.background,
              paddingBottom: paddingBottom ?? space['2xl'],
              transform: [{ translateY }],
            },
            heightPct === 'auto'
              ? { maxHeight: '88%' }
              : { height: `${heightPct}%` },
            contentStyle,
          ]}
        >
          {/* Drag handle — only this top strip captures the pan. */}
          <View {...panResponder.panHandlers} style={styles.dragHandle}>
            <View
              style={[styles.grabber, { backgroundColor: c.borderDefault }]}
            />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  dragHandle: {
    width: '100%',
    paddingTop: 8,
    paddingBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
})
