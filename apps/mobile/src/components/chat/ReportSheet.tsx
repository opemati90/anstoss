import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { useClubColors } from '../../context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../../utils/useSafeAreaInsetsSafe'
import { space } from '../../theme/tokens'
import * as Haptics from '../../utils/haptics'
import { BottomSheet, Button, Icon, Text } from '../ui'
import { MODERATION_RESPONSE_HOURS, type ReportReason } from '@anstoss/shared'
import { ReportReasonList } from './ReportReasonList'

export type { ReportReason } from '@anstoss/shared'

/** What the sheet acts on: one specific message, never "the peer's latest". */
export type ModerationTarget = {
  mode: 'report' | 'block'
  messageId: string
  isDm: boolean
  senderId: string | null
  senderName: string
}

type Props = {
  target: ModerationTarget | null
  onClose: () => void
  /** Called after a successful block (DMs: the thread turns read-only). */
  onBlocked?: (userId: string) => void
}

/**
 * M6: report (with reasons) and block live in one bottom sheet opened from a
 * specific message's long-press menu. A sheet, not Alert.alert: Android's
 * alert shows at most three buttons and silently dropped reasons.
 */
export function ReportSheet({ target, onClose, onBlocked }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  useEffect(() => {
    if (!target) return
    setReason(null)
    setStatus('idle')
  }, [target])

  const visible = !!target
  const mode = target?.mode ?? 'report'
  const name = target?.senderName ?? ''

  const submitReport = async () => {
    if (!target || !reason || status === 'sending') return
    setStatus('sending')
    try {
      await api(
        target.isDm ? `/direct-messages/${target.messageId}/report` : `/messages/${target.messageId}/report`,
        { method: 'POST', body: { reason } },
      )
      Haptics.success()
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  const submitBlock = async () => {
    if (!target?.senderId || status === 'sending') return
    setStatus('sending')
    try {
      await api(`/users/${target.senderId}/block`, { method: 'POST' })
      Haptics.success()
      setStatus('done')
      onBlocked?.(target.senderId)
    } catch {
      setStatus('error')
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={status === 'sending' ? () => undefined : onClose}
      heightPct="auto"
      paddingBottom={insets.bottom + space.md}
    >
      <View style={styles.body} testID="chat-report-sheet">
        {status === 'done' ? (
          <View style={styles.done} accessibilityLiveRegion="polite">
            <Icon name="checkmark.circle.fill" size={40} color={c.primary} />
            <Text variant="headline" weight="semibold" color="primary" style={styles.center}>
              {mode === 'report' ? t('chatThread.report.doneTitle') : t('chatThread.block.doneTitle', { name })}
            </Text>
            <Text variant="subheadline" color="secondary" style={styles.center}>
              {mode === 'report' ? t('chatThread.report.doneBody', { hours: MODERATION_RESPONSE_HOURS }) : t('chatThread.block.doneBody', { name })}
            </Text>
            <Button label={t('chatThread.done')} variant="filled" size="lg" fullWidth onPress={onClose} />
          </View>
        ) : mode === 'report' ? (
          <>
            <Text variant="headline" weight="semibold" color="primary">
              {t('chatThread.report.title')}
            </Text>
            <Text variant="subheadline" color="secondary">
              {t('chatThread.report.body', { name })}
            </Text>
            <ReportReasonList value={reason} onChange={setReason} />
            {status === 'error' ? (
              <Text variant="footnote" style={{ color: c.error }} accessibilityLiveRegion="polite">
                {t('chatThread.report.failed')}
              </Text>
            ) : null}
            <Button
              label={t('chatThread.report.submit')}
              variant="filled"
              size="lg"
              fullWidth
              disabled={!reason}
              loading={status === 'sending'}
              onPress={() => void submitReport()}
              testID="chat-report-submit"
            />
          </>
        ) : (
          <>
            <Text variant="headline" weight="semibold" color="primary">
              {t('chatThread.block.title', { name })}
            </Text>
            <Text variant="subheadline" color="secondary">
              {t('chatThread.block.body')}
            </Text>
            {status === 'error' ? (
              <Text variant="footnote" style={{ color: c.error }} accessibilityLiveRegion="polite">
                {t('chatThread.block.failed')}
              </Text>
            ) : null}
            <Button
              label={t('chatThread.block.confirm')}
              variant="destructive"
              size="lg"
              fullWidth
              loading={status === 'sending'}
              onPress={() => void submitBlock()}
              testID="chat-block-confirm"
            />
            <Button label={t('common.cancel')} variant="plain" size="lg" fullWidth onPress={onClose} />
          </>
        )}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.md, paddingHorizontal: space.md },
  done: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  center: { textAlign: 'center' },
})
