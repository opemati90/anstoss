import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../../src/components/ui'
import { FormInput } from '../../src/components/FormInput'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { TeamRole } from '@anstoss/shared'
import { fontSize, fontWeight, fonts, hairline, radius, space } from '../../src/theme/tokens'
import { onboardingStep } from '../../src/onboarding/steps'

type DirectoryHit = {
  id: string
  directoryEntryId: string
  name: string
  badgeUrl: string | null
  city: string | null
  isActive: false
}

type SearchResponse = {
  results: DirectoryHit[]
  nextCursor: string | null
}

export default function ClubCreate() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state, update, markStep } = useOnboardingFlow()
  useEffect(() => markStep('/(auth)/club-create'), [markStep])
  const [name, setName] = useState(state.clubName ?? '')
  const [team, setTeam] = useState(state.teamName ?? '')
  const [officialTeamUrl, setOfficialTeamUrl] = useState(state.officialTeamUrl ?? '')

  // External team-data autocomplete state. The dropdown opens once the user
  // has typed at least 3 chars; debounced 300ms to keep upstream
  // calls cheap. When the admin picks a hit we store the
  // externalClubId so done.tsx can auto-link the team after the club
  // record is created.
  const [hits, setHits] = useState<DirectoryHit[]>([])
  const [searching, setSearching] = useState(false)
  const [scraperAvailable, setScraperAvailable] = useState(true)
  const [pickedClubId, setPickedClubId] = useState<string | null>(
    state.fussballExternalClubId ?? null,
  )
  const [pickedLogo, setPickedLogo] = useState<string | null>(state.fussballClubLogoUrl ?? null)
  const [teamRoles, setTeamRoles] = useState<TeamRole[]>(state.adminTeamRoles ?? [])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = name.trim()
    // Don't search after the user has explicitly picked a hit — the
    // pickedClubId stays sticky until they edit the name field again.
    if (pickedClubId && trimmed === name) return
    if (trimmed.length < 3) {
      setHits([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api<SearchResponse>(
          `/clubs/search?q=${encodeURIComponent(trimmed)}&limit=6`,
        )
        setHits((data?.results ?? []).filter((result) => !result.isActive))
        setScraperAvailable(true)
      } catch {
        setHits([])
        setScraperAvailable(false)
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [name, pickedClubId])

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const validOfficialUrl = /^https:\/\/(?:[^/]+\.)?(?:fussball\.de|dfb\.de|fupa\.net)(?:\/|$)/i.test(
    officialTeamUrl.trim(),
  )
  const ready = name.trim().length > 1 && team.trim().length > 1 && validOfficialUrl

  function handleSubmit() {
    update({
      clubName: name.trim(),
      teamName: team.trim(),
      fussballExternalClubId: pickedClubId ?? undefined,
      officialTeamUrl: officialTeamUrl.trim(),
      fussballClubLogoUrl: pickedLogo ?? undefined,
      adminTeamRoles: teamRoles,
    })
    router.push('/(auth)/club-identity')
  }

  function pickHit(hit: DirectoryHit) {
    setName(hit.name)
    setPickedClubId(hit.directoryEntryId)
    setPickedLogo(hit.badgeUrl)
    setHits([])
  }

  function clearPick() {
    setPickedClubId(null)
    setPickedLogo(null)
  }

  function toggleTeamRole(role: TeamRole) {
    setTeamRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    )
  }

  return (
    <WizardStep
      title={t('onboarding.clubCreate.title')}
      hint={t('onboarding.clubCreate.hint', {
        defaultValue: 'Add your club and one team to get started. You can add more teams later.',
      })}
      ctaLabel={t('common.next')}
      onCta={handleSubmit}
      ctaDisabled={!ready}
      step={onboardingStep('clubCreate')}
      scrollable
    >
      <View>
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          {pickedLogo ? (
            <Image source={{ uri: pickedLogo }} style={styles.badgeImage} />
          ) : (
            <Text allowFontScaling={false} style={[styles.badgeText, { color: colors.surface }]}>
              {initials || 'A'}
            </Text>
          )}
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
          {t('onboarding.clubCreate.nameLabel', { defaultValue: 'Club name' })}
        </Text>
        <View style={styles.searchWrap}>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value)
              if (pickedClubId) clearPick()
            }}
            placeholder={t('onboarding.clubCreate.namePlaceholder', {
              defaultValue: 'Type to search public club data…',
            })}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="words"
            autoCorrect={false}
            style={[
              styles.input,
              {
                color: colors.textPrimary,
                borderColor: pickedClubId ? colors.primary : colors.border,
                backgroundColor: colors.surfaceSunken,
              },
            ]}
          />
          {searching ? (
            <ActivityIndicator size="small" color={colors.primary} style={styles.searchSpinner} />
          ) : null}
        </View>

        {pickedClubId ? (
          <Text style={[styles.matchedHint, { color: colors.success ?? colors.primary }]}>
            {t('onboarding.clubCreate.matched', {
              defaultValue:
                'Matched in the club directory. The official team page can be saved as a reference; fixtures stay under club control.',
            })}
          </Text>
        ) : null}

        {hits.length > 0 && !pickedClubId ? (
          <View
            style={[
              styles.suggestList,
              { borderColor: colors.borderDefault, backgroundColor: colors.surface },
            ]}
          >
            {hits.slice(0, 6).map((hit) => (
              <Pressable
                key={hit.id}
                onPress={() => pickHit(hit)}
                accessibilityRole="button"
                accessibilityLabel={hit.name}
                style={({ pressed }) => [
                  styles.suggestRow,
                  pressed && { backgroundColor: colors.surfaceSunken },
                ]}
              >
                {hit.badgeUrl ? (
                  <Image source={{ uri: hit.badgeUrl }} style={styles.suggestLogo} />
                ) : (
                  <View style={[styles.suggestLogo, { backgroundColor: colors.surfaceSunken }]} />
                )}
                <View style={styles.suggestCopy}>
                  <Text variant="callout" weight="semibold" color="primary" numberOfLines={1}>
                    {hit.name}
                  </Text>
                  {hit.city ? (
                    <Text variant="caption2" color="secondary" numberOfLines={1}>
                      {hit.city}
                    </Text>
                  ) : null}
                </View>
                <Icon name="chevron.right" size={14} color="tertiary" />
              </Pressable>
            ))}
          </View>
        ) : null}

        {!searching && name.trim().length >= 3 && hits.length === 0 && !pickedClubId ? (
          <Text style={[styles.noMatch, { color: colors.textTertiary }]}>
            {scraperAvailable
              ? t('onboarding.clubCreate.noMatch', {
                  defaultValue:
                    'No directory match found. You can still continue with the official club name and team-page link for platform review.',
                })
              : t('onboarding.clubCreate.scraperOffline', {
                  defaultValue:
                    'Public club-data search is offline right now. Please retry before submitting a club claim.',
                })}
          </Text>
        ) : null}

        <View style={styles.teamField}>
          <FormInput
            label={t('onboarding.clubCreate.teamLabel', { defaultValue: 'Team name' })}
            value={team}
            onChangeText={setTeam}
            placeholder={t('onboarding.clubCreate.teamPlaceholder', {
              defaultValue: '1. Mannschaft, U15, Frauen…',
            })}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.teamField}>
          <FormInput
            label={t('onboarding.clubCreate.officialTeamUrlLabel', {
              defaultValue: 'Official team page',
            })}
            value={officialTeamUrl}
            onChangeText={setOfficialTeamUrl}
            placeholder="https://www.fussball.de/..."
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text variant="caption2" color="secondary" style={styles.fieldHelp}>
            {t('onboarding.clubCreate.officialTeamUrlHelp', {
              defaultValue:
                'Paste the official team page as context for platform review. The link does not prove club authority.',
            })}
          </Text>
        </View>

        <View style={styles.participation}>
          <Text variant="footnote" weight="semibold" color="secondary">
            {t('onboarding.clubCreate.participation', {
              defaultValue: 'Will you also participate in this team?',
            })}
          </Text>
          <View style={styles.roleRow}>
            {[
              {
                role: TeamRole.HEAD_COACH,
                label: t('roles.COACH', { defaultValue: 'Coach' }),
              },
              {
                role: TeamRole.PLAYER,
                label: t('roles.PLAYER', { defaultValue: 'Player' }),
              },
            ].map((option) => {
              const selected = teamRoles.includes(option.role)
              return (
                <Pressable
                  key={option.role}
                  onPress={() => toggleTeamRole(option.role)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  style={[
                    styles.roleChoice,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary50 : colors.surface,
                    },
                  ]}
                >
                  <Icon
                    name={selected ? 'checkmark.circle.fill' : 'circle'}
                    size={18}
                    color={selected ? 'primary' : 'tertiary'}
                  />
                  <Text variant="footnote" weight="semibold">
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  badge: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
    overflow: 'hidden',
  },
  badgeImage: {
    width: 88,
    height: 88,
    resizeMode: 'cover',
  },
  badgeText: {
    fontFamily: fonts.heading,
    fontSize: fontSize['2xl'],
    lineHeight: fontSize['2xl'] * 1.3,
    fontWeight: fontWeight.bold,
  },
  fieldLabel: {
    fontFamily: fonts.label,
    fontSize: fontSize.xs,
    letterSpacing: 1.4,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    marginBottom: space.xs,
  },
  teamField: {
    marginTop: space.lg,
  },
  fieldHelp: {
    marginTop: space.xs,
  },
  participation: {
    marginTop: space.lg,
    gap: space.sm,
  },
  roleRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  roleChoice: {
    minHeight: 48,
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  searchWrap: {
    position: 'relative',
  },
  searchSpinner: {
    position: 'absolute',
    right: space.md,
    top: space.md + space.xs,
  },
  input: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
  },
  matchedHint: {
    marginTop: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  suggestList: {
    marginTop: space.sm,
    borderRadius: radius.md,
    borderWidth: hairline,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  suggestLogo: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
  },
  suggestCopy: { flex: 1, gap: space.xs },
  noMatch: {
    marginTop: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
})
