import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import type { ClubTheme } from '../../theme/club-theme'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { Avatar, Icon, Text, type IconName } from '../ui'
import { CARD_PADDING, hairline, RADIUS_CARD, RADIUS_SM, space } from '../../theme/tokens'
import { availabilityPillLabel, loanOutLabel, rsvpLabel } from './format'
import type { AvailabilityKind, KaderMember } from './squadModel'

type KaderRowProps = {
  member: KaderMember
  onPress?: () => void
  /** First / last row of a grouped card: rounds the matching corners. */
  isFirst: boolean
  isLast: boolean
  /** Hint read after the row's facts, e.g. "Bearbeiten" or "Nachricht". */
  actionHint?: string
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
 * L7: the RSVP marker carries a shape, not only a colour, so Zusage /
 * Vielleicht / Absage / offen stay distinguishable without colour vision.
 */
const RSVP_ICON: Record<'YES' | 'MAYBE' | 'NO' | 'NONE', { name: IconName; color: 'success' | 'warning' | 'error' | 'tertiary' }> = {
  YES: { name: 'checkmark.circle.fill', color: 'success' },
  MAYBE: { name: 'questionmark.circle.fill', color: 'warning' },
  NO: { name: 'xmark.circle.fill', color: 'error' },
  NONE: { name: 'ellipsis.circle', color: 'tertiary' },
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
export function KaderRow({ member, onPress, isFirst, isLast, actionHint, testID }: KaderRowProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const locale = getAppLocale(getAppLanguage())

  const pill = availabilityPillLabel(t, member.availability, locale)
  const rsvp = rsvpLabel(t, member.rsvp)
  const meta = [
    member.isCoach
      ? t(member.role === 'HEAD_COACH' ? 'kader.roles.headCoach' : 'kader.roles.assistantCoach')
      : member.position,
    loanOutLabel(t, member, locale),
  ].filter(Boolean) as string[]
  const tags: Array<{ label: string; tone: TagTone }> = [
    pill ? { label: pill, tone: AVAILABILITY_TONE[member.availability.kind] ?? 'quiet' } : null,
    member.phase === 'TRIAL' ? { label: t('kader.row.trial'), tone: 'club' as const } : null,
    member.isNew ? { label: t('kader.row.new'), tone: 'club' as const } : null,
    member.operationalStatus === 'INACTIVE' ? { label: t('kader.row.inactive'), tone: 'quiet' as const } : null,
  ].filter(Boolean) as Array<{ label: string; tone: TagTone }>

  const rsvpIcon = RSVP_ICON[member.rsvp ?? 'NONE']

  const a11y = [
    member.jerseyNumber != null ? t('kader.row.numberA11y', { number: member.jerseyNumber }) : null,
    member.name,
    member.isSelf ? t('kader.row.you') : null,
    ...meta,
    ...tags.map((tag) => tag.label),
    rsvp,
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
        {tags.length > 0 ? (
          <View style={styles.tags}>
            {tags.map((tag) => {
              const tone = tagColors(tag.tone, c)
              return (
                <View key={tag.label} style={[styles.tag, { backgroundColor: tone.bg }]}>
                  <Text variant="caption1" weight="bold" style={{ color: tone.fg }}>
                    {tag.label}
                  </Text>
                </View>
              )
            })}
          </View>
        ) : null}
      </View>
      {member.rsvp !== undefined && !member.isCoach ? (
        <View style={styles.rsvp} testID={testID ? `${testID}-rsvp-${member.rsvp ?? 'NONE'}` : undefined}>
          <Icon name={rsvpIcon.name} size={20} color={rsvpIcon.color} />
        </View>
      ) : null}
    </Pressable>
  )
}

const NUMBER_COLUMN = 30

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
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs + 2,
    marginTop: space['2xs'],
  },
  tag: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: RADIUS_SM,
    borderCurve: 'continuous',
  },
  rsvp: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
})
