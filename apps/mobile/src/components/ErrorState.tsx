import { StyleSheet, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { Icon } from './ui'
import { Text } from './ui/Text'
import {
  hairline,
  RADIUS_FULL,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
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

export function ErrorState({ message, hint, onRetry, retryLabel, fillContainer }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const displayMessage = message || t('common.loadError')
  const displayRetryLabel = retryLabel || t('common.retry')

  return (
    <View style={[styles.container, fillContainer && styles.fill]}>
      <Icon
        name="exclamationmark.circle.fill"
        size="xl"
        color={c.error}
        style={styles.icon}
      />
      <Text variant="subheadline" color="secondary" align="center">
        {displayMessage}
      </Text>
      {hint ? (
        <Text variant="footnote" color="tertiary" align="center" style={styles.hint}>
          {hint}
        </Text>
      ) : null}
      {onRetry && (
        <Pressable
          style={[
            styles.retryButton,
            { borderColor: c.borderDefault, backgroundColor: c.surface },
          ]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={displayRetryLabel}
        >
          <Icon name="arrow.clockwise" size="sm" color={c.textPrimary} />
          <Text variant="subheadline" color="primary" weight="medium">
            {displayRetryLabel}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_XL,
    gap: SPACING_MD,
  },
  fill: {
    flex: 1,
  },
  icon: {
    marginBottom: SPACING_XS,
  },
  hint: {
    marginTop: -SPACING_XS,
    maxWidth: 280,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS,
    marginTop: SPACING_SM,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_SM,
    borderRadius: RADIUS_FULL,
    borderWidth: hairline,
  },
})
