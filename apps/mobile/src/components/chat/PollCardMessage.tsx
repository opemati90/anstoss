import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { useClubColors } from '../../context/ClubThemeContext'
import { RADIUS_CARD, RADIUS_INPUT, space } from '../../theme/tokens'
import { Haptics } from '../../utils/haptics'
import type { ChatMessage } from '../../hooks/useChat'
import { Icon, Text } from '../ui'

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
      style={[styles.card, { backgroundColor: c.surface }]}
    >
      <View style={styles.head}>
        <Text variant="label" color="secondary">
          {t('chatHub.poll.label')}
        </Text>
        {message.senderName ? (
          <Text variant="caption1" color="tertiary" numberOfLines={1} style={styles.sender}>
            {message.senderName}
          </Text>
        ) : (
          <View style={styles.sender} />
        )}
        {poll ? (
          <Text variant="caption1" color="secondary" tabular>
            {closed
              ? t('chatHub.poll.closed', { count: total })
              : t('chatHub.poll.votes', { count: total })}
          </Text>
        ) : null}
      </View>
      <Text variant="body" weight="bold" color="primary">
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
                  mine
                    ? { borderColor: c.ink, borderWidth: 2 }
                    : { borderColor: c.borderDefault, borderWidth: 1 },
                  { backgroundColor: c.surface },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.round(share * 100)}%`,
                      backgroundColor: mine ? c.primary50 : c.surfaceMuted,
                    },
                  ]}
                />
                {/* The pick is marked by shape too (thick ink ring + check), not colour alone. */}
                {mine ? <Icon name="checkmark.circle.fill" size={18} color={c.ink} /> : null}
                {/* L8: labels wrap fully at font scale 2.0; the row grows instead. */}
                <Text
                  variant="subheadline"
                  weight={mine ? 'bold' : 'semibold'}
                  color="primary"
                  style={styles.optionLabel}
                >
                  {option.label}
                </Text>
                <Text variant="data" color="primary" style={styles.optionCount}>
                  {option.votes}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    padding: space.md,
    gap: space.sm + 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sender: { flex: 1, minWidth: 0 },
  options: { gap: space.sm },
  option: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm + space.xs + 2,
    paddingVertical: space.sm,
    borderRadius: RADIUS_INPUT,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  optionCount: { fontSize: 17, lineHeight: 20 },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  optionLabel: { flex: 1, minWidth: 0, flexShrink: 1 },
  retry: { flexDirection: 'row', gap: space.sm, minHeight: 44, alignItems: 'center' },
})
