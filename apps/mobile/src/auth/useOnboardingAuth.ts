import { useCallback } from 'react'
import { useSignUp } from '@clerk/clerk-expo'

export function useOnboardingAuth() {
  const { isLoaded, signUp, setActive } = useSignUp()

  const startPhoneOtp = useCallback(
    async (phone: string) => {
      if (!isLoaded || !signUp) throw new Error('Auth not ready')
      await signUp.create({ phoneNumber: phone })
      await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' })
    },
    [isLoaded, signUp],
  )

  const verifyPhoneOtp = useCallback(
    async (code: string) => {
      if (!isLoaded || !signUp) throw new Error('Auth not ready')
      await signUp.attemptPhoneNumberVerification({ code })
    },
    [isLoaded, signUp],
  )

  const setBasicProfile = useCallback(
    async (input: { firstName: string }) => {
      if (!isLoaded || !signUp) throw new Error('Auth not ready')
      await signUp.update({ firstName: input.firstName })
    },
    [isLoaded, signUp],
  )

  const finalizeSession = useCallback(async () => {
    if (!isLoaded || !signUp) throw new Error('Auth not ready')
    if (signUp.createdSessionId && setActive) {
      await setActive({ session: signUp.createdSessionId })
    }
  }, [isLoaded, signUp, setActive])

  return { startPhoneOtp, verifyPhoneOtp, setBasicProfile, finalizeSession, isLoaded }
}
