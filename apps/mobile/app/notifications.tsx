import { useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { InboxNotification } from '@anstoss/shared'
import { api } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { useNotificationInbox } from '../src/hooks/useNotificationInbox'
import { openNotificationTarget } from '../src/lib/notificationRoute'
import { adminActionErrorKey } from '../src/components/admin/adminActions'
import { Button, Icon, IconButton, Screen, SoftIcon, Text, type IconName } from '../src/components/ui'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import {
  hairline,
  RADIUS_CARD,
  RADIUS_FULL,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XS,
} from '../src/theme/tokens'

type Section = { key: 'today' | 'week' | 'older'; title: string; data: InboxNotification[] }

const ICONS: Array<[RegExp, IconName]> = [
  [/^JOIN_/, 'person.badge.plus'],
  [/^CONTRIBUTION_/, 'eurosign.circle'],
  [/^TRIAL_/, 'figure.soccer'],
  [/^(CONSENT|COMPLIANCE)_/, 'checkmark.shield'],
  [/^MODERATION_/, 'flag'],
  [/^(FIXTURE_CHANGED|FULL_TIME)$/, 'football'],
  [/^ANNOUNCEMENT$/, 'megaphone'],
  [/^LINEUP_POSTED$/, 'person.3'],
  [/^RSVP_UPDATE$/, 'xmark.circle'],
  [/^EVENT_/, 'calendar'],
]

function iconFor(type: string): IconName {
  return ICONS.find(([re]) => re.test(type))?.[1] ?? 'bell'
}

/**
 * Mitteilungen (screen 09): everything worth checking later — join requests
 * (answer inline), declines, dues, schedule changes, trials, consent. Chat
 * has its own unread counts and does not appear here.
 */
export default function NotificationsScreen() {
  const { t, i18n } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const auth = useAuth()
  const inbox = useNotificationInbox()
  const [actingId, setActingId] = useState<string | null>(null)
  const [handled, setHandled] = useState<Record<string, 'approved' | 'rejected'>>({})
  const locale = i18n.language || 'de'

  const sections = useMemo<Section[]>(() => groupByAge(inbox.items, t), [inbox.items, t])

  const ensureClubFor = (clubId: string | null | undefined) => () => {
    const { memberships, activeClub, setActiveClub } = auth
    if (!clubId || !memberships || !setActiveClub) return
    if (activeClub?.club?.id === clubId) return
    const target = memberships.find((m) => m.club?.id === clubId)
    if (target) setActiveClub(target)
  }

  const open = (item: InboxNotification) => {
    if (!item.readAt) void inbox.markRead(item.id)
    if (item.target) openNotificationTarget(item.target, ensureClubFor(item.clubId ?? item.target.clubId))
  }

  const decideJoinRequest = async (item: InboxNotification, action: 'approve' | 'reject') => {
    const clubId = item.target?.clubId ?? item.clubId
    const requestId = item.target?.requestId
    if (!clubId || !requestId) return
    setActingId(item.id)
    try {
      // The decision endpoints need the request's current revision.
      const pending = await api<Array<{ id: string; revision: number }>>(`/clubs/${clubId}/join-requests`)
      const request = pending?.find((r) => r.id === requestId)
      if (!request) {
        Alert.alert(
          t('notificationsInbox.alreadyHandledTitle', { defaultValue: 'Already decided' }),
          t('notificationsInbox.alreadyHandledBody', {
            defaultValue: 'Someone in your club has already answered this request.',
          }),
        )
      } else {
        await api(`/clubs/${clubId}/join-requests/${request.id}/${action}`, {
          method: 'POST',
          body: { revision: request.revision },
        })
        setHandled((prev) => ({ ...prev, [item.id]: action === 'approve' ? 'approved' : 'rejected' }))
      }
      if (!item.readAt) void inbox.markRead(item.id)
    } catch (err) {
      Alert.alert(t('common.error'), t(adminActionErrorKey(err)))
    } finally {
      setActingId(null)
    }
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + SPACING_MD }]}>
      <IconButton variant="outlined" accessibilityLabel={t('common.back')} onPress={() => router.back()}>
        <Icon name="chevron.left" size={20} color={c.textPrimary} />
      </IconButton>
      <Text variant="title3" accessibilityRole="header" style={styles.title} numberOfLines={1}>
        {t('notificationsInbox.title', { defaultValue: 'Notifications' })}
      </Text>
      {inbox.unreadCount > 0 ? (
        <Button
          label={t('notificationsInbox.markAllRead', { defaultValue: 'Mark all read' })}
          variant="bordered"
          size="sm"
          onPress={() => void inbox.markAllRead()}
          testID="inbox-mark-all-read"
        />
      ) : null}
      <IconButton
        accessibilityLabel={t('notificationsInbox.settings', { defaultValue: 'Notification settings' })}
        onPress={() => router.push('/notification-settings' as never)}
        testID="inbox-settings"
      >
        <Icon name="gearshape" size={20} color={c.textSecondary} />
      </IconButton>
    </View>
  )

  if (inbox.loading) {
    return (
      <Screen scroll={false} padded={false} edges={['left', 'right']}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
        </View>
      </Screen>
    )
  }

  if (inbox.error && inbox.items.length === 0) {
    return (
      <Screen scroll={false} padded={false} edges={['left', 'right']}>
        {header}
        <ErrorState
          message={t('notificationsInbox.loadError', { defaultValue: 'Notifications could not load' })}
          onRetry={() => void inbox.reload()}
          fillContainer
        />
      </Screen>
    )
  }

  return (
    <Screen scroll={false} padded={false} edges={['left', 'right']}>
      {header}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + SPACING_XL }]}
        refreshControl={<RefreshControl refreshing={inbox.refreshing} onRefresh={() => void inbox.refresh()} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => void inbox.loadMore()}
        ListEmptyComponent={
          <EmptyState
            icon="bell"
            title={t('notificationsInbox.emptyTitle', { defaultValue: 'All caught up' })}
            description={t('notificationsInbox.emptyBody', {
              defaultValue: 'Join requests, declines, dues and schedule changes show up here.',
            })}
          />
        }
        ListFooterComponent={inbox.loadingMore ? <ActivityIndicator color={c.textSecondary} /> : null}
        renderSectionHeader={({ section }) => (
          <Text variant="label" accessibilityRole="header" style={styles.sectionLabel}>
            {section.title}
          </Text>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0
          const last = index === section.data.length - 1
          const unread = !item.readAt
          const isJoinRequest = item.type === 'JOIN_REQUEST' && Boolean(item.target?.requestId)
          const decided = handled[item.id]
          return (
            <View
              style={[
                styles.rowWrap,
                { backgroundColor: c.surface },
                first && styles.groupTop,
                last && styles.groupBottom,
              ]}
            >
              <Pressable
                onPress={() => open(item)}
                accessibilityRole="button"
                accessibilityLabel={`${unread ? `${t('notificationsInbox.unread', { defaultValue: 'Unread' })}. ` : ''}${item.title}. ${item.body}`}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                testID={`inbox-row-${item.id}`}
              >
                <SoftIcon name={iconFor(item.type)} />
                <View style={styles.text}>
                  <Text variant="subheadline" weight={unread ? 'bold' : 'semibold'} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.body ? (
                    <Text variant="footnote" color="secondary" numberOfLines={3}>
                      {item.body}
                    </Text>
                  ) : null}
                  {isJoinRequest ? (
                    decided ? (
                      <Text variant="footnote" weight="semibold" color="secondary">
                        {decided === 'approved'
                          ? t('notificationsInbox.approved', { defaultValue: 'Accepted' })
                          : t('notificationsInbox.rejected', { defaultValue: 'Declined' })}
                      </Text>
                    ) : (
                      <View style={styles.actions}>
                        <Button
                          label={t('notificationsInbox.approve', { defaultValue: 'Accept' })}
                          size="sm"
                          loading={actingId === item.id}
                          disabled={actingId !== null}
                          onPress={() => void decideJoinRequest(item, 'approve')}
                          testID={`inbox-approve-${item.id}`}
                        />
                        <Button
                          label={t('notificationsInbox.reject', { defaultValue: 'Decline' })}
                          size="sm"
                          variant="bordered"
                          disabled={actingId !== null}
                          onPress={() => void decideJoinRequest(item, 'reject')}
                          testID={`inbox-reject-${item.id}`}
                        />
                      </View>
                    )
                  ) : null}
                </View>
                <View style={styles.meta}>
                  <Text variant="caption1" color="secondary" tabular>
                    {formatWhen(item.createdAt, section.key, locale)}
                  </Text>
                  {unread ? <View style={[styles.dot, { backgroundColor: c.alertDot }]} /> : null}
                </View>
              </Pressable>
              {!last ? <View style={[styles.divider, { backgroundColor: c.borderSubtle }]} /> : null}
            </View>
          )
        }}
      />
    </Screen>
  )
}

