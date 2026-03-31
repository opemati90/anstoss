import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import type {
  ExternalTeamLink,
  FussballTeamPreview,
  ImportedFixture,
  SyncRun,
} from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { fonts, neutralColors, semanticColors, fontSize, space, radius, fontWeight } from '../src/theme/tokens'

type CreateTeamLinkResponse = {
  link: ExternalTeamLink
  sync: SyncRun
}

export default function FussballLinkScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const theme = useClubColors()
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<FussballTeamPreview | null>(null)
  const [links, setLinks] = useState<ExternalTeamLink[]>([])
  const [fixtures, setFixtures] = useState<ImportedFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const locale = getAppLocale(getAppLanguage())

  const loadData = useCallback(async () => {
    if (!activeTeamId) {
      setLoading(false)
      return
    }

    try {
      const [linkedTeams, importedFixtures] = await Promise.all([
        api<ExternalTeamLink[]>(`/integrations/fussball/team-links?teamId=${activeTeamId}`),
        api<ImportedFixture[]>(`/teams/${activeTeamId}/fixtures?scope=upcoming&limit=6`),
      ])

      setLinks(linkedTeams)
      setFixtures(importedFixtures)
    } catch {
      Alert.alert(t('common.error'), t('fussball.loadError'))
    } finally {
      setLoading(false)
    }
  }, [activeTeamId, t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handlePreview = async () => {
    if (!input.trim()) {
      Alert.alert(t('common.error'), t('fussball.inputRequired'))
      return
    }

    try {
      setPreviewing(true)
      const result = await api<FussballTeamPreview>(
        '/integrations/fussball/team-preview',
        {
          method: 'POST',
          body: { input: input.trim() },
        },
      )
      setPreview(result)
    } catch (error) {
      Alert.alert(
        t('fussball.previewErrorTitle'),
        error instanceof Error ? error.message : t('fussball.previewErrorBody'),
      )
    } finally {
      setPreviewing(false)
    }
  }

  const handleConnect = async () => {
    if (!activeClub || !activeTeamId || !preview) {
      return
    }

    try {
      setSaving(true)
      const result = await api<CreateTeamLinkResponse>('/integrations/fussball/team-links', {
        method: 'POST',
        headers: {
          'x-club-id': activeClub.club.id,
        },
        body: {
          teamId: activeTeamId,
          input: preview.externalUrl,
          label: preview.label,
        },
      })
      await loadData()
      setPreview(null)
      setInput('')

      if (result.sync.status === 'FAILED') {
        Alert.alert(
          t('fussball.syncErrorTitle'),
          result.sync.errorSummary || t('fussball.connectSyncFailedBody'),
        )
        return
      }

      if (
        result.sync.status === 'PARTIAL' &&
        result.sync.importedCount === 0 &&
        result.sync.updatedCount === 0
      ) {
        Alert.alert(
          t('fussball.connectSuccessTitle'),
          t('fussball.connectPartialBody'),
        )
        return
      }

      Alert.alert(t('fussball.connectSuccessTitle'), t('fussball.connectSuccessBody'))
    } catch (error) {
      Alert.alert(
        t('fussball.connectErrorTitle'),
        error instanceof Error ? error.message : t('fussball.connectErrorBody'),
      )
    } finally {
      setSaving(false)
    }
  }

  const handleSyncNow = async (teamLinkId: string) => {
    if (!activeClub) return

    try {
      setSyncingId(teamLinkId)
      const result = await api<SyncRun>(`/integrations/fussball/team-links/${teamLinkId}/sync`, {
        method: 'POST',
        headers: {
          'x-club-id': activeClub.club.id,
        },
        body: { force: true },
      })
      await loadData()

      if (result.status === 'FAILED') {
        Alert.alert(
          t('fussball.syncErrorTitle'),
          result.errorSummary || t('fussball.syncErrorBody'),
        )
        return
      }

      Alert.alert(
        t('fussball.syncSuccessTitle'),
        t('fussball.syncSuccessBody', {
          count: result.importedCount + result.updatedCount,
        }),
      )
    } catch (error) {
      Alert.alert(
        t('fussball.syncErrorTitle'),
        error instanceof Error ? error.message : t('fussball.syncErrorBody'),
      )
    } finally {
      setSyncingId(null)
    }
  }

  if (!activeClub || !activeTeamId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>{t('fussball.noTeamTitle')}</Text>
        <Text style={styles.emptyBody}>{t('fussball.noTeamBody')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ModalHeader title={t('fussball.title')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{t('fussball.eyebrow')}</Text>
        <Text style={styles.subtitle}>
          {t('fussball.subtitle', {
            team: activeTeamAccess?.team.displayName || activeClub.club.name,
          })}
        </Text>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{t('fussball.linkTitle')}</Text>
          <Text style={styles.panelBody}>{t('fussball.linkBody')}</Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('fussball.inputPlaceholder')}
            placeholderTextColor={neutralColors.textTertiary}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.clubPrimary }]}
            onPress={handlePreview}
            disabled={previewing}
            accessibilityRole="button"
            accessibilityLabel={t('fussball.previewAction')}
          >
            {previewing ? (
              <ActivityIndicator color={neutralColors.textInverse} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {t('fussball.previewAction')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {preview ? (
          <View style={styles.panel}>
            <View style={styles.previewHeader}>
              <View>
                <Text style={styles.panelTitle}>{preview.label}</Text>
                <Text style={styles.metaText}>
                  {preview.competition || t('fussball.competitionUnknown')}
                </Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{preview.provider}</Text>
              </View>
            </View>
            {preview.pitchAddress ? (
              <Text style={styles.panelBody}>{preview.pitchAddress}</Text>
            ) : (
              <Text style={styles.panelBody}>{t('fussball.pitchPending')}</Text>
            )}
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: theme.clubPrimary }]}
              onPress={handleConnect}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={t('fussball.connectAction')}
            >
              {saving ? (
                <ActivityIndicator color={neutralColors.textInverse} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {t('fussball.connectAction')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('fussball.linkedFeeds')}</Text>
        </View>
        {loading ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color={theme.clubPrimary} />
          </View>
        ) : links.length > 0 ? (
          links.map((link) => (
            <View key={link.id} style={styles.panel}>
              <View style={styles.previewHeader}>
                <View style={styles.previewCopy}>
                  <Text style={styles.panelTitle}>{link.label}</Text>
                  <Text style={styles.metaText}>
                    {t('fussball.lastSynced', {
                      value: link.lastSyncedAt
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(link.lastSyncedAt))
                        : t('fussball.neverSynced'),
                    })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    link.status === 'ERROR' && styles.statusPillError,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      link.status === 'ERROR' && styles.statusPillTextError,
                    ]}
                  >
                    {link.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.monoText}>{link.externalTeamId}</Text>
              {link.status === 'ERROR' ? (
                <Text style={styles.errorNotice}>
                  {t('fussball.linkErrorNotice')}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: theme.clubPrimary }]}
                onPress={() => handleSyncNow(link.id)}
                disabled={syncingId === link.id}
                accessibilityRole="button"
                accessibilityLabel={t('fussball.syncNow')}
              >
                {syncingId === link.id ? (
                  <ActivityIndicator color={theme.clubPrimary} />
                ) : (
                  <Text
                    style={[styles.secondaryButtonText, { color: theme.clubPrimary }]}
                  >
                    {t('fussball.syncNow')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.panel}>
            <Text style={styles.emptyTitle}>{t('fussball.noLinksTitle')}</Text>
            <Text style={styles.emptyBody}>{t('fussball.noLinksBody')}</Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('fussball.upcomingFixtures')}</Text>
        </View>
        {fixtures.length > 0 ? (
          fixtures.map((fixture) => (
            <View key={fixture.id} style={styles.panel}>
              <Text style={styles.fixtureCompetition}>{fixture.competition}</Text>
              <Text style={styles.panelTitle}>
                {fixture.homeTeam} vs {fixture.awayTeam}
              </Text>
              <Text style={styles.metaText}>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(fixture.kickoffAt))}
              </Text>
              {fixture.venueName ? (
                <Text style={styles.panelBody}>{fixture.venueName}</Text>
              ) : null}
              {fixture.pitchAddress ? (
                <Text style={styles.panelBody}>{fixture.pitchAddress}</Text>
              ) : null}
            </View>
          ))
        ) : (
          <View style={styles.panel}>
            <Text style={styles.emptyTitle}>{t('fussball.noFixturesTitle')}</Text>
            <Text style={styles.emptyBody}>{t('fussball.noFixturesBody')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    backgroundColor: neutralColors.background,
  },
  eyebrow: {
    marginTop: 20,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: fonts.label,
  },
  subtitle: {
    marginTop: 10,
    marginBottom: space.lg,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  panel: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.md,
    marginBottom: space.md,
  },
  loadingPanel: {
    paddingVertical: space.xl,
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    fontFamily: fonts.heading,
  },
  panelBody: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  input: {
    marginTop: space.md,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    color: neutralColors.textPrimary,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  primaryButton: {
    marginTop: space.md,
    minHeight: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
    fontFamily: fonts.label,
  },
  secondaryButton: {
    marginTop: space.md,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  secondaryButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: fonts.label,
  },
  sectionHeader: {
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    fontFamily: fonts.heading,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: radius.lg,
  },
  previewCopy: {
    flex: 1,
  },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
  },
  statusPillError: {
    backgroundColor: `${semanticColors.error}12`,
    borderColor: `${semanticColors.error}2E`,
  },
  statusPillText: {
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: fonts.label,
  },
  statusPillTextError: {
    color: semanticColors.error,
  },
  metaText: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
  monoText: {
    marginTop: space.sm,
    fontSize: fontSize.xs,
    color: neutralColors.textTertiary,
    fontFamily: fonts.data,
  },
  errorNotice: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: 19,
    color: semanticColors.error,
    fontFamily: fonts.body,
  },
  fixtureCompetition: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: space.sm,
    fontFamily: fonts.label,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    fontFamily: fonts.heading,
  },
  emptyBody: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: neutralColors.textSecondary,
    fontFamily: fonts.body,
  },
})
