import { memo } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { ChatMessage } from '../../hooks/useChat'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { Icon, Text } from '../ui'
import { clockTime } from './chatGrouping'
import { POSITION_CODES, slotsByLine } from './lineupFormations'

type Slot = { position: string; playerName: string }

type Props = {
  message: ChatMessage
  locale: string
  onLongPress?: () => void
  onDoubleTap?: () => void
}

export function positionLabel(position: string, t: TFunction): string {
  const code = position.trim().toUpperCase()
  return POSITION_CODES.has(code) ? t(`chatThread.positions.${code}`) : position
}

/**
 * A lineup card, in channels and DMs: formation header, the event or card
 * title, and the XI drawn on a flat pitch (goal at the bottom). Legacy
 * channel lineups without slots show their text XI.
 */
export const LineupCardMessage = memo(function LineupCardMessage({ message, locale, onLongPress }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const meta = message.attachmentMeta ?? null
  const formation = typeof meta?.formation === 'string' ? meta.formation : null
  const slots: Slot[] = Array.isArray(meta?.slots)
    ? (meta.slots as Slot[]).filter((s) => s && typeof s.position === 'string')
    : []
  const lines = formation && slots.length > 0 ? slotsByLine(formation, slots) : null
  const title =
    (typeof meta?.title === 'string' && meta.title) ||
    (typeof meta?.opponent === 'string' && meta.opponent ? t('chatThread.lineup.versus', { opponent: meta.opponent }) : null)
  const eventDate =
    typeof meta?.eventDate === 'string' && Number.isFinite(new Date(meta.eventDate).getTime())
      ? new Intl.DateTimeFormat(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(meta.eventDate))
      : null
  const a11yTeam = slots.map((s) => `${positionLabel(s.position, t)} ${s.playerName}`).join(', ')

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={250}
      accessibilityRole="summary"
      accessibilityLabel={[
        formation ? t('chatThread.lineup.withFormation', { formation }) : t('chatThread.lineup.label'),
        title,
        eventDate,
        a11yTeam,
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint={t('chat.bubbleHint')}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
      testID={`chat-lineup-card-${message.id}`}
    >
      <View style={styles.head}>
        <Icon name="figure.soccer" size={14} color={c.textSecondary} />
        <Text variant="caption1" weight="semibold" color="secondary" style={styles.flex}>
          {formation ? t('chatThread.lineup.withFormation', { formation }) : t('chatThread.lineup.label')}
        </Text>
        <Text variant="caption1" color="tertiary" tabular>
          {clockTime(message.createdAt, locale)}
        </Text>
      </View>
      {title ? (
        <Text variant="headline" weight="semibold" color="primary">
          {title}
        </Text>
      ) : null}
      {eventDate ? (
        <Text variant="footnote" color="secondary" tabular>
          {eventDate}
        </Text>
      ) : null}

      {lines ? (
        <View
          style={[styles.pitch, { backgroundColor: c.surfaceSunken, borderColor: c.borderSubtle }]}
          importantForAccessibility="no-hide-descendants"
        >
          <View style={[styles.halfway, { backgroundColor: c.borderDefault }]} />
          {[...lines].reverse().map((line, lineIndex) => (
            <View key={lineIndex} style={styles.line}>
              {line.map((slot, slotIndex) => (
                <View key={`${lineIndex}-${slotIndex}`} style={styles.slot}>
                  <View style={[styles.dot, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
                    <Text variant="caption2" weight="semibold" color="primary" numberOfLines={1}>
                      {positionLabel(slot.position, t)}
                    </Text>
                  </View>
                  <Text variant="caption1" color="primary" numberOfLines={2} style={styles.slotName}>
                    {slot.playerName || t('chatThread.lineup.open')}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : slots.length > 0 ? (
        <View style={styles.list}>
          {slots.map((slot, index) => (
            <View key={index} style={styles.listRow}>
              <Text variant="footnote" weight="semibold" color="secondary" style={styles.listPos}>
                {positionLabel(slot.position, t)}
              </Text>
              <Text variant="subheadline" color="primary" style={styles.flex}>
                {slot.playerName || t('chatThread.lineup.open')}
              </Text>
            </View>
          ))}
        </View>
      ) : message.content ? (
        <Text variant="body" color="primary">
          {message.content}
        </Text>
      ) : null}

      {message.senderName ? (
        <Text variant="footnote" color="tertiary">
          {t('chatThread.lineup.sharedBy', { name: message.senderName })}
        </Text>
      ) : null}
    </Pressable>
  )
})

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    padding: space.md,
    gap: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1, minWidth: 0 },
  pitch: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    gap: space.md,
    overflow: 'hidden',
  },
  halfway: { position: 'absolute', left: 0, right: 0, top: '50%', height: hairline },
  line: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  slot: { flex: 1, alignItems: 'center', gap: space.xs, minWidth: 0, paddingHorizontal: space['2xs'] },
  dot: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: space.xs,
    borderRadius: radius.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotName: { textAlign: 'center' },
  list: { gap: space.xs },
  listRow: { flexDirection: 'row', gap: space.sm, alignItems: 'baseline' },
  listPos: { minWidth: 40 },
})
