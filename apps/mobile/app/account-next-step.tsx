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
import { ModalHeader } from '../src/components/ModalHeader'
import { useAuth } from '../src/context/AuthContext'
import { neutralColors, radius, space, fontSize, fontWeight, fonts, lineHeight } from '../src/theme/tokens'

export default function AccountNextStepScreen() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()

  const registrationRole = user?.registrationRole as RegistrationRole | undefined
  const isJoinRequestRole =
    registrationRole === RegistrationRole.PLAYER ||
    registrationRole === RegistrationRole.PARENT ||
    registrationRole === RegistrationRole.COACH

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
      <ModalHeader title={t('accountNextStep.title', { defaultValue: '' })} mode="back" />
      <View style={styles.content}>
      <View style={styles.panel}>
        <Ionicons
          name={isJoinRequestRole ? 'search-outline' : 'mail-open-outline'}
          size={36}
          color={neutralColors.textPrimary}
          style={{ marginBottom: space.sm }}
        />

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>

        {isJoinRequestRole ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handlePrimary}
            accessibilityRole="button"
            accessibilityLabel={t('accountNextStep.joinClubAction')}
          >
            <Text style={styles.primaryButtonText}>
              {t('accountNextStep.joinClubAction')}
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel={t('more.signOut')}
        >
          <Text style={styles.secondaryButtonText}>{t('more.signOut')}</Text>
        </TouchableOpacity>
      </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  content: {
    flex: 1,
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
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    fontFamily: fonts.heading,
    color: neutralColors.textPrimary,
  },
  body: {
    fontSize: fontSize.md,
    fontFamily: fonts.body,
    lineHeight: lineHeight.md,
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
    fontFamily: fonts.heading,
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
    fontFamily: fonts.label,
    color: neutralColors.textPrimary,
  },
})
