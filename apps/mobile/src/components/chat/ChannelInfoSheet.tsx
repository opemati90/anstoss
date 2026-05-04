/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import type { Channel } from '@anstoss/shared'
import { api } from '../../api/client'
import { useClubColors } from '../../context/ClubThemeContext'
import { fonts, hairline, radius, space } from '../../theme/tokens'
import { Button, Icon, Text } from '../ui'

type ChannelMember = {
  userId: string
  name: string
  email: string | null
  avatarUrl: string | null
  role: 'OWNER' | 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT'
  isMember: boolean
}

export type ChannelInfoSheetProps = {
  visible: boolean
  channel: Channel | null
  teamId: string
  currentUserId: string
  canManage: boolean
  onClose: () => void
  onChanged?: () => void
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

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

const ROLE_DEFAULTS: Record<ChannelMember['role'], string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  COACH: 'Coach',
  PARENT: 'Parent',
  PLAYER: 'Player',
}

export function ChannelInfoSheet({
  visible,
  channel,
  teamId,
  currentUserId,
  canManage,
  onClose,
  onChanged,
}: ChannelInfoSheetProps) {
  const c = useClubColors()
  const { t } = useTranslation()
  const [members, setMembers] = useState<ChannelMember[]>([])
  const [loading, setLoading] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [muted, setMuted] = useState(false)
  const [pinned, setPinned] = useState(false)

  const fetchMembers = useCallback(async () => {
    if (!channel) return
    setLoading(true)
    try {
      const result = await api<ChannelMember[]>(
        `/teams/${teamId}/channels/${channel.id}/members`,
      )
      setMembers(result ?? [])
    } catch {
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [channel, teamId])

  useEffect(() => {
    if (visible && channel) {
      void fetchMembers()
      setShowAdd(false)
    }
  }, [visible, channel, fetchMembers])

  if (!channel) return null

  const inMembers = members.filter((m) => m.isMember)
  const eligibleToAdd = members.filter((m) => !m.isMember)

  const addMember = async (userId: string) => {
    if (!channel) return
    setBusyUserId(userId)
    try {
      await api(`/teams/${teamId}/channels/${channel.id}/members`, {
        method: 'POST',
        body: { userId },
      })
      await fetchMembers()
      onChanged?.()
    } catch {
      Alert.alert(
        t('common.error'),
        t('chat.addMemberError', { defaultValue: 'Could not add. Try again.' }),
      )
    } finally {
      setBusyUserId(null)
    }
  }

  const removeMember = (userId: string, name: string) => {
    Alert.alert(
      t('chat.removeMemberTitle', { defaultValue: 'Remove from channel?' }),
      t('chat.removeMemberBody', {
        defaultValue: '{{name}} will no longer see new messages here.',
        name,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('chat.remove', { defaultValue: 'Remove' }),
          style: 'destructive',
          onPress: async () => {
            setBusyUserId(userId)
            try {
              await api(
                `/teams/${teamId}/channels/${channel.id}/members/${userId}`,
                { method: 'DELETE' },
              )
              await fetchMembers()
              onChanged?.()
            } catch {
              Alert.alert(
                t('common.error'),
                t('chat.removeMemberError', {
                  defaultValue: 'Could not remove. Try again.',
                }),
              )
            } finally {
              setBusyUserId(null)
            }
          },
        },
      ],
    )
  }

  const leaveChannel = () => {
    Alert.alert(
      t('chat.leaveChannelTitle', { defaultValue: 'Leave channel?' }),
      t('chat.leaveChannelBody', {
        defaultValue:
          "You'll stop receiving messages from #{{name}}. You can be re-added later.",
        name: channel.name || channel.slug,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('chat.leave', { defaultValue: 'Leave' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await api(
                `/teams/${teamId}/channels/${channel.id}/members/${currentUserId}`,
                { method: 'DELETE' },
              )
              onChanged?.()
              onClose()
            } catch {
              Alert.alert(
                t('common.error'),
                t('chat.leaveError', {
                  defaultValue: 'Could not leave. Try again.',
                }),
              )
            }
          },
        },
      ],
    )
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={[styles.overlay, { backgroundColor: c.surfaceOverlay }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.background, paddingBottom: space['2xl'] },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: c.borderDefault }]} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Channel head */}
            <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
              {t('chat.channelEyebrow', { defaultValue: 'CHANNEL' })}
            </Text>
            <Text variant="title2" color="primary" weight="semibold" style={styles.title}>
              {channel.name || channel.slug}
            </Text>
            {channel.description ? (
              <Text variant="footnote" color="secondary" style={styles.desc}>
                {channel.description}
              </Text>
            ) : null}

            {/* Quick toggles row */}
            <View style={styles.toggleRow}>
              <ToggleChip
                active={muted}
                icon={muted ? 'bell.slash.fill' : 'bell.fill'}
                label={
                  muted
                    ? t('chat.unmute', { defaultValue: 'Unmute' })
                    : t('chat.mute', { defaultValue: 'Mute' })
                }
                onPress={() => setMuted((v) => !v)}
                c={c}
              />
              <ToggleChip
                active={pinned}
                icon="pin.fill"
                label={
                  pinned
                    ? t('chat.unpin', { defaultValue: 'Unpin' })
                    : t('chat.pin', { defaultValue: 'Pin' })
                }
                onPress={() => setPinned((v) => !v)}
                c={c}
              />
            </View>

            {/* Members section */}
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
                {t('chat.membersLabel', { defaultValue: 'MEMBERS' })}
                {'  '}
                <Text style={[styles.countTag, { color: c.textTertiary }]}>
                  {String(inMembers.length)}
                </Text>
              </Text>
              {canManage && eligibleToAdd.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowAdd((v) => !v)}
                  style={({ pressed }) => [pressed && { opacity: 0.5 }]}
                >
                  <Text style={[styles.actionLink, { color: c.primary }]}>
                    {showAdd
                      ? t('common.cancel')
                      : t('chat.addMember', { defaultValue: '＋ Add member' })}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {/* Add-member picker */}
            {canManage && showAdd ? (
              <View
                style={[
                  styles.list,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                {eligibleToAdd.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Text variant="footnote" color="secondary">
                      {t('chat.allMembersAdded', {
                        defaultValue: 'Everyone on the team is already in.',
                      })}
                    </Text>
                  </View>
                ) : (
                  eligibleToAdd.map((m, idx) => (
                    <Pressable
                      key={m.userId}
                      accessibilityRole="button"
                      accessibilityLabel={t('chat.addMemberFor', {
                        defaultValue: 'Add {{name}}',
                        name: m.name,
                      })}
                      disabled={busyUserId === m.userId}
                      onPress={() => void addMember(m.userId)}
                      style={({ pressed }) => [
                        styles.row,
                        idx > 0 && {
                          borderTopWidth: hairline,
                          borderTopColor: c.borderDefault,
                        },
                        pressed && { backgroundColor: c.surfaceSunken ?? c.background },
                        busyUserId === m.userId && { opacity: 0.5 },
                      ]}
                    >
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
                          {initialsOf(m.name)}
                        </Text>
                      </View>
                      <View style={styles.rowCopy}>
                        <Text
                          variant="footnote"
                          color="primary"
                          weight="semibold"
                          numberOfLines={1}
                        >
                          {m.name}
                        </Text>
                        <Text variant="caption2" color="tertiary" numberOfLines={1}>
                          {t(`chat.role${m.role.charAt(0)}${m.role.slice(1).toLowerCase()}`, { defaultValue: ROLE_DEFAULTS[m.role] })}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.addPill,
                          { backgroundColor: withAlpha(c.primary, 0.12) },
                        ]}
                      >
                        <Icon name="plus" size={12} color={c.primary} />
                      </View>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}

            {/* Existing members list */}
            <View
              style={[
                styles.list,
                { backgroundColor: c.surface, borderColor: c.borderDefault },
              ]}
            >
              {loading && inMembers.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text variant="footnote" color="secondary">
                    {t('common.loading')}
                  </Text>
                </View>
              ) : inMembers.length === 0 ? (
                <View style={styles.emptyRow}>
                  <Text variant="footnote" color="secondary">
                    {t('chat.noMembersYet', {
                      defaultValue: 'No members yet. Add the first one above.',
                    })}
                  </Text>
                </View>
              ) : (
                inMembers.map((m, idx) => {
                  const isMe = m.userId === currentUserId
                  return (
                    <View
                      key={m.userId}
                      style={[
                        styles.row,
                        idx > 0 && {
                          borderTopWidth: hairline,
                          borderTopColor: c.borderDefault,
                        },
                      ]}
                    >
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
                          {initialsOf(m.name)}
                        </Text>
                      </View>
                      <View style={styles.rowCopy}>
                        <Text
                          variant="footnote"
                          color="primary"
                          weight="semibold"
                          numberOfLines={1}
                        >
                          {m.name}
                          {isMe ? (
                            <Text variant="caption2" color="tertiary">
                              {'  '}·{'  '}
                              {t('chat.youTag', { defaultValue: 'you' })}
                            </Text>
                          ) : null}
                        </Text>
                        <Text variant="caption2" color="tertiary" numberOfLines={1}>
                          {t(`chat.role${m.role.charAt(0)}${m.role.slice(1).toLowerCase()}`, { defaultValue: ROLE_DEFAULTS[m.role] })}
                        </Text>
                      </View>
                      {canManage && !isMe ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('chat.remove', {
                            defaultValue: 'Remove',
                          })}
                          disabled={busyUserId === m.userId}
                          onPress={() => removeMember(m.userId, m.name)}
                          style={({ pressed }) => [
                            styles.removeBtn,
                            { borderColor: withAlpha(c.error, 0.4) },
                            pressed && { opacity: 0.5 },
                            busyUserId === m.userId && { opacity: 0.5 },
                          ]}
                        >
                          <Icon name="xmark" size={12} color={c.error} />
                        </Pressable>
                      ) : null}
                    </View>
                  )
                })
              )}
            </View>

            {/* Leave (if member but not the channel owner) */}
            {!canManage ? (
              <Pressable
                accessibilityRole="button"
                onPress={leaveChannel}
                style={({ pressed }) => [
                  styles.leaveBtn,
                  pressed && { opacity: 0.5 },
                ]}
              >
                <Text style={[styles.leaveText, { color: c.error }]}>
                  {t('chat.leaveChannel', { defaultValue: 'Leave channel' })}
                </Text>
              </Pressable>
            ) : null}

            <Button
              label={t('common.done', { defaultValue: 'Done' })}
              variant="filled"
              size="lg"
              fullWidth
              onPress={onClose}
              style={{ marginTop: space.sm }}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function ToggleChip({
  active,
  icon,
  label,
  onPress,
  c,
}: {
  active: boolean
  icon: string
  label: string
  onPress: () => void
  c: ReturnType<typeof useClubColors>
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.toggleChip,
        active
          ? { backgroundColor: withAlpha(c.primary, 0.12), borderColor: c.primary }
          : { backgroundColor: c.surface, borderColor: c.borderStrong },
        pressed && { opacity: 0.5 },
      ]}
    >
      <Icon name={icon as never} size={12} color={active ? c.primary : c.textPrimary} />
      <Text
        style={[
          styles.toggleChipText,
          { color: active ? c.primary : c.textPrimary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '88%',
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.lg,
    gap: space.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.2, marginTop: 4 },
  desc: { marginTop: 2, lineHeight: 18 },

  toggleRow: { flexDirection: 'row', gap: 8, marginTop: space.sm },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  toggleChipText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
    marginLeft: 4,
    marginRight: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  countTag: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 0.2,
  },
  actionLink: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontWeight: '700',
  },

  list: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  emptyRow: {
    paddingHorizontal: space.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontFamily: fonts.label, fontWeight: '700' },
  rowCopy: { flex: 1, gap: 2 },
  addPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },

  leaveBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: space.sm,
  },
  leaveText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
})
