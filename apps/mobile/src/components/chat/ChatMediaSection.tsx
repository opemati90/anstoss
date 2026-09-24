import { useCallback, useEffect, useState } from 'react'
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useTranslation } from 'react-i18next'
import type { ChatMediaItem, ChatMediaTab } from '@anstoss/shared'
import { useClubColors } from '../../context/ClubThemeContext'
import { fetchChatMedia, fetchSignedMediaUrl } from '../../api/chatInfo'
import type { ConversationKind } from './inboxModel'
import { Skeleton } from '../Skeleton'
import { RADIUS_CARD, RADIUS_MD, hairline, space } from '../../theme/tokens'
import { Icon, SegmentedControl, Text, type IconName } from '../ui'
import { useSafeAreaInsetsSafe } from '../../utils/useSafeAreaInsetsSafe'

type Props = {
  clubId: string
  kind: ConversationKind
  conversationId: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: ChatMediaItem[] }

const GRID_GAP = 2
// Photo viewers are theme-independent (like Photos / WhatsApp): media on black.
const MEDIA_BACKDROP = 'black'
const MEDIA_CONTROL = 'white'
const SIGNED_URL_TTL_MS = 50 * 60 * 1000

// Signed URLs live 1h server-side; reuse them for 50 min across tiles and
// tab switches instead of re-signing every render.
const signedCache = new Map<string, { url: string | null; at: number }>()

async function resolveUrl(
  clubId: string,
  kind: ConversationKind,
  conversationId: string,
  item: ChatMediaItem,
): Promise<string | null> {
  const cached = signedCache.get(item.id)
  if (cached && Date.now() - cached.at < SIGNED_URL_TTL_MS) return cached.url
  const url = await fetchSignedMediaUrl(clubId, kind, conversationId, item.id)
    .then((res) => res?.url ?? null)
    .catch(() => null)
  // Dev without R2: the API returns null and the stored URL is the read path.
  const resolved = url ?? item.attachmentUrl ?? null
  signedCache.set(item.id, { url: resolved, at: Date.now() })
  return resolved
}

/** Test hook. */
export function __resetSignedMediaCache() {
  signedCache.clear()
}

/**
 * "Geteilte Inhalte" on the chat info screen: Medien (photo/video grid),
 * Dateien (PDFs, voice notes, lineups) and Links, each with its own
 * skeleton, composed empty line and inline retry.
 */
export function ChatMediaSection({ clubId, kind, conversationId }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [tab, setTab] = useState<ChatMediaTab>('media')
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [width, setWidth] = useState(0)
  const [viewer, setViewer] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const items = await fetchChatMedia(clubId, kind, conversationId, tab)
      setState({ status: 'ready', items: Array.isArray(items) ? items : [] })
    } catch {
      setState({ status: 'error' })
    }
  }, [clubId, conversationId, kind, tab])

  useEffect(() => {
    void load()
  }, [load])

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)
  const columns = width >= 560 ? 5 : width >= 400 ? 4 : 3
  const tile = width > 0 ? Math.floor((width - GRID_GAP * (columns - 1)) / columns) : 0

  const openItem = useCallback(
    async (item: ChatMediaItem) => {
      if (tab === 'links') {
        if (item.url) await WebBrowser.openBrowserAsync(item.url).catch(() => undefined)
        return
      }
      const url = await resolveUrl(clubId, kind, conversationId, item)
      if (!url) return
      if (item.messageType === 'IMAGE') {
        setViewer(url)
        return
      }
      await WebBrowser.openBrowserAsync(url).catch(() => undefined)
    },
    [clubId, conversationId, kind, tab],
  )

  const emptyKey =
    tab === 'media' ? 'chatInbox.media.emptyMedia' : tab === 'files' ? 'chatInbox.media.emptyFiles' : 'chatInbox.media.emptyLinks'

  return (
    <View style={styles.wrap} testID="chat-info-media">
      <Text variant="footnote" weight="semibold" color="secondary" style={styles.header}>
        {t('chatInbox.media.header')}
      </Text>
      <SegmentedControl<ChatMediaTab>
        segments={[
          { key: 'media', label: t('chatInbox.media.tabMedia'), testID: 'chat-info-media-tab-media' },
          { key: 'files', label: t('chatInbox.media.tabFiles'), testID: 'chat-info-media-tab-files' },
          { key: 'links', label: t('chatInbox.media.tabLinks'), testID: 'chat-info-media-tab-links' },
        ]}
        value={tab}
        onChange={setTab}
        fullWidth
      />
      <View
        onLayout={onLayout}
        style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}
      >
        {state.status === 'loading' ? (
          tab === 'media' ? (
            <View style={styles.grid}>
              {Array.from({ length: columns * 2 }).map((_, i) => (
                <Skeleton key={i} width={tile || 96} height={tile || 96} style={styles.square} />
              ))}
            </View>
          ) : (
            <View style={styles.listPad}>
              {Array.from({ length: 3 }).map((_, i) => (
                <View key={i} style={styles.skeletonRow}>
                  <Skeleton width={36} height={36} />
                  <Skeleton width="60%" height={16} />
                </View>
              ))}
            </View>
          )
        ) : state.status === 'error' ? (
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel={`${t('chatInbox.media.error')} ${t('chatInbox.media.retry')}`}
            style={styles.message}
            testID="chat-info-media-retry"
          >
            <Text variant="footnote" color="secondary" align="center">
              {t('chatInbox.media.error')}
            </Text>
            <Text variant="footnote" weight="semibold" color={c.primary} align="center">
              {t('chatInbox.media.retry')}
            </Text>
          </Pressable>
        ) : state.items.length === 0 ? (
          <View style={styles.message}>
            <Text variant="footnote" color="secondary" align="center">
              {t(emptyKey)}
            </Text>
          </View>
        ) : tab === 'media' ? (
          <View style={styles.grid}>
            {state.items.map((item) => (
              <MediaTile
                key={item.id}
                item={item}
                size={tile}
                clubId={clubId}
                kind={kind}
                conversationId={conversationId}
                onPress={() => void openItem(item)}
              />
            ))}
          </View>
        ) : (
          state.items.map((item, index) => (
            <FileRow
              key={item.id}
              item={item}
              tab={tab}
              first={index === 0}
              onPress={() => void openItem(item)}
            />
          ))
        )}
      </View>
      <ImageViewer url={viewer} onClose={() => setViewer(null)} />
    </View>
  )
}

