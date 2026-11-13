import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import type { ClubTheme } from '../../theme/club-theme'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { Avatar, Text } from '../ui'
import { CARD_PADDING, hairline, RADIUS_CARD, RADIUS_SM, space } from '../../theme/tokens'
import { availabilityPillLabel, formatDayMonth, loanOutLabel, rsvpLabel } from './format'
import type { AvailabilityKind, KaderMember } from './squadModel'

type KaderRowProps = {
  member: KaderMember
  onPress?: () => void
  /** First / last row of a grouped card: rounds the matching corners. */
  isFirst: boolean
  isLast: boolean
  /** Hint read after the row's facts, e.g. "Bearbeiten" or "Nachricht". */
  actionHint?: string
  /** Last trainings, oldest → newest (true = attended). Null hides the bars. */
  attendance?: boolean[] | null
  testID?: string
}

type TagTone = 'alert' | 'warning' | 'club' | 'quiet'

const AVAILABILITY_TONE: Partial<Record<AvailabilityKind, TagTone>> = {
  INJURED: 'alert',
  SUSPENDED: 'warning',
  UNAVAILABLE: 'quiet',
  AWAY: 'quiet',
}

function tagColors(tone: TagTone, c: ClubTheme): { bg: string; fg: string } {
  switch (tone) {
    case 'alert':
      return { bg: c.errorBg, fg: c.error }
    case 'warning':
      return { bg: c.warningBg, fg: c.warning }
    case 'club':
      return { bg: c.primary50, fg: c.textPrimary }
    default:
      return { bg: c.surfaceMuted, fg: c.textSecondary }
  }
}

/**
 * One squad row (design "16 Kader"): the shirt number in Barlow in its own
 * column, name with position, quiet status tags (Verletzt, Gesperrt, Probe,
 * Neu …) and the RSVP marker for the next event.
 *
 * Rows sit in one white radius-20 group per position line; the first and
 * last row round the group's corners and rows in between draw an inset
 * divider.
 *
 * Built to hold at 320pt and font scale 2.0: the number column grows with
 * the text (minWidth, not width), the name may take two lines, and the tags
 * sit under the name in a wrapping meta row instead of fighting the name for
 * horizontal space.
 */
