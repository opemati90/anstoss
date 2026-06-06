/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { BottomSheet, Button, Icon, Text } from '../src/components/ui'
import { ComingSoon } from '../src/components/ComingSoon'
import { isFeatureEnabled } from '../src/utils/featureFlags'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type Tag = 'tactical' | 'praise' | 'fix' | 'set-piece'

type Memo = {
  id: string
  fromUserId: string
  fromUserName: string
  toUserId: string
  toUserName: string
  audioUrl: string
  durationSec: number
  peaks: number[]
  title: string | null
  tags: Tag[]
  listened: boolean
  fixtureId: string | null
  createdAt: string
}

type SquadMember = {
  userId: string
  name: string
  jerseyNumber: number | null
  position: 'GK' | 'DEF' | 'MID' | 'ATT'
}

const TAG_META: Record<Tag, { label: string; color: 'success' | 'primary' | 'warning' | 'info' }> = {
  tactical: { label: 'Tactical', color: 'primary' },
  praise: { label: 'Praise', color: 'success' },
  fix: { label: 'Fix', color: 'warning' },
  'set-piece': { label: 'Set piece', color: 'info' },
}

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (_, body) => {
      const parts = String(body).split(',').map((p) => p.trim()).slice(0, 3)
      return `rgba(${parts.join(', ')}, ${alpha})`
    })
  }
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function VoiceMemosScreen() {
  // Gated out of MVP: recording/playback is still a prototype (no real audio).
  if (!isFeatureEnabled('anstoss.experimentalFeatures')) {
    return <ComingSoon title="Voice memos" />
  }
  return <VoiceMemosScreenInner />
}

