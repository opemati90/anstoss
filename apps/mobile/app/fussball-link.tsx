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
import { Ionicons } from '@expo/vector-icons'
import type {
  ExternalTeamLink,
  FussballTeamPreview,
  ImportedFixture,
  SyncRun,
} from '@anstoss/shared'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { getAppLocale } from '../src/i18n'
import { neutralColors } from '../src/theme/tokens'

type CreateTeamLinkResponse = {
  link: ExternalTeamLink
  sync: SyncRun
}

export default function FussballLinkScreen() {
  const { t, i18n } = useTranslation()
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

  const locale = getAppLocale(i18n.resolvedLanguage === 'en' ? 'en' : 'de')

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
      await api<CreateTeamLinkResponse>('/integrations/fussball/team-links', {
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
      Alert.alert(t('fussball.connectSuccessTitle'), t('fussball.connectSuccessBody'))
      setPreview(null)
      setInput('')
      await loadData()
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
      await api<SyncRun>(`/integrations/fussball/team-links/${teamLinkId}/sync`, {
        method: 'POST',
        headers: {
          'x-club-id': activeClub.club.id,
        },
        body: { force: true },
      })
      await loadData()
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons
            name="chevron-back"
            size={20}
            color={neutralColors.textPrimary}
          />
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.eyebrow}>{t('fussball.eyebrow')}</Text>
      <Text style={styles.title}>{t('fussball.title')}</Text>
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
        >
          {previewing ? (
            <ActivityIndicator color="#FFF" />
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
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
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
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{link.status}</Text>
              </View>
            </View>
            <Text style={styles.monoText}>{link.externalTeamId}</Text>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: theme.clubPrimary }]}
              onPress={() => handleSyncNow(link.id)}
              disabled={syncingId === link.id}
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
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  content: {
    padding: 20,
    paddingTop: 56,
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: neutralColors.background,
  },
  headerRow: {
    marginBottom: 18,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backLabel: {
    fontSize: 15,
    color: neutralColors.textPrimary,
    fontWeight: '600',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  subtitle: {
    marginTop: 12,
    marginBottom: 24,
    fontSize: 15,
    lineHeight: 22,
    color: neutralColors.textSecondary,
  },
  panel: {
    backgroundColor: neutralColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: 16,
    marginBottom: 14,
  },
  loadingPanel: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  panelBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
  input: {
    marginTop: 14,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    color: neutralColors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  primaryButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  secondaryButton: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  previewCopy: {
    flex: 1,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: neutralColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metaText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: neutralColors.textSecondary,
  },
  monoText: {
    marginTop: 10,
    fontSize: 12,
    color: neutralColors.textTertiary,
    fontFamily: 'GeistMono_400Regular',
  },
  fixtureCompetition: {
    fontSize: 12,
    fontWeight: '700',
    color: neutralColors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: neutralColors.textPrimary,
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: neutralColors.textSecondary,
  },
})
