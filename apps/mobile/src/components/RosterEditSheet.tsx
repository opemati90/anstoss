import { useState } from 'react'
import {
  View,
  StyleSheet,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import {
  FONT_FAMILY_REGULAR,
  FONT_SIZE_BODY,
  hairline,
  INPUT_HEIGHT,
  RADIUS_INPUT,
  RADIUS_LG,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
} from '../theme/tokens'
import { Button } from './ui/Button'
import { Text } from './ui/Text'

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
        style={[styles.overlay, { backgroundColor: c.surfaceOverlay }]}
      >
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <Text variant="title3" color="primary">
            {t('roster.editTitle')}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {playerName}
          </Text>

          <Text variant="subheadline" color="secondary" style={styles.label}>
            {t('roster.position')}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: c.borderDefault,
                color: c.textPrimary,
                backgroundColor: c.surface,
              },
            ]}
            value={position}
            onChangeText={setPosition}
            placeholder={t('roster.positionPlaceholder')}
            placeholderTextColor={c.textTertiary}
            maxLength={30}
          />

          <Text variant="subheadline" color="secondary" style={styles.label}>
            {t('roster.jerseyNumber')}
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: c.borderDefault,
                color: c.textPrimary,
                backgroundColor: c.surface,
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
            <Button
              label={t('common.cancel')}
              onPress={onClose}
              variant="bordered"
              size="md"
              style={styles.button}
            />
            <Button
              label={t('roster.save')}
              onPress={handleSave}
              variant="filled"
              size="md"
              style={styles.button}
            />
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
  },
  sheet: {
    borderTopLeftRadius: RADIUS_LG,
    borderTopRightRadius: RADIUS_LG,
    padding: SPACING_LG,
    paddingBottom: SPACING_XL,
  },
  subtitle: {
    marginTop: SPACING_XS,
    marginBottom: SPACING_LG,
  },
  label: {
    marginBottom: SPACING_XS,
    marginTop: SPACING_SM,
  },
  input: {
    borderWidth: hairline,
    borderRadius: RADIUS_INPUT,
    paddingHorizontal: SPACING_MD,
    height: INPUT_HEIGHT,
    fontSize: FONT_SIZE_BODY,
    fontFamily: FONT_FAMILY_REGULAR,
  },
  buttons: {
    flexDirection: 'row',
    gap: SPACING_SM,
    marginTop: SPACING_LG,
  },
  button: {
    flex: 1,
  },
})