function groupByAge(
  items: InboxNotification[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): Section[] {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const weekAgo = startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000
  const today: InboxNotification[] = []
  const week: InboxNotification[] = []
  const older: InboxNotification[] = []
  for (const item of items) {
    const at = new Date(item.createdAt).getTime()
    if (at >= startOfToday.getTime()) today.push(item)
    else if (at >= weekAgo) week.push(item)
    else older.push(item)
  }
  const sections: Section[] = [
    { key: 'today', title: t('notificationsInbox.today', { defaultValue: 'Today' }), data: today },
    { key: 'week', title: t('notificationsInbox.thisWeek', { defaultValue: 'This week' }), data: week },
    { key: 'older', title: t('notificationsInbox.older', { defaultValue: 'Earlier' }), data: older },
  ]
  return sections.filter((s) => s.data.length > 0)
}

function formatWhen(iso: string, bucket: Section['key'], locale: string): string {
  const date = new Date(iso)
  if (bucket === 'today') {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
  }
  if (bucket === 'week') {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date).replace('.', '')
  }
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(date)
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: SPACING_MD,
  },
  title: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SCREEN_PADDING, gap: 0 },
  sectionLabel: { paddingHorizontal: SPACING_XS, paddingTop: SPACING_XL, paddingBottom: SPACING_MD },
  rowWrap: { paddingHorizontal: SPACING_LG },
  groupTop: { borderTopLeftRadius: RADIUS_CARD, borderTopRightRadius: RADIUS_CARD, borderCurve: 'continuous' },
  groupBottom: {
    borderBottomLeftRadius: RADIUS_CARD,
    borderBottomRightRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING_MD + 2, minHeight: 60, paddingVertical: SPACING_MD },
  text: { flex: 1, minWidth: 0, gap: SPACING_XS },
  actions: { flexDirection: 'row', gap: SPACING_SM, marginTop: SPACING_XS },
  meta: { alignItems: 'flex-end', gap: SPACING_XS },
  dot: { width: SPACING_SM, height: SPACING_SM, borderRadius: RADIUS_FULL },
  divider: { height: hairline },
})
