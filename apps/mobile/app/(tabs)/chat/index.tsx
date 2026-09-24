import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { InboxItem } from '@anstoss/shared'
import { useAuth } from '../../../src/context/AuthContext'
import { useClubColors } from '../../../src/context/ClubThemeContext'
import { useInbox, patchInboxItem, refreshInbox } from '../../../src/hooks/useInbox'
import { markConversationRead, muteConversation } from '../../../src/api/chat'
import { EmptyState } from '../../../src/components/EmptyState'
import { ErrorState } from '../../../src/components/ErrorState'
import { Skeleton } from '../../../src/components/Skeleton'
import { IconButton, Icon, SearchBar, Text } from '../../../src/components/ui'
import { InboxRow, INBOX_AVATAR_SIZE } from '../../../src/components/chat/InboxRow'
import { openConversation } from '../../../src/components/chat/chatRoutes'
import {
  conversationSubtitle,
  conversationTitle,
  filterInbox,
  isMuted,
  previewLine,
  routeKindFor,
  sortInbox,
  typingPreview,
} from '../../../src/components/chat/inboxModel'
import { hairline, space, TAB_BAR_CLEARANCE } from '../../../src/theme/tokens'

/** Scroll offset over which the large title hands over to the compact bar. */
const COLLAPSE_START = 24
const COLLAPSE_END = 44

/**
 * Chat inbox. One list, the way WhatsApp already taught everyone: every
 * team channel, club channel, group and direct message the member can read,
 * newest first. Unread Ankündigungen stay pinned on top.
 */
