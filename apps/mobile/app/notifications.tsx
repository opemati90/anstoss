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
import { Button, getInitials, Icon, IconButton, Screen, SoftIcon, Text, type IconName } from '../src/components/ui'
import { EmptyState } from '../src/components/EmptyState'
import { ErrorState } from '../src/components/ErrorState'
import { useSafeAreaInsetsSafe } from '../src/utils/useSafeAreaInsetsSafe'
import {
  hairline,
  RADIUS_CARD,
  SCREEN_PADDING,
  SPACING_LG,
  SPACING_MD,
  SPACING_SM,
  SPACING_XL,
  SPACING_XXS,
  SPACING_XXL,
} from '../src/theme/tokens'

type Section = { key: 'today' | 'week' | 'older'; title: string; data: InboxNotification[] }


// People rows (design .av): 36pt round initials well.
const AVATAR_SIZE = 36
// Design rows: 14pt between the leading well and the text.
const ROW_GAP = SPACING_MD + SPACING_XXS
// Design inline action gap under the sentence.
const ACTIONS_GAP = SPACING_SM + SPACING_XXS

const ICONS: Array<[RegExp, IconName]> = [
  [/^JOIN_/, 'person.badge.plus'],
  [/^CONTRIBUTION_/, 'creditcard'],
  [/^POLL_/, 'message'],
  [/^FIXTURE_CHANGED$/, 'chart.bar'],
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

const trimEnd = (s: string) => s.trimEnd().replace(/[.:]+$/, '')
const withStop = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`)

/**
 * One sentence per row, like the design: "**Paul Krüger** möchte … beitreten."
 * People rows (the payload names an actor) lead with the bold name; system
 * rows read "Titel: Text." Exported for the spec.
 */
export function inboxSentence(item: Pick<InboxNotification, 'title' | 'body' | 'target'>): {
  actor: string | null
  rest: string
} {
  const actor = item.target?.actorName?.trim() || null
  const title = item.title?.trim() ?? ''
  const body = item.body?.trim() ?? ''
  if (actor) {
    if (title.startsWith(actor)) {
      const head = trimEnd(title.slice(actor.length))
      return { actor, rest: withStop(body ? `${head}: ${body}` : head) }
    }
    if (body.startsWith(actor)) return { actor, rest: withStop(body.slice(actor.length)) }
  }
  const text = body ? `${trimEnd(title).trim()}: ${body}` : title
  return { actor: null, rest: withStop(text) }
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
    </View>
  )

  // Settings live at the end of the list, so the header stays as designed
  // (back, title, "Alle gelesen") and the title never truncates.
  const settingsRow = (
    <Pressable
      onPress={() => router.push('/notification-settings' as never)}
      accessibilityRole="button"
      testID="inbox-settings"
      style={({ pressed }) => [
        styles.settingsRow,
        { backgroundColor: c.surface },
        pressed && { opacity: 0.7 },
      ]}
    >
      <SoftIcon name="gearshape" />
      <Text variant="subheadline" weight="semibold" style={styles.title}>
        {t('notificationsInbox.settings', { defaultValue: 'Notification settings' })}
      </Text>
      <Icon name="chevron.right" size={18} color={c.textSecondary} />
    </Pressable>
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
        ListFooterComponent={
          <View style={styles.footer}>
            {inbox.loadingMore ? <ActivityIndicator color={c.textSecondary} /> : null}
            {settingsRow}
          </View>
        }
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
          const { actor, rest } = inboxSentence(item)
          const label = `${unread ? `${t('notificationsInbox.unread', { defaultValue: 'Unread' })}. ` : ''}${actor ?? ''}${rest}`
          const lead = actor ? (
            <View style={[styles.avatar, { backgroundColor: c.surfaceSunken }]}>
              <Text variant="caption1" weight="bold" style={styles.avatarText}>
                {getInitials(actor)}
              </Text>
            </View>
          ) : (
            <SoftIcon name={iconFor(item.type)} size={40} />
          )
          // Unread reads heavier; the design carries no dots.
          const sentence = (
            <Text variant="body" weight={unread ? 'medium' : 'regular'} style={styles.sentence}>
              {actor ? <Text variant="body" weight="bold">{actor}</Text> : null}
              {rest}
            </Text>
          )
          const time = (
            <Text variant="caption1" weight="regular" color="secondary" tabular style={styles.time}>
              {formatWhen(item.createdAt, section.key, locale)}
            </Text>
          )
          return (
            <View
              style={[
                styles.rowWrap,
                { backgroundColor: c.surface },
                first && styles.groupTop,
                last && styles.groupBottom,
              ]}
            >
              {isJoinRequest ? (
                // Buttons sit in the text column, outside the open tap target,
                // so they are not nested inside another button.
                <View style={[styles.row, styles.rowTop]}>
                  {lead}
                  <View style={styles.text}>
                    <Pressable
                      onPress={() => open(item)}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      style={({ pressed }) => (pressed ? styles.pressed : null)}
                      testID={`inbox-row-${item.id}`}
                    >
                      {sentence}
                    </Pressable>
                    {decided ? (
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
                    )}
                  </View>
                  {time}
                </View>
              ) : (
                <Pressable
                  onPress={() => open(item)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                  testID={`inbox-row-${item.id}`}
                >
                  {lead}
                  <View style={styles.text}>{sentence}</View>
                  {time}
                </Pressable>
              )}
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
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date)
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
  sectionLabel: { paddingTop: SPACING_XXL, paddingBottom: SPACING_MD },
  rowWrap: { paddingHorizontal: SPACING_LG },
  groupTop: { borderTopLeftRadius: RADIUS_CARD, borderTopRightRadius: RADIUS_CARD, borderCurve: 'continuous' },
  groupBottom: {
    borderBottomLeftRadius: RADIUS_CARD,
    borderBottomRightRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, minHeight: 60, paddingVertical: SPACING_MD },
  rowTop: { alignItems: 'flex-start' },
  pressed: { opacity: 0.7 },
  text: { flex: 1, minWidth: 0, gap: ACTIONS_GAP },
  sentence: { lineHeight: 21 },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { letterSpacing: 0 },
  time: { lineHeight: 21 },
  actions: { flexDirection: 'row', gap: SPACING_SM },
  footer: { gap: SPACING_MD, paddingTop: SPACING_XL },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_MD + 2,
    minHeight: 60,
    paddingHorizontal: SPACING_LG,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  divider: { height: hairline },
})
