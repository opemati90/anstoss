import { useMemo } from 'react'
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { RegistrationRole } from '@anstoss/shared'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { neutralColors, radius, space, fontSize, fontWeight } from '../src/theme/tokens'

export default function AccountNextStepScreen() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()

  const registrationRole = user?.registrationRole as RegistrationRole | undefined
  const isJoinRequestRole =
    registrationRole === RegistrationRole.PLAYER ||
    registrationRole === RegistrationRole.PARENT

  const title = useMemo(() => {
    if (registrationRole === RegistrationRole.COACH) {
      return t('accountNextStep.coachTitle')
    }

    if (registrationRole === RegistrationRole.PARENT) {
      return t('accountNextStep.parentTitle')
    }

    return t('accountNextStep.playerTitle')
  }, [registrationRole, t])

  const body = useMemo(() => {
    if (registrationRole === RegistrationRole.COACH) {
      return t('accountNextStep.coachBody')
    }

    if (registrationRole === RegistrationRole.PARENT) {
      return t('accountNextStep.parentBody')
    }

    return t('accountNextStep.playerBody')
  }, [registrationRole, t])

  const handlePrimary = () => {
    if (!isJoinRequestRole) {
      return
    }

    router.replace({
      pathname: '/join-club',
      params: {
        role: registrationRole,
      },
    })
  }

  const handleSignOut = () => {
    Alert.alert(t('more.signOutTitle'), t('more.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('more.signOut'),
        style: 'destructive',
        onPress: async () => {
          await signOut()
          router.replace('/(auth)/sign-in')
        },
      },
    ])
  }

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <View style={styles.iconCircle}>
          <Ionicons
            name={isJoinRequestRole ? 'search-outline' : 'mail-open-outline'}
            size={30}
            color={neutralColors.textPrimary}
          />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>

        {isJoinRequestRole ? (
          <TouchableOpacity style={styles.primaryButton} onPress={handlePrimary}>
            <Text style={styles.primaryButtonText}>
              {t('accountNextStep.joinClubAction')}
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.secondaryButton} onPress={handleSignOut}>
          <Text style={styles.secondaryButtonText}>{t('more.signOut')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
    justifyContent: 'center',
    padding: space.lg,
  },
  panel: {
    backgroundColor: neutralColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: neutralColors.border,
    padding: space.xl,
    gap: space.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: neutralColors.border,
    backgroundColor: neutralColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
  },
  body: {
    fontSize: fontSize.md,
    lineHeight: 24,
    color: neutralColors.textSecondary,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: neutralColors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.sm,
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: neutralColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
  },
})
