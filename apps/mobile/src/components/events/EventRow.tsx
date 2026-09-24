import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space, RADIUS_INPUT, SPACING_XXS } from '../../theme/tokens'
import { eventDisplayTitle, eventTimeLine, type EventLike } from './eventFormat'
import { RsvpControl, type AbsenceDetail, type RsvpStatus } from './RsvpControl'

export type EventRowEvent = EventLike & {
  id: string
  location: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
  myRsvpStale?: boolean
}

export type EventRowProps = {
  event: EventRowEvent
  locale: string
  onOpen: () => void
  /** The answer to show and change. Omit to render the row without a control. */
  rsvp?: {
    value: RsvpStatus | null
    onChange: (status: RsvpStatus, absence?: AbsenceDetail) => void
    pending?: boolean
    /** A parent answering for a child: "Mia". */
    subjectName?: string | null
  }
  /** Small leading label above the title, e.g. "Mia · U11" or a team badge. */
  eyebrow?: string | null
  /** Right-aligned summary for coaches, e.g. "14/18". */
  trailing?: string | null
  trailingHint?: string | null
  testID?: string
}

/**
 * One schedule row: date block · title · "Treff 13:30 · Anstoß 14:30" and,
 * for players and parents, the answer right there. Everything a Kreisliga
 * player needs from the list without opening anything.
 */
export const EventRow = memo(function EventRow({
  event,
  locale,
  onOpen,
  rsvp,
  eyebrow,
  trailing,
  trailingHint,
  testID,
}: EventRowProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const date = new Date(event.date)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    .format(date)
    .replace('.', '')
    .toUpperCase()
  const dayNumber = String(date.getDate()).padStart(2, '0')
  const title = eventDisplayTitle(event, t)
  const cancelled = Boolean(event.cancelledAt)
  const timeLine = eventTimeLine(event, locale, t)
  const subline = cancelled
    ? [t('eventFlow.cancelled'), event.cancelReason].filter(Boolean).join(' · ')
    : event.myRsvpStale
      ? t('eventFlow.list.rescheduled')
      : event.location
  const typeLabel = t(`eventFlow.type.${event.type}`)

  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
    >
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={[
          eyebrow,
          title,
          new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(
            date,
          ),
          timeLine,
          subline,
          trailingHint,
        ]
          .filter(Boolean)
          .join(', ')}
        android_ripple={{ color: c.surfaceSunken }}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <View style={[styles.dateBlock, { backgroundColor: c.surfaceSunken }]}>
          <Text variant="caption1" color="secondary" style={styles.weekday}>
            {weekday}
          </Text>
          <Text variant="title3" color={cancelled ? 'tertiary' : 'primary'} tabular style={styles.day}>
            {dayNumber}
          </Text>
        </View>

        <View style={styles.body}>
          {eyebrow ? (
            <Text variant="caption1" color="secondary" numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text
            variant="headline"
            weight="semibold"
            color={cancelled ? 'tertiary' : 'primary'}
            numberOfLines={2}
            style={cancelled ? styles.struck : undefined}
          >
            {title}
          </Text>
          {/* M5: never truncated. At 320pt or font scale 2.0 "Treff 13:30 ·
              Anstoß 14:30" wraps instead of hiding the kickoff. */}
          <Text
            variant="subheadline"
            color={cancelled ? 'tertiary' : 'primary'}
            tabular
            testID={testID ? `${testID}-time` : undefined}
          >
            {(event.type === 'TRAINING' || event.type === 'OTHER') && title !== typeLabel
              ? `${typeLabel} · ${timeLine}`
              : timeLine}
          </Text>
          {subline ? (
            <Text
              variant="footnote"
              color={event.myRsvpStale && !cancelled ? 'tint' : 'secondary'}
              numberOfLines={1}
            >
              {subline}
            </Text>
          ) : null}
        </View>

        {trailing ? (
          <View style={styles.trailing}>
            <Text variant="headline" weight="semibold" color="primary" tabular>
              {trailing}
            </Text>
            {trailingHint ? (
              <Text variant="caption1" color="tertiary" numberOfLines={1}>
                {trailingHint}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Icon name="chevron.right" size={14} color="tertiary" />
      </Pressable>

      {rsvp && !cancelled ? (
        <RsvpControl
          value={rsvp.value}
          onChange={rsvp.onChange}
          disabled={rsvp.pending}
          subjectName={rsvp.subjectName}
          size="compact"
          testID={testID ? `${testID}-rsvp` : undefined}
        />
      ) : null}
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.md,
    marginBottom: space.sm,
    padding: space.sm + space.xs,
    gap: space.sm + space.xs,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm + space.xs },
  pressed: { opacity: 0.7 },
  dateBlock: {
    minWidth: 52,
    minHeight: 56,
    paddingHorizontal: space.xs,
    paddingVertical: space.xs,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekday: { fontFamily: fonts.label, letterSpacing: 0.6 },
  day: { fontFamily: fonts.data },
  body: { flex: 1, minWidth: 0, gap: SPACING_XXS },
  struck: { textDecorationLine: 'line-through' },
  trailing: { alignItems: 'flex-end', gap: 1 },
})
