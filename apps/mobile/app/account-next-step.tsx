import { useMemo } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { RegistrationRole } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { ModalHeader } from '../src/components/ModalHeader'
import { useAuth } from '../src/context/AuthContext'
import { setAuthExpiryHandlingSuspended } from '../src/api/client'
import { Screen, Card, Button, Text, Icon } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import { fontSize, fonts, lineHeight, space } from '../src/theme/tokens'

export default function AccountNextStepScreen() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const c = useClubColors()

  const registrationRole = user?.registrationRole as RegistrationRole | undefined
  const isJoinRequestRole = registrationRole === RegistrationRole.PLAYER
  const isParent = registrationRole === RegistrationRole.PARENT
  const isCoach = registrationRole === RegistrationRole.COACH
  const iconName = isJoinRequestRole ? 'magnifyingglass' : isParent ? 'heart' : 'envelope'

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
    if (!isJoinRequestRole) return
    router.replace({ pathname: '/join-club', params: { role: registrationRole } })
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
    >
      <View style={styles.center}>
        <Card padding="card" style={{ gap: space.md }}>
          <Icon name={iconName} size="xl" color="primary" />
          <Text style={[styles.title, { color: c.textPrimary }]}>{title}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>{body}</Text>

          <View style={{ gap: space.sm, marginTop: space.sm }}>
            {isJoinRequestRole ? (
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
              variant="secondary"
              size="md"
              fullWidth
              onPress={handleSignOut}
            />
          </View>
        </Card>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: space.lg,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: fonts.heading,
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
  },
})
