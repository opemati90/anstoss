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
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorState({ message, onRetry, retryLabel }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const displayMessage = message || t('common.loadError')
  const displayRetryLabel = retryLabel || t('common.retry')

  return (
    <View style={styles.container}>
      <Icon
        name="exclamationmark.circle"
        size="xl"
        color={c.error}
        style={styles.icon}
      />
      <Text variant="subheadline" color="secondary" align="center">
        {displayMessage}
      </Text>
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
  icon: {
    marginBottom: SPACING_XS,
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
