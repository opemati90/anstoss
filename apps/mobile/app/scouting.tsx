/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Image,
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
import { Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type Position = 'GK' | 'DEF' | 'MID' | 'ATT'

type FreeAgent = {
  id: string
  userId: string
  name: string
  age: number
  position: Position
  foot: 'LEFT' | 'RIGHT' | 'BOTH'
  postcode: string
  distanceKm: number
  history: string
  note: string
  avatarUrl: string | null
  videoUrl: string | null
  contactedByThisClub: boolean
  postedAt: string
}

type Filter = 'ALL' | Position

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'GK', label: 'GK' },
  { key: 'DEF', label: 'DEF' },
  { key: 'MID', label: 'MID' },
  { key: 'ATT', label: 'ATT' },
]

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

function relativeDays(iso: string) {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60_000))
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  return `${Math.round(d / 7)}w ago`
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function ScoutingScreen() {
  const { t } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id

  const [agents, setAgents] = useState<FreeAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [posFilter, setPosFilter] = useState<Filter>('ALL')
  const [nearbyOnly, setNearbyOnly] = useState(false)

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<FreeAgent[]>(`/clubs/${clubId}/scouting`)
      setAgents(result ?? [])
    } catch {
      setAgents([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const filtered = useMemo(() => {
    return agents
      .filter((a) => posFilter === 'ALL' || a.position === posFilter)
      .filter((a) => !nearbyOnly || a.distanceKm <= 10)
      .sort(
        (a, b) =>
          a.distanceKm - b.distanceKm ||
          new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
      )
  }, [agents, posFilter, nearbyOnly])

  // Split into two groups so the feed reads as "act on these" + "already
  // moved on these". Reduces clutter when a club has invited many.
  const availableAgents = useMemo(
    () => filtered.filter((a) => !a.contactedByThisClub),
    [filtered],
  )
  const invitedAgents = useMemo(
    () => filtered.filter((a) => a.contactedByThisClub),
    [filtered],
  )

  const expressInterest = (agent: FreeAgent) => {
    if (!clubId || agent.contactedByThisClub) return
    Alert.alert(
      t('scouting.interestTitle', { defaultValue: 'Send trial invite?' }),
      t('scouting.interestBody', {
        defaultValue:
          '{{name}} ({{age}}, {{position}}) will be notified that {{club}} is interested. They reply directly in chat.',
        name: agent.name,
        age: agent.age,
        position: agent.position,
        club: activeClub?.club.name ?? 'your club',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('scouting.sendInvite', { defaultValue: 'Send invite' }),
          style: 'default',
          onPress: async () => {
            setBusyId(agent.id)
            try {
              await api(`/clubs/${clubId}/scouting/${agent.id}/interest`, {
                method: 'POST',
              })
              await fetchData()
              Alert.alert(
                t('scouting.sentTitle', { defaultValue: 'Invite sent' }),
                t('scouting.sentBody', {
                  defaultValue:
                    '{{name}} got a push. Their reply lands in your DM inbox.',
                  name: agent.name,
                }),
              )
            } catch {
              Alert.alert(t('common.error'))
            } finally {
              setBusyId(null)
            }
          },
        },
      ],
    )
  }

  const counts = useMemo(() => {
    return {
      total: agents.length,
      nearby: agents.filter((a) => a.distanceKm <= 10).length,
      contacted: agents.filter((a) => a.contactedByThisClub).length,
    }
  }, [agents])

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('scouting.title', { defaultValue: 'Scouting feed' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : agents.length === 0 ? (
        <EmptyState
          icon="figure.walk"
          title={t('scouting.emptyTitle', {
            defaultValue: 'No free agents right now',
          })}
          description={t('scouting.emptyBody', {
            defaultValue:
              'Free-agent listings appear here as soon as players opt in to scouting in your area.',
          })}
        />
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
            {t('scouting.eyebrow', { defaultValue: 'TRIAL SCOUTING · ADMIN' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {t('scouting.headline', { defaultValue: 'Free agents nearby' })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('scouting.body', {
              defaultValue:
                "Players who've opted in to be discovered by clubs in their area. Tap to view profile + send a trial invite.",
            })}
          </Text>

          {/* Summary */}
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <SummaryStat
              label={t('scouting.totalLabel', { defaultValue: 'Listings' })}
              value={counts.total}
              tone={c.textPrimary}
            />
            <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
            <SummaryStat
              label={t('scouting.nearbyLabel', { defaultValue: '< 10 km' })}
              value={counts.nearby}
              tone={c.success}
            />
            <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
            <SummaryStat
              label={t('scouting.contactedLabel', { defaultValue: 'Invited' })}
              value={counts.contacted}
              tone={c.primary}
            />
          </View>

          {/* Filters */}
          <View style={styles.filterRow}>
            {FILTERS.map((f) => {
              const active = posFilter === f.key
              return (
                <Pressable
                  key={f.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setPosFilter(f.key)}
                  style={[
                    styles.filterChip,
                    active
                      ? { backgroundColor: c.textPrimary, borderColor: c.textPrimary }
                      : { borderColor: c.borderStrong, backgroundColor: c.surface },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: active ? c.textInverse : c.textPrimary },
                    ]}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              )
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: nearbyOnly }}
              onPress={() => setNearbyOnly((v) => !v)}
              style={[
                styles.filterChip,
                nearbyOnly
                  ? {
                      backgroundColor: withAlpha(c.success, 0.12),
                      borderColor: c.success,
                    }
                  : { borderColor: c.borderStrong, backgroundColor: c.surface },
              ]}
            >
              <Icon name="mappin" size={11} color={nearbyOnly ? c.success : c.textPrimary} />
              <Text
                style={[
                  styles.filterChipText,
                  { color: nearbyOnly ? c.success : c.textPrimary },
                ]}
              >
                {t('scouting.nearbyToggle', { defaultValue: '< 10 km' })}
              </Text>
            </Pressable>
          </View>

          {/* Listings */}
          {filtered.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: c.surface, borderColor: c.borderDefault },
              ]}
            >
              <Text variant="footnote" color="secondary">
                {t('scouting.filterEmpty', {
                  defaultValue: 'No listings match these filters.',
                })}
              </Text>
            </View>
          ) : (
            (() => {
              const renderCard = (agent: FreeAgent) => {
                const positionTone =
                  agent.position === 'GK'
                    ? c.warning
                    : agent.position === 'DEF'
                      ? c.primary
                      : agent.position === 'MID'
                        ? c.success
                        : c.error
                return (
                <View
                  key={agent.id}
                  style={[
                    styles.agentCard,
                    {
                      backgroundColor: c.surface,
                      borderColor: agent.contactedByThisClub
                        ? withAlpha(c.primary, 0.4)
                        : c.borderDefault,
                    },
                  ]}
                >
                  <View style={styles.agentHead}>
                    {agent.avatarUrl ? (
                      <Image
                        source={{ uri: agent.avatarUrl }}
                        style={styles.agentAvatar}
                      />
                    ) : (
                      <View
                        style={[
                          styles.agentAvatar,
                          {
                            backgroundColor: c.surfaceSunken ?? c.background,
                            alignItems: 'center',
                            justifyContent: 'center',
                          },
                        ]}
                      >
                        <Text style={[styles.avatarText, { color: c.textPrimary }]}>
                          {initials(agent.name)}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
                        {agent.name}
                      </Text>
                      <View style={styles.metaRow}>
                        <View
                          style={[
                            styles.posPill,
                            { backgroundColor: withAlpha(positionTone, 0.12) },
                          ]}
                        >
                          <Text style={[styles.posPillText, { color: positionTone }]}>
                            {agent.position}
                          </Text>
                        </View>
                        <Text variant="caption2" color="secondary" tabular>
                          {agent.age} ·{' '}
                          {agent.foot === 'BOTH'
                            ? t('scouting.bothFoot', { defaultValue: 'Both' })
                            : agent.foot === 'LEFT'
                              ? 'L'
                              : 'R'}
                        </Text>
                        <Text style={[styles.metaDot, { color: c.textTertiary }]}>·</Text>
                        <Icon name="mappin" size={11} color="tertiary" />
                        <Text variant="caption2" color="secondary" tabular>
                          {agent.distanceKm} km
                        </Text>
                      </View>
                    </View>
                    {agent.videoUrl ? (
                      <View
                        style={[
                          styles.videoPill,
                          { backgroundColor: withAlpha(c.error, 0.12) },
                        ]}
                      >
                        <Icon name="play.fill" size={9} color={c.error} />
                        <Text style={[styles.videoPillText, { color: c.error }]}>
                          {t('scouting.video', { defaultValue: 'VIDEO' })}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={[styles.historyBox, { backgroundColor: c.surfaceSunken ?? c.background }]}>
                    <Text variant="caption2" color="tertiary" style={styles.historyLabel}>
                      {t('scouting.historyLabel', { defaultValue: 'LAST CLUB' })}
                    </Text>
                    <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                      {agent.history}
                    </Text>
                  </View>

                  <Text variant="footnote" color="secondary" style={styles.note} numberOfLines={3}>
                    "{agent.note}"
                  </Text>

                  <View style={styles.cardFooter}>
                    <Text variant="caption2" color="tertiary">
                      {t('scouting.posted', {
                        defaultValue: 'Posted {{when}}',
                        when: relativeDays(agent.postedAt),
                      })}
                    </Text>
                    {agent.contactedByThisClub ? (
                      <View
                        style={[
                          styles.donePill,
                          { backgroundColor: withAlpha(c.primary, 0.12) },
                        ]}
                      >
                        <Icon name="checkmark" size={10} color={c.primary} />
                        <Text style={[styles.donePillText, { color: c.primary }]}>
                          {t('scouting.invited', { defaultValue: 'Invited' })}
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => expressInterest(agent)}
                        disabled={busyId === agent.id}
                        style={({ pressed }) => [
                          styles.inviteBtn,
                          { backgroundColor: c.textPrimary },
                          pressed && { opacity: 0.85 },
                          busyId === agent.id && { opacity: 0.5 },
                        ]}
                      >
                        <Icon name="paperplane.fill" size={11} color="inverse" />
                        <Text style={[styles.inviteText, { color: c.textInverse }]}>
                          {t('scouting.sendInvite', {
                            defaultValue: 'Send invite',
                          })}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
                )
              }

              return (
                <>
                  {availableAgents.length > 0 ? (
                    <>
                      <Text
                        variant="caption2"
                        color="tertiary"
                        tracking="wide"
                        style={styles.groupHeader}
                      >
                        {t('scouting.groupAvailable', {
                          defaultValue: 'AVAILABLE · {{count}}',
                          count: availableAgents.length,
                        })}
                      </Text>
                      {availableAgents.map(renderCard)}
                    </>
                  ) : null}
                  {invitedAgents.length > 0 ? (
                    <>
                      <Text
                        variant="caption2"
                        color="tertiary"
                        tracking="wide"
                        style={styles.groupHeader}
                      >
                        {t('scouting.groupInvited', {
                          defaultValue: 'ALREADY INVITED · {{count}}',
                          count: invitedAgents.length,
                        })}
                      </Text>
                      {invitedAgents.map(renderCard)}
                    </>
                  ) : null}
                </>
              )
            })()
          )}

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('scouting.footer', {
              defaultValue:
                'Players opt in to be discoverable. Distance is approximate (postcode prefix). Replies land in DMs.',
            })}
          </Text>
        </ScrollView>
      )}
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

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    marginTop: space.sm,
  },
  summaryStat: { flex: 1, gap: 2, alignItems: 'flex-start' },
  divider: { width: hairline, height: 28 },

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: space.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  emptyCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    alignItems: 'center',
    marginTop: space.sm,
  },

  groupHeader: {
    fontFamily: fonts.label,
    marginTop: space.md,
    marginBottom: space.xs,
  },
  agentCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    gap: 10,
  },
  agentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  agentAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarText: {
    fontSize: 14,
    fontFamily: fonts.label,
    fontWeight: '700',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaDot: { fontSize: 11, fontFamily: fonts.label },
  posPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  posPillText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  videoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  videoPillText: {
    fontSize: 9,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1,
  },

  historyBox: {
    padding: 10,
    borderRadius: radius.md,
    gap: 2,
  },
  historyLabel: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  note: { fontStyle: 'italic', lineHeight: 18 },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  donePillText: {
    fontSize: 11,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  inviteText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },
})
