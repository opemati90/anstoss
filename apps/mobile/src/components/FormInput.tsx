import { useState } from 'react'
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native'
import { InlineError } from './InlineError'
import { neutralColors, semanticColors, space, radius, fontSize, fonts } from '../theme/tokens'

type FormInputProps = TextInputProps & {
  label: string
  error?: string | null
  focusColor?: string
}

export function FormInput({ label, error, focusColor, style, ...rest }: FormInputProps) {
  const [focused, setFocused] = useState(false)

  const borderColor = error
    ? semanticColors.error
    : focused
      ? focusColor || neutralColors.textPrimary
      : neutralColors.border

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, { borderColor }, style]}
        placeholderTextColor={neutralColors.textTertiary}
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
    color: neutralColors.textSecondary,
    marginBottom: space.xs,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
})
