/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Image,
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
import { Button, Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type PitchState = 'OK' | 'WET' | 'FROZEN' | 'CANCELLED'

type Status = {
  fixtureId: string | null
  state: PitchState
  reportedById: string | null
  reportedByName: string | null
  reportedAt: string | null
  photoUrl: string | null
  note: string | null
}

type StateOption = {
  state: PitchState
  icon: string
  labelKey: string
  bodyKey: string
  labelDefault: string
  bodyDefault: string
}

const STATE_OPTIONS: StateOption[] = [
  {
    state: 'OK',
    icon: '✅',
    labelKey: 'pitch.state.ok.label',
    bodyKey: 'pitch.state.ok.body',
    labelDefault: 'Pitch is good',
    bodyDefault: 'Match is on. Bring boots.',
  },
  {
    state: 'WET',
    icon: '💧',
    labelKey: 'pitch.state.wet.label',
    bodyKey: 'pitch.state.wet.body',
    labelDefault: 'Pitch is wet',
    bodyDefault: 'Boots optional, ref will decide at warm-up.',
  },
  {
    state: 'FROZEN',
    icon: '❄️',
    labelKey: 'pitch.state.frozen.label',
    bodyKey: 'pitch.state.frozen.body',
    labelDefault: 'Pitch is frozen',
    bodyDefault: 'Likely cancelled — wait for ref.',
  },
  {
    state: 'CANCELLED',
    icon: '🛑',
    labelKey: 'pitch.state.cancelled.label',
    bodyKey: 'pitch.state.cancelled.body',
    labelDefault: 'Match cancelled',
    bodyDefault: 'Match called off. Notify the team.',
  },
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

function relative(
  iso: string | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60_000)
  if (m < 1) return t('pitch.relative.justNow', { defaultValue: 'just now' })
  if (m < 60) return t('pitch.relative.minsAgo', { defaultValue: '{{count}}m ago', count: m })
  const h = Math.round(m / 60)
  return t('pitch.relative.hoursAgo', { defaultValue: '{{count}}h ago', count: h })
}

export default function PitchStatusScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const teamId = activeTeamId

  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [composeState, setComposeState] = useState<PitchState | null>(null)
  const [composeNote, setComposeNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!clubId || !teamId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<Status>(
        `/clubs/${clubId}/teams/${teamId}/pitch-status`,
      )
      setStatus(result ?? null)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId, teamId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const submit = async () => {
    if (!clubId || !teamId || !composeState) return
    setSubmitting(true)
    try {
      await api(`/clubs/${clubId}/teams/${teamId}/pitch-status`, {
        method: 'POST',
        body: {
          state: composeState,
          note: composeNote.trim() || null,
        },
      })
      setComposeState(null)
      setComposeNote('')
      Alert.alert(
        t('pitch.confirmedTitle', { defaultValue: 'Pitch report sent' }),
        t('pitch.confirmedBody', {
          defaultValue:
            'The team has been pinged. Anyone arriving later sees your photo + note.',
        }),
      )
      await fetchData()
    } catch {
      Alert.alert(
        t('common.error'),
        t('pitch.error', {
          defaultValue: "Couldn't send pitch report. Try again.",
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const stateMeta = STATE_OPTIONS.find((o) => o.state === status?.state)
  const stateColor =
    status?.state === 'OK'
      ? c.success
      : status?.state === 'WET'
        ? c.warning
        : status?.state === 'FROZEN'
          ? c.warning
          : status?.state === 'CANCELLED'
            ? c.error
            : c.textSecondary

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('pitch.title', { defaultValue: 'Pitch status' })}
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
            {t('pitch.eyebrow', { defaultValue: 'PITCH · LIVE' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {stateMeta ? t(stateMeta.labelKey, { defaultValue: stateMeta.labelDefault }) : t('pitch.unknown', { defaultValue: 'Not yet reported' })}
          </Text>
          {status?.reportedAt ? (
            <Text variant="footnote" color="secondary" style={styles.subtitle}>
              {t('pitch.reportedBy', {
                defaultValue: 'Reported by {{name}} · {{when}}',
                name: status.reportedByName ?? 'someone',
                when: relative(status.reportedAt, t),
              })}
            </Text>
          ) : (
            <Text variant="footnote" color="secondary" style={styles.subtitle}>
              {t('pitch.firstThereBody', {
                defaultValue:
                  'First arriver — confirm the pitch state so anyone driving in turns the right way.',
              })}
            </Text>
          )}

          {/* Status hero card */}
          <View
            style={[
              styles.statusCard,
              {
                backgroundColor: c.surface,
                borderColor: withAlpha(stateColor, 0.4),
              },
            ]}
          >
            {status?.photoUrl ? (
              <Image
                source={{ uri: status.photoUrl }}
                style={styles.statusPhoto}
                resizeMode="cover"
              />
            ) : (
              <View
                style={[
                  styles.statusPhoto,
                  styles.statusPhotoEmpty,
                  { backgroundColor: c.surfaceSunken ?? c.background },
                ]}
              >
                <Icon name="camera" size="xl" color={c.textTertiary} />
              </View>
            )}
            <View style={styles.statusBody}>
              <View style={styles.stateRow}>
                <Text style={styles.stateEmoji}>{stateMeta?.icon ?? '⚽'}</Text>
                <View style={{ flex: 1, gap: 2 }}>
                  <View
                    style={[
                      styles.statePill,
                      { backgroundColor: withAlpha(stateColor, 0.12) },
                    ]}
                  >
                    <Text style={[styles.statePillText, { color: stateColor }]}>
                      {(status?.state ?? 'NOT REPORTED').toUpperCase()}
                    </Text>
                  </View>
                  <Text variant="footnote" color="primary" weight="semibold">
                    {stateMeta
                      ? t(stateMeta.bodyKey, { defaultValue: stateMeta.bodyDefault })
                      : t('pitch.firstThereCta', {
                          defaultValue: 'Tap a state below to report.',
                        })}
                  </Text>
                </View>
              </View>
              {status?.note ? (
                <Text variant="caption2" color="secondary" style={styles.note} numberOfLines={3}>
                  "{status.note}"
                </Text>
              ) : null}
            </View>
          </View>

          {/* Quick-confirm grid */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            {t('pitch.reportLabel', { defaultValue: 'REPORT THE PITCH' })}
          </Text>
          <View style={styles.optionsGrid}>
            {STATE_OPTIONS.map((opt) => {
              const tone =
                opt.state === 'OK'
                  ? c.success
                  : opt.state === 'CANCELLED'
                    ? c.error
                    : c.warning
              const active = composeState === opt.state
              return (
                <Pressable
                  key={opt.state}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setComposeState(opt.state)}
                  style={({ pressed }) => [
                    styles.optionCard,
                    {
                      backgroundColor: active ? withAlpha(tone, 0.12) : c.surface,
                      borderColor: active ? tone : c.borderDefault,
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.optionEmoji}>{opt.icon}</Text>
                  <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                    {t(opt.labelKey, { defaultValue: opt.labelDefault })}
                  </Text>
                  <Text variant="caption2" color="secondary" numberOfLines={2}>
                    {t(opt.bodyKey, { defaultValue: opt.bodyDefault })}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Note + submit */}
          {composeState ? (
            <>
              <Text style={[styles.sectionLabel, { color: c.textTertiary, marginTop: space.md }]}>
                {t('pitch.noteLabel', { defaultValue: 'NOTE (OPTIONAL)' })}
              </Text>
              <View
                style={[
                  styles.noteCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                <TextInput
                  style={[styles.noteInput, { color: c.textPrimary }]}
                  value={composeNote}
                  onChangeText={setComposeNote}
                  placeholder={t('pitch.notePlaceholder', {
                    defaultValue:
                      'e.g. Standing water on the south end · ref still on the way.',
                  })}
                  placeholderTextColor={c.textTertiary}
                  multiline
                  numberOfLines={2}
                />
              </View>
              <Button
                label={t('pitch.confirm', {
                  defaultValue: 'Confirm + notify team',
                })}
                variant="filled"
                size="lg"
                fullWidth
                loading={submitting}
                disabled={submitting}
                onPress={submit}
                style={{ marginTop: space.md }}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => setComposeState(null)}
                style={({ pressed }) => [pressed && { opacity: 0.5 }]}
              >
                <Text style={[styles.cancelText, { color: c.textSecondary }]}>
                  {t('common.cancel')}
                </Text>
              </Pressable>
            </>
          ) : null}

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('pitch.footer', {
              defaultValue:
                "Photo gets attached automatically. We'll push the team if you flip the state to wet/frozen/cancelled.",
            })}
          </Text>
        </ScrollView>
      )}
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

  statusCard: {
    marginTop: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1.25,
    overflow: 'hidden',
  },
  statusPhoto: {
    width: '100%',
    height: 180,
  },
  statusPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBody: { padding: space.md, gap: 10 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stateEmoji: { fontSize: 28 },
  statePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statePillText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  note: { fontStyle: 'italic', lineHeight: 16 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
    marginBottom: -space.xs,
  },

  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: space.sm,
  },
  optionCard: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.25,
    gap: 6,
  },
  optionEmoji: { fontSize: 22 },

  noteCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
    marginTop: 6,
  },
  noteInput: {
    paddingHorizontal: space.md,
    paddingVertical: 12,
    minHeight: 64,
    fontSize: 15,
    fontFamily: fonts.body,
    textAlignVertical: 'top',
  },
  cancelText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: space.sm,
  },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },
})
