import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, hairline, radius, space } from '../../theme/tokens'

export type EditMessageSheetProps = {
  visible: boolean
  initialContent: string
  onClose: () => void
  onSubmit: (content: string) => void | Promise<void>
}

export function EditMessageSheet({
  visible,
  initialContent,
  onClose,
  onSubmit,
}: EditMessageSheetProps) {
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const [value, setValue] = useState(initialContent)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (visible) {
      setValue(initialContent)
      setSubmitting(false)
    }
  }, [visible, initialContent])

  const trimmed = value.trim()
  const canSave = trimmed.length > 0 && trimmed !== initialContent.trim()

  const handleSave = async () => {
    if (!canSave || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Close edit"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: c.surface,
              borderColor: c.borderDefault,
              paddingBottom: insets.bottom + space.md,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Text variant="headline" weight="semibold" color="primary">
              Edit message
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Cancel" hitSlop={8}>
              <Text style={[styles.action, { color: c.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>
          <TextInput
            value={value}
            onChangeText={setValue}
            multiline
            autoFocus
            placeholder="Type your message"
            placeholderTextColor={c.textTertiary}
            maxLength={2000}
            style={[
              styles.input,
              {
                color: c.textPrimary,
                backgroundColor: c.surfaceSunken,
                borderColor: c.borderDefault,
              },
            ]}
          />
          <View style={styles.footer}>
            <Text variant="caption2" color="tertiary">
              {value.length}/2000
            </Text>
            <Pressable
              onPress={handleSave}
              disabled={!canSave || submitting}
              accessibilityRole="button"
              accessibilityLabel="Save edit"
              style={({ pressed }) => [
                styles.saveBtn,
                {
                  backgroundColor:
                    canSave && !submitting ? c.primary : c.borderDefault,
                },
                pressed && canSave && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.saveText, { color: c.surface }]}>
                {submitting ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,17,22,0.42)',
  },
  kav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    paddingTop: space.md,
    paddingHorizontal: space.md,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: hairline,
    gap: space.sm,
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
  input: {
    minHeight: 96,
    maxHeight: 240,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
  },
  saveBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.full,
  },
  saveText: {
    fontFamily: fonts.heading,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
