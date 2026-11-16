import React, { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Text } from '../ui/Text'
import { SPACING_MD, SPACING_XS, space, radius } from '../../theme/tokens'
import { useClubColors } from '../../context/ClubThemeContext'
import { useReducedMotion } from '../../hooks/useReducedMotion'

type Props = {
  users: string[]
}

function TypingDot({ index, color, reducedMotion }: { index: number; color: string; reducedMotion: boolean }) {
  const opacity = useSharedValue(0.45)
  useEffect(() => {
    opacity.value = reducedMotion ? 1 : withDelay(index * 140,
      withRepeat(withTiming(1, { duration: 280 }), -1, true))
    return () => cancelAnimation(opacity)
  }, [index, opacity, reducedMotion])
  const animation = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View testID="chat-typing-dot" style={[styles.dot, { backgroundColor: color }, animation]} />
}

export function TypingIndicator({ users }: Props) {
  const { t } = useTranslation()
  const colors = useClubColors()
  const reducedMotion = useReducedMotion()

  if (users.length === 0) return null

  const label =
    users.length === 1
      ? t('chat.typing', { name: users[0] })
      : t('chat.typingMultiple', { count: users.length })

  return (
    <View style={styles.container} testID="chat-typing-indicator" accessible accessibilityLabel={label} accessibilityLiveRegion="polite">
      <View style={[styles.bubble, { backgroundColor: colors.surface }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[0, 1, 2].map(index => <TypingDot key={index} index={index} color={colors.textSecondary} reducedMotion={reducedMotion} />)}
      </View>
      <Text variant="caption1" color="secondary" style={styles.text}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING_MD,
    paddingVertical: SPACING_XS,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  bubble: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.md, borderRadius: radius.lg + space['2xs'], borderBottomLeftRadius: space.xs + space['2xs'], borderCurve: 'continuous' },
  dot: { width: 6, height: 6, borderRadius: radius.full },
  text: {
    flexShrink: 1,
  },
})
