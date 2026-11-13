import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheet } from '../ui/BottomSheet'
import { Button, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import {
  fonts,
  INPUT_HEIGHT,
  RADIUS_FULL,
  RADIUS_INPUT,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
} from '../../theme/tokens'
import { ABSENCE_REASON_CHIPS, type RsvpReasonKey } from './eventFormat'

export type AbsenceDetail = { reason?: RsvpReasonKey; note?: string }

export interface UnavailableReasonSheetProps {
  visible: boolean
  /** Who the Absage is for when a parent answers ("Mia"). */
  subjectName?: string | null
  /** The event the Absage is for, e.g. "So · Heimspiel gegen X". */
  contextLabel?: string | null
  onSubmit: (detail: AbsenceDetail) => void
  onClose: () => void
}

const NOTE_MAX = 200

/**
 * The Absage sheet (design 24): one tap on a reason chip, an optional line
 * for the coach, Abbrechen · Absagen. A reason is never required, because a
 * player who has to explain themselves just stops answering: "Absagen"
 * without a chip sends no reason, and the quiet "Ohne Grund absagen" drops a
 * chip and note that were already filled in.
 */
export function UnavailableReasonSheet({
  visible,
  subjectName,
  contextLabel,
  onSubmit,
  onClose,
}: UnavailableReasonSheetProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [reason, setReason] = useState<RsvpReasonKey | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (visible) {
      setReason(null)
      setNote('')
    }
  }, [visible])

  const trimmedNote = note.trim()
  const submit = (withReason: boolean) => {
    onSubmit({
      ...(withReason && reason ? { reason } : {}),
      ...(withReason && trimmedNote ? { note: trimmedNote } : {}),
    })
  }
  const subtitle = contextLabel
    ? `${contextLabel} · ${t('eventFlow.absence.coachOnly', { defaultValue: 'only the coach sees the reason' })}`
    : t('eventFlow.absence.subtitle')

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="title3" weight="bold" color="primary" accessibilityRole="header">
            {subjectName
              ? t('eventFlow.absence.titleFor', { name: subjectName })
              : t('eventFlow.absence.title')}
          </Text>
          <Text variant="subheadline" color="secondary">
            {subtitle}
          </Text>
        </View>

        <View style={styles.chips} accessibilityRole="radiogroup">
          {ABSENCE_REASON_CHIPS.map((key) => {
            const selected = reason === key
            const label = t(`eventFlow.reason.${key}`)
            return (
              <Pressable
                key={key}
                testID={`absence-reason-${key}`}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ selected, checked: selected }}
                android_ripple={{ color: c.borderSubtle }}
                onPress={() => setReason(selected ? null : key)}
                style={({ pressed }) => [
                  styles.chip,
                  selected
                    ? { backgroundColor: c.ink, borderColor: c.ink }
                    : { backgroundColor: 'transparent', borderColor: c.borderStrong },
                  pressed && !selected && styles.pressed,
                ]}
              >
                <Text variant="subheadline" weight="semibold" color={selected ? c.onInk : c.textPrimary}>
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.field}>
          <Text variant="footnote" weight="semibold" color="primary">
            {t('eventFlow.absence.noteLabel')}
          </Text>
          <TextInput
            testID="absence-note"
            value={note}
            onChangeText={setNote}
            placeholder={t('eventFlow.absence.notePlaceholder')}
            placeholderTextColor={c.textTertiary}
            maxLength={NOTE_MAX}
            multiline
            accessibilityLabel={t('eventFlow.absence.noteLabel')}
            style={[
              styles.note,
              { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          />
          {note.length > NOTE_MAX - 40 ? (
            <Text variant="caption1" color="tertiary" tabular style={styles.counter}>
              {`${note.length}/${NOTE_MAX}`}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <View style={styles.cancel}>
            <Button
              label={t('eventFlow.cancelAction')}
              variant="bordered"
              size="lg"
              fullWidth
              onPress={onClose}
              testID="absence-cancel"
            />
          </View>
          <View style={styles.confirm}>
            <Button
              label={t('eventFlow.absence.confirm')}
              variant="filled"
              size="lg"
              fullWidth
              onPress={() => submit(true)}
              testID="absence-confirm"
            />
          </View>
        </View>
        <Button
          label={t('eventFlow.absence.withoutReason')}
          variant="plain"
          size="md"
          fullWidth
          onPress={() => submit(false)}
          testID="absence-skip"
        />
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingTop: SPACING_XS,
    paddingBottom: SPACING_LG,
    gap: SPACING_XL,
  },
  header: { gap: SPACING_XS + 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_SM },
  chip: {
    minHeight: 44,
    paddingHorizontal: SPACING_MD + 6,
    borderRadius: RADIUS_FULL,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  field: { gap: SPACING_XS + 2 },
  note: {
    minHeight: INPUT_HEIGHT,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: SPACING_LG,
    paddingTop: SPACING_MD + 2,
    paddingBottom: SPACING_MD + 2,
    fontSize: 16,
    fontFamily: fonts.body,
    includeFontPadding: false,
    textAlignVertical: 'top',
  },
  counter: { alignSelf: 'flex-end' },
  actions: { flexDirection: 'row', gap: SPACING_MD - 2 },
  // Design 24: Abbrechen 1fr, Absage senden 1.6fr.
  cancel: { flex: 1 },
  confirm: { flex: 1.6 },
})
