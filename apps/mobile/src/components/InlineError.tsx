import { StyleSheet, type TextStyle } from 'react-native'
import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'
import { useClubColors } from '../context/ClubThemeContext'
import {
  FONT_FAMILY_REGULAR,
  FONT_SIZE_CAPTION,
  SPACING_XS,
} from '../theme/tokens'

type InlineErrorProps = {
  message: string | null | undefined
  style?: TextStyle
}

export function InlineError({ message, style }: InlineErrorProps) {
  const c = useClubColors()
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
    <Animated.Text style={[styles.error, { color: c.error, opacity }, style]}>
      {message}
    </Animated.Text>
  )
}

const styles = StyleSheet.create({
  error: {
    fontFamily: FONT_FAMILY_REGULAR,
    fontSize: FONT_SIZE_CAPTION,
    marginTop: SPACING_XS,
  },
})
