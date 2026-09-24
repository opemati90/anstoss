import { useEffect, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { BottomSheet, Button, Icon, Text } from '../ui'
import { space } from '../../theme/tokens'
import { DateField } from './DateField'
import { formatDayMonth } from './format'
import { SheetHeader } from './SheetHeader'
import { patchRosterMember } from './rosterApi'
import { endOfDayIso, type KaderMember } from './squadModel'

type SelfStatusSheetProps = {
  visible: boolean
  member: KaderMember | null
  clubId: string
  teamId: string
  onClose: () => void
  onSaved: () => void
}

/**
 * "Status ändern" for the signed-in player: Urlaub (with an optional end
 * date) or back to fit. Injuries and Sperren are the coach's to set, so the
 * sheet explains them instead of offering a switch the server would refuse.
 */
export function SelfStatusSheet({
  visible,
  member,
  clubId,
  teamId,
  onClose,
  onSaved,
}: SelfStatusSheetProps) {
  const { t } = useTranslation()
  const locale = getAppLocale(getAppLanguage())
  const [until, setUntil] = useState<Date | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      setUntil(member?.absence === 'AWAY' && member.absenceUntil ? new Date(member.absenceUntil) : null)
    }
  }, [visible, member])

  if (!member) return null

  const availability = member.availability
  const isAway = availability.kind === 'AWAY'

  const submit = async (absence: 'AWAY' | 'NONE') => {
    setSaving(true)
    try {
      await patchRosterMember(clubId, teamId, member.userId, {
        absence,
        absenceUntil: absence === 'AWAY' && until ? endOfDayIso(until) : null,
      })
      onSaved()
      onClose()
    } catch {
      Alert.alert(t('kader.errors.title'), t('kader.errors.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const tomorrow = new Date(Date.now() + 86_400_000)

  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <SheetHeader
        title={t('kader.self.title')}
        cancelLabel={t('kader.actions.cancel')}
        onCancel={onClose}
      />
      <View style={styles.content}>
        {availability.kind === 'INJURED' || availability.kind === 'SUSPENDED' ? (
          <View style={styles.note}>
            <Icon
              name={availability.kind === 'INJURED' ? 'heart' : 'nosign'}
              size={20}
              color="secondary"
            />
            <Text variant="body" color="secondary" style={styles.noteText}>
              {availability.kind === 'INJURED'
                ? t('kader.self.injuredNote', { title: availability.title })
                : availability.until
                  ? t('kader.self.suspendedUntilNote', {
                      date: formatDayMonth(availability.until, locale),
                    })
                  : t('kader.self.suspendedNote')}
            </Text>
          </View>
        ) : (
          <>
            <Text variant="body" color="secondary">
              {isAway ? t('kader.self.awayIntro') : t('kader.self.fitIntro')}
            </Text>
            <DateField
              label={t('kader.self.awayUntil')}
              emptyLabel={t('kader.date.open')}
              value={until}
              minimumDate={tomorrow}
              onChange={setUntil}
              testID="self-status-until"
            />
            <Button
              label={isAway ? t('kader.self.updateAway') : t('kader.self.setAway')}
              variant="filled"
              size="lg"
              fullWidth
              loading={saving}
              disabled={saving}
              onPress={() => void submit('AWAY')}
            />
            {isAway ? (
              <Button
                label={t('kader.self.backFit')}
                variant="bordered"
                size="lg"
                fullWidth
                disabled={saving}
                onPress={() => void submit('NONE')}
              />
            ) : null}
          </>
        )}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    gap: space.md,
  },
  note: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  noteText: { flex: 1 },
})