function MediaTile({
  item,
  size,
  clubId,
  kind,
  conversationId,
  onPress,
}: {
  item: ChatMediaItem
  size: number
  clubId: string
  kind: ConversationKind
  conversationId: string
  onPress: () => void
}) {
  const { t, i18n } = useTranslation()
  const c = useClubColors()
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  const isVideo = item.messageType === 'VIDEO'

  useEffect(() => {
    if (isVideo) return
    let cancelled = false
    void resolveUrl(clubId, kind, conversationId, item).then((resolved) => {
      if (!cancelled) setUrl(resolved)
    })
    return () => {
      cancelled = true
    }
  }, [clubId, conversationId, isVideo, item, kind])

  const date = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' }).format(
    new Date(item.createdAt),
  )
  const label = t(isVideo ? 'chatInbox.media.videoA11y' : 'chatInbox.media.photoA11y', {
    name: item.senderName ?? t('chatHub.unknownPerson'),
    date,
  })

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      style={({ pressed }) => [
        { width: size, height: size, backgroundColor: c.surfaceSunken, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {isVideo ? (
        <View style={styles.videoTile}>
          <Icon name="play.circle.fill" size={32} color={c.textSecondary} />
        </View>
      ) : url === undefined ? (
        <Skeleton width={size} height={size} style={styles.square} />
      ) : url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <View style={styles.videoTile}>
          <Icon name="photo" size={24} color={c.textTertiary} />
        </View>
      )}
    </Pressable>
  )
}

function FileRow({
  item,
  tab,
  first,
  onPress,
}: {
  item: ChatMediaItem
  tab: ChatMediaTab
  first: boolean
  onPress: () => void
}) {
  const { t, i18n } = useTranslation()
  const c = useClubColors()
  const meta = item.attachmentMeta
  let icon: IconName = 'doc.fill'
  let title = item.content || meta?.fileName || t('chatInbox.media.file')
  if (tab === 'links') {
    icon = 'link'
    title = item.url ?? item.content
  } else if (item.messageType === 'VOICE') {
    icon = 'play.circle.fill'
    title = t('chatInbox.media.voice')
  } else if (item.messageType === 'LINEUP') {
    icon = 'list.clipboard.fill'
    title = meta?.formation ? `${t('chatInbox.media.lineup')} · ${meta.formation}` : t('chatInbox.media.lineup')
  } else if (meta?.fileName) {
    title = meta.fileName
  }
  const date = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(item.createdAt))
  const subtitle = [item.senderName, date].filter(Boolean).join(' · ')

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={tab === 'links' ? 'link' : 'button'}
      accessibilityLabel={t('chatInbox.media.openA11y', { name: title })}
      android_ripple={{ color: c.borderSubtle }}
      style={({ pressed }) => [
        styles.fileRow,
        !first && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
        pressed && { backgroundColor: c.surfaceSunken },
      ]}
    >
      <View style={[styles.fileIcon, { backgroundColor: c.surfaceSunken }]}>
        <Icon name={icon} size={18} color={c.textSecondary} />
      </View>
      <View style={styles.fileBody}>
        <Text variant="body" color="primary" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption1" weight="regular" color="tertiary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  )
}

/** Minimal full-screen photo view; tap anywhere or back to close. */
function ImageViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  const { t } = useTranslation()
  const insets = useSafeAreaInsetsSafe()
  return (
    <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        style={styles.viewer}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        {url ? <Image source={{ uri: url }} style={styles.viewerImage} resizeMode="contain" /> : null}
        <View style={[styles.viewerClose, { top: insets.top + space.sm }]}>
          <Icon name="xmark.circle.fill" size={32} color={MEDIA_CONTROL} />
        </View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  header: { paddingHorizontal: space.md, textTransform: 'uppercase' },
  panel: {
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  square: { borderRadius: 0 },
  videoTile: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listPad: { padding: space.md, gap: space.md },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  message: { paddingHorizontal: space.md, paddingVertical: space.lg, gap: space.xs, minHeight: 44 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + space.xs,
    minHeight: 56,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS_MD,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileBody: { flex: 1, minWidth: 0, gap: space['2xs'] },
  viewer: { flex: 1, backgroundColor: MEDIA_BACKDROP, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', right: space.md },
})
