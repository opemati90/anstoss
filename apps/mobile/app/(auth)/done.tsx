/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Easing, Image, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { RegistrationRole } from '@anstoss/shared'
import { Text } from '../../src/components/ui'
import { WizardStep } from '../../src/components/wizard/WizardStep'
import { ConfettiBurst } from '../../src/components/wizard/ConfettiBurst'
import { useOnboardingAuth } from '../../src/auth/useOnboardingAuth'
import { useOnboardingFlow } from '../../src/context/OnboardingFlowContext'
import { useClubColors } from '../../src/context/ClubThemeContext'
import { activateE2EScenario } from '../../src/e2e/session'
import { api, setTokenGetter } from '../../src/api/client'
import { uploadMedia } from '../../src/api/uploadMedia'
import { useAuth } from '@clerk/clerk-expo'
import { fontSize, fonts, radius, space } from '../../src/theme/tokens'

const DEV_SCENARIO_BY_ROLE: Record<
  RegistrationRole,
  'player' | 'parent' | 'coach' | 'club-admin' | 'free-agent'
> = {
  [RegistrationRole.PLAYER]: 'player',
  [RegistrationRole.PARENT]: 'parent',
  [RegistrationRole.COACH]: 'coach',
  [RegistrationRole.CLUB_ADMIN]: 'club-admin',
  [RegistrationRole.FREE_AGENT]: 'free-agent',
}

type ClubSetupResponse = {
  club: { id: string; name: string; primaryColor: string; badgeUrl: string | null }
  team: { id: string; name: string }
}

export default function Done() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { finalizeSession } = useOnboardingAuth()
  const { state, reset } = useOnboardingFlow()
  const { getToken } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  const badgeScale = useRef(new Animated.Value(0.7)).current
  const badgeFade = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.parallel([
      Animated.spring(badgeScale, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(badgeFade, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start()
  }, [badgeScale, badgeFade])

  async function handleCta() {
    if (submitting) return
    setSubmitting(true)
    try {
      if (__DEV__ && state.phone === '+15555550100') {
        const scenario = state.role ? DEV_SCENARIO_BY_ROLE[state.role] : 'player'
        await activateE2EScenario(scenario)
        reset()
        router.replace('/')
        return
      }

      await finalizeSession()
      // The Clerk session is now active. Wire the api client's token
      // getter directly so this screen's API calls use the freshly minted
      // session immediately (AuthProvider's setTokenGetter only fires
      // after a re-render at the root, which doesn't happen here).
      setTokenGetter(() => getToken())

      // Persist name + DOB on the user record (JIT-creates if needed).
      if (state.firstName || state.dateOfBirth) {
        try {
          await api('/me', {
            method: 'PATCH',
            body: {
              ...(state.firstName ? { name: state.firstName } : {}),
              ...(state.dateOfBirth ? { dateOfBirth: state.dateOfBirth } : {}),
            },
          })
        } catch (err) {
          if (__DEV__) console.warn('[onboarding/done] /me patch failed', err)
        }
      }

      // Admin flow: actually create the club + team now that auth is live.
      if (
        state.role === RegistrationRole.CLUB_ADMIN &&
        state.clubName &&
        state.teamName &&
        state.clubPrimaryColor
      ) {
        const setup = await api<ClubSetupResponse>('/clubs/setup', {
          method: 'POST',
          body: {
            club: {
              name: state.clubName,
              primaryColor: state.clubPrimaryColor,
            },
            team: {
              name: state.teamName,
            },
          },
        })

        // Optional: upload the picked logo, then patch the club's badgeUrl.
        if (state.clubLogoUri) {
          try {
            const token = await getToken()
            if (token) {
              const uploaded = await uploadMedia({
                teamId: setup.team.id,
                token,
                uri: state.clubLogoUri,
                contentType: 'image/png',
                kind: 'image',
                filename: 'club-badge.png',
              })
              if (uploaded?.publicUrl) {
                await api(`/clubs/${setup.club.id}`, {
                  method: 'PATCH',
                  body: { badgeUrl: uploaded.publicUrl },
                })
              }
            }
          } catch (err) {
            if (__DEV__) console.warn('[onboarding/done] badge upload skipped', err)
          }
        }

        // Add roster slots if the admin pre-filled any names.
        if (state.rosterNames && state.rosterNames.length > 0) {
          try {
            await api(
              `/clubs/${setup.club.id}/teams/${setup.team.id}/roster-slots`,
              {
                method: 'POST',
                body: {
                  slots: state.rosterNames.map((fullName) => ({ fullName })),
                },
              },
            )
          } catch (err) {
            if (__DEV__) console.warn('[onboarding/done] roster-slots failed', err)
          }
        }
      }

      reset()
      router.replace('/')
    } catch (err) {
      if (__DEV__) console.warn('[onboarding/done] finalize failed', err)
      Alert.alert(
        t('common.error'),
        t('onboarding.done.error', {
          defaultValue: 'Could not finish setup. Please try again.',
        }),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const clubName = state.clubName ?? 'Anstoss'
  const initials = clubName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join('')

  return (
    <WizardStep
      title={t('onboarding.done.title')}
      ctaLabel={t('onboarding.done.cta')}
      onCta={handleCta}
      ctaLoading={submitting}
      ctaDisabled={submitting}
      progress={1}
    >
      <View style={styles.body}>
        <View style={styles.badgeStage}>
          <ConfettiBurst count={24} durationMs={950} colors={[colors.primary, '#F4C84A', '#A8364E', '#1F5C42', '#A8642A']} />
          <Animated.View
            style={{
              opacity: badgeFade,
              transform: [{ scale: badgeScale }],
            }}
          >
            {state.clubLogoUri ? (
              <Image source={{ uri: state.clubLogoUri }} style={styles.badge} />
            ) : state.clubBadgeUrl ? (
              <Image source={{ uri: state.clubBadgeUrl }} style={styles.badge} />
            ) : (
              <View
                style={[
                  styles.badgePlaceholder,
                  { backgroundColor: state.clubPrimaryColor ?? colors.primary },
                ]}
              >
                <Text variant="title1" weight="bold" color="inverse">
                  {initials || 'A'}
                </Text>
              </View>
            )}
          </Animated.View>
        </View>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('onboarding.done.body', { club: clubName })}
        </Text>
      </View>
    </WizardStep>
  )
}

const BADGE_SIZE = 96

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingTop: space.lg, gap: space.md },
  badgeStage: {
    width: BADGE_SIZE * 2.4,
    height: BADGE_SIZE * 2.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
  },
  badgePlaceholder: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { fontFamily: fonts.body, fontSize: fontSize.md, textAlign: 'center' },
})
