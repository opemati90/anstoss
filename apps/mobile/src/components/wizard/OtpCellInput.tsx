import { SPACING_XXS, SPACING_XXL, SPACING_SM } from '../../theme/spacing';
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

const LENGTH = 6
const CELL_HEIGHT = 56

export type OtpCellInputProps = {
  value: string
  onChange: (next: string) => void
  autoFocus?: boolean
}

export function OtpCellInput({ value, onChange, autoFocus = true }: OtpCellInputProps) {
  const colors = useClubColors()
  const { t } = useTranslation()
  const inputRef = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const cells = Array.from({ length: LENGTH }, (_, i) => value[i] ?? '')
  const activeIndex = Math.min(value.length, LENGTH - 1)

  useEffect(() => {
    if (!autoFocus) return
    const id = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(id)
  }, [autoFocus])

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={styles.wrapper}
      accessibilityRole="none"
      accessibilityLabel={t('onboarding.code.title')}
    >
      <View style={styles.row} pointerEvents="none">
        {cells.map((d, i) => {
          const isActive = focused && i === activeIndex
          const isFilled = !!d
          return (
            <View
              key={i}
              style={[
                styles.cell,
                {
                  borderColor: isActive
                    ? colors.primary
                    : isFilled
                    ? colors.textPrimary
                    : colors.border,
                  borderWidth: isActive ? 2 : 1.5,
                  backgroundColor: colors.surfaceSunken,
                },
              ]}
            >
              <Text style={[styles.digit, { color: colors.textPrimary }]}>{d}</Text>
              {isActive && !isFilled ? (
                <View style={[styles.caret, { backgroundColor: colors.primary }]} />
              ) : null}
            </View>
          )
        })}
      </View>
      <TextInput
        ref={inputRef}
        testID="otp-input"
        value={value}
        onChangeText={(raw) => onChange(raw.replace(/\D/g, '').slice(0, LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={LENGTH}
        autoFocus={autoFocus}
        caretHidden
        style={styles.hidden}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.code.clear')}
          onPress={() => {
            onChange('')
            inputRef.current?.focus()
          }}
          hitSlop={12}
          style={[styles.clearChip, { borderColor: colors.border }]}
        >
          <Icon name="xmark.circle" size={16} color={colors.textSecondary} />
          <Text style={[styles.clearLabel, { color: colors.textSecondary }]}>
            {t('onboarding.code.clear')}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  cell: {
    width: 48,
    height: CELL_HEIGHT,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontFamily: fonts.data,
    fontSize: fontSize['2xl'],
    lineHeight: fontSize['2xl'],
    fontWeight: '700',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  caret: {
    position: 'absolute',
    width: SPACING_XXS,
    height: SPACING_XXL,
    borderRadius: 1,
  },
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
  },
  clearChip: {
    marginTop: space.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: SPACING_SM,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  clearLabel: { fontFamily: fonts.body, fontSize: fontSize.sm, fontWeight: '600' },
})
