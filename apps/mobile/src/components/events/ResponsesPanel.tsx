import { useMemo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { EventRsvpEntry, EventSquadMember } from '@anstoss/shared'
import { Avatar, Button, SectionGroup, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { SPACING_LG, SPACING_MD, SPACING_SM, SPACING_XXS } from '../../theme/tokens'
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

type Status = 'YES' | 'MAYBE' | 'NO' | 'OPEN'

type Person = {
  userId: string
  name: string
  avatarUrl?: string | null
  status: Status
  /** Absage reason, shown beside the status ("Absage · Verletzt"). */
  reason?: string | null
  /** The player's own line, under the name. */
  note?: string | null
}

const ORDER: Record<Status, number> = { YES: 0, MAYBE: 1, NO: 2, OPEN: 3 }

/**
 * Zusagen (design 12, "Kader · 14 von 22 dabei"): one white list, everyone on
 * the team with their answer on the right. Zusage first, then Vielleicht,
 * Absage (with the reason), Offen. The club colour marks only Zusage, so the
 * list reads as one squad, not three alarms.
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

  const people = useMemo(() => {
    const answered = new Set(rsvps.map((entry) => entry.userId))
    const list: Person[] = [
      ...rsvps.map<Person>((entry) => ({
        userId: entry.userId,
        name: entry.user.name,
        avatarUrl: entry.user.avatarUrl,
        status: entry.status,
        reason: entry.status === 'NO' ? reasonLabel(entry.reason, t) : null,
        note: entry.note ?? null,
      })),
      ...members
        .filter((member) => !answered.has(member.userId))
        .map<Person>((member) => ({
          userId: member.userId,
          name: member.name,
          avatarUrl: member.avatarUrl,
          status: 'OPEN',
        })),
    ]
    return list.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name))
  }, [members, rsvps, t])

  const yes = people.filter((person) => person.status === 'YES').length
  const open = people.filter((person) => person.status === 'OPEN').length
  const cooling =
    remind?.cooldownUntil != null && new Date(remind.cooldownUntil).getTime() > Date.now()
  const showRemind = canManage && remind && open > 0
  const remindLabel = cooling
    ? remind?.sentCount != null
      ? t('eventFlow.responses.remindDone', { defaultValue: 'Reminded' })
      : t('eventFlow.responses.remindCooldown')
    : t('eventFlow.responses.remindShort', { count: open, defaultValue: 'Remind {{count}}' })
  const remindA11y =
    cooling && remind?.sentCount != null
      ? t('eventFlow.responses.remindSent', { count: remind.sentCount })
      : cooling
        ? t('eventFlow.responses.remindCooldown')
        : t('eventFlow.responses.remindOpen', { count: open })

  const statusLabel = (person: Person) => {
    if (person.status === 'OPEN') return t('eventFlow.responses.open')
    const base = t(
      person.status === 'YES'
        ? 'eventFlow.rsvp.yes'
        : person.status === 'MAYBE'
          ? 'eventFlow.rsvp.maybe'
          : 'eventFlow.rsvp.no',
    )
    return person.reason ? `${base} · ${person.reason}` : base
  }

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text variant="label" accessibilityRole="header" style={styles.headline}>
          {t('eventFlow.responses.headline', {
            yes,
            total: people.length,
            defaultValue: 'Squad · {{yes}} of {{total}} in',
          })}
        </Text>
        {showRemind && remind ? (
          <Pressable
            onPress={remind.onPress}
            disabled={remind.pending || cooling}
            accessibilityRole="button"
            accessibilityLabel={remindA11y}
            accessibilityState={{ disabled: remind.pending || cooling, busy: remind.pending }}
            hitSlop={4}
            style={({ pressed }) => [styles.remind, pressed && styles.pressed]}
            testID="event-remind-open"
          >
            <Text
              variant="subheadline"
              weight="semibold"
              color={cooling || remind.pending ? 'secondary' : 'tint'}
            >
              {remindLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {people.length === 0 ? (
        <Text variant="subheadline" color="secondary">
          {t('eventFlow.responses.empty')}
        </Text>
      ) : (
        <SectionGroup>
          {people.map((person) => {
            const status = statusLabel(person)
            return (
              <View
                key={person.userId}
                style={styles.row}
                accessible
                accessibilityLabel={[person.name, status, person.note].filter(Boolean).join(', ')}
              >
                <Avatar size={36} src={person.avatarUrl} fallbackText={person.name} tone="neutral" />
                <View style={styles.rowText}>
                  <Text
                    variant="callout"
                    weight="semibold"
                    color={person.status === 'OPEN' ? 'secondary' : 'primary'}
                    numberOfLines={1}
                  >
                    {person.name}
                  </Text>
                  {person.note ? (
                    <Text variant="footnote" color="secondary" numberOfLines={2}>
                      {person.note}
                    </Text>
                  ) : null}
                </View>
                <Text
                  variant="footnote"
                  weight="semibold"
                  numberOfLines={1}
                  color={
                    person.status === 'YES'
                      ? c.primary
                      : person.status === 'OPEN'
                        ? c.textSecondary
                        : c.textPrimary
                  }
                  style={styles.status}
                >
                  {status}
                </Text>
              </View>
            )
          })}
        </SectionGroup>
      )}

      {canManage && onOpenAttendance ? (
        <Button
          label={t('eventFlow.responses.attendance')}
          variant="bordered"
          size="lg"
          fullWidth
          onPress={onOpenAttendance}
          testID="event-open-attendance"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: SPACING_MD },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: SPACING_SM,
    minHeight: 44,
  },
  headline: { flexShrink: 1 },
  remind: { minHeight: 44, justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    minHeight: 54,
    paddingHorizontal: SPACING_LG,
    paddingVertical: SPACING_SM,
  },
  rowText: { flex: 1, minWidth: 0, gap: SPACING_XXS },
  status: { maxWidth: '45%', textAlign: 'right' },
})
