import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { router } from 'expo-router'
import type {
  ExternalTeamLink,
  FussballTeamPreview,
  ImportedFixture,
  SyncRun,
} from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen } from '../src/components/ui/Screen'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { Text } from '../src/components/ui'
import { getAppLanguage, getAppLocale } from '../src/i18n'
import { fonts, fontSize, space, radius, lineHeight ,
  hairline} from '../src/theme/tokens'

type CreateTeamLinkResponse = {
  link: ExternalTeamLink
  sync: SyncRun | null
}

export default function FussballLinkScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const canManage =
    activeClub?.role === 'OWNER' ||
    activeClub?.role === 'ADMIN'
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<FussballTeamPreview | null>(null)
  const [links, setLinks] = useState<ExternalTeamLink[]>([])
  const [fixtures, setFixtures] = useState<ImportedFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)

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

      if (!result.sync) {
        Alert.alert(t('fussball.connectSuccessTitle'), t('fussball.connectSuccessBody'))
        return
      }

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

  if (!activeClub || !activeTeamId) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
          {t('fussball.noTeamTitle')}
        </Text>
        <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
          {t('fussball.noTeamBody')}
        </Text>
      </View>
    )
  }

  return (
    <Screen
      header={<ModalHeader title={t('fussball.title')} />}
      scroll
      padded
      edges={['top', 'left', 'right', 'bottom']}
    >
      <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
        {t('fussball.eyebrow')}
      </Text>
      <Text style={[styles.subtitle, { color: c.textSecondary }]}>
        {t('fussball.subtitle', {
          team: activeTeamAccess?.team.displayName || activeClub.club.name,
        })}
      </Text>

      {canManage ? (
        <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text style={[styles.panelTitle, { color: c.textPrimary }]}>
            {t('fussball.linkTitle')}
          </Text>
          <Text style={[styles.panelBody, { color: c.textSecondary }]}>
            {t('fussball.linkBody')}
          </Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('fussball.inputPlaceholder')}
            placeholderTextColor={c.textTertiary}
            style={[
              styles.input,
              {
                borderColor: c.borderDefault,
                backgroundColor: c.background,
                color: c.textPrimary,
              },
            ]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.primaryButton, { backgroundColor: c.primary }]}
            onPress={handlePreview}
            disabled={previewing}
            accessibilityRole="button"
            accessibilityLabel={t('fussball.previewAction')}
          >
            {previewing ? (
              <ActivityIndicator color={c.textInverse} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: c.textInverse }]}>
                {t('fussball.previewAction')}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {preview && canManage ? (
        <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <View style={styles.previewHeader}>
            <View>
              <Text style={[styles.panelTitle, { color: c.textPrimary }]}>
                {preview.label}
              </Text>
              <Text style={[styles.metaText, { color: c.textSecondary }]}>
                {preview.competition || t('fussball.competitionUnknown')}
              </Text>
            </View>
            <View
              style={[
                styles.statusPill,
                { borderColor: c.borderDefault, backgroundColor: c.background },
              ]}
            >
              <Text style={[styles.statusPillText, { color: c.textSecondary }]}>
                {preview.provider}
              </Text>
            </View>
          </View>
          {preview.pitchAddress ? (
            <Text style={[styles.panelBody, { color: c.textSecondary }]}>
              {preview.pitchAddress}
            </Text>
          ) : (
            <Text style={[styles.panelBody, { color: c.textSecondary }]}>
              {t('fussball.pitchPending')}
            </Text>
          )}
          <Pressable
            style={[styles.primaryButton, { backgroundColor: c.primary }]}
            onPress={handleConnect}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={t('fussball.connectAction')}
          >
            {saving ? (
              <ActivityIndicator color={c.textInverse} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: c.textInverse }]}>
                {t('fussball.connectAction')}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
          {t('fussball.linkedFeeds')}
        </Text>
      </View>
      {loading ? (
        <View style={styles.loadingPanel}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : links.length > 0 ? (
        links.map((link) => (
          <View
            key={link.id}
            style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
          >
            <View style={styles.previewHeader}>
              <View style={styles.previewCopy}>
                <Text style={[styles.panelTitle, { color: c.textPrimary }]}>
                  {link.label}
                </Text>
                <Text style={[styles.metaText, { color: c.textSecondary }]}>
                  {officialPageBrand(link.externalUrl)}
                </Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  { borderColor: c.borderDefault, backgroundColor: c.background },
                  link.status === 'ERROR' && {
                    backgroundColor: `${c.error}12`,
                    borderColor: `${c.error}2E`,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    { color: c.textSecondary },
                    link.status === 'ERROR' ? { color: c.error } : {},
                  ]}
                >
                  {link.status}
                </Text>
              </View>
            </View>
            <Text style={[styles.monoText, { color: c.textTertiary }]}>
              {link.externalTeamId}
            </Text>
            {link.status === 'ERROR' ? (
              <Text style={[styles.errorNotice, { color: c.error }]}>
                {t('fussball.linkErrorNotice')}
              </Text>
            ) : null}
            {link.provider === 'fussball_public_page' || link.provider === 'api_fussball' ? (
              <Pressable
                style={[styles.secondaryButton, { borderColor: c.borderDefault }]}
                onPress={() =>
                  router.push({
                    pathname: '/official-team-page',
                    params: { url: link.externalUrl, title: link.label },
                  })
                }
                accessibilityRole="link"
                accessibilityLabel={`${officialPageBrand(link.externalUrl)} · ${link.label}`}
              >
                <Text style={[styles.secondaryButtonText, { color: c.textPrimary }]}>
                  {officialPageBrand(link.externalUrl)}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))
      ) : (
        <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
            {t('fussball.noLinksTitle')}
          </Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            {t('fussball.noLinksBody')}
          </Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>
          {t('fussball.upcomingFixtures')}
        </Text>
      </View>
      {fixtures.length > 0 ? (
        fixtures.map((fixture) => (
          <Pressable
            key={fixture.id}
            style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
            onPress={() =>
              router.push({
                pathname: '/match-detail',
                params: { fixtureId: fixture.id, teamId: fixture.teamId },
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`${fixture.homeTeam} vs ${fixture.awayTeam}`}
          >
            <Text style={[styles.fixtureCompetition, { color: c.textTertiary }]}>
              {fixture.competition}
            </Text>
            <Text style={[styles.panelTitle, { color: c.textPrimary }]}>
              {fixture.homeTeam} vs {fixture.awayTeam}
            </Text>
            <Text style={[styles.metaText, { color: c.textSecondary }]}>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(fixture.kickoffAt))}
            </Text>
            {fixture.venueName ? (
              <Text style={[styles.panelBody, { color: c.textSecondary }]}>
                {fixture.venueName}
              </Text>
            ) : null}
            {fixture.pitchAddress ? (
              <Text style={[styles.panelBody, { color: c.textSecondary }]}>
                {fixture.pitchAddress}
              </Text>
            ) : null}
          </Pressable>
        ))
      ) : (
        <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
            {t('fussball.noFixturesTitle')}
          </Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            {t('fussball.noFixturesBody')}
          </Text>
        </View>
      )}
    </Screen>
  )
}

function officialPageBrand(url: string) {
  const lower = typeof url === 'string' ? url.toLowerCase() : ''
  if (lower.includes('dfb.de')) return 'DFB.DE'
  if (lower.includes('fupa.net')) return 'FUPA'
  return 'FUSSBALL.DE'
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  eyebrow: {
    marginTop: space.xl,
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
    fontFamily: fonts.label,
  },
  subtitle: {
    marginTop: space.sm,
    marginBottom: space.lg,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontFamily: fonts.body,
  },
  panel: {
    borderRadius: radius.lg,
    borderWidth: hairline,
    padding: space.md,
    marginBottom: space.md,
  },
  loadingPanel: {
    paddingVertical: space.xl,
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
  },
  panelBody: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  input: {
    marginTop: space.md,
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.md,
    fontFamily: fonts.body,
  },
  primaryButton: {
    marginTop: space.md,
    minHeight: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontFamily: fonts.label,
  },
  secondaryButton: {
    marginTop: space.md,
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  secondaryButtonText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.label,
  },
  sectionHeader: {
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
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
    borderWidth: hairline,
  },
  statusPillText: {
    fontSize: fontSize['2xs'],
    letterSpacing: 0.2,
    fontFamily: fonts.label,
  },
  metaText: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  monoText: {
    marginTop: space.sm,
    fontSize: fontSize.xs,
    fontFamily: fonts.data,
  },
  errorNotice: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
  fixtureCompetition: {
    fontSize: fontSize.xs,
    letterSpacing: 0.2,
    marginBottom: space.sm,
    fontFamily: fonts.label,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontFamily: fonts.heading,
  },
  emptyBody: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    fontFamily: fonts.body,
  },
})
