/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import { BottomSheet, Text } from '../ui'
import { useClubColors } from '../../context/ClubThemeContext'
import { fontSize, fonts, radius, space } from '../../theme/tokens'
import { api } from '../../api/client'

type Channel = { id: string; kind: string; teamId: string | null }

export type AnnounceSheetProps = {
  clubId: string
  /** When provided, fetches ANNOUNCEMENTS channel from the team. When omitted,
   *  fetches the club-level ANNOUNCEMENTS channel instead. */
  teamId?: string
  visible: boolean
  onClose: () => void
}

export function AnnounceSheet({ clubId, teamId, visible, onClose }: AnnounceSheetProps) {
  const { t } = useTranslation()
  const c = useClubColors()
  const insets = useSafeAreaInsets()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [posted, setPosted] = useState(false)
  const titleRef = useRef<TextInput>(null)

  const canPost = title.trim().length > 0 && !posting

  // Reset state when sheet closes
  useEffect(() => {
    if (!visible) {
      setTitle('')
      setBody('')
      setPosting(false)
      setError(null)
      setPosted(false)
    }
  }, [visible])

  // Auto-dismiss success toast after 1.8s
  useEffect(() => {
    if (!posted) return
    const timer = setTimeout(() => {
      setPosted(false)
      onClose()
    }, 1800)
    return () => clearTimeout(timer)
  }, [posted, onClose])

  const handlePost = async () => {
    if (!canPost) return
    setPosting(true)
    setError(null)
    try {
      // Fetch ANNOUNCEMENTS channel — team-scoped when teamId is available,
      // otherwise fall back to the club-level channel list.
      const channelsUrl = teamId
        ? `/teams/${teamId}/channels`
        : `/clubs/${clubId}/channels`
      const channels = await api<Channel[]>(channelsUrl)
      const ch = channels.find((channel) => channel.kind === 'ANNOUNCEMENTS')
      if (!ch) throw new Error('No announcements channel')

      // Post message — title + optional body as second paragraph
      const content = body.trim() ? `${title.trim()}\n\n${body.trim()}` : title.trim()
      await api(`/clubs/${clubId}/channels/${ch.id}/messages`, {
        method: 'POST',
        body: { content },
      })

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setPosted(true)
    } catch {
      setError(t('announcements.postFailed'))
    } finally {
      setPosting(false)
    }
  }

  const handleClose = () => {
    if (posting) return
    onClose()
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      heightPct="auto"
      paddingBottom={insets.bottom + space.md}
    >
      <View style={styles.body}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text variant="headline" weight="semibold" color="primary">
            {t('announcements.sheetTitle')}
          </Text>
          <Pressable
            onPress={handleClose}
            disabled={posting}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            hitSlop={8}
          >
            <Text style={[styles.action, { color: c.textSecondary }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>

        {/* Success toast inline */}
        {posted ? (
          <View style={[styles.successBanner, { backgroundColor: c.successBg, borderColor: c.success }]}>
            <Text variant="footnote" weight="semibold" style={{ color: c.success }}>
              {t('announcements.posted')}
            </Text>
          </View>
        ) : null}

        {/* Title field */}
        <View style={styles.field}>
          <Text variant="caption2" color="secondary" tracking="wide" style={styles.label}>
            {t('announcements.titlePlaceholder').toUpperCase()}
          </Text>
          <TextInput
            ref={titleRef}
            value={title}
            onChangeText={(text) => {
              setTitle(text)
              if (error) setError(null)
            }}
            autoFocus
            placeholder={t('announcements.titlePlaceholder')}
            placeholderTextColor={c.textTertiary}
            maxLength={80}
            returnKeyType="next"
            style={[
              styles.input,
              {
                color: c.textPrimary,
                backgroundColor: c.surfaceSunken,
                borderColor: error ? c.error : c.borderDefault,
              },
            ]}
            accessibilityLabel={t('announcements.titlePlaceholder')}
          />
        </View>

        {/* Body field */}
        <View style={styles.field}>
          <Text variant="caption2" color="secondary" tracking="wide" style={styles.label}>
            {t('announcements.bodyPlaceholder').toUpperCase()}
          </Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={t('announcements.bodyPlaceholder')}
            placeholderTextColor={c.textTertiary}
            maxLength={500}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={[
              styles.bodyInput,
              {
                color: c.textPrimary,
                backgroundColor: c.surfaceSunken,
                borderColor: c.borderDefault,
              },
            ]}
            accessibilityLabel={t('announcements.bodyPlaceholder')}
          />
        </View>

        {/* Inline error */}
        {error ? (
          <Text variant="footnote" style={{ color: c.error }}>
            {error}
          </Text>
        ) : null}

        {/* CTA */}
        <View style={styles.footer}>
          <Pressable
            onPress={handlePost}
            disabled={!canPost}
            accessibilityRole="button"
            accessibilityLabel={posting ? t('announcements.posting') : t('announcements.postButton')}
            accessibilityState={{ disabled: !canPost }}
            style={({ pressed }) => [
              styles.cta,
              {
                backgroundColor: canPost ? c.primary : c.borderDefault,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={[styles.ctaText, { color: c.surface }]}>
              {posting ? t('announcements.posting') : t('announcements.postButton')}
            </Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: {
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    gap: space.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  action: {
    fontFamily: fonts.label,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  successBanner: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  field: { gap: 6 },
  label: { letterSpacing: 1.2 },
  input: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
  },
  bodyInput: {
    minHeight: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
  },
  footer: {
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  cta: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  ctaText: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
})
