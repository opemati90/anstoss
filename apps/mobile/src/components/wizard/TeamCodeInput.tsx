import { SPACING_XXS, SPACING_SM } from '../../theme/spacing';
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export const TEAM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const TEAM_CODE_LENGTH = 5

export function normalizeTeamCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((ch) => TEAM_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, TEAM_CODE_LENGTH)
}

export type TeamCodeInputProps = {
  value: string
  onChange: (next: string) => void
  autoFocus?: boolean
}

export function TeamCodeInput({ value, onChange, autoFocus = true }: TeamCodeInputProps) {
  const colors = useClubColors()
  const { t } = useTranslation()
  const inputRef = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const cells = Array.from({ length: TEAM_CODE_LENGTH }, (_, i) => value[i] ?? '')
  const activeIndex = Math.min(value.length, TEAM_CODE_LENGTH - 1)

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
      accessibilityLabel={t('onboarding.teamCode.title')}
    >
      <View style={styles.row} pointerEvents="none">
        {cells.map((c, i) => {
          const isActive = focused && i === activeIndex
          const isFilled = !!c
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
              <Text style={[styles.char, { color: colors.textPrimary }]}>{c}</Text>
              {isActive && !isFilled ? (
                <View style={[styles.caret, { backgroundColor: colors.primary }]} />
              ) : null}
            </View>
          )
        })}
      </View>
      <TextInput
        ref={inputRef}
        testID="team-code-input"
        value={value}
        onChangeText={(raw) => onChange(normalizeTeamCode(raw))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="characters"
        autoCorrect={false}
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
  )
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  cell: {
    width: 52,
    height: 64,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  char: {
    fontFamily: fonts.data,
    fontSize: fontSize['2xl'],
    lineHeight: fontSize['2xl'] * 1.3,
    fontWeight: '700',
    textAlignVertical: 'center',
  },
  caret: {
    position: 'absolute',
    width: SPACING_XXS,
    height: 28,
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
