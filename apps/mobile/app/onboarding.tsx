import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Animated,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { MembershipRole } from '@anstoss/shared'
import { useAuth } from '../src/context/AuthContext'
import { useClubColors } from '../src/context/ClubThemeContext'
import { neutralColors, radius, space, fontSize, fontWeight } from '../src/theme/tokens'

type OnboardingStep = {
  id: string
  icon: keyof typeof Ionicons.glyphMap
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
  const theme = useClubColors()

  const clubRole = activeClub?.role ?? MembershipRole.PLAYER
  const teamRole = activeTeamAccess?.role

  // Build role-specific steps
  const steps = useMemo((): OnboardingStep[] => {
    const common: OnboardingStep[] = [
      {
        id: 'welcome',
        icon: 'flag-outline',
        titleKey: 'onboarding.welcomeTitle',
        bodyKey: 'onboarding.welcomeBody',
        isComplete: () => false, // always show
      },
      {
        id: 'profile',
        icon: 'person-outline',
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
          icon: 'people-outline',
          titleKey: 'onboarding.adminTeamsTitle',
          bodyKey: 'onboarding.adminTeamsBody',
          isComplete: () => teamsForActiveClub.length > 1,
        },
        {
          id: 'invite',
          icon: 'mail-outline',
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
          icon: 'football-outline',
          titleKey: 'onboarding.coachTeamTitle',
          bodyKey: 'onboarding.coachTeamBody',
          isComplete: () => !!activeTeamAccess,
        },
        {
          id: 'invite',
          icon: 'mail-outline',
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
          icon: 'heart-outline',
          titleKey: 'onboarding.parentChildTitle',
          bodyKey: 'onboarding.parentChildBody',
          isComplete: () => false,
        },
        {
          id: 'schedule',
          icon: 'calendar-outline',
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
        icon: 'football-outline',
        titleKey: 'onboarding.playerTeamTitle',
        bodyKey: 'onboarding.playerTeamBody',
        isComplete: () => !!activeTeamAccess,
      },
      {
        id: 'events',
        icon: 'calendar-outline',
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
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isRestored && user?.id) {
      AsyncStorage.setItem(storageKey, String(currentIndex))
    }
  }, [currentIndex, isRestored]) // eslint-disable-line react-hooks/exhaustive-deps

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
    return <View style={styles.container} />
  }

  const roleLabel = t(`roles.${clubRole}`)

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: theme.clubPrimary,
                width: `${((safeIndex + 1) / activeSteps.length) * 100}%`,
              },
            ]}
          />
        </View>

        <Text style={styles.stepCounter}>
          {safeIndex + 1} / {activeSteps.length}
        </Text>

        {/* Animated step content */}
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
            alignItems: 'center',
            width: '100%',
          }}
        >
          {/* Club badge / context */}
          {activeClub?.club.badgeUrl ? (
            <Image
              source={{ uri: activeClub.club.badgeUrl }}
              style={styles.badge}
              resizeMode="contain"
            />
          ) : null}

          {currentIndex === 0 ? (
            <View style={styles.welcomeHeader}>
              <Text style={styles.welcomeEyebrow}>
                {clubName} · {roleLabel}
              </Text>
            </View>
          ) : null}

          {/* Step content */}
          <View style={styles.iconWrap}>
            <Ionicons
              name={step.icon}
              size={40}
              color={theme.clubPrimary}
            />
          </View>

          <Text style={styles.title}>
            {t(step.titleKey, { clubName, role: roleLabel })}
          </Text>
          <Text style={styles.body}>
            {t(step.bodyKey, { clubName, role: roleLabel })}
          </Text>

          {/* Optional action button */}
          {step.actionKey && step.actionRoute ? (
            <TouchableOpacity
              style={[styles.actionButton, { borderColor: theme.clubPrimary }]}
              onPress={handleAction}
            >
              <Text style={[styles.actionButtonText, { color: theme.clubPrimary }]}>
                {t(step.actionKey)}
              </Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>
      </ScrollView>

      {/* Bottom buttons */}
      <View style={styles.bottom}>
        {safeIndex > 0 ? (
          <TouchableOpacity
            style={styles.backStepButton}
            onPress={() => animateTransition(Math.max(safeIndex - 1, 0))}
          >
            <Ionicons name="chevron-back" size={20} color={neutralColors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleFinish}
            disabled={isFinishing}
          >
            <Text style={styles.skipText}>{t('onboarding.skipAll')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.nextButton,
            { backgroundColor: theme.clubPrimary },
            isFinishing && styles.buttonDisabled,
          ]}
          onPress={handleNext}
          disabled={isFinishing}
        >
          {isFinishing ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.nextText}>
              {isLast ? t('onboarding.finish') : t('common.next')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: 80,
    paddingBottom: space.xl,
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: neutralColors.border,
    marginBottom: space.sm,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  stepCounter: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: neutralColors.textTertiary,
    marginBottom: space.xl,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginBottom: space.lg,
  },
  welcomeHeader: {
    marginBottom: space.sm,
  },
  welcomeEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: neutralColors.textTertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: neutralColors.surface,
    borderWidth: 1,
    borderColor: neutralColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    textAlign: 'center',
    marginBottom: space.sm,
  },
  body: {
    fontSize: fontSize.md,
    lineHeight: 24,
    color: neutralColors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: space.md,
  },
  actionButton: {
    marginTop: space.lg,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  bottom: {
    paddingHorizontal: space.lg,
    paddingBottom: 40,
    paddingTop: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  backStepButton: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  skipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: neutralColors.textTertiary,
  },
  nextButton: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
