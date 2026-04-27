import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Icon, Text } from '../ui'
import type { IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { TEXT_WHITE } from '../../theme/colors'
import { radius, space } from '../../theme/tokens'

const PILL_IDLE_BG = hexToRgba(TEXT_WHITE, 0.18)

export type ActionCardAction = {
  id: string
  label: string
  onPress: () => void
  selected?: boolean
}

export type ActionCardProps = {
  eyebrow?: string
  title: string
  body?: string
  icon?: IconName
  actions?: ActionCardAction[]
  onPress?: () => void
  style?: ViewStyle
}

export function ActionCard({
  eyebrow,
  title,
  body,
  icon,
  actions,
  onPress,
  style,
}: ActionCardProps) {
  const c = useClubColors()
  const Container = onPress ? Pressable : View

  return (
    <Container
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${title}${body ? `. ${body}` : ''}` : undefined}
      style={({ pressed }: { pressed?: boolean } = {}) => [
        styles.card,
        { backgroundColor: c.primary },
        pressed && { opacity: 0.92 },
        style,
      ]}
    >
      <View style={styles.head}>
        {icon ? <Icon name={icon} size={22} color={TEXT_WHITE} /> : null}
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <Text variant="footnote" weight="semibold" style={[styles.eyebrow, { color: c.primary50 ?? TEXT_WHITE }]}>
              {eyebrow.toUpperCase()}
            </Text>
          ) : null}
          <Text variant="title2" weight="semibold" style={{ color: TEXT_WHITE }}>
            {title}
          </Text>
        </View>
      </View>
      {body ? (
        <Text
          variant="footnote"
          style={[styles.body, { color: c.primary50 ?? TEXT_WHITE }]}
        >
          {body}
        </Text>
      ) : null}
      {actions && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.id}
              onPress={a.onPress}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityState={{ selected: a.selected }}
              style={({ pressed }) => [
                styles.actionPill,
                a.selected ? styles.actionPillActive : styles.actionPillIdle,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text
                variant="footnote"
                weight="semibold"
                style={{ color: a.selected ? c.primary : TEXT_WHITE }}
              >
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Container>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    borderRadius: radius.lg,
    gap: space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  eyebrow: {
    letterSpacing: 1,
    marginBottom: 2,
  },
  body: {
    opacity: 0.9,
  },
  actions: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.xs,
  },
  actionPill: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  actionPillIdle: {
    backgroundColor: PILL_IDLE_BG,
  },
  actionPillActive: {
    backgroundColor: TEXT_WHITE,
  },
})
