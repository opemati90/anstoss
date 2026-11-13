import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Banner, Button, Icon, Text } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useClubColors } from '../context/ClubThemeContext'
import { radius, space, RADIUS_CARD } from '../theme/tokens'
import { clearWelcomeNotice, readWelcomeNotice, type WelcomeNotice } from './welcomeNotice'

/**
 * Everything onboarding still has to say once the user is on home:
 *  - "Dein Verein wird geprüft" for a club admin whose claim is being
 *    checked: a full home state saying what happens next and what they can
 *    prepare meanwhile (H6: the club only exists after the check, so nothing
 *    pretends invites or Beiträge already work),
 *  - "Kind hinzufügen" for a parent with no child linked yet,
 *  - a one-time "Willkommen bei …" after joining.
 * Mount it at the top of the home tab; it renders nothing when there is
 * nothing to say.
 */
export function HomeOnboardingNotices() {
  const { t } = useTranslation()
  const { user, activeClub, pendingClubClaim, teamMembers, activeRoleMode } = useAuth()
  const [welcome, setWelcome] = useState<WelcomeNotice | null>(null)

  useEffect(() => {
    let alive = true
    if (!user?.id) {
      setWelcome(null)
      return
    }
    void readWelcomeNotice(user.id).then((notice) => {
      if (alive) setWelcome(notice)
    })
    return () => {
      alive = false
    }
  }, [user?.id])

  const verification =
    !activeClub && !!pendingClubClaim && user?.registrationRole === 'CLUB_ADMIN'
      ? pendingClubClaim
      : null

  const isParentMode =
    activeRoleMode === 'PARENT' || (activeRoleMode === null && activeClub?.role === 'PARENT')
  const hasLinkedChild = (teamMembers ?? []).some(
    (access) =>
      access.role === 'PARENT' &&
      access.team.clubId === activeClub?.club.id &&
      (access.status == null || access.status === 'ACTIVE'),
  )
  const needsChild = !!activeClub && isParentMode && !hasLinkedChild

  const showWelcome = !!welcome && !!activeClub && welcome.clubId === activeClub.club.id

  if (!verification && !needsChild && !showWelcome) return null

  return (
    <View style={styles.stack}>
      {verification ? <ClubVerificationHome claim={verification} /> : null}
      {showWelcome && welcome ? (
        <Banner
          tone="success"
          icon="checkmark.circle.fill"
          title={t('onboardingFlow.home.welcomeTitle', { club: welcome.clubName })}
          description={t('onboardingFlow.home.welcomeBody')}
          onDismiss={() => {
            setWelcome(null)
            if (user?.id) void clearWelcomeNotice(user.id)
          }}
          testID="home-welcome-banner"
        />
      ) : null}
      {needsChild ? (
        <Banner
          tone="tint"
          icon="figure.and.child.holdinghands"
          title={t('onboardingFlow.home.addChildTitle')}
          description={t('onboardingFlow.home.addChildBody')}
          action={{
            label: t('onboardingFlow.home.addChildAction'),
            onPress: () => router.push('/(auth)/parent-handoff'),
          }}
          testID="home-add-child"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: space.sm, marginBottom: space.md },
  verification: { gap: space.md },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    minHeight: 28,
    paddingHorizontal: space.sm,
    borderRadius: radius.full,
  },
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: RADIUS_CARD,
    borderCurve: 'continuous',
  },
  step: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  stepText: { flex: 1, minWidth: 0 },
})

/**
 * H6, honest landing: the club admin's home while Anstoss checks the claim.
 * Decision: no provisional club (the Club model has no verification state
 * and invites, Beiträge and the public listing live in many modules), so the
 * home says plainly what happens next and what can be prepared offline.
 */
export function ClubVerificationHome({
  claim,
}: {
  claim: { id: string; status: 'SUBMITTED' | 'NEEDS_INFO' }
}) {
  const { t } = useTranslation()
  const c = useClubColors()
  const needsInfo = claim.status === 'NEEDS_INFO'
  const openClaim = () =>
    router.push({ pathname: '/(auth)/claim-pending', params: { claimId: claim.id } })
  return (
    <View style={styles.verification} testID="home-verification">
      <View style={[styles.statusPill, { backgroundColor: needsInfo ? c.warningBg : c.primary50 }]}>
        <Icon
          name={needsInfo ? 'exclamationmark.circle.fill' : 'clock.fill'}
          size={14}
          color={needsInfo ? c.warning : c.primary}
        />
        <Text variant="caption1" weight="semibold" color={needsInfo ? 'warning' : 'tint'}>
          {needsInfo
            ? t('onboardingFlow.home.verificationNeedsInfoTitle')
            : t('onboardingFlow.home.verificationStatus')}
        </Text>
      </View>
      <Text variant="title2" accessibilityRole="header">
        {t('onboardingFlow.home.verificationTitle')}
      </Text>
      <Text variant="body" color="secondary">
        {needsInfo
          ? t('onboardingFlow.home.verificationNeedsInfoBody')
          : t('onboardingFlow.home.verificationBody')}
      </Text>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
        <Text variant="headline" weight="semibold">
          {t('onboardingFlow.home.verificationNextTitle')}
        </Text>
        <Step icon="checkmark.shield" text={t('onboardingFlow.home.verificationNext1')} />
        <Step icon="bell.fill" text={t('onboardingFlow.home.verificationNext2')} />
        <Step icon="person.2.fill" text={t('onboardingFlow.home.verificationNext3')} />
      </View>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.borderSubtle }]}>
        <Text variant="headline" weight="semibold">
          {t('onboardingFlow.home.verificationPrepareTitle')}
        </Text>
        <Step icon="list.bullet" text={t('onboardingFlow.home.verificationPrepare1')} />
        <Step icon="photo" text={t('onboardingFlow.home.verificationPrepare2')} />
        <Step icon="calendar" text={t('onboardingFlow.home.verificationPrepare3')} />
      </View>

      <Button
        label={
          needsInfo
            ? t('onboardingFlow.home.verificationAnswer')
            : t('onboardingFlow.home.verificationAction')
        }
        variant={needsInfo ? 'filled' : 'bordered'}
        onPress={openClaim}
        fullWidth
        testID="home-verification-details"
      />
    </View>
  )
}

function Step({ icon, text }: { icon: string; text: string }) {
  const c = useClubColors()
  return (
    <View style={styles.step}>
      <Icon name={icon} size={18} color={c.textSecondary} />
      <Text variant="subheadline" color="secondary" style={styles.stepText}>
        {text}
      </Text>
    </View>
  )
}
