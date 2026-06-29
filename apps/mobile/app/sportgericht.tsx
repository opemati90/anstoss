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
import { FormInput } from '../src/components/FormInput'
import {
  Badge,
  Button,
  Card,
  StatusPill,
  type StatusPillTone,
  Text,
} from '../src/components/ui'
import {
  fonts,
  hairline,
  radius,
  space,
  SPACING_MD,
  SPACING_SM,
} from '../src/theme/tokens'
import { hexToRgba } from '../src/theme/club-theme'

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

const KIND_META: Record<IncidentKind, { variant: 'warning' | 'error' | 'neutral' }> = {
  YELLOW: { variant: 'warning' },
  YELLOW2: { variant: 'error' },
  RED: { variant: 'error' },
  OTHER: { variant: 'neutral' },
}


function kindLabel(kind: IncidentKind, t: (key: string, opts?: any) => string): string {
  switch (kind) {
    case 'YELLOW': return t('sportgericht.kindYellow', { defaultValue: 'Yellow' })
    case 'YELLOW2': return t('sportgericht.kindYellow2', { defaultValue: 'Second yellow' })
    case 'RED': return t('sportgericht.kindRed', { defaultValue: 'Red card' })
    case 'OTHER': return t('sportgericht.kindOther', { defaultValue: 'Other' })
  }
}


function reportStatusLabel(status: Report['status'], t: (key: string, opts?: any) => string): string {
  switch (status) {
    case 'DRAFT': return t('sportgericht.statusDraft', { defaultValue: 'Draft' })
    case 'SUBMITTED': return t('sportgericht.statusSubmitted', { defaultValue: 'Submitted' })
    case 'ACKNOWLEDGED': return t('sportgericht.statusAcknowledged', { defaultValue: 'Acknowledged' })
  }
}

function statusTone(status: Report['status']): StatusPillTone {
  switch (status) {
    case 'SUBMITTED':
      return 'success'
    case 'ACKNOWLEDGED':
      return 'info'
    case 'DRAFT':
    default:
      return 'warning'
  }
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
                  receipt: res?.receipt ?? '-',
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
              <Card
                key={report.id}
                variant="plain"
                padding="md"
                style={[
                  styles.reportCard,
                  isSubmitted
                    ? { borderColor: hexToRgba(c.success, 0.4) }
                    : null,
                ]}
              >
                <View style={styles.reportHead}>
                  <View style={styles.reportHeadText}>
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
                  <StatusPill
                    label={reportStatusLabel(report.status, t)}
                    tone={statusTone(report.status)}
                  />
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
                          <Badge
                            label={kindLabel(inc.kind, t).toUpperCase()}
                            variant={meta.variant}
                          />
                          <View style={styles.flexSpacer} />
                          <Text variant="caption2" color="secondary" numberOfLines={1}>
                            #{inc.playerNumber ?? '-'} · {inc.playerName}
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
                {isSubmitted ? (
                  <>
                    <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
                      {t('sportgericht.coachNarrativeLabel', {
                        defaultValue: 'COACH NARRATIVE',
                      })}
                    </Text>
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
                  </>
                ) : (
                  <FormInput
                    label={t('sportgericht.coachNarrativeLabel', {
                      defaultValue: 'COACH NARRATIVE',
                    })}
                    style={[styles.coachNarrativeField, { backgroundColor: c.background }]}
                    value={editedNarrative}
                    onChangeText={(text) =>
                      updateDraft(report.id, { coachNarrative: text })
                    }
                    placeholder={t('sportgericht.coachPlaceholder', {
                      defaultValue:
                        'Match summary from your perspective. Be honest. The league reads everything.',
                    })}
                    multiline
                    numberOfLines={4}
                  />
                )}

                {/* Actions */}
                {isSubmitted ? (
                  <StatusPill
                    icon="checkmark.circle.fill"
                    tone="success"
                    style={styles.submittedBanner}
                    label={t('sportgericht.submittedAt', {
                      defaultValue: 'Submitted to BFV · {{date}}',
                      date: report.submittedAt
                        ? new Date(report.submittedAt).toLocaleDateString(
                            locale,
                            { day: 'numeric', month: 'short' },
                          )
                        : '-',
                    })}
                  />
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
              </Card>
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
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  tinyEyebrow: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: space['2xs'] },
  subtitle: { marginTop: space.xs, lineHeight: 18 },

  reportCard: {
    gap: SPACING_SM,
    marginTop: space.sm,
  },
  reportHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
  },
  reportHeadText: { flex: 1, gap: space['2xs'] },
  flexSpacer: { flex: 1 },

  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.xs,
    marginLeft: space.xs,
  },

  incidentList: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  incidentRow: {
    paddingHorizontal: space.md,
    paddingVertical: SPACING_SM,
    gap: space.xs,
  },
  incidentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_SM,
  },
  minutePill: {
    paddingHorizontal: SPACING_SM,
    paddingVertical: space['2xs'],
    borderRadius: radius.full,
  },
  minuteText: {
    fontSize: 11,
    fontFamily: fonts.data,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  reasonLine: { fontStyle: 'italic' },

  narrativeCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
    marginTop: space.xs,
  },
  narrativeInput: {
    paddingHorizontal: space.md,
    paddingVertical: SPACING_SM,
    fontSize: 14,
    fontFamily: fonts.body,
    lineHeight: 20,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  narrativeReadOnly: {
    paddingHorizontal: space.md,
    paddingVertical: SPACING_SM,
    lineHeight: 20,
  },
  coachNarrativeField: {
    minHeight: 96,
    paddingTop: SPACING_MD,
    textAlignVertical: 'top',
  },

  submittedBanner: {
    alignSelf: 'flex-start',
    marginTop: space.xs,
  },

  actionRow: {
    flexDirection: 'row',
    gap: SPACING_SM,
    marginTop: space.xs,
  },
  saveBtn: {
    paddingHorizontal: space.md,
    paddingVertical: SPACING_SM,
    borderRadius: radius.full,
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
