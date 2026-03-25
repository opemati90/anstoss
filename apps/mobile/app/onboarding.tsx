import { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native'
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

  const step = activeSteps[currentIndex]
  const isLast = currentIndex === activeSteps.length - 1
  const clubName = activeClub?.club.name ?? ''

  const handleNext = useCallback(() => {
    if (isLast) {
      handleFinish()
    } else {
      setCurrentIndex((i) => i + 1)
    }
  }, [isLast, currentIndex])

  const handleFinish = useCallback(async () => {
    setIsFinishing(true)
    await completeOnboarding()
    router.replace('/(tabs)')
  }, [completeOnboarding])

  const handleAction = useCallback(() => {
    if (step?.actionRoute) {
      router.push(step.actionRoute as never)
    }
  }, [step])

  if (!step) {
    // Edge case: all steps filtered out
    handleFinish()
    return null
  }

  const roleLabel = t(`roles.${clubRole}`)

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <View style={styles.stepRow}>
          {activeSteps.map((s, i) => (
            <View
              key={s.id}
              style={[
                styles.stepDot,
                i <= currentIndex && { backgroundColor: theme.clubPrimary },
              ]}
            />
          ))}
        </View>

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
      </ScrollView>

      {/* Bottom buttons */}
      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleFinish}
          disabled={isFinishing}
        >
          <Text style={styles.skipText}>{t('onboarding.skipAll')}</Text>
        </TouchableOpacity>

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
  stepRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: space.xl,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: neutralColors.border,
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
