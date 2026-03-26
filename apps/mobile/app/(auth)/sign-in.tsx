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
import { useSignIn, useSignUp } from '@clerk/clerk-expo'
import { neutralColors } from '../../src/theme/tokens'

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
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn()
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp()
  const [email, setEmail] = useState('')
  const [dob, setDob] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<Step>('email')
  const [code, setCode] = useState('')
  const [isNewUser, setIsNewUser] = useState(false)

  const handleSendCode = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.')
      return
    }
    // Go to age gate before sending code
    setStep('age-gate')
  }

  const handleAgeGate = async () => {
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

    if (!signInLoaded || !signUpLoaded) return
    setIsLoading(true)

    try {
      // Try sign-in first (existing user)
      const { supportedFirstFactors } = await signIn.create({
        identifier: email.trim(),
      })

      const emailCodeFactor = supportedFirstFactors?.find(
        (f: { strategy: string }) => f.strategy === 'email_code',
      )

      if (emailCodeFactor) {
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: (emailCodeFactor as any).emailAddressId,
        })
      }

      setIsNewUser(false)
      setStep('code')
    } catch (err: any) {
      // If user doesn't exist, create via sign-up
      if (err?.errors?.[0]?.code === 'form_identifier_not_found') {
        try {
          await signUp.create({
            emailAddress: email.trim(),
          })
          await signUp.prepareEmailAddressVerification({
            strategy: 'email_code',
          })
          setIsNewUser(true)
          setStep('code')
        } catch (signUpErr: any) {
          Alert.alert('Error', signUpErr?.errors?.[0]?.message || 'Failed to send code')
        }
      } else {
        Alert.alert('Error', err?.errors?.[0]?.message || 'Failed to send code')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (!signInLoaded || !signUpLoaded) return
    setIsLoading(true)
    try {
      if (isNewUser) {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      } else {
        const { supportedFirstFactors } = await signIn.create({
          identifier: email.trim(),
        })
        const emailCodeFactor = supportedFirstFactors?.find(
          (f: { strategy: string }) => f.strategy === 'email_code',
        )
        if (emailCodeFactor) {
          await signIn.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: (emailCodeFactor as any).emailAddressId,
          })
        }
      }
      Alert.alert('Code Sent', 'A new verification code has been sent to your email.')
    } catch (err: any) {
      Alert.alert('Error', err?.errors?.[0]?.message || 'Failed to resend code')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!code.trim() || !signInLoaded || !signUpLoaded) return
    setIsLoading(true)
    try {
      // Try sign-in verification first
      const result = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code: code.trim(),
      })

      if (result.status === 'complete' && result.createdSessionId) {
        await setSignInActive({ session: result.createdSessionId })
        // AuthContext will detect the Clerk session change and fetch /me
      }
    } catch {
      // If sign-in verification fails, try sign-up verification
      try {
        const result = await signUp.attemptEmailAddressVerification({
          code: code.trim(),
        })

        if (result.status === 'complete' && result.createdSessionId) {
          await setSignUpActive({ session: result.createdSessionId })
        }
      } catch (err: any) {
        Alert.alert('Error', err?.errors?.[0]?.message || 'Invalid code')
      }
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
              onPress={handleResendCode}
              disabled={isLoading}
            >
              <Text style={styles.backLinkText}>Resend Code</Text>
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
    backgroundColor: neutralColors.textPrimary,
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
