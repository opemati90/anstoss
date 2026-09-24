import { useCallback, useEffect, useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ChatRetentionSettings } from '@anstoss/shared'
import { api } from '../../api/client'
import { BottomSheet, Icon, ListRow, SectionGroup, SoftIcon, Text } from '../ui'
import { space } from '../../theme/tokens'

/** Retention choices for the single Chat-Aufbewahrung picker (0 = keep forever). */
export const CHAT_RETENTION_OPTIONS = [0, 90, 180, 365, 730] as const
type RetentionOption = (typeof CHAT_RETENTION_OPTIONS)[number]

/**
 * One picker row replacing the old chat-retention screen: how long team
 * chats and attachments are kept before automatic deletion.
 */
export function ChatRetentionRow({ clubId }: { clubId: string }) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<ChatRetentionSettings | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api<ChatRetentionSettings>(`/clubs/${clubId}/chat/retention`)
      setSettings(data && typeof data === 'object' ? data : null)
      setFailed(!data || typeof data !== 'object')
    } catch {
      setFailed(true)
    }
  }, [clubId])

  useEffect(() => {
    void load()
  }, [load])

  const current: RetentionOption | null = settings
    ? settings.enabled
      ? (CHAT_RETENTION_OPTIONS.find((option) => option === settings.messageRetentionDays) ??
        null)
      : 0
    : null

  const labelFor = (option: number) => {
    if (option === 0) return t('verein.retention.forever')
    if (option === 90) return t('verein.retention.months', { count: 3 })
    if (option === 180) return t('verein.retention.months', { count: 6 })
    if (option === 365) return t('verein.retention.years', { count: 1 })
    if (option === 730) return t('verein.retention.years', { count: 2 })
    return t('verein.retention.days', { count: option })
  }

  const valueLabel = settings
    ? settings.enabled
      ? labelFor(settings.messageRetentionDays)
      : labelFor(0)
    : failed
      ? t('verein.retention.unavailable')
      : ''

  const apply = async (option: RetentionOption) => {
    if (!settings) return
    const next =
      option === 0
        ? { enabled: false }
        : { enabled: true, messageRetentionDays: option, attachmentRetentionDays: option }
    const shortening =
      option !== 0 && (!settings.enabled || option < settings.messageRetentionDays)
    if (shortening) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          t('chatRetention.confirmTitle', { defaultValue: 'Confirm automatic deletion' }),
          t('verein.retention.confirmBody', { period: labelFor(option) }),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('verein.retention.confirm'), style: 'destructive', onPress: () => resolve(true) },
          ],
        )
      })
      if (!confirmed) return
    }
    const previous = settings
    setSaving(true)
    setSettings({ ...settings, ...next })
    try {
      const updated = await api<ChatRetentionSettings>(`/clubs/${clubId}/chat/retention`, {
        method: 'PATCH',
        body: next,
      })
      if (updated && typeof updated === 'object') setSettings(updated)
      setOpen(false)
    } catch {
      setSettings(previous)
      Alert.alert(
        t('common.errorTitle', { defaultValue: 'Something went wrong' }),
        t('chatRetention.saveError', { defaultValue: 'Could not save chat retention settings.' }),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ListRow
        left={<SoftIcon name="archivebox" />}
        title={t('verein.retention.title')}
        right={
          <Text variant="body" color="secondary" numberOfLines={1}>
            {valueLabel}
          </Text>
        }
        showChevron
        disabled={!settings}
        accessibilityLabel={`${t('verein.retention.title')}: ${valueLabel}`}
        onPress={() => setOpen(true)}
        testID="chat-retention-row"
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)} heightPct="auto">
        <View style={styles.sheet}>
          <Text variant="title3" weight="bold" color="primary">
            {t('verein.retention.title')}
          </Text>
          <Text variant="subheadline" color="secondary">
            {t('verein.retention.hint')}
          </Text>
          <SectionGroup>
            {CHAT_RETENTION_OPTIONS.map((option) => (
              <ListRow
                key={option}
                title={labelFor(option)}
                selected={current === option}
                disabled={saving}
                right={
                  current === option ? <Icon name="checkmark" size="md" color="tint" /> : undefined
                }
                onPress={() => void apply(option)}
              />
            ))}
          </SectionGroup>
        </View>
      </BottomSheet>
    </>
  )
}

const styles = StyleSheet.create({
  sheet: { gap: space.md, paddingBottom: space.md },
})
