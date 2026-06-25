import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { Icon, Text } from '../ui'
import type { IconName } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'

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
        { backgroundColor: c.surface, borderColor: c.borderDefault },
        pressed && { opacity: 0.92 },
        style,
      ]}
    >
      {eyebrow ? (
        <Text
          variant="caption2"
          tracking="wide"
          weight="semibold"
          style={{ color: c.primary }}
        >
          {eyebrow.toUpperCase()}
        </Text>
      ) : null}
      <View style={styles.head}>
        {icon ? <Icon name={icon} size="md" color={c.primary} /> : null}
        <Text variant="title2" weight="semibold" color="primary" style={styles.title}>
          {title}
        </Text>
      </View>
      {body ? (
        <Text variant="footnote" color="secondary">
          {body}
        </Text>
      ) : null}
      {actions && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.id}
              onPress={(e) => {
                // RN GestureResponderEvent has no native stopPropagation,
                // but expo-router wraps it on web. Use a typed shape and
                // a try/catch so a missing method on native is silent.
                try {
                  const evt = e as unknown as { stopPropagation?: () => void }
                  evt.stopPropagation?.()
                } catch {
                  // intentional: stopPropagation only exists on web wrapper
                }
                try {
                  a.onPress()
                } catch (err) {
                  if (__DEV__) console.warn('ActionCard action threw', err)
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityState={{ selected: a.selected }}
              style={({ pressed }) => [
                styles.actionPill,
                {
                  borderColor: a.selected ? c.primary : c.borderDefault,
                  backgroundColor: a.selected ? c.primary : 'transparent',
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text
                variant="footnote"
                weight={a.selected ? 'semibold' : 'regular'}
                color={a.selected ? c.textInverse : 'primary'}
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
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    gap: space.xs,
    // eslint-disable-next-line no-restricted-syntax -- TODO subtle drop shadow not tokenized yet
    shadowColor: '#0F1116',
    shadowOpacity: 0.02,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  title: { flex: 1 },
  actions: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.sm,
  },
  actionPill: {
    flex: 1,
    paddingVertical: space.sm,
    // eslint-disable-next-line no-restricted-syntax -- TODO Pass 3 spacing
    borderRadius: 999,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
