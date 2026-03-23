import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useAuth } from '../../src/context/AuthContext'
import { neutralColors, semanticColors } from '../../src/theme/tokens'

const MIN_AGE = 16 // GDPR Article 8, Germany = 16

function isOldEnough(dobStr: string): boolean {
  const dob = new Date(dobStr)
  if (isNaN(dob.getTime())) return false
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age >= MIN_AGE
}

type Step = 'email' | 'age-gate' | 'code'

export default function SignInScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<Step>('email')
  const [code, setCode] = useState('')

  const handleSendCode = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.')
      return
    }
    // Go to age gate before sending code
    setStep('age-gate')
  }

  const handleAgeGate = () => {
    if (!dob.trim()) {
      Alert.alert('Date of birth required', 'Please enter your date of birth (YYYY-MM-DD).')
      return
    }
    if (!isOldEnough(dob.trim())) {
      Alert.alert(
        'Age Restriction',
        `You must be at least ${MIN_AGE} years old to use Anstoss (GDPR Art. 8).`,
      )
      return
    }
    // Age verified — proceed to code entry
    setIsLoading(true)
    // Dev mode: skip Clerk, go straight to code entry
    setTimeout(() => {
      setStep('code')
      setIsLoading(false)
      Alert.alert('Dev Mode', `Enter any 6-digit code to sign in as ${email}`)
    }, 300)
  }

  const handleVerifyCode = async () => {
    if (!code.trim()) return
    setIsLoading(true)
    try {
      // Dev auth: token format "dev_{email}" — the API's ClerkAuthGuard
      // accepts this in development mode and creates/finds a user by email
      await signIn(`dev_${email.trim()}`)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Invalid code')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.logo}>Anstoss</Text>
          <Text style={styles.tagline}>Der Anstoss fur deinen Verein.</Text>
        </View>

        {step === 'email' && (
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={neutralColors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSendCode}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>Continue with Email</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'age-gate' && (
          <View style={styles.form}>
            <Text style={styles.label}>Date of Birth</Text>
            <Text style={styles.hint}>
              You must be at least {MIN_AGE} to use Anstoss (GDPR).
            </Text>
            <TextInput
              style={styles.input}
              value={dob}
              onChangeText={setDob}
              placeholder="2000-06-15"
              placeholderTextColor={neutralColors.textTertiary}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleAgeGate}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Continue</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => setStep('email')}
            >
              <Text style={styles.backLinkText}>Use a different email</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 'code' && (
          <View style={styles.form}>
            <Text style={styles.label}>Enter verification code</Text>
            <Text style={styles.hint}>Sent to {email}</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              placeholderTextColor={neutralColors.textTertiary}
              keyboardType="number-pad"
              maxLength={6}
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleVerifyCode}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backLink}
              onPress={() => {
                setStep('email')
                setCode('')
                setDob('')
              }}
            >
              <Text style={styles.backLinkText}>Use a different email</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: neutralColors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 40,
    fontWeight: '700',
    color: neutralColors.textPrimary,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: neutralColors.textSecondary,
    marginTop: 8,
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: neutralColors.textPrimary,
  },
  hint: {
    fontSize: 14,
    color: neutralColors.textSecondary,
    marginTop: -8,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: neutralColors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    color: neutralColors.textPrimary,
    backgroundColor: neutralColors.surface,
  },
  button: {
    height: 52,
    borderRadius: 8,
    backgroundColor: '#1A1A18',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  backLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  backLinkText: {
    fontSize: 14,
    color: neutralColors.textSecondary,
    textDecorationLine: 'underline',
  },
})
