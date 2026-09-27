import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ReportReason } from '@anstoss/shared'
import { useClubColors } from '../../context/ClubThemeContext'
import { fetchPeerMessages, reportDirectMessage, type PeerMessage } from '../../api/chatInfo'
import { hairline, radius, space } from '../../theme/tokens'
import { BottomSheet, Button, Icon, Text } from '../ui'
import { ReportReasonList } from './ReportReasonList'

type Props = {
  visible: boolean
  onClose: () => void
  clubId: string
  conversationId: string
  peer: { id: string; name: string }
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'nothing' }
  | { kind: 'ready'; messages: PeerMessage[] }
  | { kind: 'error' }

const PREVIEW_KEYS: Record<string, string> = {
  IMAGE: 'chatHub.preview.photo',
  VIDEO: 'chatHub.preview.video',
  VOICE: 'chatHub.preview.voice',
  LINEUP: 'chatHub.preview.lineup',
  FILE: 'chatHub.preview.file',
}

/**
 * "Nutzer melden" from DM info (M6). The reporter picks the specific message
 * of the peer that goes to the moderators (nothing is preselected), then the
 * reason, both as sheet rows. In the conversation the same report is one
 * long-press away on the message itself.
 */
export function UserReportSheet({ visible, onClose, clubId, conversationId, peer }: Props) {
  const { t, i18n } = useTranslation()
  const c = useClubColors()
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [messageId, setMessageId] = useState<string | null>(null)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'sent' | 'failed' | null>(null)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setPhase({ kind: 'loading' })
    setMessageId(null)
    setReason(null)
    setResult(null)
    fetchPeerMessages(clubId, conversationId, peer.id)
      .then((messages) => {
        if (cancelled) return
        setPhase(messages.length > 0 ? { kind: 'ready', messages } : { kind: 'nothing' })
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [clubId, conversationId, peer.id, visible])

  const submit = async () => {
    if (!messageId || !reason || sending) return
    setSending(true)
    setResult(null)
    try {
      await reportDirectMessage(messageId, reason)
      setResult('sent')
    } catch {
      setResult('failed')
    } finally {
      setSending(false)
    }
  }

  const previewOf = (m: PeerMessage) =>
    m.messageType === 'TEXT' ? m.content : t(PREVIEW_KEYS[m.messageType] ?? 'chatHub.preview.file')
  const timeOf = (iso: string) => {
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) return ''
    return new Intl.DateTimeFormat(i18n.language, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit', hourCycle: 'h23',
      minute: '2-digit',
    }).format(date)
  }

  return (
    <BottomSheet visible={visible} onClose={sending ? () => undefined : onClose} heightPct="auto">
      <ScrollView contentContainerStyle={styles.body} testID="chat-info-report-sheet" keyboardShouldPersistTaps="handled">
        <Text variant="title3" weight="bold" color="primary" accessibilityRole="header">
          {t('chatInbox.report.title', { name: peer.name })}
        </Text>

        {phase.kind === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={c.textTertiary} />
            <Text variant="footnote" color="secondary">
              {t('chatInbox.report.loading')}
            </Text>
          </View>
        ) : phase.kind === 'nothing' ? (
          <Text variant="body" color="secondary">
            {t('chatHub.info.reportNothingBody', { name: peer.name })}
          </Text>
        ) : phase.kind === 'error' ? (
          <Text variant="body" color="secondary" accessibilityRole="alert">
            {t('chatInbox.report.failed')}
          </Text>
        ) : result === 'sent' ? (
          <View style={styles.sent} accessibilityLiveRegion="polite">
            <Icon name="checkmark.circle.fill" size={28} color={c.primary} />
            <Text variant="body" color="primary" style={styles.flex}>
              {t('chatInbox.report.sent')}
            </Text>
          </View>
        ) : (
          <>
            <Text variant="footnote" weight="semibold" color="secondary">
              {t('chatThread.report.pickMessage', { name: peer.name })}
            </Text>
            <View
              style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
              accessibilityRole="radiogroup"
            >
              {phase.messages.map((m, index) => {
                const selected = messageId === m.id
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setMessageId(m.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${previewOf(m)}, ${timeOf(m.createdAt)}`}
                    android_ripple={{ color: c.borderSubtle }}
                    testID={`chat-report-message-${m.id}`}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
                      pressed && { backgroundColor: c.surfaceSunken },
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text variant="body" color="primary" numberOfLines={3}>
                        {previewOf(m)}
                      </Text>
                      <Text variant="caption1" color="tertiary" tabular>
                        {timeOf(m.createdAt)}
                      </Text>
                    </View>
                    <Icon
                      name={selected ? 'checkmark.circle.fill' : 'circle'}
                      size={22}
                      color={selected ? c.primary : c.textTertiary}
                    />
                  </Pressable>
                )
              })}
            </View>
            <Text variant="footnote" weight="semibold" color="secondary">
              {t('chatInbox.report.prompt', { name: peer.name })}
            </Text>
            <ReportReasonList value={reason} onChange={setReason} />
            {result === 'failed' ? (
              <Text variant="footnote" color={c.error} accessibilityRole="alert">
                {t('chatInbox.report.failed')}
              </Text>
            ) : null}
            <Text variant="caption1" color="tertiary">
              {t('chatInbox.report.longPressHint')}
            </Text>
          </>
        )}

        <View style={styles.actions}>
          {phase.kind === 'ready' && result !== 'sent' ? (
            <Button
              label={t('chatThread.report.submitUser')}
              variant="destructive"
              size="lg"
              fullWidth
              loading={sending}
              disabled={!reason || !messageId}
              onPress={() => void submit()}
              testID="chat-report-submit"
            />
          ) : null}
          <Button
            label={result === 'sent' ? t('common.done') : t('common.cancel')}
            variant="plain"
            size="lg"
            fullWidth
            onPress={onClose}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingBottom: space.md },
  flex: { flex: 1, minWidth: 0, gap: space['2xs'] },
  center: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  card: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  sent: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actions: { gap: space.xs },
})
