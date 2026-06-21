import { useMemo } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { RegistrationRole } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import { useAuth } from '../src/context/AuthContext'
import { setAuthExpiryHandlingSuspended } from '../src/api/client'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { fontSize, fonts, hairline, lineHeight, radius, space } from '../src/theme/tokens'

const STEP_KEYS = {
  player: [
    'accountNextStep.playerStepSearch',
    'accountNextStep.playerStepRequest',
    'accountNextStep.playerStepApproval',
  ],
  parent: [
    'accountNextStep.parentStepCode',
    'accountNextStep.parentStepConfirm',
    'accountNextStep.parentStepSchedule',
  ],
  coach: [
    'accountNextStep.coachStepAsk',
    'accountNextStep.coachStepOpen',
    'accountNextStep.coachStepUnlock',
  ],
} as const

function normalizeRegistrationRole(role: unknown): RegistrationRole | undefined {
  return Object.values(RegistrationRole).includes(role as RegistrationRole)
    ? (role as RegistrationRole)
    : undefined
}

export default function AccountNextStepScreen() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const c = useClubColors()

  const registrationRole = normalizeRegistrationRole(user?.registrationRole)
  const isParent = registrationRole === RegistrationRole.PARENT
  const isCoach = registrationRole === RegistrationRole.COACH
  const isPlayerHandoff = !isParent && !isCoach
  const iconName = isCoach ? 'envelope' : isParent ? 'heart' : 'magnifyingglass'
  const steps = isCoach ? STEP_KEYS.coach : isParent ? STEP_KEYS.parent : STEP_KEYS.player

  const title = useMemo(() => {
    if (registrationRole === RegistrationRole.COACH) return t('accountNextStep.coachTitle')
    if (registrationRole === RegistrationRole.PARENT) return t('accountNextStep.parentTitle')
    return t('accountNextStep.playerTitle')
  }, [registrationRole, t])

  const body = useMemo(() => {
    if (registrationRole === RegistrationRole.COACH) return t('accountNextStep.coachBody')
    if (registrationRole === RegistrationRole.PARENT) return t('accountNextStep.parentBody')
    return t('accountNextStep.playerBody')
  }, [registrationRole, t])

  const handlePrimary = () => {
    if (!isPlayerHandoff) return
    router.replace({
      pathname: '/join-club',
      params: { role: registrationRole ?? RegistrationRole.PLAYER },
    })
  }

  const handleSignOut = () => {
    setAuthExpiryHandlingSuspended(true)
    Alert.alert(t('more.signOutTitle'), t('more.signOutBody'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
        onPress: () => setAuthExpiryHandlingSuspended(false),
      },
      {
        text: t('more.signOut'),
        style: 'destructive',
        onPress: () => {
          void signOut()
          router.replace('/(auth)/welcome')
        },
      },
    ])
  }

  return (
    <Screen
      header={<ModalHeader title={t('accountNextStep.title', { defaultValue: '' })} mode="back" />}
      padded={false}
      scroll
      contentStyle={styles.screenContent}
    >
      <View style={styles.center}>
        <View style={styles.hero}>
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: c.primary50, borderColor: c.borderDefault },
            ]}
          >
            <Icon name={iconName} size="xl" color="primary" />
          </View>
          <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>{body}</Text>
        </View>

        <View style={[styles.panel, { borderTopColor: c.borderDefault }]}>
          <Text style={[styles.eyebrow, { color: c.textTertiary }]}>
            {t('accountNextStep.nextUp').toUpperCase()}
          </Text>
          <View style={styles.stepList}>
            {steps.map((stepKey, index) => (
              <View key={stepKey} style={styles.stepRow}>
                <View style={[styles.stepIcon, { backgroundColor: c.successBg }]}>
                  <Icon name="checkmark.circle.fill" size={18} color="success" />
                </View>
                <Text style={[styles.stepText, { color: c.textPrimary }]}>
                  {t(stepKey, { count: index + 1 })}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.spacer} />

        <View style={styles.actions}>
          {isPlayerHandoff ? (
            <Button
              label={t('accountNextStep.joinClubAction')}
              variant="filled"
              size="lg"
              fullWidth
              onPress={handlePrimary}
            />
          ) : null}
          {isCoach ? (
            <Button
              label={t('joinCode.title', { defaultValue: 'Enter invite code' })}
              variant="filled"
              size="lg"
              fullWidth
              onPress={() => router.push('/join-code')}
            />
          ) : null}
          {isParent ? (
            <Button
              label={t('parentHandoff.title', { defaultValue: 'Set up your child' })}
              variant="filled"
              size="lg"
              fullWidth
              onPress={() => router.push('/(auth)/parent-handoff')}
            />
          ) : null}
          <Button
            label={t('more.signOut')}
            variant="bordered"
            size="md"
            fullWidth
            onPress={handleSignOut}
          />
        </View>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screenContent: { flexGrow: 1 },
  center: {
    flex: 1,
    padding: space.lg,
    paddingTop: space.xl,
  },
  hero: { gap: space.sm },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontFamily: fonts.heading,
    fontWeight: '800',
    lineHeight: fontSize['3xl'] * 1.12,
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
  },
  panel: {
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: hairline,
  },
  eyebrow: {
    fontSize: fontSize.xs,
    fontFamily: fonts.label,
    fontWeight: '700',
    marginBottom: space.md,
  },
  stepList: { gap: space.md },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    fontFamily: fonts.body,
  },
  spacer: { flex: 1, minHeight: space.xl },
  actions: {
    paddingTop: space.xl,
    gap: space.sm,
  },
})
