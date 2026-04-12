import { StyleSheet, Text, Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { Icon } from './ui'
import { space, fontSize, radius, fonts,
  hairline } from '../theme/tokens'

type Props = {
  message?: string
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorState({
  message,
  onRetry,
  retryLabel,
}: Props) {
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
      <Text style={[styles.message, { color: c.textSecondary }]}>{displayMessage}</Text>
      {onRetry && (
        <Pressable
          style={[styles.retryButton, { borderColor: c.border }]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={displayRetryLabel}
        >
          <Icon name="arrow.clockwise" size="sm" color={c.textPrimary} />
          <Text style={[styles.retryLabel, { color: c.textPrimary }]}>{displayRetryLabel}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
  },
  icon: {
    marginBottom: space.md,
  },
  message: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  retryLabel: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
})
