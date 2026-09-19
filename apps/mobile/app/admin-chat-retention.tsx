import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, RefreshControl, StyleSheet, Switch, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ChatRetentionSettings } from '@anstoss/shared'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ErrorState } from '../src/components/ErrorState'
import { EmptyState } from '../src/components/EmptyState'
import { ModalHeader } from '../src/components/ModalHeader'
import { Banner, Button, ListRow, Screen, SectionGroup, Text } from '../src/components/ui'
import { space } from '../src/theme/tokens'

const MESSAGE_OPTIONS = [30, 90, 180, 365, 730, 2555] as const
const ATTACHMENT_OPTIONS = [7, 30, 90, 180, 365, 730] as const

export default function AdminChatRetentionScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const role = activeClub?.role
  const canManageRetention = role === MembershipRole.OWNER || role === MembershipRole.ADMIN

  const [settings, setSettings] = useState<ChatRetentionSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!canManageRetention) {
      setLoading(false)
      return
    }
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const data = await api<ChatRetentionSettings>(`/clubs/${clubId}/chat/retention`)
      setSettings(data)
      setError(null)
    } catch {
      setError(
        t('chatRetention.loadError', {
          defaultValue: 'Could not load chat retention settings.',
        }),
      )
    } finally {
      setLoading(false)
    }
  }, [canManageRetention, clubId, t])

  useEffect(() => {
    void load()
  }, [load])

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const updateSettings = async (next: Partial<ChatRetentionSettings>) => {
    if (!clubId || !settings) return
    const optimistic = { ...settings, ...next }
    setSettings(optimistic)
    setSaving(true)
    try {
      const updated = await api<ChatRetentionSettings>(`/clubs/${clubId}/chat/retention`, {
        method: 'PATCH',
        body: next,
      })
      setSettings(updated)
      setError(null)
    } catch {
      setSettings(settings)
      Alert.alert(
        t('common.errorTitle', { defaultValue: 'Something went wrong' }),
        t('chatRetention.saveError', {
          defaultValue: 'Could not save chat retention settings. Try again.',
        }),
      )
    } finally {
      setSaving(false)
    }
  }

  const messageSubtitle = useMemo(
    () =>
      settings
        ? t('chatRetention.messageWindowValue', {
            defaultValue: '{{days}} days',
            days: settings.messageRetentionDays,
          })
        : undefined,
    [settings, t],
  )
  const attachmentSubtitle = useMemo(
    () =>
      settings
        ? t('chatRetention.attachmentWindowValue', {
            defaultValue: '{{days}} days',
            days: settings.attachmentRetentionDays,
          })
        : undefined,
    [settings, t],
  )

  if (!canManageRetention) {
    return (
      <Screen
        header={<ModalHeader title={t('chatRetention.title', { defaultValue: 'Chat retention' })} mode="back" />}
        padded={false}
        style={{ backgroundColor: c.surfaceSunken }}
      >
        <EmptyState
          icon="lock.shield.fill"
          title={t('common.accessDenied', { defaultValue: 'Access denied' })}
          description={t('common.accessDeniedDescription', {
            defaultValue: 'Only club administrators can open this workspace.',
          })}
        />
      </Screen>
    )
  }

  return (
    <Screen
      header={<ModalHeader title={t('chatRetention.title', { defaultValue: 'Chat retention' })} mode="back" />}
      scroll
      padded={false}
      style={{ backgroundColor: c.surfaceSunken }}
      contentStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Banner
        tone="info"
        icon="checkmark.shield"
        title={t('chatRetention.guardrailTitle', {
          defaultValue: 'Reports and legal holds are protected',
        })}
        description={t('chatRetention.guardrailBody', {
          defaultValue:
            'The retention sweep never removes unresolved reports. Attachments are deleted from storage before their database pointer is cleared.',
        })}
      />

      {error ? (
        <View style={styles.errorWrap}>
          <ErrorState message={error} onRetry={load} />
        </View>
      ) : null}

      <SectionGroup
        header={t('chatRetention.policySection', { defaultValue: 'Club policy' })}
        footer={t('chatRetention.policyFooter', {
          defaultValue:
            'When enabled, Anstoss soft-deletes old chat text and purges attachments on the schedule below. Turn this on only after your club has approved the policy.',
        })}
      >
        <ListRow
          left={<Text variant="title3">💬</Text>}
          title={t('chatRetention.enableTitle', { defaultValue: 'Enable retention lifecycle' })}
          subtitle={
            settings?.enabled
              ? t('chatRetention.enabledBody', { defaultValue: 'Automatic cleanup is active.' })
              : t('chatRetention.disabledBody', {
                  defaultValue: 'Nothing is deleted automatically while this is off.',
                })
          }
          right={
            <Switch
              value={Boolean(settings?.enabled)}
              onValueChange={(enabled) => void updateSettings({ enabled })}
              disabled={!settings || loading || saving}
              trackColor={{ false: c.borderStrong, true: c.clubPrimaryLight }}
              thumbColor={settings?.enabled ? c.clubPrimary : c.surface}
            />
          }
          accessibilityLabel={t('chatRetention.enableTitle', {
            defaultValue: 'Enable retention lifecycle',
          })}
        />
      </SectionGroup>

      <SectionGroup
        header={t('chatRetention.windowsSection', { defaultValue: 'Retention windows' })}
        footer={t('chatRetention.windowsFooter', {
          defaultValue:
            'Attachments can expire sooner than messages to reduce storage risk without deleting the conversation record.',
        })}
      >
        <ListRow
          title={t('chatRetention.messageWindowTitle', { defaultValue: 'Messages' })}
          subtitle={messageSubtitle}
          titleNumberOfLines={2}
        />
        <OptionRail
          values={MESSAGE_OPTIONS}
          selected={settings?.messageRetentionDays}
          disabled={!settings || loading || saving}
          accessibilityPrefix={t('chatRetention.messageWindowTitle', { defaultValue: 'Messages' })}
          onSelect={(messageRetentionDays) => void updateSettings({ messageRetentionDays })}
        />
        <View style={styles.divider} />
        <ListRow
          title={t('chatRetention.attachmentWindowTitle', { defaultValue: 'Attachments' })}
          subtitle={attachmentSubtitle}
          titleNumberOfLines={2}
        />
        <OptionRail
          values={ATTACHMENT_OPTIONS}
          selected={settings?.attachmentRetentionDays}
          disabled={!settings || loading || saving}
          accessibilityPrefix={t('chatRetention.attachmentWindowTitle', {
            defaultValue: 'Attachments',
          })}
          onSelect={(attachmentRetentionDays) => void updateSettings({ attachmentRetentionDays })}
        />
      </SectionGroup>

      {loading ? (
        <Text variant="footnote" color="secondary" style={styles.loading}>
          {t('common.loading', { defaultValue: 'Loading…' })}
        </Text>
      ) : null}
    </Screen>
  )
}

function OptionRail({
  values,
  selected,
  disabled,
  accessibilityPrefix,
  onSelect,
}: {
  values: readonly number[]
  selected?: number
  disabled?: boolean
  accessibilityPrefix: string
  onSelect: (value: number) => void
}) {
  const c = useClubColors()
  return (
    <View style={styles.optionRail}>
      {values.map((value) => {
        const active = selected === value
        return (
          <Button
            key={value}
            label={`${value}d`}
            variant={active ? 'filled' : 'bordered'}
            size="sm"
            disabled={disabled || active}
            accessibilityLabel={`${accessibilityPrefix}: ${value} days`}
            onPress={() => onSelect(value)}
            style={{
              ...styles.optionButton,
              ...(!active ? { backgroundColor: c.surface } : {}),
            }}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['3xl'],
    gap: space.lg,
  },
  errorWrap: {
    marginHorizontal: space.xs,
  },
  divider: {
    height: space.xs,
  },
  optionRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
  },
  optionButton: {
    minWidth: 74,
  },
  loading: {
    textAlign: 'center',
  },
})
