/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useAuth } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RegistrationRole } from '@anstoss/shared'
import { Icon, Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { TEAM_CODE_LENGTH, TeamCodeInput } from '../../src/components/wizard/TeamCodeInput'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { api, ApiError, setTokenGetter } from '../../src/api/client'
import { useAuth as useAppAuth } from '../../src/context/AuthContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { fontSize, fonts, hairline, radius, space } from '../../src/theme/tokens'

const HANDOFF_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const HANDOFF_CODE_LENGTH = 8

type HandoffPreview = {
  childFirstName: string
  childDateOfBirth: string
}

type RosterSlotPreview = {
  id: string
  fullName: string
  position: string | null
  jerseyNumber: number | null
}

type TeamPreview = {
  team: { id: string; clubId: string; name: string; displayName: string | null }
  club: { id: string; name: string; badgeUrl: string | null; primaryColor: string | null }
  rosterSlots: RosterSlotPreview[]
}

async function waitForToken(
  getToken: () => Promise<string | null>,
  budgetMs: number,
): Promise<boolean> {
  const deadline = Date.now() + budgetMs
  while (Date.now() < deadline) {
    const token = await getToken()
    if (token) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

function normalizeHandoffCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((ch) => HANDOFF_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, HANDOFF_CODE_LENGTH)
}

function formatDob(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#')) return hex
  let h = hex.slice(1)
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function ParentHandoff() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { state, reset, markStep } = useOnboardingFlow()
  const { finalizeSession } = useOnboardingAuth()
  const { getToken } = useAuth()
  const { refreshUser } = useAppAuth()

  const [setupCode, setSetupCode] = useState('')
  const [teamCode, setTeamCode] = useState('')
  const [child, setChild] = useState<HandoffPreview | null>(null)
  const [team, setTeam] = useState<TeamPreview | null>(null)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [loadingCode, setLoadingCode] = useState(false)
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [redeeming, setRedeeming] = useState(false)

  useEffect(() => markStep('/(auth)/parent-handoff'), [markStep])

  useEffect(() => {
    setChild(null)
    setTeam(null)
    setTeamCode('')
    setSelectedSlotId(null)
    setCodeError(null)
    setTeamError(null)
    setSubmitError(null)
    if (setupCode.length !== HANDOFF_CODE_LENGTH) {
      setLoadingCode(false)
      return
    }
    let cancelled = false
    async function lookup() {
      setLoadingCode(true)
      try {
        const result = await api<HandoffPreview>(`/parent-handoff/${setupCode}`)
        if (!cancelled) setChild(result)
      } catch (err) {
        if (cancelled) return
        const fallback =
          err instanceof ApiError && err.status === 409
            ? t('onboarding.parentHandoff.codeUsed', {
                defaultValue: 'This setup code was already used or has expired.',
              })
            : t('onboarding.parentHandoff.codeInvalid', {
                defaultValue: 'We could not find that setup code.',
              })
        setCodeError(fallback)
      } finally {
        if (!cancelled) setLoadingCode(false)
      }
    }
    lookup()
    return () => {
      cancelled = true
    }
  }, [setupCode, t])

  useEffect(() => {
    setTeam(null)
    setSelectedSlotId(null)
    setTeamError(null)
    setSubmitError(null)
    if (!child || teamCode.length !== TEAM_CODE_LENGTH) {
      setLoadingTeam(false)
      return
    }
    let cancelled = false
    async function lookupTeam() {
      setLoadingTeam(true)
      try {
        const result = await api<TeamPreview>(
          `/parent-handoff/${setupCode}/team/${teamCode}`,
        )
        if (!cancelled) {
          setTeam(result)
          if (result.rosterSlots.length === 1) {
            setSelectedSlotId(result.rosterSlots[0].id)
          }
        }
      } catch {
        if (!cancelled) {
          setTeamError(
            t('onboarding.parentHandoff.teamInvalid', {
              defaultValue: 'That team code does not match an active team.',
            }),
          )
        }
      } finally {
        if (!cancelled) setLoadingTeam(false)
      }
    }
    lookupTeam()
    return () => {
      cancelled = true
    }
  }, [child, setupCode, teamCode, t])

  const selectedSlot = useMemo(
    () => team?.rosterSlots.find((slot) => slot.id === selectedSlotId) ?? null,
    [selectedSlotId, team],
  )

  const canRedeem =
    !!child &&
    !!team &&
    !!selectedSlot &&
    !loadingCode &&
    !loadingTeam &&
    !redeeming

  async function handleRedeem() {
    if (!canRedeem || !selectedSlot || !team) return
    const currentTeam = team
    setRedeeming(true)
    setSubmitError(null)
    try {
      await finalizeSession()
      setTokenGetter(() => getToken())
      await waitForToken(getToken, 3000)

      const profilePatch = {
        ...(state.firstName ? { name: state.firstName } : {}),
        ...(state.dateOfBirth ? { dateOfBirth: state.dateOfBirth } : {}),
        registrationRole: RegistrationRole.PARENT,
      }
      await api('/me', { method: 'PATCH', body: profilePatch })
      await api('/parent-handoff/redeem', {
        method: 'POST',
        body: {
          code: setupCode,
          teamJoinCode: teamCode,
          rosterSlotId: selectedSlot.id,
        },
      })
      await refreshUser(undefined, {
        preferredClubId: currentTeam.club.id,
        throwOnError: true,
      })
      reset()
      router.replace('/')
    } catch (err) {
      if (__DEV__) console.warn('[parent-handoff] redeem failed', err)
      const message =
        err instanceof ApiError && err.status === 409
          ? t('onboarding.parentHandoff.slotTaken', {
              defaultValue:
                'That setup code or roster slot is no longer available. Please refresh and try again.',
            })
          : t('onboarding.parentHandoff.redeemError', {
              defaultValue: 'We could not finish the child setup. Please try again.',
            })
      setSubmitError(message)
      Alert.alert(t('common.error', { defaultValue: 'Error' }), message)
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <WizardStep
      title={t('onboarding.parentHandoff.title', {
        defaultValue: 'Set up your child',
      })}
      hint={t('onboarding.parentHandoff.hint', {
        defaultValue:
          'Enter the parent setup code, then the team code from the coach.',
      })}
      ctaLabel={t('onboarding.parentHandoff.cta', {
        defaultValue: 'Finish setup',
      })}
      ctaDisabled={!canRedeem}
      ctaLoading={redeeming}
      onCta={handleRedeem}
      scrollable
    >
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          {t('onboarding.parentHandoff.setupCodeLabel', {
            defaultValue: 'Parent setup code',
          })}
        </Text>
        <TextInput
          value={setupCode}
          onChangeText={(raw) => setSetupCode(normalizeHandoffCode(raw))}
          placeholder="AB12CD34"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={HANDOFF_CODE_LENGTH}
          style={[
            styles.codeInput,
            {
              color: colors.textPrimary,
              borderColor: codeError ? colors.error : colors.borderDefault,
              backgroundColor: colors.surfaceSunken,
            },
          ]}
        />
        {loadingCode ? (
          <ActivityIndicator color={colors.primary} style={styles.inlineLoader} />
        ) : null}
        {codeError ? (
          <Text style={[styles.errorText, { color: colors.error }]}>{codeError}</Text>
        ) : null}
      </View>

      {child ? (
        <View
          style={[
            styles.preview,
            { backgroundColor: colors.surfaceSunken, borderColor: colors.borderDefault },
          ]}
        >
          <View style={[styles.previewIcon, { backgroundColor: withAlpha(colors.primary, 0.12) }]}>
            <Icon name="heart" size={22} color={colors.primary} />
          </View>
          <View style={styles.previewBody}>
            <Text style={[styles.previewTitle, { color: colors.textPrimary }]}>
              {child.childFirstName}
            </Text>
            <Text style={[styles.previewMeta, { color: colors.textSecondary }]}>
              {formatDob(child.childDateOfBirth)}
            </Text>
          </View>
        </View>
      ) : null}

      {child ? (
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('onboarding.parentHandoff.teamCodeLabel', {
              defaultValue: 'Team code',
            })}
          </Text>
          <TeamCodeInput value={teamCode} onChange={setTeamCode} autoFocus={false} />
          {loadingTeam ? (
            <ActivityIndicator color={colors.primary} style={styles.inlineLoader} />
          ) : null}
          {teamError ? (
            <Text style={[styles.errorText, { color: colors.error }]}>{teamError}</Text>
          ) : null}
        </View>
      ) : null}

      {team ? (
        <View style={styles.section}>
          <View
            style={[
              styles.teamCard,
              { borderColor: colors.borderDefault, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.teamName, { color: colors.textPrimary }]}>
              {team.club.name}
            </Text>
            <Text style={[styles.teamMeta, { color: colors.textSecondary }]}>
              {team.team.displayName || team.team.name}
            </Text>
          </View>

          {team.rosterSlots.length > 0 ? (
            <View style={styles.slotList}>
              {team.rosterSlots.map((slot) => {
                const selected = selectedSlotId === slot.id
                return (
                  <Pressable
                    key={slot.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedSlotId(slot.id)}
                    style={({ pressed }) => [
                      styles.slotRow,
                      {
                        borderColor: selected ? colors.primary : colors.borderDefault,
                        backgroundColor: selected
                          ? withAlpha(colors.primary, 0.08)
                          : pressed
                            ? colors.surfaceSunken
                            : colors.surface,
                      },
                    ]}
                  >
                    <View style={styles.slotBody}>
                      <Text style={[styles.slotName, { color: colors.textPrimary }]}>
                        {slot.fullName}
                      </Text>
                      <Text style={[styles.slotMeta, { color: colors.textSecondary }]}>
                        {[slot.position, slot.jerseyNumber ? `#${slot.jerseyNumber}` : null]
                          .filter(Boolean)
                          .join(' · ') ||
                          t('onboarding.parentHandoff.rosterSlot', {
                            defaultValue: 'Roster slot',
                          })}
                      </Text>
                    </View>
                    <Icon
                      name={selected ? 'checkmark.circle.fill' : 'circle'}
                      size={22}
                      color={selected ? colors.primary : colors.textTertiary}
                    />
                  </Pressable>
                )
              })}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {t('onboarding.parentHandoff.noSlots', {
                defaultValue:
                  'This team has no open roster slots. Ask the coach to add your child first.',
              })}
            </Text>
          )}
        </View>
      ) : null}

      {submitError ? (
        <Text style={[styles.errorText, styles.submitError, { color: colors.error }]}>
          {submitError}
        </Text>
      ) : null}
    </WizardStep>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
    marginBottom: space.xl,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  codeInput: {
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.md,
    fontFamily: fonts.data,
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
  },
  inlineLoader: {
    alignSelf: 'center',
    marginTop: space.xs,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    padding: space.md,
    marginBottom: space.xl,
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBody: {
    flex: 1,
  },
  previewTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  previewMeta: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  teamCard: {
    borderRadius: radius.md,
    borderWidth: hairline,
    padding: space.md,
  },
  teamName: {
    fontFamily: fonts.heading,
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  teamMeta: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    marginTop: 3,
  },
  slotList: {
    gap: space.sm,
  },
  slotRow: {
    minHeight: 66,
    borderRadius: radius.md,
    borderWidth: 1.5,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  slotBody: {
    flex: 1,
  },
  slotName: {
    fontFamily: fonts.heading,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  slotMeta: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: space.sm,
  },
  submitError: {
    textAlign: 'center',
    marginBottom: space.lg,
  },
})
