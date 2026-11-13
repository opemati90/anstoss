import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import type { ClubSearchResponse, ClubSearchResult, TeamRole } from '@anstoss/shared'
import { ApiError, api } from '../../src/api/client'
import { Icon, SegmentedControl, Text } from '../../src/components/ui'
import { useAuth } from '../../src/context/AuthContext'
import { ClubThemeOverride, useClubColors } from '../../src/context/ClubThemeContext'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { pickClubBadge, uploadClubBadge } from '../../src/onboarding/clubBadge'
import { useSessionExpiryHandler } from '../../src/onboarding/sessionExpiry'
import {
  ChoiceRow,
  ClubCrest,
  OnboardingScreen,
  OnboardingTextField,
  clubInitials,
} from '../../src/onboarding/ui'
import { goBackOrReplace } from '../../src/utils/navigation'
import { contrastBetween, onColor } from '../../src/theme/club-theme'
import {
  CLUB_SETUP_PRIMARY_PRESETS,
  CLUB_SETUP_SECONDARY_PRESETS,
  CONTRAST_WHITE,
  CUSTOM_SWATCH_WHEEL,
} from '../../src/theme/clubColorPresets'
import {
  RADIUS_CARD,
  RADIUS_FULL,
  SPACING_MD,
  SPACING_XS,
  fonts,
  space,
} from '../../src/theme/tokens'

const PRIMARY_HEXES: readonly string[] = CLUB_SETUP_PRIMARY_PRESETS.map((p) => p.hex)
const SECONDARY_HEXES: readonly string[] = CLUB_SETUP_SECONDARY_PRESETS.map((p) => p.hex)

/** Kept for callers that list the onboarding presets (Vereinsprofil, specs). */
export const CLUB_COLOURS: readonly string[] = PRIMARY_HEXES

const HEX_RE = /^#[0-9A-Fa-f]{6}$/
const FEDERATION_NUMBER_RE = /^\d{4,10}$/

const OFFICIAL_LINK_RE = /^https:\/\/(?:[^/]+\.)?(?:fussball\.de|dfb\.de|fupa\.net)\/.+/i

export function isOfficialTeamLink(value: string): boolean {
  return OFFICIAL_LINK_RE.test(value.trim())
}

/**
 * Board 06: a Hauptfarbe below 4.5:1 against white stays the surface colour
 * but is darkened (×0.9 per step) for text and buttons.
 */
