import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { BottomSheet } from '../ui/BottomSheet'
import { Button, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space, RADIUS_INPUT } from '../../theme/tokens'
import { ABSENCE_REASON_CHIPS, type RsvpReasonKey } from './eventFormat'

export type AbsenceDetail = { reason?: RsvpReasonKey; note?: string }

export interface UnavailableReasonSheetProps {
  visible: boolean
  /** Who the Absage is for when a parent answers ("Mia"). */
  subjectName?: string | null
  onSubmit: (detail: AbsenceDetail) => void
  onClose: () => void
}

const NOTE_MAX = 200

/**
 * The short Absage sheet: one tap on a reason chip, an optional line for the
 * coach, and a quiet way out without giving a reason. A reason is never
 * required, because a player who has to explain themselves just stops
 * answering.
 */
export function UnavailableReasonSheet({
  visible,
  subjectName,
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

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text variant="title3" color="primary">
            {subjectName
              ? t('eventFlow.absence.titleFor', { name: subjectName })
              : t('eventFlow.absence.title')}
          </Text>
          <Text variant="footnote" color="secondary">
            {t('eventFlow.absence.subtitle')}
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
                accessibilityState={{ selected }}
                android_ripple={{ color: c.borderSubtle }}
                onPress={() => setReason(selected ? null : key)}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: selected ? c.primary : c.surfaceSunken,
                    borderColor: selected ? c.primary : c.borderSubtle,
                  },
                  pressed && !selected && { opacity: 0.8 },
                ]}
              >
                <Text
                  variant="subheadline"
                  weight={selected ? 'semibold' : 'medium'}
                  color={selected ? c.textInverse : c.textPrimary}
                >
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <View>
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
              { color: c.textPrimary, backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle },
            ]}
          />
          {note.length > NOTE_MAX - 40 ? (
            <Text variant="caption1" color="tertiary" tabular style={styles.counter}>
              {`${note.length}/${NOTE_MAX}`}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <Button
            label={t('eventFlow.absence.confirm')}
            variant="filled"
            size="lg"
            fullWidth
            onPress={() => submit(true)}
            testID="absence-confirm"
          />
          <Button
            label={t('eventFlow.absence.withoutReason')}
            variant="plain"
            size="md"
            fullWidth
            onPress={() => submit(false)}
            testID="absence-skip"
          />
        </View>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    paddingBottom: space.lg,
    gap: space.md,
  },
  header: { gap: space.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderCurve: 'continuous',
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    minHeight: 64,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingTop: space.sm + 2,
    paddingBottom: space.sm + 2,
    fontSize: 16,
    fontFamily: fonts.body,
    includeFontPadding: false,
    textAlignVertical: 'top',
  },
  counter: { alignSelf: 'flex-end', marginTop: space.xs },
  actions: { gap: space.xs },
})
