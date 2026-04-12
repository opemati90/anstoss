import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { radius, space, fontSize, fonts,
  hairline } from '../theme/tokens'

type Props = {
  visible: boolean
  onClose: () => void
  onSave: (data: { position: string | null; jerseyNumber: number | null }) => void
  initialPosition?: string | null
  initialJerseyNumber?: number | null
  playerName: string
}

export function RosterEditSheet({
  visible,
  onClose,
  onSave,
  initialPosition,
  initialJerseyNumber,
  playerName,
}: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [position, setPosition] = useState(initialPosition ?? '')
  const [jerseyNumber, setJerseyNumber] = useState(
    initialJerseyNumber != null ? String(initialJerseyNumber) : '',
  )

  const handleSave = () => {
    const num = jerseyNumber.trim() ? parseInt(jerseyNumber, 10) : null
    onSave({
      position: position.trim() || null,
      jerseyNumber: num != null && !isNaN(num) ? num : null,
    })
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <Text style={[styles.title, { color: c.textPrimary }]}>
            {t('roster.editTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {playerName}
          </Text>

          <Text style={[styles.label, { color: c.textSecondary }]}>
            {t('roster.position')}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: c.border,
                color: c.textPrimary,
              },
            ]}
            value={position}
            onChangeText={setPosition}
            placeholder={t('roster.positionPlaceholder')}
            placeholderTextColor={c.textTertiary}
            maxLength={30}
          />

          <Text style={[styles.label, { color: c.textSecondary }]}>
            {t('roster.jerseyNumber')}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: c.border,
                color: c.textPrimary,
              },
            ]}
            value={jerseyNumber}
            onChangeText={setJerseyNumber}
            placeholder="—"
            placeholderTextColor={c.textTertiary}
            keyboardType="number-pad"
            maxLength={3}
          />

          <View style={styles.buttons}>
            <Pressable
              style={[styles.cancelButton, { borderColor: c.border }]}
              onPress={onClose}
            >
              <Text style={[styles.cancelText, { color: c.textSecondary }]}>
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, { backgroundColor: c.clubPrimary }]}
              onPress={handleSave}
            >
              <Text style={[styles.saveText, { color: c.textInverse }]}>
                {t('roster.save')}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    paddingBottom: space['2xl'],
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
    marginBottom: space.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: fonts.body,
    marginBottom: space.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
    marginBottom: space.xs,
  },
  input: {
    borderWidth: hairline,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    marginBottom: space.md,
  },
  buttons: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.md,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: space.sm + 4,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  saveButton: {
    flex: 1,
    paddingVertical: space.sm + 4,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  saveText: {
    fontSize: fontSize.md,
    fontFamily: fonts.heading,
  },
})
