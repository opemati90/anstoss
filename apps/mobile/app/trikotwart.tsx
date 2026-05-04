/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { BottomSheet, Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type Jersey = {
  number: number
  holderUserId: string | null
  holderName: string | null
  washed: boolean
  assignedAt: string
  note?: string | null
}

type SquadStat = {
  userId: string
  name: string
  jerseyNumber: number | null
  position: 'GK' | 'DEF' | 'MID' | 'ATT'
  attendance: number
  minutesShare: number
  unavailable: boolean
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function TrikotwartScreen() {
  const { t } = useTranslation()
  const { user, activeClub, activeTeamId } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const teamId = activeTeamId

  const [jerseys, setJerseys] = useState<Jersey[]>([])
  const [squad, setSquad] = useState<SquadStat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [picking, setPicking] = useState<Jersey | null>(null)

  const fetchData = useCallback(async () => {
    if (!clubId || !teamId) {
      setLoading(false)
      return
    }
    try {
      const [j, s] = await Promise.all([
        api<Jersey[]>(`/clubs/${clubId}/teams/${teamId}/jerseys`),
        api<SquadStat[]>(`/clubs/${clubId}/teams/${teamId}/squad-stats`),
      ])
      setJerseys(j ?? [])
      setSquad(s ?? [])
    } catch {
      setJerseys([])
      setSquad([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId, teamId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const sorted = useMemo(
    () => jerseys.slice().sort((a, b) => a.number - b.number),
    [jerseys],
  )
  const myJerseys = useMemo(
    () => sorted.filter((j) => j.holderUserId === user?.id),
    [sorted, user?.id],
  )
  const total = jerseys.length
  const washed = jerseys.filter((j) => j.washed).length
  const unwashedCount = jerseys.filter((j) => !j.washed && j.holderUserId).length
  const unassignedCount = jerseys.filter((j) => !j.holderUserId).length

  const toggleWashed = async (j: Jersey) => {
    if (!clubId || !teamId) return
    try {
      await api(`/clubs/${clubId}/teams/${teamId}/jerseys/${j.number}`, {
        method: 'PATCH',
        body: { washed: !j.washed },
      })
      await fetchData()
    } catch {
      Alert.alert(t('common.error'))
    }
  }

  const reassign = async (jerseyNumber: number, holder: SquadStat | null) => {
    if (!clubId || !teamId) return
    try {
      await api(`/clubs/${clubId}/teams/${teamId}/jerseys/${jerseyNumber}`, {
        method: 'PATCH',
        body: {
          holderUserId: holder?.userId ?? null,
          holderName: holder?.name ?? null,
        },
      })
      await fetchData()
    } catch {
      Alert.alert(t('common.error'))
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('trikotwart.title', { defaultValue: 'Trikotwart' })}
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
            {t('trikotwart.eyebrow', { defaultValue: 'KIT · TEAM' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {t('trikotwart.headline', { defaultValue: 'Jersey rotation' })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('trikotwart.body', {
              defaultValue:
                'Track who has which number, mark washed/returned each week, reassign in one tap.',
            })}
          </Text>

          {/* My jerseys this week */}
          {myJerseys.length > 0 ? (
            <View
              style={[
                styles.myCard,
                {
                  backgroundColor: withAlpha(c.primary, 0.08),
                  borderColor: withAlpha(c.primary, 0.3),
                },
              ]}
            >
              <Text style={[styles.myEyebrow, { color: c.primary }]}>
                {t('trikotwart.youHave', { defaultValue: 'YOU HAVE' })}
              </Text>
              <View style={styles.myRow}>
                {myJerseys.map((j) => (
                  <View
                    key={j.number}
                    style={[styles.myJersey, { backgroundColor: c.primary }]}
                  >
                    <Text style={styles.myJerseyNum} tabular>
                      {j.number}
                    </Text>
                  </View>
                ))}
              </View>
              <Text variant="footnote" color="primary" weight="semibold">
                {t('trikotwart.youHaveBody', {
                  defaultValue: 'Wash + bring back for next match.',
                })}
              </Text>
            </View>
          ) : null}

          {/* Summary */}
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <View style={styles.summaryRow}>
              <SummaryStat label={t('trikotwart.total', { defaultValue: 'Total' })} value={total} tone={c.textPrimary} />
              <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
              <SummaryStat
                label={t('trikotwart.washed', { defaultValue: 'Washed' })}
                value={washed}
                tone={c.success}
              />
              <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
              <SummaryStat
                label={t('trikotwart.unwashed', { defaultValue: 'Unwashed' })}
                value={unwashedCount}
                tone={c.warning}
              />
              <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
              <SummaryStat
                label={t('trikotwart.unassigned', { defaultValue: 'Spare' })}
                value={unassignedCount}
                tone={c.textSecondary}
              />
            </View>
            <View style={[styles.progressTrack, { backgroundColor: c.borderDefault }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${total > 0 ? (washed / total) * 100 : 0}%`,
                    backgroundColor: c.success,
                  },
                ]}
              />
            </View>
          </View>

          {/* Jersey list */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            {t('trikotwart.allJerseys', { defaultValue: 'ALL JERSEYS' })}
          </Text>
          <View
            style={[
              styles.list,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            {sorted.map((j, idx) => {
              const assigned = !!j.holderUserId
              return (
                <View
                  key={j.number}
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
                      styles.numberBadge,
                      assigned
                        ? { backgroundColor: c.primary }
                        : {
                            backgroundColor: c.surface,
                            borderColor: c.borderStrong,
                            borderWidth: hairline,
                          },
                    ]}
                  >
                    <Text
                      style={[
                        styles.numberBadgeText,
                        { color: assigned ? c.textInverse : c.textTertiary },
                      ]}
                      tabular
                    >
                      {j.number}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    {assigned ? (
                      <>
                        <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                          {j.holderName}
                        </Text>
                        {j.note ? (
                          <Text variant="caption2" color="tertiary" numberOfLines={1}>
                            {j.note}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text variant="footnote" color="tertiary" weight="semibold">
                        {t('trikotwart.unassignedRow', { defaultValue: 'Unassigned' })}
                      </Text>
                    )}
                  </View>
                  {assigned ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        j.washed
                          ? t('trikotwart.markUnwashed', {
                              defaultValue: 'Mark unwashed',
                            })
                          : t('trikotwart.markWashed', {
                              defaultValue: 'Mark washed',
                            })
                      }
                      onPress={() => toggleWashed(j)}
                      style={({ pressed }) => [
                        styles.washChip,
                        j.washed
                          ? {
                              backgroundColor: withAlpha(c.success, 0.12),
                              borderColor: 'transparent',
                            }
                          : {
                              backgroundColor: withAlpha(c.warning, 0.12),
                              borderColor: 'transparent',
                            },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Icon
                        name={j.washed ? 'checkmark' : 'arrow.clockwise'}
                        size={11}
                        color={j.washed ? c.success : c.warning}
                      />
                      <Text
                        style={[
                          styles.washChipText,
                          { color: j.washed ? c.success : c.warning },
                        ]}
                      >
                        {j.washed
                          ? t('trikotwart.washed', { defaultValue: 'Washed' })
                          : t('trikotwart.unwashed', { defaultValue: 'Unwashed' })}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('trikotwart.reassign', {
                      defaultValue: 'Reassign',
                    })}
                    onPress={() => setPicking(j)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.swap, pressed && { opacity: 0.5 }]}
                  >
                    <Icon name="arrow.right.arrow.left" size={14} color={c.textSecondary} />
                  </Pressable>
                </View>
              )
            })}
          </View>

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('trikotwart.footer', {
              defaultValue:
                'Marking washed pings the next holder. Spare jerseys (no holder) stay in the kit bag.',
            })}
          </Text>
        </ScrollView>
      )}

      {/* Reassign sheet */}
      <BottomSheet
        visible={!!picking}
        onClose={() => setPicking(null)}
        heightPct="auto"
      >
        <View style={styles.sheetBody}>
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('trikotwart.assignEyebrow', { defaultValue: 'ASSIGN JERSEY' })}
          </Text>
          <Text variant="title2" color="primary" weight="semibold" style={styles.title}>
            #{picking?.number}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('trikotwart.assignBody', {
              defaultValue: 'Pick a player to take this number.',
            })}
          </Text>

          {picking?.holderUserId ? (
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                if (picking) await reassign(picking.number, null)
                setPicking(null)
              }}
              style={({ pressed }) => [
                styles.clearBtn,
                { borderColor: withAlpha(c.error, 0.4) },
                pressed && { opacity: 0.5 },
              ]}
            >
              <Icon name="xmark" size={12} color={c.error} />
              <Text style={[styles.clearText, { color: c.error }]}>
                {t('trikotwart.unassign', { defaultValue: 'Unassign (spare)' })}
              </Text>
            </Pressable>
          ) : null}

          <View
            style={[
              styles.list,
              { backgroundColor: c.surface, borderColor: c.borderDefault, marginTop: space.sm },
            ]}
          >
            {squad
              .filter((p) => p.userId !== picking?.holderUserId)
              .map((p, idx) => (
                <Pressable
                  key={p.userId}
                  accessibilityRole="button"
                  accessibilityLabel={p.name}
                  onPress={async () => {
                    if (picking) await reassign(picking.number, p)
                    setPicking(null)
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    idx > 0 && {
                      borderTopWidth: hairline,
                      borderTopColor: c.borderDefault,
                    },
                    pressed && { backgroundColor: c.surfaceSunken ?? c.background },
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
                      {initials(p.name)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text variant="caption2" color="tertiary">
                      {p.position}
                      {p.jerseyNumber != null ? `  ·  currently #${p.jerseyNumber}` : ''}
                    </Text>
                  </View>
                  <Icon name="chevron.right" size={14} color="tertiary" />
                </Pressable>
              ))}
          </View>
        </View>
      </BottomSheet>
    </View>
  )
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: string
}) {
  return (
    <View style={styles.summaryStat}>
      <Text variant="title3" color="primary" weight="semibold" tabular>
        <Text style={{ color: tone }}>{value}</Text>
      </Text>
      <Text variant="caption2" color="secondary">
        {label}
      </Text>
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
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },

  myCard: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
  },
  myEyebrow: {
    fontSize: 10,
    fontFamily: fonts.label,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  myRow: { flexDirection: 'row', gap: 8 },
  myJersey: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myJerseyNum: {
    color: '#fff',
    fontSize: 20,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  summaryCard: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 10,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryStat: { flex: 1, gap: 2, alignItems: 'flex-start' },
  divider: { width: hairline, height: 28 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
    marginBottom: -space.xs,
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
  numberBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadgeText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  washChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: hairline,
  },
  washChipText: {
    fontSize: 11,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  swap: { padding: 4 },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },

  sheetBody: {
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.25,
    marginTop: space.sm,
  },
  clearText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.3,
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
})
