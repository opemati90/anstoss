import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Avatar, PressableScale, Text } from '../ui'
import { space } from '../../theme/tokens'

export type PlayerIdentityBarProps = {
  name: string
  avatarUrl?: string | null
  /** Team the player is currently acting in, e.g. "1. Herren". */
  teamName?: string | null
  /** Localised role label, e.g. "Spieler". */
  roleLabel?: string | null
}

/**
 * The line that makes home *yours*.
 *
 * Deliberately not a card: a greeting, a face, and where you play. It sits
 * above the first surface so the eye lands on a person before it lands on a
 * decision, and it costs one row of height to do it.
 */
export function PlayerIdentityBar({
  name,
  avatarUrl,
  teamName,
  roleLabel,
}: PlayerIdentityBarProps) {
  const { t } = useTranslation()
  const firstName = name.trim().split(/\s+/)[0] || name
  const subtitle = [teamName, roleLabel].filter(Boolean).join(' · ')

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="title2" weight="bold" color="primary" numberOfLines={1}>
          {t(greetingKey(), { defaultValue: greetingFallback(), name: firstName })}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <PressableScale
        onPress={() => router.push('/me')}
        accessibilityRole="button"
        accessibilityLabel={t('more.profile', { defaultValue: 'Profile' })}
        haptic="tapLight"
      >
        <Avatar size="md" src={avatarUrl ?? undefined} fallbackText={initials(name)} />
      </PressableScale>
    </View>
  )
}

/**
 * Daypart greeting. German clubs actually talk like this, and it is the
 * cheapest signal that the app knows when you opened it.
 */
function greetingKey(): string {
  const hour = new Date().getHours()
  if (hour < 11) return 'home.greeting.morning'
  if (hour < 18) return 'home.greeting.afternoon'
  return 'home.greeting.evening'
}

function greetingFallback(): string {
  const hour = new Date().getHours()
  if (hour < 11) return 'Good morning, {{name}}'
  if (hour < 18) return 'Hi {{name}}'
  return 'Good evening, {{name}}'
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  text: { flex: 1, gap: space['2xs'] },
})
