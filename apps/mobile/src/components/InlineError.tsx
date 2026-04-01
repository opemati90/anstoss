import { Text, StyleSheet, type TextStyle } from 'react-native'
import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'
import { semanticColors, fonts, fontSize, space } from '../theme/tokens'

type InlineErrorProps = {
  message: string | null | undefined
  style?: TextStyle
}

export function InlineError({ message, style }: InlineErrorProps) {
  const opacity = useRef(new Animated.Value(message ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: message ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start()
  }, [message, opacity])

  if (!message) return null

  return (
    <Animated.Text style={[styles.error, { opacity }, style]}>
      {message}
    </Animated.Text>
  )
}

const styles = StyleSheet.create({
  error: {
    color: semanticColors.error,
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    marginTop: space.xs,
  },
})
