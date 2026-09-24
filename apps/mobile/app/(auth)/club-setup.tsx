import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ClubSearchResponse, ClubSearchResult, TeamRole } from '@anstoss/shared'
import { ApiError, api } from '../../src/api/client'
import { Icon, SegmentedControl, Text } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { ClubThemeOverride, useClubColors } from '../../src/context/ClubThemeContext'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { onboardingProgress } from '../../src/onboarding/steps'
import { useSessionExpiryHandler } from '../../src/onboarding/sessionExpiry'
import { ChoiceRow, ClubCrest, OnboardingScreen, OnboardingTextField } from '../../src/onboarding/ui'
import { goBackOrReplace } from '../../src/utils/navigation'
import { onColor } from '../../src/theme/club-theme'
import { CLUB_COLOR_PRESET_NAMES, CLUB_COLOR_PRESETS } from '../../src/theme/clubColorPresets'
import { hairline, radius, space } from '../../src/theme/tokens'

/** Traditional Vereinsfarben (shared with Vereinsprofil & Farben). */
export const CLUB_COLOURS: readonly string[] = CLUB_COLOR_PRESETS.slice(0, 8)

/** Screen readers hear the colour's name, not "Vereinsfarbe 3". */
function colourNameKey(hex: string): string {
  const index = CLUB_COLOR_PRESETS.indexOf(hex as (typeof CLUB_COLOR_PRESETS)[number])
  return `onboardingFlow.clubSetup.colors.${CLUB_COLOR_PRESET_NAMES[index] ?? 'black'}`
}

const OFFICIAL_LINK_RE = /^https:\/\/(?:[^/]+\.)?(?:fussball\.de|dfb\.de|fupa\.net)\/.+/i

