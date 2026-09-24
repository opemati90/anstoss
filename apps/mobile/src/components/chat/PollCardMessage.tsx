import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import type { ChatMessage } from '../../hooks/useChat'
import { Icon, Text } from '../ui'
import { RADIUS_MD } from '../../theme/tokens'

type Poll = {
  id: string
  question: string
  closesAt: string | null
  closedAt: string | null
  totalVotes: number
  options: Array<{ id: string; label: string; votes: number }>
  myVoteOptionIds: string[]
}

type Props = {
  message: ChatMessage
  onLongPress?: () => void
}

/**
 * A poll answered where it is read: every option is a row with its live
 * share, the reader's pick is marked, and one tap votes. Replaces the old
 * "Tap to vote" bubble that opened a separate sheet.
 */
export function PollCardMessage({ message, onLongPress }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [poll, setPoll] = useState<Poll | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await api<Poll>(`/messages/${message.id}/poll`)
      if (data && Array.isArray(data.options)) {
        setPoll(data)
        setStatus('ready')
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }, [message.id])

  useEffect(() => {
    if (message.id.startsWith('pending:')) return
    void load()
  }, [load, message.id])

  const vote = useCallback(
    async (optionId: string) => {
      if (!poll || pendingId || poll.closedAt) return
      setPendingId(optionId)
      const previous = poll
      const hadVote = poll.myVoteOptionIds.length > 0
      // Optimistic: move my vote to the tapped option.
      setPoll({
        ...poll,
        myVoteOptionIds: [optionId],
        totalVotes: poll.totalVotes + (hadVote ? 0 : 1),
        options: poll.options.map((o) => ({
          ...o,
          votes:
            o.votes +
            (o.id === optionId && !poll.myVoteOptionIds.includes(o.id) ? 1 : 0) -
            (o.id !== optionId && poll.myVoteOptionIds.includes(o.id) ? 1 : 0),
        })),
      })
      try {
        await api(`/polls/${poll.id}/vote`, { method: 'POST', body: { optionId } })
        Haptics.success()
        const fresh = await api<Poll>(`/polls/${poll.id}`).catch(() => null)
        if (fresh && Array.isArray(fresh.options)) setPoll(fresh)
      } catch {
        setPoll(previous)
        Haptics.fail()
      } finally {
        setPendingId(null)
      }
    },
    [pendingId, poll],
  )

  const closed = Boolean(poll?.closedAt)
  const total = poll?.totalVotes ?? 0

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={250}
      accessibilityRole="summary"
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
    >
      <View style={styles.head}>
        <Icon name="chart.bar.fill" size={13} color={c.textSecondary} />
        <Text variant="caption1" weight="semibold" color="secondary">
          {t('chatHub.poll.label')}
        </Text>
        {message.senderName ? (
          <Text variant="caption1" color="tertiary" numberOfLines={1} style={styles.sender}>
            {message.senderName}
          </Text>
        ) : null}
      </View>
      <Text variant="body" weight="semibold" color="primary">
        {poll?.question ?? message.content}
      </Text>

      {status === 'loading' && !poll ? (
        <Text variant="footnote" color="tertiary">
          {t('common.loading')}
        </Text>
      ) : status === 'error' && !poll ? (
        <Pressable
          onPress={() => void load()}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
          style={styles.retry}
        >
          <Text variant="footnote" color="error">
            {t('chatHub.poll.loadFailed')}
          </Text>
          <Text variant="footnote" weight="semibold" color="tint">
            {t('common.retry')}
          </Text>
        </Pressable>
      ) : poll ? (
        <View style={styles.options}>
          {poll.options.map((option) => {
            const mine = poll.myVoteOptionIds.includes(option.id)
            const share = total > 0 ? option.votes / total : 0
            return (
              <Pressable
                key={option.id}
                onPress={() => void vote(option.id)}
                disabled={closed || !!pendingId}
                accessibilityRole="radio"
                accessibilityState={{ checked: mine, disabled: closed }}
                accessibilityLabel={t('chatHub.poll.optionA11y', {
                  label: option.label,
                  count: option.votes,
                })}
                style={({ pressed }) => [
                  styles.option,
                  { borderColor: mine ? c.primary : c.borderDefault },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.round(share * 100)}%`,
                      backgroundColor: mine ? c.primary50 : c.surfaceSunken,
                    },
                  ]}
                />
                <Icon
                  name={mine ? 'checkmark.circle.fill' : 'circle'}
                  size={18}
                  color={mine ? c.primary : c.textTertiary}
                />
                {/* L8: labels wrap fully at font scale 2.0; the row grows instead. */}
                <Text variant="subheadline" color="primary" style={styles.optionLabel}>
                  {option.label}
                </Text>
                <Text variant="footnote" tabular color="secondary">
                  {option.votes}
                </Text>
              </Pressable>
            )
          })}
          <Text variant="caption1" color="tertiary" tabular>
            {closed
              ? t('chatHub.poll.closed', { count: total })
              : t('chatHub.poll.votes', { count: total })}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

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
  sender: { flexShrink: 1, marginLeft: space.xs },
  options: { gap: space.sm },
  option: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: space.sm,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  optionLabel: { flex: 1, minWidth: 0, flexShrink: 1 },
  retry: { flexDirection: 'row', gap: space.sm, minHeight: 44, alignItems: 'center' },
})
