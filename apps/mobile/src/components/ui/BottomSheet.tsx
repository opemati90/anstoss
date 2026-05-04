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
  /** Sheet height as % of the screen. Defaults to 88. */
  heightPct?: number
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
  const translateY = useRef(new Animated.Value(0)).current
  const sheetHeight = (SCREEN_HEIGHT * heightPct) / 100

  // Reset translation each time the sheet opens so the previous
  // dismiss-drag doesn't leak into the new appearance.
  useEffect(() => {
    if (visible) {
      translateY.setValue(0)
    }
  }, [visible, translateY])

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
          Animated.timing(translateY, {
            toValue: sheetHeight,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0)
            onClose()
          })
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
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.overlay, { backgroundColor: c.surfaceOverlay }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {dismissOnBackdrop ? (
          <View
            style={StyleSheet.absoluteFill}
            onTouchEnd={onClose}
            accessibilityElementsHidden
          />
        ) : null}
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: c.background,
              height: `${heightPct}%`,
              paddingBottom: paddingBottom ?? space['2xl'],
              transform: [{ translateY }],
            },
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