export default function ChatInboxScreen() {
  const { t } = useTranslation()
  const c = useClubColors()
  const { user, activeClub, teamsForActiveClub } = useAuth()
  const { items, status, refetch, typing } = useInbox()
  // Large title + search scroll away; a compact title bar fades in (iOS
  // large-title behaviour, identical on Android).
  const scrollY = useRef(new Animated.Value(0)).current
  const compactOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_START, COLLAPSE_END],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const clubId = activeClub?.club.id ?? null
  const teamCount = teamsForActiveClub?.length ?? 0
  const crestUrl = activeClub?.club.badgeUrl ?? null

  const rows = useMemo(() => {
    const decorated = items.map((item) => {
      const typist = typing[item.id]
      return {
        item,
        title: conversationTitle(item, t),
        subtitle: conversationSubtitle(item, teamCount, t),
        typing: !!typist,
        preview: typist ? typingPreview(item, typist.userName, t) : previewLine(item, user?.id, t),
      }
    })
    const byId = new Map(decorated.map((row) => [row.item.id, row]))
    const sorted = sortInbox(items)
    const filtered = filterInbox(sorted, query, (item) => byId.get(item.id)?.title ?? item.title)
    return filtered.map((item) => byId.get(item.id)!)
  }, [items, query, t, teamCount, typing, user?.id])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  const open = useCallback(
    (item: InboxItem) => {
      if (item.unreadCount > 0) patchInboxItem(item.id, { unreadCount: 0 })
      openConversation({
        kind: routeKindFor(item),
        id: item.id,
        teamId: item.teamId,
        title: conversationTitle(item, t),
      })
    },
    [t],
  )

  const toggleMute = useCallback(
    async (item: InboxItem) => {
      if (!clubId) return
      const nextMuted = !isMuted(item)
      patchInboxItem(item.id, { muted: nextMuted, mutedUntil: null })
      try {
        await muteConversation(clubId, routeKindFor(item), item.id, nextMuted)
      } catch {
        patchInboxItem(item.id, { muted: item.muted, mutedUntil: item.mutedUntil })
        Alert.alert(t('common.error'), t('chatHub.errors.muteFailed'))
      } finally {
        void refreshInbox(clubId)
      }
    },
    [clubId, t],
  )

  const markRead = useCallback(
    async (item: InboxItem) => {
      if (!clubId || item.unreadCount === 0) return
      patchInboxItem(item.id, { unreadCount: 0 })
      try {
        await markConversationRead(clubId, routeKindFor(item), item.id)
      } catch {
        patchInboxItem(item.id, { unreadCount: item.unreadCount })
      } finally {
        void refreshInbox(clubId)
      }
    },
    [clubId],
  )

  // Long-press is the row menu (mute, mark read), mirroring the swipe
  // actions; VoiceOver users get the same two as accessibility actions.
  const showRowMenu = useCallback(
    (item: InboxItem) => {
      const muteLabel = isMuted(item) ? t('chatHub.actions.unmute') : t('chatHub.actions.mute')
      const actions: Array<{ label: string; run: () => void }> = [
        { label: muteLabel, run: () => void toggleMute(item) },
      ]
      if (item.unreadCount > 0) {
        actions.push({ label: t('chatHub.actions.markRead'), run: () => void markRead(item) })
      }
      const title = conversationTitle(item, t)
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title,
            options: [...actions.map((a) => a.label), t('common.cancel')],
            cancelButtonIndex: actions.length,
          },
          (index) => actions[index]?.run(),
        )
        return
      }
      Alert.alert(title, undefined, [
        ...actions.map((a) => ({ text: a.label, onPress: a.run })),
        { text: t('common.cancel'), style: 'cancel' as const },
      ])
    },
    [markRead, t, toggleMute],
  )

  // Free agents have no club chat yet. Clubs reach them once they ask for a
  // Probetraining, so point there instead of a dead "join a club" line.
  if (!activeClub) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: c.background }]}>
        <EmptyState
          illustration="emptyChat"
          icon="bubble.fill"
          title={t('chatHub.freeAgent.title')}
          description={t('chatHub.freeAgent.body')}
          actionLabel={t('chatHub.freeAgent.cta')}
          onAction={() => router.push('/find-club' as never)}
          testID="chat-free-agent-empty"
        />
      </View>
    )
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text variant="largeTitle" color="primary" accessibilityRole="header" style={styles.title}>
          {t('chatHub.title')}
        </Text>
        <IconButton
          onPress={() => router.push('/chat/new' as never)}
          accessibilityLabel={t('chatHub.newChat')}
          testID="chat-compose"
        >
          <Icon name="square.and.pencil" size="lg" color={c.primary} />
        </IconButton>
      </View>
      <SearchBar
        value={query}
        onChangeText={setQuery}
        placeholder={t('chatHub.searchPlaceholder')}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
        testID="chat-inbox-search"
      />
    </View>
  )

  const body = (() => {
    if (status === 'loading' && items.length === 0) return <InboxSkeleton />
    if (status === 'error' && items.length === 0) {
      return (
        <ErrorState
          message={t('chatHub.errors.loadTitle')}
          hint={t('chatHub.errors.loadHint')}
          onRetry={() => void refetch()}
          fillContainer
        />
      )
    }
    return null
  })()

  const compactBar = (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.compactBar,
        { backgroundColor: c.background, borderBottomColor: c.borderSubtle, opacity: compactOpacity },
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text variant="headline" weight="semibold" color="primary" numberOfLines={1}>
        {t('chatHub.title')}
      </Text>
    </Animated.View>
  )

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      {body ? (
        <>
          {header}
          {body}
        </>
      ) : (
        <Animated.FlatList
          data={rows}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true,
          })}
          scrollEventThrottle={16}
          keyExtractor={(row) => `${row.item.type}:${row.item.id}`}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={c.textTertiary}
              colors={[c.primary]}
              progressBackgroundColor={c.surface}
            />
          }
          renderItem={({ item: row }) => (
            <InboxRow
              item={row.item}
              title={row.title}
              subtitle={row.subtitle}
              preview={row.preview}
              typing={row.typing}
              crestUrl={crestUrl}
              onPress={open}
              onLongPress={showRowMenu}
              onToggleMute={(i) => void toggleMute(i)}
              onMarkRead={(i) => void markRead(i)}
            />
          )}
          ListEmptyComponent={
            query.trim() ? (
              <View style={styles.searchEmpty}>
                <Text variant="body" color="secondary" style={styles.centerText}>
                  {t('chatHub.searchEmpty', { query: query.trim() })}
                </Text>
              </View>
            ) : (
              <EmptyState
                illustration="emptyChat"
                icon="bubble.fill"
                title={t('chatHub.empty.title')}
                description={t('chatHub.empty.body')}
                actionLabel={t('chatHub.newChat')}
                onAction={() => router.push('/chat/new' as never)}
                style={styles.empty}
              />
            )
          }
          testID="chat-inbox-list"
        />
      )}
      {body ? null : compactBar}
    </View>
  )
}

function InboxSkeleton() {
  return (
    <View style={styles.skeleton} accessibilityLabel="" importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 7 }).map((_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <Skeleton shape="circle" width={INBOX_AVATAR_SIZE} height={INBOX_AVATAR_SIZE} />
          <View style={styles.skeletonText}>
            <Skeleton width="55%" height={16} />
            <Skeleton width="85%" height={14} />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  compactBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderBottomWidth: hairline,
  },
  centered: { justifyContent: 'center', paddingHorizontal: space.md },
  header: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.sm,
    gap: space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { flex: 1 },
  listContent: { paddingBottom: space.lg + TAB_BAR_CLEARANCE },
  searchEmpty: { paddingHorizontal: space.lg, paddingVertical: space.xl },
  centerText: { textAlign: 'center' },
  empty: { marginTop: space.xl },
  skeleton: { paddingTop: space.sm },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
  },
  skeletonText: { flex: 1, gap: space.sm },
})
