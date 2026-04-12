import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { InlineError } from '../src/components/InlineError'
import { useAuth } from '../src/context/AuthContext'
import { api, ApiError } from '../src/api/client'
import {
  formatDateOfBirthInput,
  parseDateOfBirthInput,
} from '../src/utils/dateOfBirth'
import { Screen, Button, Text, Icon } from '../src/components/ui'
import { useClubColors } from '../src/context/ClubThemeContext'
import {
  fonts,
  fontSize,
  hairline,
  radius,
  space,
} from '../src/theme/tokens'

export default function EnterDobScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { refreshUser } = useAuth()
  const c = useClubColors()

  const [dobText, setDobText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dobError, setDobError] = useState<string | null>(null)

  const handleTextChange = (text: string) => {
    setDobText(formatDateOfBirthInput(text))
    setDobError(null)
  }

  const handleSubmit = async () => {
    const parsed = parseDateOfBirthInput(dobText)
    if (!parsed) {
      setDobError(t('auth.dateOfBirthInvalidBody'))
      return
    }

    const now = new Date()
    let age = now.getFullYear() - parsed.date.getFullYear()
    const monthDiff = now.getMonth() - parsed.date.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.date.getDate())) {
      age--
    }
    if (age < 5 || age > 120) {
      setDobError(t('auth.dateOfBirthInvalidBody'))
      return
    }

    setIsSubmitting(true)
    try {
      await api('/me', { method: 'PATCH', body: { dateOfBirth: parsed.iso } })
      await refreshUser()
      router.replace('/')
    } catch (error) {
      const msg =
        error instanceof ApiError && error.message ? error.message : t('common.error')
      setDobError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <View
            style={[
              styles.iconTile,
              { backgroundColor: hexWithAlpha(c.clubPrimary, 0.1) },
            ]}
          >
            <Icon name="calendar.fill" size={64} color="tint" />
          </View>

          <Text variant="title1" color="primary" align="center" style={styles.title}>
            {t('auth.dateOfBirth')}
          </Text>
          <Text variant="body" color="secondary" align="center" style={styles.body}>
            {t('auth.dateOfBirthHint')}
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: c.surface,
                borderColor: dobError ? c.error : c.border,
                color: c.textPrimary,
              },
            ]}
            value={dobText}
            onChangeText={handleTextChange}
            placeholder={t('auth.dateOfBirthPlaceholder')}
            placeholderTextColor={c.textTertiary}
            keyboardType="number-pad"
            maxLength={10}
            autoFocus
          />
          <InlineError message={dobError} />

          <Button
            label={t('common.confirm')}
            variant="filled"
            size="lg"
            fullWidth
            loading={isSubmitting}
            disabled={dobText.length < 10}
            onPress={handleSubmit}
            style={{ marginTop: space.lg }}
          />

          <Text
            variant="footnote"
            color="tertiary"
            align="center"
            style={styles.hint}
          >
            {t('enterDob.privacyHint')}
          </Text>
        </View>
      </KeyboardAvoidingView>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.lg,
  },
  iconTile: {
    width: 112,
    height: 112,
    borderRadius: 28,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.xl,
  },
  title: {
    marginBottom: space.sm,
    paddingHorizontal: space.md,
  },
  body: {
    paddingHorizontal: space.md,
    marginBottom: space.xl,
    maxWidth: 360,
  },
  input: {
    width: '100%',
    maxWidth: 360,
    height: 60,
    borderWidth: hairline,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: space.md,
    fontSize: fontSize['2xl'],
    textAlign: 'center',
    letterSpacing: 2,
    fontFamily: fonts.data,
  },
  hint: {
    marginTop: space.md,
    paddingHorizontal: space.lg,
    maxWidth: 360,
  },
})
