import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { FormInput } from '../FormInput'
import { BottomSheet, Button, Icon, ListRow, Text, type IconName } from '../ui'
import type { ChatMessage } from '../../hooks/useChat'

export type ComposeAction = 'photo' | 'poll' | 'event' | 'lineup'

type UpcomingEvent = {
  id: string
  title: string
  type: string
  date: string
  location?: string | null
  cancelledAt?: string | null
}

type Props = {
  visible: boolean
  clubId: string
  teamId: string
  channelId: string | null
  locale: string
  onClose: () => void
  /** Photo and lineup are handled by the caller (picker / route). */
  onAction: (action: 'photo' | 'lineup') => void
  /** A message this sheet created through REST, for the caller to append. */
  onPosted: (message: ChatMessage) => void
}

type Step = 'menu' | 'event' | 'poll'

/**
 * What a manager can put into the conversation besides text: a photo, a
 * poll, an event card people answer inline, or the lineup. Announcements
 * are not in here any more: in an Ankündigungen channel the plain send is
 * the announcement.
 */
export function ComposeSheet({
  visible,
  clubId,
  teamId,
  channelId,
  locale,
  onClose,
  onAction,
  onPosted,
}: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<Step>('menu')
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])

  useEffect(() => {
    if (!visible) {
      setStep('menu')
      setEvents(null)
      setPosting(false)
      setError(null)
      setQuestion('')
      setOptions(['', ''])
    }
  }, [visible])

  useEffect(() => {
    if (step !== 'event' || events !== null) return
    api<UpcomingEvent[]>(
      `/clubs/${clubId}/events?${new URLSearchParams({ teamId, scope: 'upcoming' }).toString()}`,
    )
      .then((list) => setEvents((Array.isArray(list) ? list : []).filter((e) => !e.cancelledAt)))
      .catch(() => setEvents([]))
  }, [clubId, events, step, teamId])

  const shareEvent = useCallback(
    async (event: UpcomingEvent) => {
      if (posting) return
      setPosting(true)
      setError(null)
      try {
        const created = await api<ChatMessage>(`/teams/${teamId}/messages/rsvp-poll`, {
          method: 'POST',
          body: { eventId: event.id, channelId: channelId ?? undefined },
        })
        onPosted(created)
        onClose()
      } catch {
        setError(t('chat.compose.postFailed', { defaultValue: "Couldn't post. Try again." }))
      } finally {
        setPosting(false)
      }
    },
    [channelId, onClose, onPosted, posting, t, teamId],
  )

  const filledOptions = options.map((o) => o.trim()).filter(Boolean)
  const canPostPoll = question.trim().length > 0 && filledOptions.length >= 2 && !posting

  const postPoll = useCallback(async () => {
    if (!canPostPoll) return
    setPosting(true)
    setError(null)
    try {
      const created = await api<ChatMessage>(`/teams/${teamId}/messages/poll`, {
        method: 'POST',
        body: { question: question.trim(), options: filledOptions, channelId: channelId ?? undefined },
      })
      onPosted(created)
      onClose()
    } catch {
      setError(t('chat.compose.postFailed', { defaultValue: "Couldn't post. Try again." }))
    } finally {
      setPosting(false)
    }
  }, [canPostPoll, channelId, filledOptions, onClose, onPosted, question, t, teamId])

  const menu: Array<{ key: ComposeAction; icon: IconName; title: string; subtitle: string }> = [
    {
      key: 'photo',
      icon: 'photo',
      title: t('chatHub.compose.photo'),
      subtitle: t('chatHub.compose.photoHint'),
    },
    {
      key: 'poll',
      icon: 'chart.bar',
      title: t('chat.compose.poll', { defaultValue: 'Poll' }),
      subtitle: t('chat.compose.pollHint', { defaultValue: 'Ask the team a question' }),
    },
    {
      key: 'event',
      icon: 'calendar',
      title: t('chat.compose.shareEvent', { defaultValue: 'Share event' }),
      subtitle: t('chat.compose.shareEventHint', { defaultValue: 'A card people can reply to' }),
    },
    {
      key: 'lineup',
      icon: 'figure.soccer',
      title: t('chatHub.compose.lineup'),
      subtitle: t('chat.compose.shareLineupHint', { defaultValue: 'From the lineup builder' }),
    },
  ]

  const formatWhen = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit', hourCycle: 'h23',
      minute: '2-digit',
    }).format(new Date(iso))

  return (
    <BottomSheet
      visible={visible}
      onClose={posting ? () => undefined : onClose}
      heightPct="auto"
      paddingBottom={insets.bottom + space.md}
    >
      <View style={styles.body}>
        <View style={styles.headerRow}>
          {step !== 'menu' ? (
            <Pressable
              onPress={() => setStep('menu')}
              accessibilityRole="button"
              accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
              hitSlop={8}
              style={styles.backBtn}
            >
              <Icon name="chevron.left" size={18} color="secondary" />
            </Pressable>
          ) : null}
          <Text variant="title3" weight="bold" color="primary" style={styles.title}>
            {step === 'event'
              ? t('chat.compose.pickEvent', { defaultValue: 'Which event?' })
              : step === 'poll'
                ? t('chat.compose.poll', { defaultValue: 'Poll' })
                : t('chat.compose.title', { defaultValue: 'Add to the chat' })}
          </Text>
          <Pressable
            onPress={onClose}
            disabled={posting}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            hitSlop={8}
          >
            <Text variant="callout" color="secondary">
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>

        {error ? (
          <Text variant="footnote" style={{ color: c.error }}>
            {error}
          </Text>
        ) : null}

        {step === 'menu' ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
            {menu.map((item, index) => (
              <ListRow
                key={item.key}
                title={item.title}
                subtitle={item.subtitle}
                left={
                  <View style={[styles.iconWell, { backgroundColor: c.surfaceSunken }]}>
                    <Icon name={item.icon} size={18} color="secondary" />
                  </View>
                }
                showChevron
                onPress={() => {
                  if (item.key === 'event') setStep('event')
                  else if (item.key === 'poll') setStep('poll')
                  else onAction(item.key)
                }}
                style={index > 0 ? { borderTopWidth: hairline, borderTopColor: c.borderSubtle } : undefined}
              />
            ))}
          </View>
        ) : null}

        {step === 'event' ? (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
            {events === null ? (
              <View style={styles.empty}>
                <Text variant="footnote" color="secondary">
                  {t('common.loading', { defaultValue: 'Loading…' })}
                </Text>
              </View>
            ) : events.length === 0 ? (
              <View style={styles.empty}>
                <Text variant="footnote" color="secondary">
                  {t('chat.compose.noUpcoming', { defaultValue: 'Nothing upcoming to share.' })}
                </Text>
              </View>
            ) : (
              events.slice(0, 6).map((event, index) => (
                <ListRow
                  key={event.id}
                  title={event.title}
                  subtitle={[formatWhen(event.date), event.location].filter(Boolean).join(' · ')}
                  disabled={posting}
                  showChevron
                  onPress={() => void shareEvent(event)}
                  style={index > 0 ? { borderTopWidth: hairline, borderTopColor: c.borderSubtle } : undefined}
                />
              ))
            )}
          </View>
        ) : null}

        {step === 'poll' ? (
          <View style={styles.form}>
            <FormInput
              label={t('chat.compose.pollQuestion', { defaultValue: 'Question' })}
              value={question}
              onChangeText={setQuestion}
              placeholder={t('chat.compose.pollQuestionPlaceholder', {
                defaultValue: 'Train Thursday or Friday?',
              })}
              maxLength={140}
              autoFocus
            />
            {options.map((value, index) => (
              <FormInput
                key={index}
                label={t('chat.compose.pollOption', { defaultValue: 'Option {{n}}', n: index + 1 })}
                value={value}
                onChangeText={(text) =>
                  setOptions((prev) => prev.map((o, i) => (i === index ? text : o)))
                }
                maxLength={60}
              />
            ))}
            {options.length < 6 ? (
              <Pressable
                onPress={() => setOptions((prev) => [...prev, ''])}
                accessibilityRole="button"
                accessibilityLabel={t('chat.compose.addOption', { defaultValue: 'Add option' })}
                style={styles.addOption}
              >
                <Icon name="plus.circle" size={16} color={c.primary} />
                <Text variant="footnote" weight="semibold" style={{ color: c.primary }}>
                  {t('chat.compose.addOption', { defaultValue: 'Add option' })}
                </Text>
              </Pressable>
            ) : null}
            <Button
              label={t('chat.compose.postPoll', { defaultValue: 'Post poll' })}
              variant="filled"
              size="lg"
              fullWidth
              loading={posting}
              disabled={!canPostPoll}
              onPress={() => void postPoll()}
            />
          </View>
        ) : null}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { padding: space.md },
  form: { gap: space.sm },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2xs'] + 2,
    minHeight: 44,
  },
})
