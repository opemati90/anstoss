import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import type { ExternalTeamLink, FussballTeamPreview } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { api } from '../src/api/client'
import { ModalHeader } from '../src/components/ModalHeader'
import { Screen } from '../src/components/ui/Screen'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { Text } from '../src/components/ui'
import { fonts, fontSize, space, radius, lineHeight, hairline } from '../src/theme/tokens'

type CreateTeamLinkResponse = {
  link: ExternalTeamLink
}

export default function FussballLinkScreen() {
  const { t } = useTranslation()
  const { activeClub, activeTeamId, activeTeamAccess } = useAuth()
  const c = useClubColors()
  const canManage = activeClub?.role === 'OWNER' || activeClub?.role === 'ADMIN'
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<FussballTeamPreview | null>(null)
  const [links, setLinks] = useState<ExternalTeamLink[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async () => {
    if (!activeTeamId) {
      setLoading(false)
      return
    }

    try {
      setLoadError(false)
      const linkedTeams = await api<ExternalTeamLink[]>(
        `/integrations/fussball/team-links?teamId=${activeTeamId}`,
      )
      setLinks(linkedTeams)
    } catch {
      setLoadError(true)
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
      const result = await api<FussballTeamPreview>('/integrations/fussball/team-preview', {
        method: 'POST',
        body: { input: input.trim() },
      })
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
          // Re-submit the original value so an official widget snippet can
          // be validated again server-side. The API stores only widget id/type,
          // never the raw HTML.
          input: preview.input,
          label: preview.label,
        },
      })
      await loadData()
      setPreview(null)
      setInput('')

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
      <Text style={[styles.eyebrow, { color: c.textTertiary }]}>{t('fussball.eyebrow')}</Text>
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
            multiline
            textAlignVertical="top"
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
              <Text style={[styles.panelTitle, { color: c.textPrimary }]}>{preview.label}</Text>
              <Text style={[styles.metaText, { color: c.textSecondary }]}>
                {preview.provider === 'widget_embed'
                  ? t('fussball.liveWidget')
                  : t('fussball.referenceOnly')}
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
          <Text style={[styles.panelBody, { color: c.textSecondary }]}>{preview.externalUrl}</Text>
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
          {t('fussball.linkedPages')}
        </Text>
      </View>
      {loading ? (
        <View style={styles.loadingPanel}>
          <ActivityIndicator color={c.primary} />
        </View>
      ) : loadError ? (
        <View style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderDefault }]}>
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{t('common.loadError')}</Text>
          <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
            {t('fussball.loadError')}
          </Text>
          <Pressable
            style={[styles.secondaryButton, { borderColor: c.borderDefault }]}
            onPress={() => {
              setLoading(true)
              void loadData()
            }}
            accessibilityRole="button"
            accessibilityLabel={t('common.tryAgain')}
          >
            <Text style={[styles.secondaryButtonText, { color: c.textPrimary }]}>
              {t('common.tryAgain')}
            </Text>
          </Pressable>
        </View>
      ) : links.length > 0 ? (
        links.map((link) => (
          <View
            key={link.id}
            style={[styles.panel, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
          >
            <View style={styles.previewHeader}>
              <View style={styles.previewCopy}>
                <Text style={[styles.panelTitle, { color: c.textPrimary }]}>{link.label}</Text>
                <Text style={[styles.metaText, { color: c.textSecondary }]}>
                  {officialPageBrand(link.externalUrl)}
                </Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  { borderColor: c.borderDefault, backgroundColor: c.background },
                ]}
              >
                <Text style={[styles.statusPillText, { color: c.textSecondary }]}>
                  {link.provider === 'widget_embed'
                    ? t('fussball.widgetLabel')
                    : t('fussball.referenceLabel')}
                </Text>
              </View>
            </View>
            <Text style={[styles.monoText, { color: c.textTertiary }]}>{link.externalTeamId}</Text>
            <Pressable
              style={[styles.secondaryButton, { borderColor: c.borderDefault }]}
              onPress={() =>
                router.push({
                  pathname: '/official-team-page',
                  params: {
                    url: link.externalUrl,
                    title: link.label,
                    ...(link.widgetId && link.widgetType
                      ? { widgetId: link.widgetId, widgetType: link.widgetType }
                      : {}),
                  },
                })
              }
              accessibilityRole="link"
              accessibilityLabel={`${officialPageBrand(link.externalUrl)} · ${link.label}`}
            >
              <Text style={[styles.secondaryButtonText, { color: c.textPrimary }]}>
                {t('fussball.openPage', { provider: officialPageBrand(link.externalUrl) })}
              </Text>
            </Pressable>
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
    minHeight: 112,
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
