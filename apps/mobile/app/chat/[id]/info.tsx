import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ChatChannelMember, PinnedMessage } from '@anstoss/shared'
import { api } from '../../../src/api/client'
import {
  addChannelMembers,
  fetchChannelMembers,
  muteConversation,
  removeChannelMember,
} from '../../../src/api/chat'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { useSafeAreaInsetsSafe } from '../../../src/utils/useSafeAreaInsetsSafe'
import { useConversationDetail } from '../../../src/hooks/useConversationDetail'
import { patchInboxItem, refreshInbox } from '../../../src/hooks/useInbox'
import { ConversationAvatar } from '../../../src/components/chat/ConversationAvatar'
import {
  conversationTitle,
  groupErrorKey,
  type ConversationKind,
} from '../../../src/components/chat/inboxModel'
import { ChatMediaSection } from '../../../src/components/chat/ChatMediaSection'
import { UserReportSheet } from '../../../src/components/chat/UserReportSheet'
import { ErrorState } from '../../../src/components/ErrorState'
import { Skeleton } from '../../../src/components/Skeleton'
import { Avatar, Icon, ListRow, SectionGroup, Text } from '../../../src/components/ui'
import { space } from '../../../src/theme/tokens'
import { RADIUS_MD } from '../../../src/theme/tokens'

const MEMBER_PREVIEW = 8

/**
 * Conversation info: what it is, a real mute switch, pinned message,
 * members (managed for custom groups), leave. DMs get the person, block
 * and report. Admins reach the club's message retention from here.
 */
