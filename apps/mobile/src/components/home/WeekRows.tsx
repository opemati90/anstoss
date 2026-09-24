import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, PressableScale, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, space } from '../../theme/tokens'
import { HomeCard, HomeSection, eventHeadline, eventMetaLine } from './HomeKit'

export type WeekRowEvent = {
  id: string
  type?: string
  title: string
  date: string
  location?: string | null
  opponent?: string | null
  homeAway?: 'HOME' | 'AWAY' | null
  meetingAt?: string | null
  meetingPoint?: string | null
  yesCount?: number
  maybeCount?: number
  noCount?: number
  /** Active players at read time, from the feed. Preferred over `squadSize`. */
  squadSize?: number
  cancelledAt?: string | null
  cancelReason?: string | null
}

export type WeekRowsProps = {
  events: WeekRowEvent[]
  locale: string
  /** Team squad count (roster-ops squadCount), the fallback denominator. */
  squadSize?: number | null
  onCreate?: () => void
  emptyLabel: string
}

const MAX_ROWS = 5

/**
 * The manager's week: one list, each row carrying "Zusagen / Kader" in
 * tabular digits, so the one number a coach scans for sits on the row.
 * Cancelled events stay in the list, struck through, so a cancelled training
 * doesn't read as a free evening.
 */
export function WeekRows({ events, locale, squadSize, onCreate, emptyLabel }: WeekRowsProps) {
  const { t } = useTranslation()
  const rows = useMemo(() => events.slice(0, MAX_ROWS), [events])

  return (
    <HomeSection
      title={t('homeHub.thisWeek', { defaultValue: 'This week' })}
      actionLabel={onCreate ? t('homeHub.coach.addEvent', { defaultValue: 'Event' }) : undefined}
      actionIcon="plus"
      onAction={onCreate}
    >
      <HomeCard>
        {rows.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="footnote" color="secondary">
              {emptyLabel}
            </Text>
          </View>
        ) : (
          rows.map((event, index) => (
            <WeekRow
              key={event.id}
              event={event}
              locale={locale}
              squadSize={squadSize ?? null}
              showDivider={index > 0}
            />
          ))
        )}
      </HomeCard>
    </HomeSection>
  )
}

function WeekRow({
  event,
  locale,
  squadSize,
  showDivider,
}: {
  event: WeekRowEvent
  locale: string
  squadSize: number | null
  showDivider: boolean
}) {
  const c = useClubColors()
  const { t } = useTranslation()
  const isCancelled = Boolean(event.cancelledAt)
  const title = eventHeadline(event)
  const meta = eventMetaLine(event, locale, t)

  const yes = event.yesCount ?? 0
  const answered = yes + (event.maybeCount ?? 0) + (event.noCount ?? 0)
  // Guests and loans can push replies past the roster, so the denominator is
  // whichever is larger; "14/3" is never an honest number.
  const total = Math.max(event.squadSize ?? squadSize ?? 0, answered)
  const pending = Math.max(0, total - answered)
  const ratio = total > 0 ? `${yes}/${total}` : String(yes)

  const label = isCancelled
    ? `${title}, ${t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}`
    : `${title}, ${meta}, ${t('homeHub.coach.yesOfA11y', {
        defaultValue: '{{yes}} of {{total}} going',
        yes,
        total,
        count: yes,
      })}`

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/event-detail', params: { eventId: event.id } })}
      accessibilityRole="button"
      accessibilityLabel={label}
      haptic="tapLight"
      style={[styles.row, showDivider && { borderTopWidth: hairline, borderTopColor: c.borderSubtle }]}
    >
      <View style={styles.rowText}>
        <Text
          variant="callout"
          weight="semibold"
          color={isCancelled ? 'tertiary' : 'primary'}
          numberOfLines={2}
          style={isCancelled ? styles.struck : undefined}
        >
          {title}
        </Text>
        <Text variant="footnote" color={isCancelled ? 'error' : 'secondary'} tabular numberOfLines={2}>
          {isCancelled
            ? `${t('event.manage.cancelledBanner', { defaultValue: 'Cancelled' })}${
                event.cancelReason ? ` · ${event.cancelReason}` : ''
              }`
            : meta}
        </Text>
      </View>
      {!isCancelled ? (
        <View style={styles.count}>
          <Text variant="headline" weight="bold" color="primary" tabular>
            {ratio}
          </Text>
          {pending > 0 ? (
            <Text variant="caption1" color="secondary" tabular>
              {t('home.coach.pendingShort', { defaultValue: '{{count}} pending', count: pending })}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Icon name="chevron.right" size={14} color="tertiary" />
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  empty: { padding: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 4,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 4,
    minHeight: 64,
  },
  rowText: { flex: 1, gap: space['2xs'] },
  count: { alignItems: 'flex-end', gap: 1 },
  struck: { textDecorationLine: 'line-through' },
})
