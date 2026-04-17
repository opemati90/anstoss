import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  View,
  StyleSheet,
  Image,
  Animated,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { illustrations } from '../src/illustrations'
import {
  Screen,
  Button,
  Text,
  Icon,
  IconButton,
  type IconName,
} from '../src/components/ui'
import { hairline, radius, space } from '../src/theme/tokens'

type OnboardingStep = {
  id: string
  icon: IconName
  titleKey: string
  bodyKey: string
  /** Return true if this step is already completed and should be skipped */
  isComplete: () => boolean
  /** Action label shown on the primary button */
  actionKey?: string
  /** Route to push when the user taps the action */
  actionRoute?: string
}

export default function OnboardingScreen() {
  const { t } = useTranslation()
  const {
    user,
    activeClub,
    activeTeamAccess,
    teamsForActiveClub,
    completeOnboarding,
  } = useAuth()
  const c = useClubColors()

  const clubRole = activeClub?.role ?? MembershipRole.PLAYER
  const teamRole = activeTeamAccess?.role

  // Build role-specific steps
  const steps = useMemo((): OnboardingStep[] => {
    const common: OnboardingStep[] = [
      {
        id: 'welcome',
        icon: 'flag.fill',
        titleKey: 'onboarding.welcomeTitle',
        bodyKey: 'onboarding.welcomeBody',
        isComplete: () => false, // always show
      },
      {
        id: 'profile',
        icon: 'person.circle.fill',
        titleKey: 'onboarding.profileTitle',
        bodyKey: 'onboarding.profileBody',
        isComplete: () => !!user?.name && user.name !== user.email,
        actionKey: 'onboarding.editProfileAction',
        actionRoute: '/edit-profile',
      },
    ]

    if (
      clubRole === MembershipRole.OWNER ||
      clubRole === MembershipRole.ADMIN
    ) {
      return [
        ...common,
        {
          id: 'teams',
          icon: 'person.2.fill',
          titleKey: 'onboarding.adminTeamsTitle',
          bodyKey: 'onboarding.adminTeamsBody',
          isComplete: () => teamsForActiveClub.length > 1,
        },
        {
          id: 'invite',
          icon: 'envelope.fill',
          titleKey: 'onboarding.inviteTitle',
          bodyKey: 'onboarding.inviteBody',
          isComplete: () => false,
          actionKey: 'onboarding.inviteAction',
          actionRoute: '/invite',
        },
      ]
    }

    if (
      clubRole === MembershipRole.COACH ||
      teamRole === 'HEAD_COACH' ||
      teamRole === 'ASSISTANT_COACH'
    ) {
      return [
        ...common,
        {
          id: 'team',
          icon: 'figure.soccer.fill',
          titleKey: 'onboarding.coachTeamTitle',
          bodyKey: 'onboarding.coachTeamBody',
          isComplete: () => !!activeTeamAccess,
        },
        {
          id: 'invite',
          icon: 'envelope.fill',
          titleKey: 'onboarding.inviteTitle',
          bodyKey: 'onboarding.inviteBody',
          isComplete: () => false,
          actionKey: 'onboarding.inviteAction',
          actionRoute: '/invite',
        },
      ]
    }

    if (clubRole === MembershipRole.PARENT) {
      return [
        ...common,
        {
          id: 'child',
          icon: 'heart.fill',
          titleKey: 'onboarding.parentChildTitle',
          bodyKey: 'onboarding.parentChildBody',
          isComplete: () => false,
        },
        {
          id: 'schedule',
          icon: 'calendar.fill',
          titleKey: 'onboarding.parentScheduleTitle',
          bodyKey: 'onboarding.parentScheduleBody',
          isComplete: () => false,
        },
      ]
    }

    // Default: player path
    return [
      ...common,
      {
        id: 'team',
        icon: 'figure.soccer.fill',
        titleKey: 'onboarding.playerTeamTitle',
        bodyKey: 'onboarding.playerTeamBody',
        isComplete: () => !!activeTeamAccess,
      },
      {
        id: 'events',
        icon: 'calendar.fill',
        titleKey: 'onboarding.playerEventsTitle',
        bodyKey: 'onboarding.playerEventsBody',
        isComplete: () => false,
      },
    ]
  }, [clubRole, teamRole, user, activeTeamAccess, teamsForActiveClub])

  // Filter out already-completed steps (except welcome)
  const activeSteps = useMemo(
    () => steps.filter((s) => s.id === 'welcome' || !s.isComplete()),
    [steps],
  )

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFinishing, setIsFinishing] = useState(false)
  const [isRestored, setIsRestored] = useState(false)

  // Animation
  const fadeAnim = useRef(new Animated.Value(1)).current
  const slideAnim = useRef(new Animated.Value(0)).current

  // Persist step index to AsyncStorage
  const storageKey = `anstoss:onboarding-step:${user?.id ?? ''}`

  useEffect(() => {
    if (!user?.id) return
    AsyncStorage.getItem(storageKey).then((val) => {
      if (val) {
        const saved = parseInt(val, 10)
        if (!isNaN(saved) && saved > 0 && saved < activeSteps.length) {
          setCurrentIndex(saved)
        }
      }
      setIsRestored(true)
    })
  }, [user?.id, storageKey, activeSteps.length])

  useEffect(() => {
    if (isRestored && user?.id) {
      AsyncStorage.setItem(storageKey, String(currentIndex))
    }
  }, [currentIndex, isRestored, storageKey, user?.id])

  const animateTransition = useCallback(
    (next: number) => {
      const direction = next > currentIndex ? 1 : -1
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: direction * -30,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentIndex(next)
        slideAnim.setValue(direction * 30)
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start()
      })
    },
    [currentIndex, fadeAnim, slideAnim],
  )

  // Clamp index if activeSteps shrinks (e.g. profile updated mid-onboarding)
  const safeIndex = Math.min(currentIndex, Math.max(activeSteps.length - 1, 0))
  const step = activeSteps[safeIndex]
  const isLast = safeIndex === activeSteps.length - 1
  const clubName = activeClub?.club.name ?? ''

  const handleFinish = useCallback(async () => {
    if (isFinishing) return
    setIsFinishing(true)
    try {
      await AsyncStorage.removeItem(storageKey)
      await completeOnboarding()
    } finally {
      router.replace('/(tabs)')
    }
  }, [completeOnboarding, isFinishing, storageKey])

  const handleNext = useCallback(() => {
    if (isLast) {
      handleFinish()
    } else {
      animateTransition(Math.min(safeIndex + 1, activeSteps.length - 1))
    }
  }, [isLast, handleFinish, animateTransition, safeIndex, activeSteps.length])

  const handleAction = useCallback(() => {
    if (step?.actionRoute) {
      router.push(step.actionRoute as string & {})
    }
  }, [step])

  if (!step) {
    if (!isFinishing) handleFinish()
    return <View style={{ flex: 1, backgroundColor: c.background }} />
  }

  const roleLabel = t(`roles.${clubRole}`)
  const progressPercent = ((safeIndex + 1) / activeSteps.length) * 100
  const isWelcomeStep = step.id === 'welcome'

  return (
    <Screen padded={false}>
      <View style={styles.container}>
        {/* Progress bar */}
        <View style={styles.progressBlock}>
          <View
            style={[styles.progressTrack, { backgroundColor: c.border }]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: c.primary,
                  width: `${progressPercent}%`,
                },
              ]}
            />
          </View>
          <Text
            variant="caption2"
            color="tertiary"
            tracking="wide"
            align="center"
            style={styles.stepCounter}
          >
            {t('onboarding.stepCounter', {
              current: safeIndex + 1,
              total: activeSteps.length,
              defaultValue: `${safeIndex + 1} / ${activeSteps.length}`,
            }).toUpperCase()}
          </Text>
        </View>

        {/* Animated step content */}
        <Animated.View
          style={[
            styles.stepBody,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Club badge / context */}
          {activeClub?.club.badgeUrl ? (
            <Image
              source={{ uri: activeClub.club.badgeUrl }}
              style={[styles.badge, { borderColor: c.border }]}
              resizeMode="contain"
            />
          ) : null}

          {currentIndex === 0 && clubName ? (
            <Text
              variant="caption2"
              color="tertiary"
              tracking="wide"
              align="center"
              style={styles.welcomeEyebrow}
            >
              {`${clubName} · ${roleLabel}`.toUpperCase()}
            </Text>
          ) : null}

          {isWelcomeStep ? (
            <View style={styles.heroWrap}>
              <Image
                testID="onboarding-hero-illustration"
                source={illustrations.onboardingHero}
                style={styles.heroIllustration}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <Text
                variant="caption2"
                color="tertiary"
                tracking="wide"
                align="center"
                style={styles.brand}
              >
                ANSTOSS
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: hexWithAlpha(c.primary, 0.1),
                },
              ]}
            >
              <Icon name={step.icon} size={64} color="tint" />
            </View>
          )}

          <Text variant="title1" color="primary" align="center" style={styles.title}>
            {t(step.titleKey, { clubName, role: roleLabel })}
          </Text>
          <Text
            variant="body"
            color="secondary"
            align="center"
            style={styles.body}
          >
            {t(step.bodyKey, { clubName, role: roleLabel })}
          </Text>

          {/* Optional action button */}
          {step.actionKey && step.actionRoute ? (
            <View style={styles.actionWrap}>
              <Button
                label={t(step.actionKey)}
                variant="tinted"
                size="lg"
                onPress={handleAction}
              />
            </View>
          ) : null}
        </Animated.View>
      </View>

      {/* Bottom buttons */}
      <View style={styles.bottom}>
        {safeIndex > 0 ? (
          <IconButton
            onPress={() => animateTransition(Math.max(safeIndex - 1, 0))}
            accessibilityLabel={t('common.back')}
          >
            <Icon name="chevron.left" size="md" color="secondary" />
          </IconButton>
        ) : (
          <View style={styles.skipWrap}>
            <Button
              label={t('onboarding.skipAll')}
              variant="plain"
              size="sm"
              onPress={handleFinish}
              disabled={isFinishing}
            />
          </View>
        )}

        <View style={{ flex: 1 }}>
          <Button
            label={isLast ? t('onboarding.finish') : t('common.next')}
            variant="filled"
            size="lg"
            fullWidth
            loading={isFinishing}
            onPress={handleNext}
          />
        </View>
      </View>
    </Screen>
  )
}

function hexWithAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingTop: space['2xl'],
    alignItems: 'stretch',
  },
  progressBlock: {
    gap: space.xs,
    marginBottom: space['2xl'],
  },
  progressTrack: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  stepCounter: {
    marginTop: space.xs,
  },
  stepBody: {
    alignItems: 'center',
    width: '100%',
    flex: 1,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    marginBottom: space.lg,
    borderWidth: hairline,
  },
  welcomeEyebrow: {
    marginBottom: space.sm,
  },
  heroWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: space.sm,
    marginBottom: space.xl,
  },
  heroIllustration: {
    width: '82%',
    maxWidth: 260,
    height: 156,
  },
  brand: {
    marginTop: space.xs,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 32,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
    marginBottom: space.xl,
  },
  title: {
    marginBottom: space.sm,
    paddingHorizontal: space.md,
  },
  body: {
    paddingHorizontal: space.md,
    maxWidth: 360,
  },
  actionWrap: {
    marginTop: space.lg,
    alignSelf: 'stretch',
  },
  bottom: {
    paddingHorizontal: space.lg,
    paddingBottom: space['2xl'],
    paddingTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  skipWrap: {
    minWidth: 80,
  },
})