export function darkenForText(hex: string): string {
  if (!HEX_RE.test(hex)) return hex
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  let out = hex.toUpperCase()
  for (let n = 0; n < 30 && contrastBetween(out, CONTRAST_WHITE) < 4.5; n += 1) {
    r = Math.round(r * 0.9)
    g = Math.round(g * 0.9)
    b = Math.round(b * 0.9)
    out = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
  }
  return out
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function normalizeHexInput(raw: string): string {
  return `#${raw.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6)}`.toUpperCase()
}

type DirectoryHit = Extract<ClubSearchResult, { isActive: false }>

/**
 * "Dein Verein" (board 06), new club path step 1 of 2: crest, name, DFB
 * number, Haupt- and Zweitfarbe with a live preview, then the first team the
 * claim needs (name, group, fussball.de link, own part). Submitting sends a
 * verification claim; the server makes the account a club admin in the same
 * step. Next: "Hol dein Team rein" (invite), then home.
 */
export default function ClubSetupScreen() {
  const router = useRouter()
  const { t } = useTranslation()
  const c = useClubColors()
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
  const [federationNumber, setFederationNumber] = useState('')
  const [badgeUri, setBadgeUri] = useState<string | null>(null)
  const [teamName, setTeamName] = useState(state.teamName ?? '')
  const [group, setGroup] = useState<'SENIOR' | 'YOUTH'>(state.teamGroupType ?? 'SENIOR')
  const [link, setLink] = useState(state.officialTeamUrl ?? '')
  const [linkTouched, setLinkTouched] = useState(false)
  const [roles, setRoles] = useState<TeamRole[]>(state.adminTeamRoles ?? [])

  const initialPrimary = state.clubPrimaryColor ?? PRIMARY_HEXES[0]
  const [primary, setPrimary] = useState(initialPrimary)
  const [primaryCustom, setPrimaryCustom] = useState(!PRIMARY_HEXES.includes(initialPrimary))
  const [primaryHex, setPrimaryHex] = useState(
    PRIMARY_HEXES.includes(initialPrimary) ? '#' : initialPrimary,
  )
  const [secondary, setSecondary] = useState<string>(SECONDARY_HEXES[0])
  const [secondaryCustom, setSecondaryCustom] = useState(false)
  const [secondaryHex, setSecondaryHex] = useState('#')
  const primaryInvalid = primaryCustom && primaryHex.length > 1 && !HEX_RE.test(primaryHex)
  const secondaryInvalid = secondaryCustom && secondaryHex.length > 1 && !HEX_RE.test(secondaryHex)
  // What the app will actually use for text and buttons on light surfaces.
  const textColour = darkenForText(primary)
  const weak = textColour !== primary.toUpperCase()
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
      clubPrimaryColor: primary,
    })
  }, [clubName, primary, directoryEntryId, group, link, roles, teamName, update])

  const linkValid = isOfficialTeamLink(link)
  const numberTrimmed = federationNumber.trim()
  const numberInvalid = numberTrimmed.length > 0 && !FEDERATION_NUMBER_RE.test(numberTrimmed)
  const ready =
    clubName.trim().length >= 2 &&
    teamName.trim().length >= 2 &&
    linkValid &&
    !numberInvalid &&
    !busy

  function toggleRole(role: TeamRole) {
    setRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role],
    )
  }

  async function pickBadge() {
    const uri = await pickClubBadge()
    if (uri) setBadgeUri(uri)
  }

  async function submit() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      // Contract keys (BACKEND_GAPS, clubClaimExtrasSchema): a server without
      // them strips them; the upload just returns nothing.
      const badgeUploadId = badgeUri ? await uploadClubBadge(badgeUri) : null
      await api<{ id: string }>('/club-claims/first', {
        method: 'POST',
        body: {
          ...(directoryEntryId
            ? { directoryEntryId }
            : { clubName: clubName.trim() }),
          teamName: teamName.trim(),
          teamGroupType: group,
          teamRoles: roles,
          primaryColor: primary,
          externalTeamUrl: link.trim(),
          secondaryColor: secondary,
          ...(numberTrimmed ? { federationClubNumber: numberTrimmed } : {}),
          ...(badgeUploadId ? { badgeUploadId } : {}),
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

  const previewClub = { name: clubName.trim() || '·', primaryColor: primary, badgeUrl: null }
  const onSurface = onColor(textColour)

  return (
    <ClubThemeOverride club={{ primaryColor: primary }}>
      <OnboardingScreen
        title={t('onboardingFlow.clubSetup.boardTitle')}
        progress={isMember ? null : SETUP_PROGRESS}
        onBack={() => goBackOrReplace(router, '/(auth)/welcome')}
        primary={{
          label: t('onboardingFlow.common.continue'),
          onPress: () => void submit(),
          disabled: !ready,
          loading: busy,
          color: textColour,
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
        <View style={styles.crestRow}>
          <View style={styles.crestWrap}>
            {badgeUri ? (
              <Image
                source={{ uri: badgeUri }}
                style={styles.badgeImage}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <SetupCrest name={clubName} fill={textColour} ring={secondary} />
            )}
            <Pressable
              onPress={() => void pickBadge()}
              accessibilityRole="button"
              accessibilityLabel={t('onboardingFlow.clubSetup.badgeUpload')}
              style={[styles.cameraButton, { backgroundColor: c.surface, borderColor: c.borderDefault }]}
              testID="club-setup-badge"
            >
              <Icon name="camera" size={16} color={c.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.crestCopy}>
            <Text variant="body" weight="bold" style={styles.size16}>
              {t('onboardingFlow.clubSetup.badgeTitle')}
            </Text>
            <Text variant="footnote" color="secondary" style={styles.lh18}>
              {t('onboardingFlow.clubSetup.badgeBody')}
            </Text>
          </View>
        </View>

        <View style={styles.fields}>
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
            label={t('onboardingFlow.clubSetup.numberLabel')}
            value={federationNumber}
            onChangeText={(next) => setFederationNumber(next.replace(/\D/g, '').slice(0, 10))}
            placeholder={t('onboardingFlow.clubSetup.numberPlaceholder')}
            keyboardType="number-pad"
            maxLength={10}
            error={numberInvalid ? t('onboardingFlow.clubSetup.numberInvalid') : null}
            hint={t('onboardingFlow.clubSetup.numberHint')}
            testID="club-setup-number-input"
          />
        </View>

        <View style={styles.section}>
          <Text variant="label" accessibilityRole="header">
            {t('onboardingFlow.clubSetup.colorsBoardTitle')}
          </Text>
          <View style={styles.colourBlock}>
            <Text variant="subheadline" weight="semibold" style={styles.size14}>
              {t('onboardingFlow.clubSetup.primaryLabel')}
            </Text>
            <View
              style={styles.swatches}
              accessibilityRole="radiogroup"
              accessibilityLabel={t('onboardingFlow.clubSetup.primaryLabel')}
            >
              {CLUB_SETUP_PRIMARY_PRESETS.map((preset) => (
                <Swatch
                  key={preset.hex}
                  hex={preset.hex}
                  selected={!primaryCustom && primary === preset.hex}
                  label={t(`onboardingFlow.clubSetup.colors.${preset.name}`)}
                  onPress={() => {
                    setPrimaryCustom(false)
                    setPrimary(preset.hex)
                  }}
                />
              ))}
              <Swatch
                hex={null}
                selected={primaryCustom}
                label={t('onboardingFlow.clubSetup.customColour')}
                onPress={() => setPrimaryCustom(true)}
                testID="club-setup-colour-custom"
              />
            </View>
            {primaryCustom ? (
              <HexField
                label={t('onboardingFlow.clubSetup.customHexLabel')}
                value={primaryHex}
                invalid={primaryInvalid}
                invalidLabel={t('onboardingFlow.clubSetup.customHexInvalid')}
                onChange={(raw) => {
                  const next = normalizeHexInput(raw)
                  setPrimaryHex(next)
                  if (HEX_RE.test(next)) setPrimary(next)
                }}
                testID="club-setup-colour-hex"
              />
            ) : null}
            {weak ? (
              <Text variant="caption1" weight="regular" color="secondary" testID="club-setup-colour-adjusted">
                {t('onboardingFlow.clubSetup.colourAdjusted', { hex: textColour })}
              </Text>
            ) : null}
          </View>

          <View style={styles.colourBlock}>
            <Text variant="subheadline" weight="semibold" style={styles.size14}>
              {t('onboardingFlow.clubSetup.secondaryLabel')}
            </Text>
            <View
              style={styles.swatches}
              accessibilityRole="radiogroup"
              accessibilityLabel={t('onboardingFlow.clubSetup.secondaryLabel')}
            >
              {CLUB_SETUP_SECONDARY_PRESETS.map((preset) => (
                <Swatch
                  key={preset.hex}
                  hex={preset.hex}
                  selected={!secondaryCustom && secondary === preset.hex}
                  label={t(`onboardingFlow.clubSetup.colors.${preset.name}`)}
                  onPress={() => {
                    setSecondaryCustom(false)
                    setSecondary(preset.hex)
                  }}
                />
              ))}
              <Swatch
                hex={null}
                selected={secondaryCustom}
                label={t('onboardingFlow.clubSetup.customSecondary')}
                onPress={() => setSecondaryCustom(true)}
                testID="club-setup-secondary-custom"
              />
            </View>
            {secondaryCustom ? (
              <HexField
                label={t('onboardingFlow.clubSetup.customHexLabel')}
                value={secondaryHex}
                invalid={secondaryInvalid}
                invalidLabel={t('onboardingFlow.clubSetup.customHexInvalid')}
                onChange={(raw) => {
                  const next = normalizeHexInput(raw)
                  setSecondaryHex(next)
                  if (HEX_RE.test(next)) setSecondary(next)
                }}
                testID="club-setup-secondary-hex"
              />
            ) : null}
          </View>

          <View
            style={[styles.preview, { backgroundColor: textColour }]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <View style={styles.previewCopy}>
              <Text variant="caption1" weight="regular" color={onSurface} style={styles.previewEyebrow}>
                {t('onboardingFlow.language.preview')}
              </Text>
              <Text variant="display" color={onSurface} style={styles.previewTitle} numberOfLines={1}>
                {t('onboardingFlow.clubSetup.previewKickoff')}
              </Text>
            </View>
            <View style={[styles.previewBar, { backgroundColor: secondary }]} />
          </View>
          <Text variant="caption1" weight="regular" color="secondary" style={styles.lh17}>
            {t('onboardingFlow.clubSetup.colorsTeamHint')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text variant="label" accessibilityRole="header">
            {t('onboardingFlow.clubSetup.teamLabel')}
          </Text>
          <OnboardingTextField
            label={t('onboardingFlow.clubSetup.teamNameLabel')}
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
            <Text variant="footnote" weight="semibold">
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
        </View>
      </OnboardingScreen>
    </ClubThemeOverride>
  )
}

const SETUP_PROGRESS = { current: 1, total: 2 }

/** The live crest: Hauptfarbe shield, Zweitfarbe inner line, initials. */
function SetupCrest({ name, fill, ring }: { name: string; fill: string; ring: string }) {
  return (
    <Svg width={CREST_W} height={CREST_H} viewBox="0 0 40 44">
      <Path d="M20 1.5 37.5 7.5v12.5c0 10.5-7.5 18.5-17.5 22.5C10 38.5 2.5 30.5 2.5 20V7.5z" fill={fill} />
      <Path
        d="M20 5 34 9.8v10.2c0 8.6-6 15.2-14 18.6C12 35.2 6 28.6 6 20V9.8z"
        fill="none"
        stroke={ring}
        strokeWidth={1.4}
      />
      <SvgText
        x={20}
        y={25.5}
        textAnchor="middle"
        fontFamily={fonts.display}
        fontWeight="700"
        fontSize={12.5}
        fill={onColor(fill)}
      >
        {name.trim() ? clubInitials(name).slice(0, 3) : '·'}
      </SvgText>
    </Svg>
  )
}

const CREST_W = 72
const CREST_H = 79

function HexField({
  label,
  value,
  invalid,
  invalidLabel,
  onChange,
  testID,
}: {
  label: string
  value: string
  invalid: boolean
  invalidLabel: string
  onChange: (raw: string) => void
  testID: string
}) {
  return (
    <OnboardingTextField
      label={label}
      value={value}
      onChangeText={onChange}
      autoCapitalize="characters"
      autoCorrect={false}
      spellCheck={false}
      maxLength={7}
      error={invalid ? invalidLabel : null}
      style={styles.hexInput}
      testID={testID}
    />
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
      <View style={[styles.picked, { backgroundColor: c.surface }]}>
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
          backgroundColor: selected ? c.ink : 'transparent',
          borderColor: selected ? c.ink : c.borderStrong,
        },
      ]}
    >
      <Icon
        name={selected ? 'checkmark' : 'plus'}
        size={16}
        color={selected ? c.onInk : c.textPrimary}
      />
      <Text variant="subheadline" weight="semibold" color={selected ? c.onInk : 'primary'}>
        {label}
      </Text>
    </Pressable>
  )
}

/** 40pt colour dot; the picked one gets a page-coloured gap and an ink ring. */
function Swatch({
  hex,
  selected,
  label,
  onPress,
  testID,
}: {
  /** `null` = the "Eigene" swatch (colour wheel). */
  hex: string | null
  selected: boolean
  label: string
  onPress: () => void
  testID?: string
}) {
  const c = useClubColors()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      hitSlop={4}
      style={styles.swatch}
      testID={testID}
    >
      {selected ? <View pointerEvents="none" style={[styles.swatchRing, { borderColor: c.ink }]} /> : null}
      {hex === null ? (
        <Svg width={SWATCH} height={SWATCH} viewBox="0 0 40 40">
          {CUSTOM_SWATCH_WHEEL.map((colour, index) => {
            const step = (2 * Math.PI) / CUSTOM_SWATCH_WHEEL.length
            const a0 = index * step - Math.PI / 2
            const a1 = a0 + step
            const x0 = 20 + 20 * Math.cos(a0)
            const y0 = 20 + 20 * Math.sin(a0)
            const x1 = 20 + 20 * Math.cos(a1)
            const y1 = 20 + 20 * Math.sin(a1)
            return <Path key={colour} d={`M20 20 L${x0} ${y0} A20 20 0 0 1 ${x1} ${y1} Z`} fill={colour} />
          })}
        </Svg>
      ) : (
        <Svg width={SWATCH} height={SWATCH} viewBox="0 0 40 40">
          <Circle cx={20} cy={20} r={20} fill={hex} />
          <Circle cx={20} cy={20} r={19.5} fill="none" stroke={c.borderDefault} strokeWidth={1} />
        </Svg>
      )}
    </Pressable>
  )
}

const SWATCH = 40
/** Ring: 3pt page gap + 2pt ink around the 40pt dot. */
const SWATCH_RING_INSET = -5

const styles = StyleSheet.create({
  group: { gap: space.sm },
  fields: { gap: SPACING_MD + 2 },
  section: { gap: SPACING_MD + 2 },
  colourBlock: { gap: SPACING_MD - 2 },
  crestRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  crestWrap: { width: CREST_W, height: CREST_H },
  badgeImage: { width: CREST_W, height: CREST_H },
  cameraButton: {
    position: 'absolute',
    right: -10,
    bottom: -6,
    width: 34,
    height: 34,
    borderRadius: RADIUS_FULL,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crestCopy: { flex: 1, minWidth: 0, gap: SPACING_XS },
  size16: { fontSize: 16, lineHeight: 20 },
  size14: { fontSize: 14, lineHeight: 18 },
  lh18: { lineHeight: 18 },
  lh17: { lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING_XS + 2,
    minHeight: 36,
    paddingHorizontal: SPACING_MD + 2,
    borderRadius: RADIUS_FULL,
    borderWidth: 1,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING_MD - 2, paddingVertical: SPACING_XS },
  swatch: { width: SWATCH, height: SWATCH },
  swatchRing: {
    position: 'absolute',
    top: SWATCH_RING_INSET,
    left: SWATCH_RING_INSET,
    right: SWATCH_RING_INSET,
    bottom: SWATCH_RING_INSET,
    borderRadius: RADIUS_FULL,
    borderWidth: 2,
  },
  hexInput: { fontFamily: fonts.data, fontSize: 22, letterSpacing: 1.6 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    padding: space.md,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  previewCopy: { flex: 1, minWidth: 0, gap: space['2xs'] },
  previewEyebrow: { opacity: 0.75 },
  previewTitle: { fontSize: 30, lineHeight: 30 },
  previewBar: { height: 8, width: 96, borderRadius: SPACING_XS },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  pickedCopy: { flex: 1, minWidth: 0, gap: space['2xs'] },
  change: { minHeight: 44, justifyContent: 'center' },
})
