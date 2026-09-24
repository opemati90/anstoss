import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../../i18n'
import { Avatar, Icon, StatusPill, Text, type IconName, type StatusPillTone } from '../ui'
import { hairline, radius, space } from '../../theme/tokens'
import { availabilityPillLabel, loanOutLabel, rsvpLabel } from './format'
import type { KaderMember } from './squadModel'

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

const PILL_TONE: Record<string, StatusPillTone> = {
  INJURED: 'error',
  SUSPENDED: 'warning',
  UNAVAILABLE: 'neutral',
  AWAY: 'neutral',
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
 * One squad row: shirt number in its own tabular column, avatar, name with
 * position, an availability pill only when the player is not fit, and the
 * RSVP dot for the next event.
 *
 * Built to hold at 320pt and font scale 2.0: the number column grows with
 * the text (minWidth, not width), the name may take two lines, and the pill
 * sits under the name in a wrapping meta row instead of fighting the name
 * for horizontal space.
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
    member.isNew ? t('kader.row.new') : null,
    member.operationalStatus === 'INACTIVE' ? t('kader.row.inactive') : null,
    member.phase === 'TRIAL' ? t('kader.row.trial') : null,
    loanOutLabel(t, member, locale),
  ].filter(Boolean) as string[]

  const rsvpIcon = RSVP_ICON[member.rsvp ?? 'NONE']

  const a11y = [
    member.jerseyNumber != null ? t('kader.row.numberA11y', { number: member.jerseyNumber }) : null,
    member.name,
    member.isSelf ? t('kader.row.you') : null,
    ...meta,
    pill,
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
        {
          backgroundColor: pressed ? c.surfaceSunken : c.surface,
          borderColor: c.borderDefault,
        },
        isFirst ? styles.first : styles.middle,
        isLast && styles.last,
      ]}
    >
      {!isFirst ? <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} /> : null}
      <Text variant="subheadline" color="tertiary" tabular style={styles.number}>
        {member.jerseyNumber ?? ''}
      </Text>
      <Avatar size="md" src={member.avatarUrl} fallbackText={member.name} />
      <View style={styles.body}>
        <Text variant="body" weight="semibold" color="primary" numberOfLines={2}>
          {member.name}
          {member.isSelf ? (
            <Text variant="body" weight="regular" color="tertiary">{`  ${t('kader.row.you')}`}</Text>
          ) : null}
        </Text>
        {meta.length > 0 || pill ? (
          <View style={styles.meta}>
            {meta.length > 0 ? (
              <Text variant="footnote" color="secondary" style={styles.metaText}>
                {meta.join(' · ')}
              </Text>
            ) : null}
            {pill ? (
              <StatusPill label={pill} tone={PILL_TONE[member.availability.kind] ?? 'neutral'} />
            ) : null}
          </View>
        ) : null}
      </View>
      {member.rsvp !== undefined && !member.isCoach ? (
        <View style={styles.rsvp} testID={testID ? `${testID}-rsvp-${member.rsvp ?? 'NONE'}` : undefined}>
          <Icon name={rsvpIcon.name} size={18} color={rsvpIcon.color} />
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingLeft: space.xs,
    paddingRight: space.md,
    paddingVertical: space.sm + 2,
    borderLeftWidth: hairline,
    borderRightWidth: hairline,
    overflow: 'hidden',
  },
  first: {
    borderTopWidth: hairline,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderCurve: 'continuous',
  },
  middle: { borderTopWidth: 0 },
  last: {
    borderBottomWidth: hairline,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    borderCurve: 'continuous',
  },
  divider: {
    position: 'absolute',
    top: 0,
    // Inset to the name column: number (28) + avatar (40) + two gaps.
    left: space.xs + 28 + (space.sm + 2) * 2 + 40,
    right: 0,
    height: hairline,
  },
  number: { minWidth: 28, textAlign: 'right', flexShrink: 0 },
  body: { flex: 1, minWidth: 0, gap: space.xs },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs + 2,
  },
  metaText: { flexShrink: 1 },
  rsvp: { flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
})
