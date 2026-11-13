import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { Button, Icon } from './ui'
import { Text } from './ui/Text'
import {
  RADIUS_CARD,
  RADIUS_FULL,
  SPACING_LG,
  SPACING_MD,
  SPACING_XS,
  SPACING_XXL,
  SPACING_XXS,
} from '../theme/tokens'

type Props = {
  message?: string
  /** Optional secondary line shown under the title. Use for "what to do next." */
  hint?: string
  onRetry?: () => void
  retryLabel?: string
  /** Fill parent vertical space so the block centers inside a scroll/list area. */
  fillContainer?: boolean
}

/**
 * Error block of the 2026-11 redesign (screen 28): a white card with a
 * neutral 56pt icon well, the message as a 20pt title, the hint muted
 * beneath, and an ink "Erneut versuchen" pill.
 */
export function ErrorState({ message, hint, onRetry, retryLabel, fillContainer }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const displayMessage = message || t('common.loadError')
  const displayRetryLabel = retryLabel || t('common.retry')

  return (
    <View style={[styles.outer, fillContainer && styles.fill]}>
      <View style={[styles.card, { backgroundColor: c.surface }]}>
        <View style={[styles.well, { backgroundColor: c.surfaceMuted }]}>
          <Icon name="exclamationmark.circle" size={26} color={c.textPrimary} />
        </View>
        <Text variant="title3" weight="bold" color="primary" align="center" accessibilityRole="header">
          {displayMessage}
        </Text>
        {hint ? (
          <Text variant="footnote" color="secondary" align="center" style={styles.hint}>
            {hint}
          </Text>
        ) : null}
        {onRetry ? (
          <Button
            label={displayRetryLabel}
            onPress={onRetry}
            variant="filled"
            size="md"
            accessibilityLabel={displayRetryLabel}
            style={styles.retry}
          />
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: { justifyContent: 'center' },
  fill: { flex: 1 },
  card: {
    alignItems: 'center',
    gap: SPACING_MD + SPACING_XXS,
    paddingHorizontal: SPACING_XXL,
    paddingVertical: SPACING_XXL * 2,
    borderRadius: RADIUS_CARD + SPACING_XS,
    borderCurve: 'continuous',
  },
  well: {
    width: 56,
    height: 56,
    borderRadius: RADIUS_FULL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { maxWidth: 260 },
  retry: { marginTop: SPACING_XS, paddingHorizontal: SPACING_LG + SPACING_MD },
})
