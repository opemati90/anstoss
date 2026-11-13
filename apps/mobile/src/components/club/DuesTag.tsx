import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { RADIUS_SM, SPACING_SM, SPACING_XS } from '../../theme/tokens'

export type DuesTagTone = 'overdue' | 'paid' | 'neutral'

/**
 * The design's `.tag`: 11pt bold, radius 8. Overdue is the warm alert wash,
 * paid the quiet success wash, everything else (open, reported) neutral.
 */
export function DuesTag({ label, tone }: { label: string; tone: DuesTagTone }) {
  const c = useClubColors()
  const palette =
    tone === 'overdue'
      ? { bg: c.errorBg, fg: c.error }
      : tone === 'paid'
        ? { bg: c.successBg, fg: c.success }
        : { bg: c.surfaceMuted, fg: c.textSecondary }
  return (
    <View style={[styles.tag, { backgroundColor: palette.bg }]}>
      <Text variant="caption1" weight="bold" style={{ color: palette.fg, fontSize: 11, lineHeight: 14 }}>
        {label}
      </Text>
    </View>
  )
}

/** Cents → localized currency string ("25,00 €"). */
export function formatDues(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
    }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING_SM,
    paddingVertical: SPACING_XS,
    borderRadius: RADIUS_SM,
    borderCurve: 'continuous',
  },
})
