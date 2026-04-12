import { useState } from 'react'
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native'
import { InlineError } from './InlineError'
import { useClubColors } from '../context/ClubThemeContext'
import { space, radius, fontSize, fonts,
  hairline } from '../theme/tokens'

type FormInputProps = TextInputProps & {
  label: string
  error?: string | null
  focusColor?: string
}

export function FormInput({ label, error, focusColor, style, ...rest }: FormInputProps) {
  const c = useClubColors()
  const [focused, setFocused] = useState(false)

  const borderColor = error
    ? c.error
    : focused
      ? focusColor || c.textPrimary
      : c.border

  return (
    <View>
      <Text style={[styles.label, { color: c.textSecondary }]}>{label}</Text>
      <TextInput
        style={[styles.input, { borderColor, color: c.textPrimary, backgroundColor: c.surface }, style]}
        placeholderTextColor={c.textTertiary}
        onFocus={(e) => {
          setFocused(true)
          rest.onFocus?.(e)
        }}
        onBlur={(e) => {
          setFocused(false)
          rest.onBlur?.(e)
        }}
        {...rest}
      />
      <InlineError message={error} />
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    marginBottom: space.xs,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
  },
})
