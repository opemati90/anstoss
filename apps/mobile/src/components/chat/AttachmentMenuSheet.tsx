import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useClubColors } from '../../context/ClubThemeContext'
import { hairline, radius, space } from '../../theme/tokens'
import { BottomSheet, Icon, Text } from '../ui'
import type { IconName } from '../ui'

export type AttachmentAction = 'library' | 'camera' | 'file' | 'voice' | 'lineup' | 'compose'

type Props = {
  visible: boolean
  onClose: () => void
  onSelect: (action: AttachmentAction) => void
  /** DMs: "Aufstellung teilen" (event lineup for coaches, formation card for anyone). */
  showLineup?: boolean
  /** Channel managers: poll, event card and team lineup live in the compose sheet. */
  showCompose?: boolean
}

type Item = { action: AttachmentAction; icon: IconName; labelKey: string; hintKey: string }

const ITEMS: Item[] = [
  { action: 'library', icon: 'photo', labelKey: 'chatThread.attach.library', hintKey: 'chatThread.attach.libraryHint' },
  { action: 'camera', icon: 'camera', labelKey: 'chatThread.attach.camera', hintKey: 'chatThread.attach.cameraHint' },
  { action: 'file', icon: 'doc.text', labelKey: 'chatThread.attach.file', hintKey: 'chatThread.attach.fileHint' },
  { action: 'voice', icon: 'mic-outline', labelKey: 'chatThread.attach.voice', hintKey: 'chatThread.attach.voiceHint' },
  { action: 'lineup', icon: 'football', labelKey: 'chatThread.attach.lineup', hintKey: 'chatThread.attach.lineupHint' },
  { action: 'compose', icon: 'chart.bar', labelKey: 'chatThread.attach.compose', hintKey: 'chatThread.attach.composeHint' },
]

/**
 * The composer's + menu as a short bottom sheet with icons (WhatsApp /
 * Telegram pattern). Same menu for channels and direct messages.
 */
export function AttachmentMenuSheet({ visible, onClose, onSelect, showLineup = false, showCompose = false }: Props) {
  const { t } = useTranslation()
  const c = useClubColors()
  const items = ITEMS.filter(
    (item) => (item.action !== 'lineup' || showLineup) && (item.action !== 'compose' || showCompose),
  )
  return (
    <BottomSheet visible={visible} onClose={onClose} heightPct="auto">
      <View style={styles.body} testID="chat-attach-menu">
        <Text variant="title3" weight="bold" color="primary" accessibilityRole="header">
          {t('chatThread.attach.title')}
        </Text>
        <View style={[styles.group, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
          {items.map((item, index) => (
            <Pressable
              key={item.action}
              onPress={() => onSelect(item.action)}
              accessibilityRole="button"
              accessibilityLabel={t(item.labelKey)}
              accessibilityHint={t(item.hintKey)}
              android_ripple={{ color: c.borderSubtle }}
              testID={`chat-attach-${item.action}`}
              style={({ pressed }) => [
                styles.row,
                index > 0 && { borderTopWidth: hairline, borderTopColor: c.borderSubtle },
                pressed && { backgroundColor: c.surfaceSunken },
              ]}
            >
              <View style={[styles.iconWell, { backgroundColor: c.surfaceSunken }]}>
                <Icon name={item.icon} size={20} color={c.primary} />
              </View>
              <View style={styles.text}>
                <Text variant="body" weight="medium" color="primary">
                  {t(item.labelKey)}
                </Text>
                <Text variant="footnote" color="secondary">
                  {t(item.hintKey)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  group: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 56,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: space['2xs'] },
})