export function isOfficialTeamLink(value: string): boolean {
  return OFFICIAL_LINK_RE.test(value.trim())
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

type DirectoryHit = Extract<ClubSearchResult, { isActive: false }>

/**
 * Club admin, screen 5: one well-grouped form (club, first team, fussball.de
 * link, own part in the team, colour). Submitting sends a verification claim;
 * the server makes the account a club admin in the same step (nothing is
 * written before, so backing out never locks the account). The admin lands
 * on home, which shows "Dein Verein wird geprüft" until Anstoss has checked.
 */
export default function ClubSetupScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const params = useLocalSearchParams<{ directoryEntryId?: string; clubName?: string }>()
  const { memberships, refreshUser } = useAuth()
  const onExpired = useSessionExpiryHandler()
  const { state, update, markStep, reset } = useOnboardingFlow()
  const isMember = memberships.length > 0

  const paramEntry = first(params.directoryEntryId)
  const paramName = first(params.clubName)
  const [directoryEntryId, setDirectoryEntryId] = useState<string | null>(
    paramEntry ?? state.directoryEntryId ?? null,
  )
  const [clubName, setClubName] = useState(paramName ?? state.clubName ?? '')
  const [teamName, setTeamName] = useState(state.teamName ?? '')
  const [group, setGroup] = useState<'SENIOR' | 'YOUTH'>(state.teamGroupType ?? 'SENIOR')
  const [link, setLink] = useState(state.officialTeamUrl ?? '')
  const [linkTouched, setLinkTouched] = useState(false)
  const [roles, setRoles] = useState<TeamRole[]>(state.adminTeamRoles ?? [])
  const [colour, setColour] = useState(state.clubPrimaryColor ?? CLUB_COLOURS[0])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => markStep('/(auth)/club-setup'), [markStep])

  // Keep the draft so an app kill mid-form does not lose it.
  useEffect(() => {
    update({
      directoryEntryId: directoryEntryId ?? undefined,
      clubName,
      teamName,
      teamGroupType: group,
      officialTeamUrl: link,
      adminTeamRoles: roles,
      clubPrimaryColor: colour,
    })
  }, [clubName, colour, directoryEntryId, group, link, roles, teamName, update])

  const linkValid = isOfficialTeamLink(link)
  const ready =
    clubName.trim().length >= 2 && teamName.trim().length >= 2 && linkValid && !busy

  function toggleRole(role: TeamRole) {
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    )
  }

  async function submit() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await api<{ id: string }>('/club-claims/first', {
        method: 'POST',
        body: {
          ...(directoryEntryId
            ? { directoryEntryId }
            : { clubName: clubName.trim() }),
          teamName: teamName.trim(),
          teamGroupType: group,
          teamRoles: roles,
          primaryColor: colour,
          externalTeamUrl: link.trim(),
        },
      })
      reset()
      await refreshUser(undefined, { throwOnError: true }).catch(() => undefined)
      router.replace('/')
    } catch (err) {
      if (onExpired(err)) return
      setError(
        err instanceof ApiError && err.status === 409
          ? t('onboardingFlow.clubSetup.alreadyActive')
          : err instanceof ApiError && err.status === 403
            ? t('onboardingFlow.clubSetup.notAllowed')
            : err instanceof ApiError
              ? t('onboardingFlow.clubSetup.submitFailed')
              : t('onboardingFlow.common.networkError'),
      )
    } finally {
      setBusy(false)
    }
  }

  const previewClub = { name: clubName.trim() || '·', primaryColor: colour, badgeUrl: null }

  return (
    <ClubThemeOverride club={{ primaryColor: colour }}>
      <OnboardingScreen
        title={t('onboardingFlow.clubSetup.title')}
        subtitle={t('onboardingFlow.clubSetup.subtitle')}
        progress={isMember ? null : onboardingProgress('admin', 'clubSetup')}
        onBack={() => goBackOrReplace(router, '/(auth)/club-search')}
        primary={{
          label: t('onboardingFlow.clubSetup.submit'),
          onPress: () => void submit(),
          disabled: !ready,
          loading: busy,
          testID: 'club-setup-submit',
        }}
        footerNote={
          error ? (
            <Text variant="footnote" color="error" align="center" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : undefined
        }
        testID="club-setup"
      >
        <ClubField
          clubName={clubName}
          directoryEntryId={directoryEntryId}
          previewClub={previewClub}
          onChangeName={(next) => {
            setClubName(next)
            setDirectoryEntryId(null)
          }}
          onPick={(hit) => {
            setClubName(hit.name)
            setDirectoryEntryId(hit.directoryEntryId)
          }}
          onClearPick={() => setDirectoryEntryId(null)}
        />

        <OnboardingTextField
          label={t('onboardingFlow.clubSetup.teamLabel')}
          value={teamName}
          onChangeText={setTeamName}
          placeholder={t('onboardingFlow.clubSetup.teamPlaceholder')}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={80}
          testID="club-setup-team-name-input"
        />

        <SegmentedControl<'SENIOR' | 'YOUTH'>
          segments={[
            { key: 'SENIOR', label: t('onboardingFlow.clubSetup.groupSenior') },
            { key: 'YOUTH', label: t('onboardingFlow.clubSetup.groupYouth') },
          ]}
          value={group}
          onChange={setGroup}
        />

        <OnboardingTextField
          label={t('onboardingFlow.clubSetup.linkLabel')}
          value={link}
          onChangeText={setLink}
          onBlur={() => setLinkTouched(true)}
          placeholder={t('onboardingFlow.clubSetup.linkPlaceholder')}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          error={linkTouched && link.trim().length > 0 && !linkValid ? t('onboardingFlow.clubSetup.linkInvalid') : null}
          hint={t('onboardingFlow.clubSetup.linkHint')}
          testID="club-setup-link-input"
        />

        <View style={styles.group}>
          <Text variant="subheadline" weight="semibold" color="secondary">
            {t('onboardingFlow.clubSetup.participation')}
          </Text>
          <View style={styles.chips}>
            {(
              [
                { role: 'HEAD_COACH' as TeamRole, label: t('onboardingFlow.clubSetup.participationCoach') },
                { role: 'PLAYER' as TeamRole, label: t('onboardingFlow.clubSetup.participationPlayer') },
              ]
            ).map((option) => (
              <Chip
                key={option.role}
                label={option.label}
                selected={roles.includes(option.role)}
                onPress={() => toggleRole(option.role)}
              />
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <Text variant="subheadline" weight="semibold" color="secondary">
            {t('onboardingFlow.clubSetup.colorsTitle')}
          </Text>
          <View style={styles.swatches}>
            {CLUB_COLOURS.map((hex) => (
              <Swatch
                key={hex}
                hex={hex}
                selected={colour === hex}
                label={t(colourNameKey(hex))}
                onPress={() => setColour(hex)}
              />
            ))}
          </View>
          <Text variant="footnote" color="tertiary">
            {t('onboardingFlow.clubSetup.colorsHint')}
          </Text>
        </View>
      </OnboardingScreen>
    </ClubThemeOverride>
  )
}

function ClubField({
  clubName,
  directoryEntryId,
  previewClub,
  onChangeName,
  onPick,
  onClearPick,
}: {
  clubName: string
  directoryEntryId: string | null
  previewClub: { name: string; primaryColor: string; badgeUrl: null }
  onChangeName: (next: string) => void
  onPick: (hit: DirectoryHit) => void
  onClearPick: () => void
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const [hits, setHits] = useState<DirectoryHit[]>([])
  const [searching, setSearching] = useState(false)
  const requestId = useRef(0)
  const trimmed = clubName.trim()

  useEffect(() => {
    const id = ++requestId.current
    if (directoryEntryId || trimmed.length < 3) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    const handle = setTimeout(() => {
      api<ClubSearchResponse>(`/clubs/search?q=${encodeURIComponent(trimmed)}&limit=6`)
        .then((res) => {
          if (id !== requestId.current) return
          setHits((res?.results ?? []).filter((hit): hit is DirectoryHit => !hit.isActive))
        })
        .catch(() => {
          if (id === requestId.current) setHits([])
        })
        .finally(() => {
          if (id === requestId.current) setSearching(false)
        })
    }, 300)
    return () => clearTimeout(handle)
  }, [directoryEntryId, trimmed])

  if (directoryEntryId) {
    return (
      <View style={[styles.picked, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
        <ClubCrest club={previewClub} size={48} />
        <View style={styles.pickedCopy}>
          <Text variant="caption1" color="secondary">
            {t('onboardingFlow.clubSetup.clubLabel')}
          </Text>
          <Text variant="headline" weight="semibold">
            {clubName}
          </Text>
        </View>
        <Pressable
          onPress={onClearPick}
          accessibilityRole="button"
          accessibilityLabel={t('onboardingFlow.clubSetup.change')}
          hitSlop={8}
          style={styles.change}
        >
          <Text variant="footnote" weight="semibold" color="tint">
            {t('onboardingFlow.clubSetup.change')}
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.group}>
      <OnboardingTextField
        label={t('onboardingFlow.clubSetup.clubLabel')}
        value={clubName}
        onChangeText={onChangeName}
        placeholder={t('onboardingFlow.clubSetup.clubPlaceholder')}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={120}
        hint={t('onboardingFlow.clubSetup.clubHint')}
        testID="club-setup-club-name-input"
      />
      {searching ? <ActivityIndicator size="small" color={c.textTertiary} /> : null}
      {hits.map((hit) => (
        <ChoiceRow
          key={hit.id}
          accessibilityRole="button"
          leading={<ClubCrest club={hit} size={40} />}
          title={hit.name}
          body={[hit.city, hit.association].filter(Boolean).join(' · ') || undefined}
          onPress={() => onPick(hit)}
          testID={`club-setup-hit-${hit.slug}`}
        />
      ))}
    </View>
  )
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      android_ripple={{ color: c.borderDefault }}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? c.primary50 : c.surface,
          borderColor: selected ? c.primary : c.borderDefault,
        },
      ]}
    >
      <Icon
        name={selected ? 'checkmark.circle.fill' : 'ellipse-outline'}
        size={18}
        color={selected ? c.primary : c.textTertiary}
      />
      <Text variant="subheadline" weight="semibold">
        {label}
      </Text>
    </Pressable>
  )
}

function Swatch({
  hex,
  selected,
  label,
  onPress,
}: {
  hex: string
  selected: boolean
  label: string
  onPress: () => void
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={4}
      android_ripple={{ color: hex, borderless: true }}
      style={[
        styles.swatch,
        { borderColor: selected ? c.textPrimary : 'transparent' },
      ]}
    >
      <View style={[styles.swatchFill, { backgroundColor: hex }]}>
        {selected ? <Icon name="checkmark" size={18} color={onColor(hex)} /> : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.full,
    borderWidth: hairline * 2,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    borderWidth: 2,
    padding: space['2xs'],
  },
  swatchFill: {
    flex: 1,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: hairline,
  },
  pickedCopy: { flex: 1, minWidth: 0, gap: space['2xs'] },
  change: { minHeight: 44, justifyContent: 'center' },
})
