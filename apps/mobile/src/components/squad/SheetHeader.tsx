import { Pressable, StyleSheet, View } from 'react-native'
import { useClubColors } from '../../context/ClubThemeContext'
import { Text } from '../ui'
import { hairline, space } from '../../theme/tokens'

type SheetHeaderProps = {
  title: string
  cancelLabel: string
  onCancel: () => void
  doneLabel?: string
  onDone?: () => void
  doneDisabled?: boolean
}

/** Cancel · Title · Done, the iOS task-sheet pattern shared by the Kader sheets. */
export function SheetHeader({
  title,
  cancelLabel,
  onCancel,
  doneLabel,
  onDone,
  doneDisabled,
}: SheetHeaderProps) {
  const c = useClubColors()
  return (
    <View style={[styles.header, { borderBottomColor: c.borderSubtle }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        onPress={onCancel}
        hitSlop={8}
        android_ripple={{ borderless: true }}
        style={({ pressed }) => [styles.side, pressed && styles.pressed]}
      >
        <Text variant="body" color="secondary">
          {cancelLabel}
        </Text>
      </Pressable>
      <Text variant="headline" weight="semibold" color="primary" numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {doneLabel && onDone ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={doneLabel}
          accessibilityState={{ disabled: doneDisabled }}
          disabled={doneDisabled}
          onPress={onDone}
          hitSlop={8}
          android_ripple={{ borderless: true }}
          style={({ pressed }) => [
            styles.side,
            styles.sideRight,
            pressed && styles.pressed,
            doneDisabled && styles.disabled,
          ]}
        >
          <Text variant="body" weight="semibold" color="tint">
            {doneLabel}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.side} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: hairline,
  },
  side: { minWidth: 72, minHeight: 44, justifyContent: 'center', flexShrink: 0 },
  sideRight: { alignItems: 'flex-end' },
  title: { flex: 1, minWidth: 0, textAlign: 'center' },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
})
