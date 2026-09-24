import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { TeamDutyAssignment } from '@anstoss/shared'
import { Text } from '../ui'
import {
  HomeCard,
  HomeRow,
  HomeSection,
  formatMoney,
  formatShortDate,
  useAccentText,
} from './HomeKit'
import type { HomeDues } from '../../hooks/usePlayerHome'

export type HomeTask = {
  id: string
  icon: string
  title: string
  detail?: string | null
  onPress?: () => void
}

/**
 * "Meine Aufgaben": the jobs someone has been given for the week
 * (Trikotwäsche, Kuchen, Fahrdienst). Hidden when there are none, so a
 * quiet week stays quiet.
 */
export function TasksSection({ tasks, title }: { tasks: HomeTask[]; title?: string }) {
  const { t } = useTranslation()
  if (tasks.length === 0) return null
  return (
    <HomeSection title={title ?? t('homeHub.myTasks', { defaultValue: 'My jobs' })}>
      <HomeCard>
        {tasks.map((task, index) => (
          <HomeRow
            key={task.id}
            icon={task.icon}
            tone="accent"
            title={task.title}
            detail={task.detail}
            showDivider={index > 0}
            onPress={task.onPress}
          />
        ))}
      </HomeCard>
    </HomeSection>
  )
}

type TFn = (key: string, opts?: Record<string, unknown>) => string

/** "Trikotwäsche", "Kabinendienst", "Leibchen waschen". */
export function dutyTitle(kind: string, t: TFn): string {
  if (kind === 'JERSEY_CLEANUP') return t('roster.jerseyCleanup', { defaultValue: 'Jersey wash' })
  if (kind === 'LOCKER_ROOM') return t('kader.duties.kind.lockerRoom')
  return t('roster.bibCleanup', { defaultValue: 'Bib wash' })
}

/** Same icons as the Aufgaben screen. */
export function dutyIcon(kind: string): string {
  return kind === 'LOCKER_ROOM' ? 'building.2' : 'shirt'
}

/** Map roster-ops kit duties to task rows. */
export function useDutyTasks(duties: TeamDutyAssignment[], locale: string): HomeTask[] {
  const { t } = useTranslation()
  return duties.slice(0, 3).map((duty) => ({
    id: duty.id,
    icon: dutyIcon(duty.kind),
    title: dutyTitle(duty.kind, t),
    detail: [
      duty.dueDate
        ? t('homeHub.dueBy', {
            defaultValue: 'by {{date}}',
            date: formatShortDate(duty.dueDate, locale),
          })
        : null,
      duty.notes,
    ]
      .filter(Boolean)
      .join(' · '),
    onPress: () => router.push('/aufgaben'),
  }))
}

/**
 * "Beitrag": one row, only while money is owed. Tapping opens the member's
 * own contributions, where they can pay or report a transfer.
 */
export function DuesRow({
  dues,
  locale,
  title,
}: {
  dues: HomeDues | null
  locale: string
  title?: string
}) {
  const { t } = useTranslation()
  const accent = useAccentText()
  if (!dues || dues.amounts.length === 0) return null
  // One formatted total per currency ("45,00 € + 20,00 CHF"), never summed.
  const amount = dues.amounts
    .map((entry) => formatMoney(entry.cents, entry.currency, locale))
    .join(' + ')
  return (
    <HomeSection title={title ?? t('homeHub.dues', { defaultValue: 'Membership fee' })}>
      <HomeCard>
        <HomeRow
          icon="banknote"
          tone={dues.overdue ? 'error' : 'warning'}
          title={t('homeHub.duesOpen', { defaultValue: '{{amount}} outstanding', amount })}
          detail={
            dues.overdue
              ? t('homeHub.duesOverdue', {
                  defaultValue: 'Overdue. Pay now or report your bank transfer.',
                })
              : t('homeHub.duesSoon', { defaultValue: 'Due soon. Pay now or report your bank transfer.' })
          }
          trailing={
            <Text variant="subheadline" weight="semibold" style={{ color: accent }}>
              {t('homeHub.pay', { defaultValue: 'Pay' })}
            </Text>
          }
          onPress={() => router.push('/my-contributions')}
        />
      </HomeCard>
    </HomeSection>
  )
}
