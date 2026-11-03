import { useRef, useState } from 'react'
import { Switch, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import { ListRow, SectionGroup, Text } from '../ui'
import { SelectionSheet } from '../SelectionSheet'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { deadlinePreset, type AvailabilityPolicy } from './availabilityPolicy'
import { space } from '../../theme/tokens'

type Change = { deadline?: string | null; locked?: boolean }
export function AvailabilityPolicySection({ policy, canManage, closed, onChange }: {
  policy: AvailabilityPolicy; canManage: boolean; closed: boolean; onChange: (change: Change) => Promise<void>
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const busy = useRef(false)
  const save = async (change: Change) => {
    if (!canManage || busy.current) return
    busy.current = true; setSaving(true); setFailed(false)
    try { await onChange(change) } catch { setFailed(true) }
    finally { busy.current = false; setSaving(false) }
  }
  const deadline = policy.rsvpDeadline ? new Date(policy.rsvpDeadline).toLocaleString(getAppLocale(getAppLanguage()), {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }) : t('eventFlow.availability.noDeadline')
  const options = [
    { value: 'none', label: t('eventFlow.availability.noDeadline') },
    ...[48, 24, 2, 0].filter((hours) => deadlinePreset(policy.date, hours)).map((hours) => ({
      value: String(hours), label: t(hours ? 'eventFlow.availability.hoursBefore' : 'eventFlow.availability.atStart', { count: hours }),
    })),
  ]
  return <>
    <SectionGroup header={t('eventFlow.availability.title')} footer={closed ? t('eventFlow.availability.closedHint') : undefined}>
      <ListRow title={t(closed ? 'eventFlow.availability.closed' : 'eventFlow.availability.open')}
        subtitle={t('eventFlow.availability.deadlineValue', { value: deadline })}
        onPress={canManage && !saving ? () => setOpen(true) : undefined} showChevron={canManage}
        testID="event-availability-policy" />
      {canManage ? <ListRow title={t('eventFlow.availability.lock')} subtitle={t('eventFlow.availability.lockHint')}
        right={<Switch value={Boolean(policy.rsvpLocked)} disabled={saving}
          accessibilityLabel={t('eventFlow.availability.lock')} testID="event-availability-lock"
          trackColor={{ true: c.primary }} onValueChange={(locked) => void save({ locked })} />} /> : null}
      {failed ? <View accessibilityRole="alert" style={{ padding: space.md }}><Text color="error">{t('eventFlow.availability.saveFailed')}</Text></View> : null}
    </SectionGroup>
    <SelectionSheet visible={open} title={t('eventFlow.availability.chooseDeadline')}
      description={t('eventFlow.availability.deadlineHint')} options={options} selectedValue={policy.rsvpDeadline ? '' : 'none'}
      onClose={() => setOpen(false)} onSelect={(value) => {
        if (value === 'none') void save({ deadline: null })
        else {
          const valueAtTap = deadlinePreset(policy.date, Number(value))
          if (valueAtTap) void save({ deadline: valueAtTap })
          else setFailed(true)
        }
      }} />
  </>
}
