/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { EmptyState } from '../src/components/EmptyState'
import { BottomSheet, Button, Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type DutyKind = 'KUCHEN' | 'AUFBAU' | 'PLATZWART' | 'SCHIRI'

type Duty = {
  id: string
  kind: DutyKind
  title: string
  date: string
  matchTitle: string
  assignedUserId: string
  assignedName: string
  swappable: boolean
}

type DutyRoster = {
  members: Array<{ userId: string; name: string }>
  duties: Duty[]
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

function dutyIcon(kind: DutyKind): string {
  switch (kind) {
    case 'KUCHEN':
      return '🍰'
    case 'AUFBAU':
      return '⚽'
    case 'PLATZWART':
      return '🌱'
    case 'SCHIRI':
      return '🟨'
  }
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function DutyRosterScreen() {
  const { t, i18n } = useTranslation()
  const { user, activeClub } = useAuth()
  const c = useClubColors()
  const locale = i18n.language

  const [data, setData] = useState<DutyRoster | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [swapping, setSwapping] = useState<string | null>(null)
  const [swapTarget, setSwapTarget] = useState<Duty | null>(null)

  const fetchData = useCallback(async () => {
    if (!activeClub) {
      setLoading(false)
      return
    }
    try {
      const result = await api<DutyRoster>(`/clubs/${activeClub.club.id}/duties`)
      setData(result)
    } catch {
      // mock fallback returns [] which we treat as no duties; show empty state.
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeClub])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setRefreshing(true)
    void fetchData()
  }

  const performSwap = async (otherUserId: string) => {
    if (!swapTarget || !activeClub) return
    setSwapping(swapTarget.id)
    try {
      await api(`/clubs/${activeClub.club.id}/duties/${swapTarget.id}/swap`, {
        method: 'POST',
        body: { otherUserId },
      })
      setSwapTarget(null)
      await fetchData()
    } catch {
      Alert.alert(
        t('common.error'),
        t('duties.swapError', { defaultValue: 'Could not swap. Try again.' }),
      )
    } finally {
      setSwapping(null)
    }
  }

  const myDuties = (data?.duties ?? []).filter(
    (d) => d.assignedUserId === user?.id,
  )
  const allDuties = data?.duties ?? []

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('duties.title', { defaultValue: 'Team duties' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : !data || allDuties.length === 0 ? (
        <EmptyState
          icon="checklist"
          title={t('duties.emptyTitle', { defaultValue: 'No duties yet' })}
          description={t('duties.emptyBody', {
            defaultValue:
              'Your club hasn\'t set up duty rotations yet. Ask an admin to enable Kuchen-Dienst, set-up duty, or referee escort.',
          })}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={c.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* My duty card — pinned top */}
          {myDuties.length > 0 ? (
            <>
              <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
                {t('duties.yourDutyEyebrow', { defaultValue: 'YOUR DUTY' })}
              </Text>
              {myDuties.map((duty) => (
                <View
                  key={duty.id}
                  style={[
                    styles.myDutyCard,
                    {
                      backgroundColor: withAlpha(c.primary, 0.06),
                      borderColor: withAlpha(c.primary, 0.3),
                    },
                  ]}
                >
                  <View style={styles.myDutyHead}>
                    <Text style={styles.dutyEmoji}>{dutyIcon(duty.kind)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
                        {duty.title}
                      </Text>
                      <Text variant="caption2" color="secondary" numberOfLines={1}>
                        {formatDate(duty.date, locale)}  ·  {duty.matchTitle}
                      </Text>
                    </View>
                  </View>
                  {duty.swappable ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('duties.swap', { defaultValue: 'Swap with…' })}
                      onPress={() => setSwapTarget(duty)}
                      style={({ pressed }) => [
                        styles.swapBtn,
                        { backgroundColor: c.textPrimary },
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <Icon name="arrow.right" size={12} color="inverse" />
                      <Text style={[styles.swapBtnText, { color: c.textInverse }]}>
                        {t('duties.swap', { defaultValue: 'Swap with…' })}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </>
          ) : null}

          {/* Full roster */}
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('duties.upcomingEyebrow', { defaultValue: 'UPCOMING ROTATION' })}
          </Text>
          <View
            style={[
              styles.list,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            {allDuties.map((duty, idx) => {
              const mine = duty.assignedUserId === user?.id
              return (
                <View
                  key={duty.id}
                  style={[
                    styles.row,
                    idx > 0 && { borderTopWidth: hairline, borderTopColor: c.borderDefault },
                  ]}
                >
                  <Text style={styles.dutyEmoji}>{dutyIcon(duty.kind)}</Text>
                  <View style={styles.rowCopy}>
                    <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                      {duty.title}
                    </Text>
                    <Text variant="caption2" color="secondary" numberOfLines={1}>
                      {formatDate(duty.date, locale)}  ·  {duty.assignedName}
                      {mine
                        ? `  ·  ${t('duties.youTag', { defaultValue: 'you' })}`
                        : ''}
                    </Text>
                  </View>
                  {mine ? (
                    <View style={[styles.youPill, { backgroundColor: withAlpha(c.primary, 0.12) }]}>
                      <Text style={[styles.youPillText, { color: c.primary }]}>
                        {t('duties.youTag', { defaultValue: 'YOU' }).toUpperCase()}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('duties.footer', {
              defaultValue:
                'Rotations balance fairly across opted-in parents. Swap with a teammate if you can\'t make it.',
            })}
          </Text>
        </ScrollView>
      )}

      {/* Swap sheet */}
      <BottomSheet
        visible={Boolean(swapTarget)}
        onClose={() => setSwapTarget(null)}
      >
        <View style={styles.swapInner}>
            <ScrollView
              contentContainerStyle={styles.swapContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
                {t('duties.swapEyebrow', { defaultValue: 'SWAP DUTY' })}
              </Text>
              <Text variant="title2" color="primary" weight="semibold" style={styles.swapTitle}>
                {swapTarget?.title}
              </Text>
              <Text variant="footnote" color="secondary" style={styles.swapBody}>
                {t('duties.swapBody', {
                  defaultValue: 'Pick a teammate to take this duty.',
                })}
              </Text>

              <View
                style={[
                  styles.list,
                  { backgroundColor: c.surface, borderColor: c.borderDefault, marginTop: space.sm },
                ]}
              >
                {(data?.members ?? [])
                  .filter((m) => m.userId !== user?.id)
                  .map((member, idx) => (
                    <Pressable
                      key={member.userId}
                      accessibilityRole="button"
                      accessibilityLabel={member.name}
                      disabled={swapping === swapTarget?.id}
                      onPress={() => void performSwap(member.userId)}
                      style={({ pressed }) => [
                        styles.row,
                        idx > 0 && {
                          borderTopWidth: hairline,
                          borderTopColor: c.borderDefault,
                        },
                        pressed && { backgroundColor: c.surfaceSunken ?? c.background },
                        swapping === swapTarget?.id && { opacity: 0.5 },
                      ]}
                    >
                      <View
                        style={[
                          styles.swapAvatar,
                          { backgroundColor: c.surfaceSunken ?? c.background, borderColor: c.borderDefault },
                        ]}
                      >
                        <Text style={[styles.swapAvatarText, { color: c.textPrimary }]}>
                          {member.name
                            .split(' ')
                            .map((p) => p[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.rowCopy}>
                        <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                          {member.name}
                        </Text>
                      </View>
                      <Icon name="chevron.right" size={14} color="tertiary" />
                    </Pressable>
                  ))}
              </View>

              <Button
                label={t('common.cancel')}
                variant="ghost"
                size="lg"
                fullWidth
                onPress={() => setSwapTarget(null)}
                style={{ marginTop: space.md }}
              />
            </ScrollView>
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
    paddingBottom: space['2xl'] * 2,
    gap: space.md,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },

  eyebrow: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginBottom: -space.xs,
    marginLeft: 4,
  },

  myDutyCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.sm,
  },
  myDutyHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dutyEmoji: { fontSize: 24 },

  swapBtn: {
    height: 40,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  swapBtnText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.2,
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
  rowCopy: { flex: 1, gap: 2 },
  youPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  youPillText: {
    fontSize: 10,
    fontFamily: fonts.label,
    letterSpacing: 1.2,
    fontWeight: '700',
  },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.xs,
  },

  swapInner: { flex: 1 },
  swapContent: {
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  swapTitle: { letterSpacing: -0.2, marginTop: 4 },
  swapBody: { marginTop: 4, lineHeight: 18 },
  swapAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapAvatarText: { fontSize: 12, fontFamily: fonts.label, fontWeight: '700' },
})