function VoiceMemosScreenInner() {
  const { t } = useTranslation()
  const { user, activeClub, activeTeamId } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const teamId = activeTeamId

  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
  const [inbox, setInbox] = useState<Memo[]>([])
  const [sent, setSent] = useState<Memo[]>([])
  const [squad, setSquad] = useState<SquadMember[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)

  // compose state
  const [cTo, setCTo] = useState<SquadMember | null>(null)
  const [cTitle, setCTitle] = useState('')
  const [cTags, setCTags] = useState<Tag[]>(['tactical'])
  const [cDuration, setCDuration] = useState(22)
  const [recording, setRecording] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const isCoach = activeClub?.role === 'COACH' || activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const [inboxRes, sentRes, sq] = await Promise.all([
        api<Memo[]>('/me/voice-memos').catch(() => []),
        isCoach
          ? api<Memo[]>(`/clubs/${clubId}/voice-memos/sent`).catch(() => [])
          : Promise.resolve([] as Memo[]),
        teamId
          ? api<SquadMember[]>(
              `/clubs/${clubId}/teams/${teamId}/squad-stats`,
            ).catch(() => [])
          : Promise.resolve([] as SquadMember[]),
      ])
      setInbox(Array.isArray(inboxRes) ? inboxRes : [])
      setSent(Array.isArray(sentRes) ? sentRes : [])
      setSquad(Array.isArray(sq) ? sq : [])
    } catch {
      setInbox([])
      setSent([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId, teamId, isCoach])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const list = tab === 'inbox' ? inbox : sent
  const sorted = useMemo(
    () =>
      list.slice().sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [list],
  )

  const togglePlayed = async (memo: Memo) => {
    setBusyId(memo.id)
    try {
      await api(`/me/voice-memos/${memo.id}`, {
        method: 'PATCH',
        body: { listened: !memo.listened },
      })
      await fetchData()
    } catch {
      Alert.alert(t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  const submit = async () => {
    if (!clubId || !cTo) {
      Alert.alert(
        t('common.errorTitle'),
        t('voiceMemos.recipientRequired', {
          defaultValue: 'Pick a player to send to.',
        }),
      )
      return
    }
    setSubmitting(true)
    try {
      await api(`/clubs/${clubId}/voice-memos`, {
        method: 'POST',
        body: {
          toUserId: cTo.userId,
          toUserName: cTo.name,
          title: cTitle.trim() || null,
          tags: cTags,
          durationSec: cDuration,
        },
      })
      setComposeOpen(false)
      setCTo(null)
      setCTitle('')
      setCTags(['tactical'])
      setCDuration(22)
      Alert.alert(
        t('voiceMemos.sentTitle', { defaultValue: 'Memo sent' }),
        t('voiceMemos.sentBody', {
          defaultValue: '{{name}} got a push. They can play it from their feed.',
          name: cTo.name,
        }),
      )
      await fetchData()
    } catch {
      Alert.alert(t('common.error'))
    } finally {
      setSubmitting(false)
    }
  }

  const fakeRecord = () => {
    if (recording) {
      // Stop recording — capture the duration as the elapsed time.
      setRecording(false)
    } else {
      setRecording(true)
      // Simulate a 22s recording stop after a delay if user doesn't tap
      // again. Real flow uses expo-av Recording API with peak metering.
      setCDuration(22)
    }
  }

  const unreadInbox = inbox.filter((m) => !m.listened).length
  const totalSent = sent.length

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('voiceMemos.title', { defaultValue: 'Voice memos' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true)
                void fetchData()
              }}
              tintColor={c.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('voiceMemos.eyebrow', { defaultValue: 'COACH MEMOS' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {tab === 'inbox'
              ? t('voiceMemos.inboxTitle', {
                  defaultValue: '{{count}} new for you',
                  count: unreadInbox,
                })
              : t('voiceMemos.sentTitleHero', {
                  defaultValue: '{{count}} memos sent',
                  count: totalSent,
                })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('voiceMemos.subtitle', {
              defaultValue:
                '30-second tactical notes from coach to player. No group chat noise — just the message you need.',
            })}
          </Text>

          {/* Inbox / Sent toggle */}
          {isCoach ? (
            <View style={[styles.tabBar, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
              {(['inbox', 'sent'] as const).map((opt) => {
                const active = tab === opt
                return (
                  <Pressable
                    key={opt}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setTab(opt)}
                    style={[
                      styles.tabSegment,
                      active && {
                        backgroundColor: c.textPrimary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabSegmentText,
                        { color: active ? c.textInverse : c.textPrimary },
                      ]}
                    >
                      {opt === 'inbox'
                        ? t('voiceMemos.inboxTab', { defaultValue: 'Inbox' })
                        : t('voiceMemos.sentTab', { defaultValue: 'Sent' })}
                    </Text>
                    {opt === 'inbox' && unreadInbox > 0 ? (
                      <View
                        style={[
                          styles.tabBadge,
                          { backgroundColor: active ? c.error : withAlpha(c.error, 0.18) },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabBadgeText,
                            { color: active ? '#fff' : c.error },
                          ]}
                          tabular
                        >
                          {unreadInbox}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          {/* List */}
          {sorted.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: c.surface, borderColor: c.borderDefault },
              ]}
            >
              <Text variant="footnote" color="secondary">
                {tab === 'inbox'
                  ? t('voiceMemos.inboxEmpty', {
                      defaultValue: 'No new memos. Coaches will tag you when they have feedback.',
                    })
                  : t('voiceMemos.sentEmpty', {
                      defaultValue:
                        'You haven\'t sent any memos yet. Tap the mic to record one.',
                    })}
              </Text>
            </View>
          ) : (
            sorted.map((memo) => {
              const isMine = memo.fromUserId === user?.id
              const counterpartName = isMine ? memo.toUserName : memo.fromUserName
              const counterpartLabel = isMine
                ? t('voiceMemos.toLabel', { defaultValue: 'TO' })
                : t('voiceMemos.fromLabel', { defaultValue: 'FROM' })
              return (
                <View
                  key={memo.id}
                  style={[
                    styles.memoCard,
                    {
                      backgroundColor: c.surface,
                      borderColor:
                        !memo.listened && !isMine
                          ? withAlpha(c.primary, 0.4)
                          : c.borderDefault,
                    },
                  ]}
                >
                  <View style={styles.memoHead}>
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: c.surfaceSunken ?? c.background,
                          borderColor: c.borderDefault,
                        },
                      ]}
                    >
                      <Text style={[styles.avatarText, { color: c.textPrimary }]}>
                        {initials(counterpartName)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.tinyEyebrow, { color: c.textTertiary }]}>
                        {counterpartLabel}
                      </Text>
                      <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                        {counterpartName}
                      </Text>
                    </View>
                    {!memo.listened && !isMine ? (
                      <View style={[styles.unreadDot, { backgroundColor: c.primary }]} />
                    ) : null}
                    <Text variant="caption2" color="tertiary" tabular>
                      {relative(memo.createdAt)}
                    </Text>
                  </View>

                  {memo.title ? (
                    <Text variant="callout" color="primary" weight="semibold" style={styles.memoTitle} numberOfLines={2}>
                      "{memo.title}"
                    </Text>
                  ) : null}

                  {/* Waveform + duration */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      memo.listened
                        ? t('voiceMemos.replay', { defaultValue: 'Replay memo' })
                        : t('voiceMemos.play', { defaultValue: 'Play memo' })
                    }
                    onPress={() => togglePlayed(memo)}
                    disabled={busyId === memo.id}
                    style={({ pressed }) => [
                      styles.waveformRow,
                      {
                        backgroundColor: memo.listened
                          ? c.surfaceSunken ?? c.background
                          : withAlpha(c.primary, 0.08),
                        borderColor: memo.listened ? c.borderDefault : withAlpha(c.primary, 0.3),
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View
                      style={[
                        styles.playBubble,
                        { backgroundColor: memo.listened ? c.textPrimary : c.primary },
                      ]}
                    >
                      <Icon
                        name={memo.listened ? 'arrow.clockwise' : 'play.fill'}
                        size={14}
                        color="inverse"
                      />
                    </View>
                    <View style={styles.waveformBars}>
                      {memo.peaks.map((p, i) => (
                        <View
                          key={i}
                          style={[
                            styles.waveBar,
                            {
                              height: 6 + p * 22,
                              backgroundColor: memo.listened ? c.borderStrong : c.primary,
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text variant="caption2" color="secondary" tabular>
                      0:{memo.durationSec.toString().padStart(2, '0')}
                    </Text>
                  </Pressable>

                  {memo.tags.length > 0 ? (
                    <View style={styles.tagRow}>
                      {memo.tags.map((tag) => {
                        const meta = TAG_META[tag]
                        const tone =
                          meta.color === 'success'
                            ? c.success
                            : meta.color === 'primary'
                              ? c.primary
                              : meta.color === 'warning'
                                ? c.warning
                                : c.textSecondary
                        return (
                          <View
                            key={tag}
                            style={[
                              styles.tagPill,
                              { backgroundColor: withAlpha(tone, 0.12) },
                            ]}
                          >
                            <Text style={[styles.tagPillText, { color: tone }]}>
                              {meta.label.toUpperCase()}
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  ) : null}
                </View>
              )
            })
          )}

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('voiceMemos.footer', {
              defaultValue:
                'Memos are private — only the tagged player + the coach see them. Goal: feedback that lands.',
            })}
          </Text>
        </ScrollView>
      )}

      {/* Coach FAB */}
      {isCoach ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('voiceMemos.compose', { defaultValue: 'Record memo' })}
          onPress={() => setComposeOpen(true)}
          style={({ pressed }) => [
            styles.fab,
            { backgroundColor: c.textPrimary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Icon name="mic.fill" size="lg" color="inverse" />
        </Pressable>
      ) : null}

      {/* Compose */}
      <BottomSheet
        visible={composeOpen}
        onClose={() => {
          setComposeOpen(false)
          setRecording(false)
        }}
        heightPct="auto"
      >
        <View style={styles.sheetBody}>
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('voiceMemos.composeEyebrow', { defaultValue: 'NEW MEMO' })}
          </Text>
          <Text variant="title2" color="primary" weight="semibold" style={styles.title}>
            {recording
              ? t('voiceMemos.recording', { defaultValue: 'Recording…' })
              : t('voiceMemos.composeTitle', { defaultValue: 'Tap to record' })}
          </Text>

          {/* Player picker */}
          <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
            {t('voiceMemos.toFieldLabel', { defaultValue: 'TO' })}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.playerRow}
          >
            {squad.map((p) => {
              const active = cTo?.userId === p.userId
              return (
                <Pressable
                  key={p.userId}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setCTo(p)}
                  style={[
                    styles.playerChip,
                    active
                      ? {
                          backgroundColor: withAlpha(c.primary, 0.12),
                          borderColor: c.primary,
                        }
                      : { borderColor: c.borderStrong, backgroundColor: c.surface },
                  ]}
                >
                  <View
                    style={[
                      styles.playerAvatar,
                      {
                        backgroundColor: active ? c.primary : c.surfaceSunken ?? c.background,
                        borderColor: active ? c.primary : c.borderDefault,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        { color: active ? c.textInverse : c.textPrimary },
                      ]}
                    >
                      {p.jerseyNumber != null ? p.jerseyNumber : initials(p.name)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.playerChipText,
                      { color: active ? c.primary : c.textPrimary },
                    ]}
                    numberOfLines={1}
                  >
                    {p.name.split(' ')[0]}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>

          {/* Title */}
          <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
            {t('voiceMemos.titleLabel', { defaultValue: 'HEADLINE (OPTIONAL)' })}
          </Text>
          <View
            style={[
              styles.fieldCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <TextInput
              style={[styles.fieldInput, { color: c.textPrimary }]}
              value={cTitle}
              onChangeText={setCTitle}
              placeholder={t('voiceMemos.titlePlaceholder', {
                defaultValue: 'e.g. Push higher on the second phase',
              })}
              placeholderTextColor={c.textTertiary}
            />
          </View>

          {/* Tags */}
          <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
            {t('voiceMemos.tagsLabel', { defaultValue: 'TAGS' })}
          </Text>
          <View style={styles.tagPickerRow}>
            {(Object.keys(TAG_META) as Tag[]).map((tag) => {
              const active = cTags.includes(tag)
              const tone =
                TAG_META[tag].color === 'success'
                  ? c.success
                  : TAG_META[tag].color === 'primary'
                    ? c.primary
                    : TAG_META[tag].color === 'warning'
                      ? c.warning
                      : c.textSecondary
              return (
                <Pressable
                  key={tag}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() =>
                    setCTags((prev) =>
                      prev.includes(tag)
                        ? prev.filter((t) => t !== tag)
                        : [...prev, tag],
                    )
                  }
                  style={[
                    styles.tagPickerChip,
                    active
                      ? { backgroundColor: withAlpha(tone, 0.12), borderColor: tone }
                      : { borderColor: c.borderStrong, backgroundColor: c.surface },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagPickerText,
                      { color: active ? tone : c.textPrimary },
                    ]}
                  >
                    {TAG_META[tag].label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Mic */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              recording
                ? t('voiceMemos.stop', { defaultValue: 'Stop' })
                : t('voiceMemos.record', { defaultValue: 'Record' })
            }
            onPress={fakeRecord}
            style={({ pressed }) => [
              styles.micBtn,
              {
                backgroundColor: recording ? c.error : c.textPrimary,
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Icon
              name={recording ? 'stop.fill' : 'mic.fill'}
              size="xl"
              color="inverse"
            />
          </Pressable>
          <Text variant="caption2" color="tertiary" style={styles.micHint}>
            {recording
              ? t('voiceMemos.recordingHint', {
                  defaultValue: 'Recording... tap to stop. (Mock mode uses a placeholder mp3.)',
                })
              : t('voiceMemos.recordHint', {
                  defaultValue: 'Hold the mic to record. 30s max.',
                })}
          </Text>

          <View style={styles.footerActions}>
            <Button
              label={t('voiceMemos.send', { defaultValue: 'Send memo' })}
              variant="filled"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={submitting || !cTo || recording}
              onPress={submit}
            />
            <Button
              label={t('common.cancel')}
              variant="ghost"
              size="lg"
              fullWidth
              onPress={() => {
                setComposeOpen(false)
                setRecording(false)
              }}
            />
          </View>
        </View>
      </BottomSheet>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space['2xl'] * 3,
    gap: space.sm,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },

  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  tinyEyebrow: {
    fontSize: 10,
    fontFamily: fonts.label,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },

  tabBar: {
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: hairline,
    padding: 4,
    marginTop: space.sm,
    gap: 4,
  },
  tabSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    borderRadius: 999,
  },
  tabSegmentText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
  },

  emptyCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    marginTop: space.sm,
  },

  memoCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    gap: 10,
  },
  memoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  memoTitle: { lineHeight: 22, fontStyle: 'italic' },

  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  playBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 32,
  },
  waveBar: {
    flex: 1,
    borderRadius: 1,
  },

  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tagPillText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.6,
  },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },

  fab: {
    position: 'absolute',
    bottom: space.lg,
    right: space.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  sheetBody: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: 8,
  },

  fieldLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
  },

  playerRow: { gap: 8, paddingVertical: 6, paddingRight: space.md },
  playerChip: {
    width: 76,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: 1.25,
    gap: 6,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerChipText: {
    fontSize: 11,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  fieldCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
    marginTop: 6,
  },
  fieldInput: {
    paddingHorizontal: space.md,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.body,
    minHeight: 46,
  },

  tagPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  tagPickerChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  tagPickerText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.4,
  },

  micBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  micHint: { textAlign: 'center', marginTop: 6 },

  footerActions: {
    marginTop: space.md,
    gap: 6,
  },
})