export default function ConversationInfoScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string; teamId?: string; title?: string }>()
  const id = String(params.id ?? '')
  const kind: ConversationKind = params.kind === 'dm' ? 'dm' : 'channel'
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsetsSafe()
  const { user, activeClub, activeTeamId } = useAuth()
  const clubId = activeClub?.club.id ?? null
  const isClubAdmin = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
  const detail = useConversationDetail(kind, id)
  const channel = detail.channel
  const dm = detail.dm

  const [members, setMembers] = useState<ChatChannelMember[] | null>(null)
  const [membersError, setMembersError] = useState(false)
  const [showAllMembers, setShowAllMembers] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [pinned, setPinned] = useState<PinnedMessage | null | undefined>(undefined)
  const [muteBusy, setMuteBusy] = useState(false)
  // M6: "Nutzer melden" opens a reason sheet (no Alert pickers).
  const [reportOpen, setReportOpen] = useState(false)
  // B1 client: a safeguarding rejection on add/remove shows inline.
  const [memberError, setMemberError] = useState<string | null>(null)

  const muted = kind === 'dm' ? (dm?.muted ?? detail.seed?.muted ?? false) : (channel?.muted ?? detail.seed?.muted ?? false)
  const teamId = channel?.teamId ?? params.teamId ?? null

  const title = useMemo(() => {
    if (kind === 'dm') return dm?.otherUser?.name ?? params.title ?? ''
    if (channel) return conversationTitle({ type: 'CHANNEL', kind: channel.kind, teamId: channel.teamId, title: channel.name }, t)
    return params.title ?? ''
  }, [channel, dm?.otherUser?.name, kind, params.title, t])

  const loadMembers = useCallback(async () => {
    if (!clubId || kind !== 'channel') return
    setMembersError(false)
    try {
      const list = await fetchChannelMembers(clubId, id)
      setMembers(Array.isArray(list) ? list : [])
    } catch {
      setMembersError(true)
      setMembers((prev) => prev ?? [])
    }
  }, [clubId, id, kind])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  useEffect(() => {
    if (!clubId || kind !== 'channel') return
    const pinnedTeam = teamId ?? activeTeamId
    if (!pinnedTeam) {
      setPinned(null)
      return
    }
    let cancelled = false
    api<PinnedMessage | null>(
      `/clubs/${clubId}/teams/${pinnedTeam}/messages/pinned?channelId=${encodeURIComponent(id)}`,
    )
      .then((msg) => {
        if (!cancelled) setPinned(msg && (msg as PinnedMessage).id ? msg : null)
      })
      .catch(() => {
        if (!cancelled) setPinned(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeTeamId, clubId, id, kind, teamId])

  const toggleMute = useCallback(
    async (next: boolean) => {
      if (!clubId || muteBusy) return
      setMuteBusy(true)
      detail.patch({ muted: next, mutedUntil: null })
      patchInboxItem(id, { muted: next, mutedUntil: null })
      try {
        await muteConversation(clubId, kind, id, next)
      } catch {
        detail.patch({ muted: !next })
        patchInboxItem(id, { muted: !next })
        Alert.alert(t('common.error'), t('chatHub.errors.muteFailed'))
      } finally {
        setMuteBusy(false)
        void refreshInbox(clubId)
      }
    },
    [clubId, detail, id, kind, muteBusy, t],
  )

  const inGroup = members?.filter((m) => m.isMember) ?? []
  const candidates = members?.filter((m) => !m.isMember) ?? []
  const isCustom = channel?.kind === 'CUSTOM'
  const canManage = Boolean(channel?.canManageMembers)
  const amMember = inGroup.some((m) => m.userId === user?.id)

  const addMember = useCallback(
    async (member: ChatChannelMember) => {
      if (!clubId) return
      setBusyUserId(member.userId)
      setMemberError(null)
      try {
        await addChannelMembers(clubId, id, [member.userId])
        await loadMembers()
        detail.reload()
      } catch (err) {
        setMemberError(t(groupErrorKey(err) ?? 'chatHub.errors.addMemberFailed'))
      } finally {
        setBusyUserId(null)
      }
    },
    [clubId, detail, id, loadMembers, t],
  )

  const confirmRemove = useCallback(
    (member: ChatChannelMember) => {
      if (!clubId) return
      Alert.alert(
        t('chatHub.info.removeTitle', { name: member.name }),
        t('chatHub.info.removeBody', { name: member.name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('chatHub.info.remove'),
            style: 'destructive',
            onPress: async () => {
              setBusyUserId(member.userId)
              setMemberError(null)
              try {
                await removeChannelMember(clubId, id, member.userId)
                await loadMembers()
                detail.reload()
              } catch (err) {
                setMemberError(t(groupErrorKey(err) ?? 'chatHub.errors.removeMemberFailed'))
              } finally {
                setBusyUserId(null)
              }
            },
          },
        ],
      )
    },
    [clubId, detail, id, loadMembers, t],
  )

  const confirmLeave = useCallback(() => {
    if (!clubId || !user) return
    Alert.alert(t('chatHub.info.leaveTitle', { name: title }), t('chatHub.info.leaveBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chatHub.info.leave'),
        style: 'destructive',
        onPress: async () => {
          try {
            await removeChannelMember(clubId, id, user.id)
            await refreshInbox(clubId)
            router.dismissTo('/(tabs)/chat' as never)
          } catch (err) {
            const key = groupErrorKey(err)
            if (key) setMemberError(t(key))
            else Alert.alert(t('common.error'), t('chatHub.errors.leaveFailed'))
          }
        },
      },
    ])
  }, [clubId, id, t, title, user])

  const blockPeer = useCallback(() => {
    const peer = dm?.otherUser
    if (!peer) return
    Alert.alert(t('chat.blockTitle', { name: peer.name }), t('chat.blockBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.blockConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/users/${peer.id}/block`, { method: 'POST' })
            await refreshInbox(clubId)
            Alert.alert(t('chat.blocked'), t('chat.blockedBody', { name: peer.name }))
            router.dismissTo('/(tabs)/chat' as never)
          } catch {
            Alert.alert(t('chat.blockFailed'), t('chat.blockFailedBody'))
          }
        },
      },
    ])
  }, [clubId, dm?.otherUser, t])

  const header = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: kind === 'dm' ? t('chatHub.info.dmTitle') : t('chatHub.info.title'),
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: c.primary,
        headerStyle: { backgroundColor: c.background },
        headerTitleStyle: { color: c.textPrimary },
      }}
    />
  )

  if (detail.status === 'error' || detail.status === 'forbidden') {
    return (
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        {header}
        <ErrorState
          message={t('chatHub.errors.infoTitle')}
          hint={detail.status === 'forbidden' ? t('chatHub.unavailable.body') : t('chatHub.errors.threadHint')}
          onRetry={detail.status === 'error' ? detail.reload : undefined}
          fillContainer
        />
      </View>
    )
  }

  const loading = detail.status === 'loading' && !channel && !dm
  const heroKind = kind === 'dm' ? 'DM' : (channel?.kind ?? 'CUSTOM')
  const visibleMembers = showAllMembers ? inGroup : inGroup.slice(0, MEMBER_PREVIEW)

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}
        testID="chat-info"
      >
        <View style={styles.hero}>
          {loading ? (
            <>
              <Skeleton shape="circle" width={88} height={88} />
              <Skeleton width={180} height={24} />
            </>
          ) : (
            <>
              <ConversationAvatar
                kind={heroKind}
                clubLevel={kind === 'channel' && !channel?.teamId}
                name={title}
                avatarUrl={dm?.otherUser?.avatarUrl ?? null}
                crestUrl={activeClub?.club.badgeUrl ?? null}
                size={88}
              />
              <Text variant="title2" weight="bold" color="primary" style={styles.center}>
                {title}
              </Text>
              {kind === 'channel' && channel ? (
                <Text variant="subheadline" color="secondary" tabular style={styles.center}>
                  {[channel.teamName ?? t('chatHub.wholeClub'), t('chatHub.header.members', { count: channel.memberCount })]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : null}
              {channel?.description ? (
                <Text variant="body" color="primary" style={styles.center}>
                  {channel.description}
                </Text>
              ) : null}
              {kind === 'channel' && channel && !channel.canWrite ? (
                <View style={[styles.notice, { backgroundColor: c.surfaceSunken }]}>
                  <Icon name="lock.fill" size={13} color={c.textSecondary} />
                  <Text variant="footnote" color="secondary">
                    {t('chatHub.readOnly')}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        <SectionGroup>
          <ListRow
            title={t('chatHub.info.mute')}
            subtitle={t('chatHub.info.muteHint')}
            left={<Icon name={muted ? 'bell.slash.fill' : 'bell'} size="md" color={c.textSecondary} />}
            right={
              <Switch
                value={muted}
                onValueChange={(next) => void toggleMute(next)}
                disabled={muteBusy || loading}
                trackColor={{ true: c.primary, false: c.borderStrong }}
                accessibilityLabel={t('chatHub.info.mute')}
                testID="chat-info-mute"
              />
            }
          />
        </SectionGroup>

        {kind === 'channel' ? (
          <SectionGroup header={t('chatHub.info.pinned')}>
            {pinned === undefined ? (
              <View style={styles.pad}>
                <Skeleton width="70%" height={16} />
              </View>
            ) : pinned ? (
              <ListRow
                title={pinned.content || t('chatHub.preview.photo')}
                subtitle={pinned.senderName ?? undefined}
                titleNumberOfLines={2}
                left={<Icon name="pin.fill" size="md" color={c.textSecondary} />}
              />
            ) : (
              <View style={styles.pad}>
                <Text variant="footnote" color="secondary">
                  {t('chatHub.info.noPinned')}
                </Text>
              </View>
            )}
          </SectionGroup>
        ) : null}

        {kind === 'channel' ? (
          <SectionGroup
            header={t('chatHub.info.membersHeader', { count: inGroup.length })}
            footer={isCustom ? undefined : t('chatHub.info.autoMembers')}
          >
            {memberError ? (
              <View
                style={[styles.inlineError, { backgroundColor: c.errorBg }]}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                testID="chat-info-member-error"
              >
                <Icon name="exclamationmark.triangle.fill" size={16} color={c.error} />
                <Text variant="footnote" color="primary" style={styles.flex}>
                  {memberError}
                </Text>
              </View>
            ) : null}
            {canManage && isCustom ? (
              <ListRow
                title={adding ? t('chatHub.info.doneAdding') : t('chatHub.info.addMembers')}
                left={<Icon name={adding ? 'checkmark' : 'person.badge.plus'} size="md" color={c.primary} />}
                onPress={() => setAdding((v) => !v)}
                testID="chat-info-add-members"
              />
            ) : null}
            {adding
              ? candidates.length === 0
                ? [
                    <View key="none" style={styles.pad}>
                      <Text variant="footnote" color="secondary">
                        {t('chatHub.info.everyoneIn')}
                      </Text>
                    </View>,
                  ]
                : candidates.map((m) => (
                    <ListRow
                      key={`add-${m.userId}`}
                      title={m.name}
                      subtitle={roleLabel(m.role, t)}
                      left={<Avatar size={36} src={m.avatarUrl} fallbackText={m.name} tone="neutral" />}
                      right={<Icon name="plus.circle.fill" size="lg" color={c.primary} />}
                      disabled={busyUserId === m.userId}
                      onPress={() => void addMember(m)}
                      accessibilityLabel={t('chatHub.info.addMember', { name: m.name })}
                    />
                  ))
              : null}
            {members === null ? (
              <View style={styles.pad}>
                <Skeleton width="60%" height={16} />
              </View>
            ) : membersError && inGroup.length === 0 ? (
              <ListRow
                title={t('chatHub.errors.membersFailed')}
                subtitle={t('common.retry')}
                onPress={() => void loadMembers()}
              />
            ) : (
              visibleMembers.map((m) => {
                const isMe = m.userId === user?.id
                return (
                  <ListRow
                    key={m.userId}
                    title={isMe ? t('chatHub.info.you', { name: m.name }) : m.name}
                    subtitle={roleLabel(m.role, t)}
                    left={<Avatar size={36} src={m.avatarUrl} fallbackText={m.name} tone="neutral" />}
                    disabled={busyUserId === m.userId}
                    onPress={
                      canManage && isCustom && !isMe ? () => confirmRemove(m) : undefined
                    }
                    accessibilityLabel={
                      canManage && isCustom && !isMe
                        ? t('chatHub.info.removeA11y', { name: m.name })
                        : undefined
                    }
                    compact
                  />
                )
              })
            )}
            {inGroup.length > MEMBER_PREVIEW && !showAllMembers ? (
              <ListRow
                title={t('chatHub.info.showAll', { count: inGroup.length })}
                onPress={() => setShowAllMembers(true)}
                showChevron
              />
            ) : null}
          </SectionGroup>
        ) : null}

        {clubId && !loading ? (
          <ChatMediaSection clubId={clubId} kind={kind} conversationId={id} />
        ) : null}

        {kind === 'dm' && dm?.otherUser ? (
          <SectionGroup>
            <ListRow
              title={t('chatHub.info.block', { name: dm.otherUser.name })}
              left={<Icon name="hand.raised" size="md" color={c.error} />}
              onPress={blockPeer}
              destructive
            />
            <ListRow
              title={t('chatHub.info.report', { name: dm.otherUser.name })}
              left={<Icon name="flag" size="md" color={c.error} />}
              onPress={() => setReportOpen(true)}
              destructive
              testID="chat-info-report"
            />
          </SectionGroup>
        ) : null}

        {isClubAdmin ? (
          <SectionGroup footer={t('chatHub.info.retentionHint')}>
            <ListRow
              title={t('chatHub.info.retention')}
              left={<Icon name="clock" size="md" color={c.textSecondary} />}
              onPress={() => router.push('/admin-chat-retention' as never)}
              showChevron
            />
          </SectionGroup>
        ) : null}

        {isCustom && amMember ? (
          <SectionGroup>
            <ListRow
              title={t('chatHub.info.leave')}
              left={<Icon name="rectangle.portrait.and.arrow.right" size="md" color={c.error} />}
              onPress={confirmLeave}
              destructive
              testID="chat-info-leave"
            />
          </SectionGroup>
        ) : null}
      </ScrollView>
      {kind === 'dm' && clubId && dm?.otherUser ? (
        <UserReportSheet
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          clubId={clubId}
          conversationId={id}
          peer={{ id: dm.otherUser.id, name: dm.otherUser.name }}
        />
      ) : null}
    </View>
  )
}

function roleLabel(role: string, t: (key: string) => string): string {
  switch (role) {
    case 'OWNER':
    case 'ADMIN':
      return t('chatHub.role.board')
    case 'COACH':
    case 'HEAD_COACH':
      return t('chatHub.role.coach')
    case 'ASSISTANT_COACH':
      return t('chatHub.role.assistant')
    case 'PARENT':
      return t('chatHub.role.parent')
    default:
      return t('chatHub.role.player')
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: space.md, paddingTop: space.lg, gap: space.lg },
  hero: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  center: { textAlign: 'center' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm + space.xs,
    paddingVertical: space.xs + space['2xs'],
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    marginTop: space.xs,
  },
  pad: { paddingHorizontal: space.md, paddingVertical: space.md },
  flex: { flex: 1, minWidth: 0 },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    margin: space.sm,
    padding: space.sm + space.xs,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
  },
})
