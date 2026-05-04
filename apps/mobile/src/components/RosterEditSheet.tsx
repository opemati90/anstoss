import { useState } from 'react'
import { View, StyleSheet, TextInput } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../context/ClubThemeContext'
import {
  FONT_FAMILY_REGULAR,
  FONT_SIZE_BODY,
  hairline,
  INPUT_HEIGHT,
  RADIUS_INPUT,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XS,
} from '../theme/tokens'
import { BottomSheet } from './ui/BottomSheet'
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
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <View style={styles.body}>
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
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: SPACING_LG,
    paddingTop: SPACING_SM,
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
