import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../src/context/AuthContext'
import { api, ApiError } from '../src/api/client'
import {
  formatDateOfBirthInput,
  parseDateOfBirthInput,
} from '../src/utils/dateOfBirth'
import { neutralColors, space, radius, fontSize, fontWeight, fonts } from '../src/theme/tokens'

export default function EnterDobScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { refreshUser } = useAuth()

  const [dobText, setDobText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleTextChange = (text: string) => {
    setDobText(formatDateOfBirthInput(text))
  }

  const handleSubmit = async () => {
    const parsed = parseDateOfBirthInput(dobText)
    if (!parsed) {
      Alert.alert(
        t('auth.dateOfBirthInvalidTitle'),
        t('auth.dateOfBirthInvalidBody'),
      )
      return
    }

    // Basic sanity: must be between 5 and 120 years old
    const now = new Date()
    const age = now.getFullYear() - parsed.date.getFullYear()
    if (age < 5 || age > 120) {
      Alert.alert(
        t('auth.dateOfBirthInvalidTitle'),
        t('auth.dateOfBirthInvalidBody'),
      )
      return
    }

    setIsSubmitting(true)
    try {
      await api('/me', {
        method: 'PATCH',
        body: { dateOfBirth: parsed.iso },
      })
      await refreshUser()
      router.replace('/')
    } catch (error) {
      const msg =
        error instanceof ApiError && error.message
          ? error.message
          : t('common.error')
      Alert.alert(t('common.error'), msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="calendar-outline" size={36} color={neutralColors.textPrimary} />
        </View>

        <Text style={styles.title}>{t('auth.dateOfBirth')}</Text>
        <Text style={styles.body}>{t('auth.dateOfBirthHint')}</Text>

        <TextInput
          style={styles.input}
          value={dobText}
          onChangeText={handleTextChange}
          placeholder={t('auth.dateOfBirthPlaceholder')}
          placeholderTextColor={neutralColors.textTertiary}
          keyboardType="number-pad"
          maxLength={10}
          autoFocus
        />

        <TouchableOpacity
          style={[
            styles.button,
            isSubmitting && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting || dobText.length < 10}
          accessibilityRole="button"
          accessibilityLabel={t('common.confirm')}
        >
          {isSubmitting ? (
            <ActivityIndicator color={neutralColors.textInverse} />
          ) : (
            <Text style={styles.buttonText}>{t('common.confirm')}</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>{t('enterDob.privacyHint')}</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: neutralColors.background },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: neutralColors.surface,
    borderWidth: 1,
    borderColor: neutralColors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: neutralColors.textPrimary,
    textAlign: 'center',
    marginBottom: space.sm,
    fontFamily: fonts.heading,
  },
  body: {
    fontSize: fontSize.md,
    color: neutralColors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: space.md,
    marginBottom: space.xl,
    fontFamily: fonts.body,
  },
  input: {
    width: '100%',
    height: 56,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.medium,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
    textAlign: 'center',
    letterSpacing: 2,
    fontFamily: fonts.data,
  },
  button: {
    width: '100%',
    height: 52,
    borderRadius: radius.md,
    backgroundColor: neutralColors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: space.lg,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: neutralColors.textInverse,
    fontFamily: fonts.label,
  },
  hint: {
    fontSize: fontSize.xs,
    color: neutralColors.textTertiary,
    textAlign: 'center',
    marginTop: space.md,
    paddingHorizontal: space.lg,
    lineHeight: 18,
    fontFamily: fonts.body,
  },
})
