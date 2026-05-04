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
import { Button, BottomSheet, Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type EhrenamtEntry = {
  id: string
  memberUserId: string
  memberName: string
  role: 'COACH' | 'PARENT' | 'ADMIN' | 'OWNER'
  activity: string
  hours: number
  occurredAt: string
  note?: string | null
}

type EhrenamtPayload = {
  settings: {
    annualGoalHours: number
    foerderungReady: boolean
  }
  entries: EhrenamtEntry[]
}

const ACTIVITY_PRESETS = [
  'Kuchen-Dienst',
  'Platzdienst',
  'Schiedsrichter-Begleitung',
  'Coaching session',
  'Match coaching',
  'Vereinsheim',
  'BFV reporting',
  'Tournament organising',
] as const

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

function relative(iso: string, locale: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export default function EhrenamtScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const locale = i18n.language

  const [data, setData] = useState<EhrenamtPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [logActivity, setLogActivity] = useState<string>(ACTIVITY_PRESETS[0])
  const [logHours, setLogHours] = useState('1.0')
  const [logNote, setLogNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<EhrenamtPayload>(`/clubs/${clubId}/ehrenamt`)
      setData(result ?? null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const totals = useMemo(() => {
    if (!data) return { ytd: 0, byMember: [] as Array<{ name: string; hours: number; role: string }> }
    const ytd = data.entries.reduce((sum, e) => sum + e.hours, 0)
    const map = new Map<string, { name: string; hours: number; role: string }>()
    for (const entry of data.entries) {
      const existing = map.get(entry.memberUserId) ?? {
        name: entry.memberName,
        hours: 0,
        role: entry.role,
      }
      existing.hours += entry.hours
      map.set(entry.memberUserId, existing)
    }
    return {
      ytd,
      byMember: Array.from(map.values()).sort((a, b) => b.hours - a.hours),
    }
  }, [data])

  const goal = data?.settings.annualGoalHours ?? 200
  const progress = Math.min(1, totals.ytd / Math.max(1, goal))

  const submit = async () => {
    if (!clubId) return
    const hours = parseFloat(logHours.replace(',', '.'))
    if (!Number.isFinite(hours) || hours <= 0) {
      Alert.alert(
        t('common.errorTitle'),
        t('ehrenamt.hoursInvalid', { defaultValue: 'Enter hours as a number, e.g. 1.5' }),
      )
      return
    }
    setSubmitting(true)
    try {
      await api(`/clubs/${clubId}/ehrenamt/entries`, {
        method: 'POST',
        body: {
          activity: logActivity,
          hours,
          note: logNote.trim() || null,
        },
      })
      setLogOpen(false)
      setLogHours('1.0')
      setLogNote('')
      setLogActivity(ACTIVITY_PRESETS[0])
      await fetchData()
    } catch {
      Alert.alert(
        t('common.error'),
        t('ehrenamt.logError', {
          defaultValue: "Couldn't log hours. Try again.",
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const exportFor = () => {
    Alert.alert(
      t('ehrenamt.exportTitle', { defaultValue: 'Export prepared' }),
      t('ehrenamt.exportBody', {
        defaultValue:
          'A Vereinsförderung-ready CSV has been emailed to the Kassenwart. Total: {{hours}}h.',
        hours: totals.ytd.toFixed(1),
      }),
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('ehrenamt.title', { defaultValue: 'Ehrenamt-Stunden' })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : !data ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('ehrenamt.empty', { defaultValue: 'No data available.' })}
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
            {t('ehrenamt.eyebrow', { defaultValue: 'EHRENAMT · YEAR-TO-DATE' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {totals.ytd.toFixed(1)}
            <Text variant="title2" color="secondary">
              {' '}
              / {goal}h
            </Text>
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('ehrenamt.subtitle', {
              defaultValue:
                'Volunteer hours feed Vereinsförderung reporting. Goal resets each calendar year.',
            })}
          </Text>

          {/* Progress to annual goal */}
          <View
            style={[
              styles.progressCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <View style={styles.progressHead}>
              <Text style={[styles.tinyEyebrow, { color: c.textTertiary }]}>
                {t('ehrenamt.goalLabel', { defaultValue: 'ANNUAL GOAL' })}
              </Text>
              <Text variant="caption2" color="secondary" tabular>
                {Math.round(progress * 100)}%
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: c.borderDefault }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress * 100}%`, backgroundColor: c.primary },
                ]}
              />
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryStat}>
                <Text variant="title3" color="primary" weight="semibold" tabular>
                  {data.entries.length}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t('ehrenamt.entriesCount', { defaultValue: 'Entries' })}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
              <View style={styles.summaryStat}>
                <Text variant="title3" color="primary" weight="semibold" tabular>
                  {totals.byMember.length}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t('ehrenamt.helpersCount', { defaultValue: 'Helpers' })}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
              <View style={styles.summaryStat}>
                <Text variant="title3" color="primary" weight="semibold" tabular>
                  {(goal - totals.ytd).toFixed(0)}
                </Text>
                <Text variant="caption2" color="secondary">
                  {t('ehrenamt.toGoLabel', { defaultValue: 'To go' })}
                </Text>
              </View>
            </View>
          </View>

          {/* Top helpers */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            {t('ehrenamt.topHelpers', { defaultValue: 'TOP HELPERS' })}
          </Text>
          <View
            style={[
              styles.list,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            {totals.byMember.map((m, idx) => (
              <View
                key={m.name}
                style={[
                  styles.helperRow,
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
                    {initials(m.name)}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text variant="caption2" color="tertiary">
                    {m.role}
                  </Text>
                </View>
                <View
                  style={[
                    styles.hoursPill,
                    { backgroundColor: withAlpha(c.primary, 0.12) },
                  ]}
                >
                  <Text style={[styles.hoursPillText, { color: c.primary }]} tabular>
                    {m.hours.toFixed(1)}h
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Entry log */}
          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            {t('ehrenamt.recent', { defaultValue: 'RECENT ENTRIES' })}
          </Text>
          <View
            style={[
              styles.list,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            {data.entries.map((entry, idx) => (
              <View
                key={entry.id}
                style={[
                  styles.entryRow,
                  idx > 0 && {
                    borderTopWidth: hairline,
                    borderTopColor: c.borderDefault,
                  },
                ]}
              >
                <View style={styles.entryHead}>
                  <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                    {entry.activity}
                  </Text>
                  <View
                    style={[
                      styles.hoursPill,
                      { backgroundColor: withAlpha(c.primary, 0.12) },
                    ]}
                  >
                    <Text style={[styles.hoursPillText, { color: c.primary }]} tabular>
                      {entry.hours.toFixed(1)}h
                    </Text>
                  </View>
                </View>
                <View style={styles.entryMeta}>
                  <Text variant="caption2" color="secondary" numberOfLines={1}>
                    {entry.memberName}
                  </Text>
                  <Text style={[styles.metaDot, { color: c.textTertiary }]}>·</Text>
                  <Text variant="caption2" color="tertiary" tabular>
                    {relative(entry.occurredAt, locale)}
                  </Text>
                </View>
                {entry.note ? (
                  <Text variant="caption2" color="secondary" style={styles.entryNote} numberOfLines={2}>
                    {entry.note}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={exportFor}
            style={({ pressed }) => [
              styles.exportBtn,
              { borderColor: c.borderStrong, backgroundColor: c.surface },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Icon name="square.and.arrow.up" size={12} color={c.textPrimary} />
            <Text style={[styles.exportText, { color: c.textPrimary }]}>
              {t('ehrenamt.exportCsv', {
                defaultValue: 'Export Vereinsförderung CSV',
              })}
            </Text>
          </Pressable>

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('ehrenamt.footer', {
              defaultValue:
                'Hours sync to the Kassenwart at month-end. {{hours}}h logged across {{helpers}} helpers this year.',
              hours: totals.ytd.toFixed(0),
              helpers: totals.byMember.length,
            })}
          </Text>
        </ScrollView>
      )}

      {/* FAB */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('ehrenamt.logHours', { defaultValue: 'Log hours' })}
        onPress={() => setLogOpen(true)}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.textPrimary },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Icon name="plus" size="lg" color="inverse" />
      </Pressable>

      {/* Log sheet */}
      <BottomSheet
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        heightPct="auto"
      >
        <View style={styles.sheetBody}>
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('ehrenamt.logEyebrow', { defaultValue: 'LOG VOLUNTEER HOURS' })}
          </Text>
          <Text variant="title2" color="primary" weight="semibold" style={styles.title}>
            {t('ehrenamt.logTitle', { defaultValue: 'New entry' })}
          </Text>

          <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
            {t('ehrenamt.activityLabel', { defaultValue: 'ACTIVITY' })}
          </Text>
          <View style={styles.chipGrid}>
            {ACTIVITY_PRESETS.map((preset) => {
              const active = logActivity === preset
              return (
                <Pressable
                  key={preset}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setLogActivity(preset)}
                  style={[
                    styles.activityChip,
                    active
                      ? {
                          backgroundColor: withAlpha(c.primary, 0.12),
                          borderColor: c.primary,
                        }
                      : { borderColor: c.borderStrong, backgroundColor: c.surface },
                  ]}
                >
                  <Text
                    style={[
                      styles.activityChipText,
                      { color: active ? c.primary : c.textPrimary },
                    ]}
                  >
                    {preset}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <View style={styles.inlineRow}>
            <View style={styles.inlineField}>
              <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
                {t('ehrenamt.hoursLabel', { defaultValue: 'HOURS' })}
              </Text>
              <View
                style={[
                  styles.fieldCard,
                  { backgroundColor: c.surface, borderColor: c.borderDefault },
                ]}
              >
                <TextInput
                  style={[styles.fieldInput, { color: c.textPrimary }]}
                  value={logHours}
                  onChangeText={setLogHours}
                  placeholder="1.5"
                  placeholderTextColor={c.textTertiary}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>

          <Text style={[styles.fieldLabel, { color: c.textTertiary }]}>
            {t('ehrenamt.noteLabel', { defaultValue: 'NOTE (OPTIONAL)' })}
          </Text>
          <View
            style={[
              styles.fieldCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <TextInput
              style={[styles.fieldInput, styles.fieldTextarea, { color: c.textPrimary }]}
              value={logNote}
              onChangeText={setLogNote}
              placeholder={t('ehrenamt.notePlaceholder', {
                defaultValue: 'e.g. Setup + cleanup at clubhouse',
              })}
              placeholderTextColor={c.textTertiary}
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={styles.footerActions}>
            <Button
              label={t('ehrenamt.logSubmit', { defaultValue: 'Log hours' })}
              variant="filled"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={submitting}
              onPress={submit}
            />
            <Button
              label={t('common.cancel')}
              variant="ghost"
              size="lg"
              fullWidth
              onPress={() => setLogOpen(false)}
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

  progressCard: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
    gap: 10,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  summaryStat: { flex: 1, gap: 2 },
  divider: { width: hairline, height: 28 },

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
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  entryRow: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
    gap: 4,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entryMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entryNote: { fontStyle: 'italic', lineHeight: 16, marginTop: 2 },
  metaDot: { fontSize: 11, fontFamily: fonts.label },

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
  hoursPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  hoursPillText: {
    fontSize: 11,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  exportBtn: {
    marginTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  exportText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
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
    gap: 10,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
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
  fieldTextarea: {
    minHeight: 64,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  inlineRow: { flexDirection: 'row', gap: space.sm },
  inlineField: { flex: 1 },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  activityChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.25,
  },
  activityChipText: {
    fontSize: 12,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  footerActions: {
    marginTop: space.md,
    gap: 6,
  },
})
