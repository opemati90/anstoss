/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
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

type ComplianceKind =
  | 'SPIELERPASS'
  | 'FUEHRUNGSZEUGNIS'
  | 'MEDICAL_CHECK'
  | 'VACCINATION_TETANUS'
  | 'FIRST_AID_CERT'

type ComplianceItem = {
  id: string
  memberUserId: string
  memberName: string
  role: 'PLAYER' | 'COACH' | 'PARENT' | 'ADMIN'
  kind: ComplianceKind
  expiresAt: string
  issuedAt: string | null
  documentUrl: string | null
  note: string | null
}

// Kind labels are resolved via t() at call site — see kindLabel() helper below.

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

function daysUntil(iso: string) {
  return Math.round(
    (new Date(iso).getTime() - Date.now()) / (24 * 60 * 60_000),
  )
}

type Tone = 'expired' | 'critical' | 'warning' | 'ok'

function toneFor(daysAway: number): Tone {
  if (daysAway < 0) return 'expired'
  if (daysAway <= 14) return 'critical'
  if (daysAway <= 60) return 'warning'
  return 'ok'
}

export default function ComplianceScreen() {
  const { t, i18n } = useTranslation()
  const { activeClub } = useAuth()
  const c = useClubColors()
  const clubId = activeClub?.club.id
  const locale = i18n.language

  const [items, setItems] = useState<ComplianceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const kindLabel = useCallback((kind: ComplianceKind): string => {
    const map: Record<ComplianceKind, string> = {
      SPIELERPASS: t('compliance.kindSpielerpass'),
      FUEHRUNGSZEUGNIS: t('compliance.kindFuehrungszeugnis'),
      MEDICAL_CHECK: t('compliance.kindMedicalCheck'),
      VACCINATION_TETANUS: t('compliance.kindVaccinationTetanus'),
      FIRST_AID_CERT: t('compliance.kindFirstAidCert'),
    }
    return map[kind]
  }, [t])

  const fetchData = useCallback(async () => {
    if (!clubId) {
      setLoading(false)
      return
    }
    try {
      const result = await api<ComplianceItem[]>(
        `/clubs/${clubId}/compliance`,
      )
      setItems(result ?? [])
    } catch {
      setItems([])
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
      items
        .slice()
        .sort(
          (a, b) =>
            new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
        ),
    [items],
  )

  const counts = useMemo(() => {
    const out = { expired: 0, critical: 0, warning: 0, ok: 0 }
    for (const item of items) {
      out[toneFor(daysUntil(item.expiresAt))]++
    }
    return out
  }, [items])

  const markRenewed = (item: ComplianceItem) => {
    if (!clubId) return
    Alert.alert(
      t('compliance.renewTitle', { defaultValue: 'Mark renewed?' }),
      t('compliance.renewBody', {
        defaultValue:
          '{{name}} — {{kind}}. Sets a fresh issue date and bumps the expiry forward.',
        name: item.memberName,
        kind: kindLabel(item.kind),
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('compliance.markRenewed', { defaultValue: 'Mark renewed' }),
          onPress: async () => {
            // Default renewal periods (years): Führungszeugnis 5, Spielerpass 3,
            // medical 1, tetanus 10, first-aid 2. Push expiry forward.
            const yrs =
              item.kind === 'FUEHRUNGSZEUGNIS'
                ? 5
                : item.kind === 'SPIELERPASS'
                  ? 3
                  : item.kind === 'MEDICAL_CHECK'
                    ? 1
                    : item.kind === 'VACCINATION_TETANUS'
                      ? 10
                      : 2
            const next = new Date()
            next.setFullYear(next.getFullYear() + yrs)
            try {
              await api(`/clubs/${clubId}/compliance/${item.id}`, {
                method: 'PATCH',
                body: {
                  issuedAt: new Date().toISOString(),
                  expiresAt: next.toISOString(),
                },
              })
              await fetchData()
            } catch {
              Alert.alert(
                t('common.error'),
                t('compliance.renewError', {
                  defaultValue: "Couldn't mark renewed. Try again.",
                }),
              )
            }
          },
        },
      ],
    )
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ModalHeader
        title={t('compliance.title', {
          defaultValue: 'Compliance dashboard',
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
      ) : items.length === 0 ? (
        <EmptyState
          icon="checkmark.shield"
          title={t('compliance.emptyTitle', {
            defaultValue: 'Nothing to track yet',
          })}
          description={t('compliance.emptyBody', {
            defaultValue:
              'Add a Spielerpass or Führungszeugnis to start tracking expiry alerts.',
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
            {t('compliance.eyebrow', { defaultValue: 'COMPLIANCE · ADMIN' })}
          </Text>
          <Text variant="title1" color="primary" weight="semibold" style={styles.title}>
            {t('compliance.headline', { defaultValue: 'Documents on file' })}
          </Text>
          <Text variant="footnote" color="secondary" style={styles.subtitle}>
            {t('compliance.body', {
              defaultValue:
                'Spielerpass, Erweitertes Führungszeugnis, medical check, vaccinations, first-aid certs. Renewals are auto-flagged 60 days before expiry.',
            })}
          </Text>

          {/* Summary KPIs */}
          <View
            style={[
              styles.summaryCard,
              { backgroundColor: c.surface, borderColor: c.borderDefault },
            ]}
          >
            <View style={styles.summaryRow}>
              <SummaryStat
                label={t('compliance.expired', { defaultValue: 'Expired' })}
                value={counts.expired}
                tone={c.error}
              />
              <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
              <SummaryStat
                label={t('compliance.critical', { defaultValue: '< 14 days' })}
                value={counts.critical}
                tone={c.error}
              />
              <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
              <SummaryStat
                label={t('compliance.warning', { defaultValue: '< 60 days' })}
                value={counts.warning}
                tone={c.warning}
              />
              <View style={[styles.divider, { backgroundColor: c.borderDefault }]} />
              <SummaryStat
                label={t('compliance.ok', { defaultValue: 'OK' })}
                value={counts.ok}
                tone={c.success}
              />
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>
            {t('compliance.allDocs', { defaultValue: 'ALL DOCUMENTS' })}
          </Text>

          {sorted.map((item) => {
            const days = daysUntil(item.expiresAt)
            const tone = toneFor(days)
            const toneColor =
              tone === 'expired' || tone === 'critical'
                ? c.error
                : tone === 'warning'
                  ? c.warning
                  : c.success
            const expiryLabel =
              tone === 'expired'
                ? t('compliance.expiredAgo', {
                    defaultValue: 'Expired {{days}}d ago',
                    days: Math.abs(days),
                  })
                : tone === 'ok'
                  ? new Date(item.expiresAt).toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : t('compliance.inDays', {
                      defaultValue: 'In {{days}}d',
                      days,
                    })
            return (
              <View
                key={item.id}
                style={[
                  styles.docCard,
                  {
                    backgroundColor: c.surface,
                    borderColor:
                      tone === 'expired' || tone === 'critical'
                        ? withAlpha(c.error, 0.4)
                        : c.borderDefault,
                  },
                ]}
              >
                <View style={styles.docHead}>
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
                      {initials(item.memberName)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="footnote" color="primary" weight="semibold" numberOfLines={1}>
                      {item.memberName}
                    </Text>
                    <Text variant="caption2" color="tertiary" numberOfLines={1}>
                      {kindLabel(item.kind)} · {item.role}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tonePill,
                      { backgroundColor: withAlpha(toneColor, 0.12) },
                    ]}
                  >
                    <Text style={[styles.tonePillText, { color: toneColor }]}>
                      {expiryLabel}
                    </Text>
                  </View>
                </View>

                {item.note ? (
                  <Text variant="caption2" color="secondary" style={styles.docNote} numberOfLines={2}>
                    {item.note}
                  </Text>
                ) : null}

                <View style={styles.docActions}>
                  {item.documentUrl ? (
                    <View
                      style={[
                        styles.docTag,
                        {
                          backgroundColor: c.surfaceSunken ?? c.background,
                          borderColor: c.borderDefault,
                        },
                      ]}
                    >
                      <Icon name="doc.text" size={11} color={c.textSecondary} />
                      <Text style={[styles.docTagText, { color: c.textSecondary }]}>
                        {t('compliance.onFile', { defaultValue: 'On file' })}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.docTag,
                        {
                          backgroundColor: withAlpha(c.warning, 0.12),
                          borderColor: 'transparent',
                        },
                      ]}
                    >
                      <Icon name="exclamationmark.triangle" size={11} color={c.warning} />
                      <Text style={[styles.docTagText, { color: c.warning }]}>
                        {t('compliance.noFile', { defaultValue: 'No file' })}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }} />
                  {tone !== 'ok' ? (
                    <Text
                      onPress={() => markRenewed(item)}
                      style={[styles.actionLink, { color: c.primary }]}
                      accessibilityRole="button"
                    >
                      {t('compliance.markRenewed', { defaultValue: 'Mark renewed' })}
                    </Text>
                  ) : null}
                </View>
              </View>
            )
          })}

          <Text style={[styles.footer, { color: c.textTertiary }]}>
            {t('compliance.footer', {
              defaultValue:
                'Coach background checks are required by Bayerischer Fußball-Verband. We auto-remind 60 / 30 / 7 days before expiry.',
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
      <Text variant="title2" color="primary" weight="semibold" tabular>
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
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
  },
  title: { letterSpacing: -0.3, marginTop: 2 },
  subtitle: { marginTop: 4, lineHeight: 18 },

  summaryCard: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: hairline,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryStat: { flex: 1, gap: 2, alignItems: 'flex-start' },
  divider: { width: hairline, height: 32 },

  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.label,
    letterSpacing: 1.4,
    fontWeight: '700',
    marginTop: space.sm,
    marginLeft: 4,
    marginBottom: -space.xs,
  },

  docCard: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    gap: 8,
  },
  docHead: {
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
  tonePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tonePillText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  docNote: {
    fontStyle: 'italic',
    lineHeight: 16,
  },
  docActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  docTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: hairline,
  },
  docTagText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  actionLink: {
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