export function KaderRow({ member, onPress, isFirst, isLast, actionHint, attendance, testID }: KaderRowProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  const pill = availabilityPillLabel(t, member.availability, locale)
  // The row's tag stays one word (design: "Verletzt"); the date moves into the
  // meta line so the name keeps its width.
  const kind = member.availability.kind
  const shortPill = kind === 'FIT' ? null : t(`kader.status.${SHORT_STATUS[kind]}`)
  const until =
    kind !== 'FIT' && 'until' in member.availability && member.availability.until
      ? t('kader.status.untilDate', { date: formatDayMonth(member.availability.until, locale) })
      : null
  const rsvp = rsvpLabel(t, member.rsvp)
  const meta = [
    member.isCoach
      ? t(member.role === 'HEAD_COACH' ? 'kader.roles.headCoach' : 'kader.roles.assistantCoach')
      : member.position,
    until,
    loanOutLabel(t, member, locale),
  ].filter(Boolean) as string[]
  const tags: Array<{ label: string; tone: TagTone }> = [
    shortPill ? { label: shortPill, tone: AVAILABILITY_TONE[member.availability.kind] ?? 'quiet' } : null,
    member.phase === 'TRIAL' ? { label: t('kader.row.trial'), tone: 'club' as const } : null,
    member.isNew ? { label: t('kader.row.new'), tone: 'club' as const } : null,
    member.operationalStatus === 'INACTIVE' ? { label: t('kader.row.inactive'), tone: 'quiet' as const } : null,
  ].filter(Boolean) as Array<{ label: string; tone: TagTone }>

  const attended = attendance ? attendance.filter(Boolean).length : 0
  const attendanceLabel = attendance
    ? t('kader.row.attendance', { count: attended, total: attendance.length })
    : null

  const a11y = [
    member.jerseyNumber != null ? t('kader.row.numberA11y', { number: member.jerseyNumber }) : null,
    member.name,
    member.isSelf ? t('kader.row.you') : null,
    ...meta.filter((part) => part !== until),
    pill,
    ...tags.slice(1).map((tag) => tag.label),
    rsvp,
    attendanceLabel,
    actionHint,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={a11y}
      android_ripple={onPress ? { color: c.borderSubtle } : undefined}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? c.surfaceMuted : c.surface },
        isFirst && styles.first,
        isLast && styles.last,
      ]}
    >
      {!isFirst ? <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} /> : null}
      <View style={styles.number}>
        {member.jerseyNumber != null ? (
          <Text variant="data" color="primary" style={styles.numberText}>
            {member.jerseyNumber}
          </Text>
        ) : (
          <Avatar size={30} src={member.avatarUrl} fallbackText={member.name} tone="neutral" />
        )}
      </View>
      <View style={styles.body}>
        <Text variant="body" weight="semibold" color="primary" numberOfLines={2}>
          {member.name}
          {member.isSelf ? (
            <Text variant="body" weight="regular" color="tertiary">{`  ${t('kader.row.you')}`}</Text>
          ) : null}
        </Text>
        {meta.length > 0 ? (
          <Text variant="caption1" weight="regular" color="secondary">
            {meta.join(' · ')}
          </Text>
        ) : null}
      </View>
      {tags.length > 0 ? (
        <View style={styles.tags}>
          {tags.slice(0, 1).map((tag) => {
            const tone = tagColors(tag.tone, c)
            return (
              <View key={tag.label} style={[styles.tag, { backgroundColor: tone.bg }]}>
                <Text variant="caption1" weight="bold" style={[styles.tagText, { color: tone.fg }]}>
                  {tag.label}
                </Text>
              </View>
            )
          })}
        </View>
      ) : null}
      {attendance && !member.isCoach ? (
        <View style={styles.bars} testID={testID ? `${testID}-attendance` : undefined}>
          {attendance.map((on, index) => (
            <View
              key={index}
              style={[styles.bar, { backgroundColor: on ? c.primary : c.surfaceSunken }]}
            />
          ))}
        </View>
      ) : null}
    </Pressable>
  )
}

const SHORT_STATUS: Record<Exclude<AvailabilityKind, 'FIT'>, string> = {
  INJURED: 'injured',
  SUSPENDED: 'suspended',
  UNAVAILABLE: 'unavailable',
  AWAY: 'away',
}

const NUMBER_COLUMN = 30
// The design's attendance bars: 6×16, 3pt apart.
const BAR_WIDTH = 6
const BAR_HEIGHT = 16
const BAR_GAP = 3

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 6,
    paddingHorizontal: CARD_PADDING,
    paddingVertical: space.sm + 4,
    overflow: 'hidden',
  },
  first: {
    borderTopLeftRadius: RADIUS_CARD,
    borderTopRightRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  last: {
    borderBottomLeftRadius: RADIUS_CARD,
    borderBottomRightRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  divider: {
    position: 'absolute',
    top: 0,
    left: CARD_PADDING,
    right: CARD_PADDING,
    height: hairline,
  },
  number: { minWidth: NUMBER_COLUMN, alignItems: 'center', flexShrink: 0 },
  numberText: { fontSize: 24, lineHeight: 28, textAlign: 'center' },
  body: { flex: 1, minWidth: 0, gap: space['2xs'] },
  tags: { flexShrink: 0, flexDirection: 'row', alignItems: 'center' },
  tag: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: RADIUS_SM,
    borderCurve: 'continuous',
  },
  tagText: { fontSize: 12, lineHeight: 14 },
  bars: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: BAR_GAP },
  bar: { width: BAR_WIDTH, height: BAR_HEIGHT, borderRadius: BAR_WIDTH / 2 },
})
