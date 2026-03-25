import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import { neutralColors, radius, space, fontSize, fontWeight } from '../theme/tokens'

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
  const theme = useClubColors()
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
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('roster.editTitle')}</Text>
          <Text style={styles.subtitle}>{playerName}</Text>

          <Text style={styles.label}>{t('roster.position')}</Text>
          <TextInput
            style={styles.input}
            value={position}
            onChangeText={setPosition}
            placeholder={t('roster.positionPlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
            maxLength={30}
          />

          <Text style={styles.label}>{t('roster.jerseyNumber')}</Text>
          <TextInput
            style={styles.input}
            value={jerseyNumber}
            onChangeText={setJerseyNumber}
            placeholder="—"
            placeholderTextColor={neutralColors.textTertiary}
            keyboardType="number-pad"
            maxLength={3}
          />

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: theme.clubPrimary }]}
              onPress={handleSave}
            >
              <Text style={styles.saveText}>{t('roster.save')}</Text>
            </TouchableOpacity>
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
    backgroundColor: neutralColors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    paddingBottom: space['2xl'],
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    marginBottom: space.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: neutralColors.textSecondary,
    marginBottom: space.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: neutralColors.textSecondary,
    marginBottom: space.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    color: neutralColors.textPrimary,
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
    borderWidth: 1,
    borderColor: neutralColors.border,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textSecondary,
  },
  saveButton: {
    flex: 1,
    paddingVertical: space.sm + 4,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  saveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
  },
})
