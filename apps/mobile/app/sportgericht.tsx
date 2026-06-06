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
import { EmptyState } from '../src/components/EmptyState'
import { Button, Icon, Text } from '../src/components/ui'
import { fonts, hairline, radius, space } from '../src/theme/tokens'

type IncidentKind = 'YELLOW' | 'YELLOW2' | 'RED' | 'OTHER'

type Incident = {
  minute: number
  kind: IncidentKind
  playerName: string
  playerNumber: number | null
  reason: string
  narrative: string
}

type Report = {
  id: string
  fixtureId: string
  fixtureTitle: string
  kickoffAt: string
  competition: string
  referee: string
  incidents: Incident[]
  coachNarrative: string
  status: 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED'
  submittedAt: string | null
}

const KIND_META: Record<IncidentKind, { color: 'warning' | 'error' | 'textPrimary' }> = {
  YELLOW: { color: 'warning' },
  YELLOW2: { color: 'error' },
  RED: { color: 'error' },
  OTHER: { color: 'textPrimary' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kindLabel(kind: IncidentKind, t: (key: string, opts?: any) => string): string {
  switch (kind) {
    case 'YELLOW': return t('sportgericht.kindYellow', { defaultValue: 'Yellow' })
    case 'YELLOW2': return t('sportgericht.kindYellow2', { defaultValue: 'Second yellow' })
    case 'RED': return t('sportgericht.kindRed', { defaultValue: 'Red card' })
    case 'OTHER': return t('sportgericht.kindOther', { defaultValue: 'Other' })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reportStatusLabel(status: Report['status'], t: (key: string, opts?: any) => string): string {
  switch (status) {
    case 'DRAFT': return t('sportgericht.statusDraft', { defaultValue: 'Draft' })
    case 'SUBMITTED': return t('sportgericht.statusSubmitted', { defaultValue: 'Submitted' })
    case 'ACKNOWLEDGED': return t('sportgericht.statusAcknowledged', { defaultValue: 'Acknowledged' })
  }
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

export default function SportgerichtScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const locale = i18n.language

  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [draftEdits, setDraftEdits] = useState<
    Record<string, { coachNarrative?: string; incidents?: Incident[] }>
  >({})

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<Report[]>(
        `/clubs/${clubId}/sportgericht/reports`,
      )
      setReports(result ?? [])
    } catch {
      setReports([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [clubId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const sorted = useMemo(
    () =>
      reports
        .slice()
        .sort(
          (a, b) =>
            new Date(b.kickoffAt).getTime() - new Date(a.kickoffAt).getTime(),
        ),
    [reports],
  )

  const draftFor = (reportId: string) => draftEdits[reportId] ?? {}

  const updateDraft = (
    reportId: string,
    patch: { coachNarrative?: string; incidents?: Incident[] },
  ) => {
    setDraftEdits((prev) => ({
      ...prev,
      [reportId]: { ...(prev[reportId] ?? {}), ...patch },
    }))
  }

  const updateIncidentNarrative = (
    reportId: string,
    incidentMinute: number,
    text: string,
  ) => {
    const original = reports.find((r) => r.id === reportId)
    if (!original) return
    const incidents = (
      draftFor(reportId).incidents ?? original.incidents
    ).map((inc) =>
      inc.minute === incidentMinute ? { ...inc, narrative: text } : inc,
    )
    updateDraft(reportId, { incidents })
  }

  const persistDraft = async (report: Report) => {
    if (!clubId) return
    const draft = draftFor(report.id)
    if (!draft.coachNarrative && !draft.incidents) {
      return
    }
    try {
      await api(`/clubs/${clubId}/sportgericht/reports/${report.id}`, {
        method: 'PATCH',
        body: draft,
      })
      await fetchData()
      setDraftEdits((prev) => {
        const next = { ...prev }
        delete next[report.id]
        return next
      })
    } catch {
      Alert.alert(t('common.error'))
    }
  }

  const submit = async (report: Report) => {
    if (!clubId) return
    Alert.alert(
      t('sportgericht.submitTitle', {
        defaultValue: 'Submit to BFV?',
      }),
      t('sportgericht.submitBody', {
        defaultValue:
          'Sends the report to the league office. You can\'t edit after submission.',
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sportgericht.submit', { defaultValue: 'Submit' }),
          style: 'default',
          onPress: async () => {
            setSubmittingId(report.id)
            try {
              // Persist any pending edits first.
              await persistDraft(report)
              const res = await api<{ receipt: string }>(
                `/clubs/${clubId}/sportgericht/reports/${report.id}/submit`,
                { method: 'POST' },
              )
              await fetchData()
              Alert.alert(
                t('sportgericht.sentTitle', { defaultValue: 'Report sent' }),
                t('sportgericht.sentBody', {
                  defaultValue:
                    'Receipt {{receipt}}. The Verband will reply via email + here.',
                  receipt: res?.receipt ?? '—',
                }),
              )
            } catch {
              Alert.alert(
                t('common.error'),
                t('sportgericht.submitError', {
                  defaultValue: "Couldn't submit. Try again.",
                }),
              )
            } finally {
              setSubmittingId(null)
            }
          },
        },
      ],
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('sportgericht.title', {
          defaultValue: 'Sportgericht reports',
        })}
        mode="back"
        onClose={() => router.back()}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <Text variant="footnote" color="secondary">
            {t('common.loading')}
          </Text>
        </View>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="exclamationmark.triangle"
          title={t('sportgericht.emptyTitle', {
            defaultValue: 'No incidents to report',
          })}
          description={t('sportgericht.emptyBody', {
            defaultValue:
              'Reports get auto-drafted when yellow / red cards are recorded during a match.',
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
            {t('sportgericht.eyebrow', {
              defaultValue: 'DISCIPLINARY · ADMIN',
            })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {t('sportgericht.headline', {
              defaultValue: 'Auto-drafted reports',
            })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('sportgericht.body', {
              defaultValue:
                'Yellow / red cards from the live ticker are pre-filled into a Sportgericht report. Edit the narrative, submit when ready.',
            })}
          </Text>

          {sorted.map((report) => {
            const editedIncidents = draftFor(report.id).incidents ?? report.incidents
            const editedNarrative =
              draftFor(report.id).coachNarrative ?? report.coachNarrative
            const isSubmitted = report.status !== 'DRAFT'
            const submitting = submittingId === report.id
            return (
              <View
                key={report.id}
                style={[
                  styles.reportCard,
                  {
                    backgroundColor: c.surface,
                    borderColor: isSubmitted
                      ? withAlpha(c.success, 0.4)
                      : c.borderDefault,
                  },
                ]}
              >
                <View style={styles.reportHead}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.tinyEyebrow, { color: c.textTertiary }]}>
                      {report.competition.toUpperCase()}
                    </Text>
                    <Text variant="callout" color="primary" weight="semibold" numberOfLines={1}>
                      {report.fixtureTitle}
                    </Text>
                    <Text variant="caption2" color="secondary" tabular>
                      {new Date(report.kickoffAt).toLocaleDateString(locale, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                      {'  ·  '}
                      {t('sportgericht.refLabel', {
                        defaultValue: 'Ref: {{name}}',
                        name: report.referee,
                      })}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor:
                          report.status === 'SUBMITTED'
                            ? withAlpha(c.success, 0.12)
                            : report.status === 'ACKNOWLEDGED'
                              ? withAlpha(c.primary, 0.12)
                              : withAlpha(c.warning, 0.12),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        {
                          color:
                            report.status === 'SUBMITTED'
                              ? c.success
                              : report.status === 'ACKNOWLEDGED'
                                ? c.primary
                                : c.warning,
                        },
                      ]}
                    >
                      {reportStatusLabel(report.status, t)}
                    </Text>
                  </View>
                </View>

                {/* Incidents */}
                <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
                  {t('sportgericht.incidentsLabel', {
                    defaultValue: 'INCIDENTS · {{count}}',
                    count: editedIncidents.length,
                  })}
                </Text>
                <View
                  style={[
                    styles.incidentList,
                    { borderColor: c.borderDefault },
                  ]}
                >
                  {editedIncidents.map((inc, idx) => {
                    const meta = KIND_META[inc.kind]
                    const tone =
                      meta.color === 'warning'
                        ? c.warning
                        : meta.color === 'error'
                          ? c.error
                          : c.textPrimary
                    return (
                      <View
                        key={`${inc.minute}-${idx}`}
                        style={[
                          styles.incidentRow,
                          idx > 0 && {
                            borderTopWidth: hairline,
                            borderTopColor: c.borderDefault,
                          },
                        ]}
                      >
                        <View style={styles.incidentHead}>
                          <View style={[styles.minutePill, { backgroundColor: c.surfaceSunken ?? c.background }]}>
                            <Text style={[styles.minuteText, { color: c.textPrimary }]} tabular>
                              {inc.minute}'
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.kindPill,
                              { backgroundColor: withAlpha(tone, 0.12) },
                            ]}
                          >
                            <Text style={[styles.kindPillText, { color: tone }]}>
                              {kindLabel(inc.kind, t).toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }} />
                          <Text variant="caption2" color="secondary" numberOfLines={1}>
                            #{inc.playerNumber ?? '—'} · {inc.playerName}
                          </Text>
                        </View>
                        <Text variant="caption2" color="tertiary" style={styles.reasonLine} numberOfLines={1}>
                          {inc.reason}
                        </Text>
                        {isSubmitted ? (
                          <Text variant="footnote" color="primary" style={styles.narrativeReadOnly}>
                            {inc.narrative}
                          </Text>
                        ) : (
                          <View
                            style={[
                              styles.narrativeCard,
                              {
                                backgroundColor: c.surfaceSunken ?? c.background,
                                borderColor: c.borderDefault,
                              },
                            ]}
                          >
                            <TextInput
                              style={[styles.narrativeInput, { color: c.textPrimary }]}
                              value={inc.narrative}
                              onChangeText={(text) =>
                                updateIncidentNarrative(report.id, inc.minute, text)
                              }
                              placeholder={t('sportgericht.narrativePlaceholder', {
                                defaultValue:
                                  'Describe the incident from the coach\'s view…',
                              })}
                              placeholderTextColor={c.textTertiary}
                              multiline
                              numberOfLines={3}
                            />
                          </View>
                        )}
                      </View>
                    )
                  })}
                </View>

                {/* Coach narrative */}
                <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
                  {t('sportgericht.coachNarrativeLabel', {
                    defaultValue: 'COACH NARRATIVE',
                  })}
                </Text>
                {isSubmitted ? (
                  <View
                    style={[
                      styles.narrativeCard,
                      { backgroundColor: c.surfaceSunken ?? c.background, borderColor: c.borderDefault },
                    ]}
                  >
                    <Text variant="footnote" color="primary" style={styles.narrativeReadOnly}>
                      {editedNarrative}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.narrativeCard,
                      { backgroundColor: c.surface, borderColor: c.borderDefault },
                    ]}
                  >
                    <TextInput
                      style={[styles.narrativeInput, { color: c.textPrimary }]}
                      value={editedNarrative}
                      onChangeText={(text) =>
                        updateDraft(report.id, { coachNarrative: text })
                      }
                      placeholder={t('sportgericht.coachPlaceholder', {
                        defaultValue:
                          'Match summary from your perspective. Be honest — the league reads everything.',
                      })}
                      placeholderTextColor={c.textTertiary}
                      multiline
                      numberOfLines={4}
                    />
                  </View>
                )}

                {/* Actions */}
                {isSubmitted ? (
                  <View
                    style={[
                      styles.submittedBanner,
                      {
                        backgroundColor: withAlpha(c.success, 0.08),
                        borderColor: withAlpha(c.success, 0.3),
                      },
                    ]}
                  >
                    <Icon name="checkmark.circle.fill" size={14} color={c.success} />
                    <Text variant="caption2" color="primary" weight="semibold" numberOfLines={1}>
                      {t('sportgericht.submittedAt', {
                        defaultValue: 'Submitted to BFV · {{date}}',
                        date: report.submittedAt
                          ? new Date(report.submittedAt).toLocaleDateString(
                              locale,
                              { day: 'numeric', month: 'short' },
                            )
                          : '—',
                      })}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.actionRow}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => persistDraft(report)}
                      disabled={!draftEdits[report.id]}
                      style={({ pressed }) => [
                        styles.saveBtn,
                        {
                          borderColor: c.borderStrong,
                          backgroundColor: c.surface,
                          opacity: draftEdits[report.id] ? 1 : 0.5,
                        },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[styles.saveBtnText, { color: c.textPrimary }]}>
                        {t('sportgericht.saveDraft', {
                          defaultValue: 'Save draft',
                        })}
                      </Text>
                    </Pressable>
                    <Button
                      label={t('sportgericht.submitToBfv', {
                        defaultValue: 'Submit to BFV',
                      })}
                      variant="filled"
                      size="md"
                      loading={submitting}
                      disabled={submitting}
                      onPress={() => submit(report)}
                      style={{ flex: 1 }}
                    />
                  </View>
                )}
              </View>
            )
          })}

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('sportgericht.footer', {
              defaultValue:
                'Reports auto-draft within 30 mins of full-time. Submit within 48h to avoid late-fee fines.',
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
  tinyEyebrow: {
    fontSize: 10,
    fontFamily: fonts.label,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },

  reportCard: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    marginTop: space.sm,
  },
  reportHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: 6,
    marginLeft: 4,
  },

  incidentList: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  incidentRow: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
    gap: 6,
  },
  incidentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minutePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  minuteText: {
    fontSize: 11,
    fontFamily: fonts.data,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  kindPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  kindPillText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  reasonLine: { fontStyle: 'italic' },

  narrativeCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
    marginTop: 4,
  },
  narrativeInput: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  narrativeReadOnly: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
    lineHeight: 20,
  },

  submittedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginTop: 4,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  saveBtn: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  footer: {
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: space.sm,
  },
})
