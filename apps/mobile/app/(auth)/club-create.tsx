/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Icon, Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { api } from '../../src/api/client'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

type FussballHit = {
  id: string
  name: string
  logo_url: string
  city: string
}

type SearchResponse = {
  available: boolean
  results: FussballHit[]
}

export default function ClubCreate() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state, update, markStep } = useOnboardingFlow()
  useEffect(() => markStep('/(auth)/club-create'), [markStep])
  const [name, setName] = useState(state.clubName ?? '')
  const [team, setTeam] = useState(state.teamName ?? '')

  // Fussball.de autocomplete state. The dropdown opens once the user
  // has typed at least 3 chars; debounced 300ms to keep upstream
  // calls cheap. When the admin picks a hit we store the
  // externalClubId so done.tsx can auto-link the team after the club
  // record is created.
  const [hits, setHits] = useState<FussballHit[]>([])
  const [searching, setSearching] = useState(false)
  const [scraperAvailable, setScraperAvailable] = useState(true)
  const [pickedClubId, setPickedClubId] = useState<string | null>(
    state.fussballExternalClubId ?? null,
  )
  const [pickedLogo, setPickedLogo] = useState<string | null>(
    state.fussballClubLogoUrl ?? null,
  )
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
          `/integrations/fussball/search?q=${encodeURIComponent(trimmed)}`,
        )
        setHits(data?.results ?? [])
        setScraperAvailable(data?.available ?? false)
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

  const ready = name.trim().length > 1 && team.trim().length > 1

  function handleSubmit() {
    update({
      clubName: name.trim(),
      teamName: team.trim(),
      fussballExternalClubId: pickedClubId ?? undefined,
      fussballClubLogoUrl: pickedLogo ?? undefined,
    })
    router.push('/(auth)/club-identity')
  }

  function pickHit(hit: FussballHit) {
    setName(hit.name)
    setPickedClubId(hit.id)
    setPickedLogo(hit.logo_url || null)
    setHits([])
  }

  function clearPick() {
    setPickedClubId(null)
    setPickedLogo(null)
  }

  return (
    <WizardStep
      title={t('onboarding.clubCreate.title')}
      hint={t('onboarding.clubCreate.hint', {
        defaultValue: 'Add your club and your first team. You can add more teams later.',
      })}
      ctaLabel={t('common.next')}
      onCta={handleSubmit}
      ctaDisabled={!ready}
      step={{ current: 5, total: 6 }}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          {pickedLogo ? (
            <Image source={{ uri: pickedLogo }} style={styles.badgeImage} />
          ) : (
            <Text style={[styles.badgeText, { color: colors.surface }]}>{initials || 'A'}</Text>
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
              defaultValue: 'Type to search fussball.de…',
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
              defaultValue: '✓ Matched on fussball.de — fixtures + roster will sync automatically.',
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
                {hit.logo_url ? (
                  <Image source={{ uri: hit.logo_url }} style={styles.suggestLogo} />
                ) : (
                  <View
                    style={[styles.suggestLogo, { backgroundColor: colors.surfaceSunken }]}
                  />
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
                  defaultValue: 'No matches on fussball.de. You can still create your club manually.',
                })
              : t('onboarding.clubCreate.scraperOffline', {
                  defaultValue: 'fussball.de search is offline right now. Type your club name to continue manually.',
                })}
          </Text>
        ) : null}

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced, { color: colors.textTertiary }]}>
          {t('onboarding.clubCreate.teamLabel', { defaultValue: 'First team' })}
        </Text>
        <TextInput
          value={team}
          onChangeText={setTeam}
          placeholder={t('onboarding.clubCreate.teamPlaceholder', {
            defaultValue: '1. Mannschaft, U15, Frauen…',
          })}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="words"
          style={[
            styles.input,
            {
              color: colors.textPrimary,
              borderColor: colors.border,
              backgroundColor: colors.surfaceSunken,
            },
          ]}
        />
      </ScrollView>
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
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
    fontWeight: '800',
  },
  fieldLabel: {
    fontFamily: fonts.label,
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: space.xs,
  },
  fieldLabelSpaced: {
    marginTop: space.lg,
  },
  searchWrap: {
    position: 'relative',
  },
  searchSpinner: {
    position: 'absolute',
    right: space.md,
    top: space.md + 4,
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
    fontWeight: '600',
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
  suggestCopy: { flex: 1, gap: 2 },
  noMatch: {
    marginTop: space.sm,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
})
