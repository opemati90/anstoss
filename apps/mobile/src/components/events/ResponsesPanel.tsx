import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { EventRsvpEntry, EventSquadMember } from '@anstoss/shared'
import { Avatar, Button, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { hexToRgba } from '../../theme/club-theme'
import { hairline, radius, space, SPACING_XXS } from '../../theme/tokens'
import { reasonLabel } from './eventFormat'

export type ResponsesPanelProps = {
  rsvps: EventRsvpEntry[]
  members: EventSquadMember[]
  canManage: boolean
  /** Before start: the "Offene erinnern" action for managers. */
  remind?: {
    onPress: () => void
    pending: boolean
    /** Cool-down until this ISO time (one reminder per 24 h). */
    cooldownUntil: string | null
    sentCount: number | null
  } | null
  /** After start: open the attendance sheet (managers). */
  onOpenAttendance?: (() => void) | null
}

type Person = {
  userId: string
  name: string
  avatarUrl?: string | null
  detail?: string | null
}

/**
 * Zusagen: who is coming, grouped the way a coach counts on a Thursday night.
 * Zugesagt, Vielleicht, Abgesagt (with the reason), Offen. The count bar is one
 * accent at three densities so it reads as one squad, not three alarms.
 */
export function ResponsesPanel({
  rsvps,
  members,
  canManage,
  remind,
  onOpenAttendance,
}: ResponsesPanelProps) {
  const { t } = useTranslation()
  const c = useClubColors()

  const groups = useMemo(() => {
    const byStatus = (status: EventRsvpEntry['status']) =>
      rsvps
        .filter((entry) => entry.status === status)
        .map<Person>((entry) => ({
          userId: entry.userId,
          name: entry.user.name,
          avatarUrl: entry.user.avatarUrl,
          detail:
            status === 'NO'
              ? [reasonLabel(entry.reason, t), entry.note].filter(Boolean).join(' · ') || null
              : entry.note ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    const answered = new Set(rsvps.map((entry) => entry.userId))
    const open = members
      .filter((member) => !answered.has(member.userId))
      .map<Person>((member) => ({
        userId: member.userId,
        name: member.name,
        avatarUrl: member.avatarUrl,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return { yes: byStatus('YES'), maybe: byStatus('MAYBE'), no: byStatus('NO'), open }
  }, [members, rsvps, t])

  const total = groups.yes.length + groups.maybe.length + groups.no.length + groups.open.length
  const cooling =
    remind?.cooldownUntil != null && new Date(remind.cooldownUntil).getTime() > Date.now()

  return (
    <View style={styles.root}>
      <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
        <View style={styles.counts}>
          <Count value={groups.yes.length} label={t('eventFlow.responses.yes')} strong />
          <Count value={groups.maybe.length} label={t('eventFlow.responses.maybe')} />
          <Count value={groups.no.length} label={t('eventFlow.responses.no')} />
          <Count value={groups.open.length} label={t('eventFlow.responses.open')} />
        </View>
        {total > 0 ? (
          <View
            style={[styles.bar, { backgroundColor: c.surfaceSunken }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {groups.yes.length ? (
              <View style={{ flex: groups.yes.length, backgroundColor: c.primary }} />
            ) : null}
            {groups.maybe.length ? (
              <View style={{ flex: groups.maybe.length, backgroundColor: hexToRgba(c.primary, 0.4) }} />
            ) : null}
            {groups.no.length ? (
              <View style={{ flex: groups.no.length, backgroundColor: c.borderStrong }} />
            ) : null}
            {groups.open.length ? <View style={{ flex: groups.open.length }} /> : null}
          </View>
        ) : null}
        {canManage && remind && groups.open.length > 0 ? (
          <Button
            label={
              cooling
                ? remind.sentCount != null
                  ? t('eventFlow.responses.remindSent', { count: remind.sentCount })
                  : t('eventFlow.responses.remindCooldown')
                : t('eventFlow.responses.remindOpen', { count: groups.open.length })
            }
            variant="bordered"
            size="md"
            fullWidth
            loading={remind.pending}
            disabled={remind.pending || cooling}
            onPress={remind.onPress}
            testID="event-remind-open"
          />
        ) : null}
        {canManage && onOpenAttendance ? (
          <Button
            label={t('eventFlow.responses.attendance')}
            variant="bordered"
            size="md"
            fullWidth
            onPress={onOpenAttendance}
            testID="event-open-attendance"
          />
        ) : null}
      </View>

      {total === 0 ? (
        <Text variant="subheadline" color="secondary" style={styles.emptyText}>
          {t('eventFlow.responses.empty')}
        </Text>
      ) : null}

      <Group title={t('eventFlow.responses.groupYes')} people={groups.yes} />
      <Group title={t('eventFlow.responses.groupMaybe')} people={groups.maybe} />
      <Group title={t('eventFlow.responses.groupNo')} people={groups.no} />
      <Group title={t('eventFlow.responses.groupOpen')} people={groups.open} muted />
    </View>
  )
}

function Count({ value, label, strong }: { value: number; label: string; strong?: boolean }) {
  return (
    <View style={styles.count} accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="title2" color={strong ? 'tint' : 'primary'} tabular>
        {String(value)}
      </Text>
      <Text variant="caption1" color="secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function Group({ title, people, muted }: { title: string; people: Person[]; muted?: boolean }) {
  const c = useClubColors()
  if (people.length === 0) return null
  return (
    <View style={styles.group}>
      <Text variant="footnote" weight="semibold" color="secondary" style={styles.groupTitle}>
        {`${title} · ${people.length}`}
      </Text>
      <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
        {people.map((person, index) => (
          <View
            key={person.userId}
            style={[
              styles.row,
              index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
            ]}
            accessible
            accessibilityLabel={[person.name, person.detail].filter(Boolean).join(', ')}
          >
            <Avatar size="sm" src={person.avatarUrl} fallbackText={person.name} />
            <View style={styles.rowText}>
              <Text variant="body" color={muted ? 'secondary' : 'primary'} numberOfLines={1}>
                {person.name}
              </Text>
              {person.detail ? (
                <Text variant="footnote" color="secondary" numberOfLines={2}>
                  {person.detail}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.md },
  summary: {
    padding: space.md,
    gap: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  counts: { flexDirection: 'row', justifyContent: 'space-between' },
  count: { flex: 1, gap: SPACING_XXS },
  bar: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  emptyText: { paddingHorizontal: space.xs },
  group: { gap: space.xs },
  groupTitle: { paddingHorizontal: space.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  list: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space.xs,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  rowText: { flex: 1, minWidth: 0 },
})
