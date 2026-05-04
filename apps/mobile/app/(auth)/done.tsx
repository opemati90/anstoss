/* eslint-disable no-restricted-syntax -- TODO Pass 3 migrate raw spacing/radius/rgba literals to design tokens */
import { useEffect, useRef } from 'react'
import { Animated, Easing, Image, StyleSheet, View } from 'react-native'
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
import { api } from '../../src/api/client'
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

export default function Done() {
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useClubColors()
  const { finalizeSession } = useOnboardingAuth()
  const { state, reset } = useOnboardingFlow()

  // Bloom the badge in: scale 0.7 → 1.0 with a soft ease over 500ms,
  // anchored to the confetti burst that fires on mount.
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
    if (__DEV__ && state.phone === '+15555550100') {
      const scenario = state.role ? DEV_SCENARIO_BY_ROLE[state.role] : 'player'
      await activateE2EScenario(scenario)
      reset()
      router.replace('/')
      return
    }
    await finalizeSession()
    // Persist the name + DOB the user entered in the wizard to our DB.
    // setBasicProfile() only writes to the Clerk user; without this, the
    // JIT user creation in clerk.guard falls back to "Player" when the
    // session-claims JWT template doesn't include first_name.
    // Fire-and-forget: navigation should not wait on this. AuthContext's
    // /me refresh on the next tab will pick up the updated name.
    if (state.firstName || state.dateOfBirth) {
      void api('/me', {
        method: 'PATCH',
        body: {
          ...(state.firstName ? { name: state.firstName } : {}),
          ...(state.dateOfBirth ? { dateOfBirth: state.dateOfBirth } : {}),
        },
      }).catch((err) => {
        if (__DEV__) {
          console.warn('[onboarding/done] persist profile failed:', err)
        }
      })
    }
    reset()
    router.replace('/')
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
            {state.clubBadgeUrl ? (
              <Image source={{ uri: state.clubBadgeUrl }} style={styles.badge} />
            ) : (
              <View style={[styles.badgePlaceholder, { backgroundColor: colors.primary }]}>
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
