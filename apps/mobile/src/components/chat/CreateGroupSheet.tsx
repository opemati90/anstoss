/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheet, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'

export type CreateGroupSheetProps = {
  visible: boolean
  onClose: () => void
  onSubmit: (input: { name: string; description?: string }) => void | Promise<void>
}

export function CreateGroupSheet({ visible, onClose, onSubmit }: CreateGroupSheetProps) {
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const trimmedName = name.trim()
  const canCreate = trimmedName.length >= 2 && trimmedName.length <= 50 && !submitting

  const reset = () => {
    setName('')
    setDesc('')
    setSubmitting(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleCreate = async () => {
    if (!canCreate) return
    setSubmitting(true)
    try {
      await onSubmit({ name: trimmedName, description: desc.trim() || undefined })
      reset()
      onClose()
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      heightPct="auto"
      paddingBottom={insets.bottom + space.md}
    >
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text variant="headline" weight="semibold" color="primary">
            New group
          </Text>
          <Pressable onPress={handleClose} accessibilityLabel="Cancel" hitSlop={8}>
            <Text style={[styles.action, { color: c.textSecondary }]}>Cancel</Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text variant="caption2" color="secondary" tracking="wide" style={styles.label}>
            GROUP NAME
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder="e.g. Travel coordination"
            placeholderTextColor={c.textTertiary}
            maxLength={50}
            style={[
              styles.input,
              {
                color: c.textPrimary,
                backgroundColor: c.surfaceSunken,
                borderColor: c.borderDefault,
              },
            ]}
          />
        </View>

        <View style={styles.field}>
          <Text variant="caption2" color="secondary" tracking="wide" style={styles.label}>
            DESCRIPTION (OPTIONAL)
          </Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder="What's this group for?"
            placeholderTextColor={c.textTertiary}
            maxLength={140}
            style={[
              styles.input,
              {
                color: c.textPrimary,
                backgroundColor: c.surfaceSunken,
                borderColor: c.borderDefault,
              },
            ]}
          />
        </View>

        <View style={styles.footer}>
          <Text variant="caption2" color="tertiary">
            You can invite players, parents, or staff once the group is created.
          </Text>
          <Pressable
            onPress={handleCreate}
            disabled={!canCreate}
            accessibilityRole="button"
            accessibilityLabel="Create group"
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: canCreate ? c.primary : c.borderDefault,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.ctaText, { color: c.surface }]}>
              {submitting ? 'Creating…' : 'Create group'}
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    gap: space.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  action: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  field: { gap: 6 },
  label: { letterSpacing: 1.2 },
  input: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
  },
  footer: {
    gap: space.sm,
    paddingTop: space.xs,
  },
  cta: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  ctaText: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
