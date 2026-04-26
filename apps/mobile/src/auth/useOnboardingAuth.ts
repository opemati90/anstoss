import { useCallback, useRef } from 'react'
import { useSignIn, useSignUp } from '@clerk/clerk-expo'

type Mode = 'signup' | 'signin'

export function useOnboardingAuth() {
  const signUpHook = useSignUp()
  const signInHook = useSignIn()
  const modeRef = useRef<Mode>('signup')

  const isLoaded = signUpHook.isLoaded && signInHook.isLoaded

  const startPhoneOtp = useCallback(
    async (phone: string, requestedMode: Mode = 'signup') => {
      if (!isLoaded) throw new Error('Auth not ready')
      if (requestedMode === 'signin') {
        const { signIn } = signInHook
        if (!signIn) throw new Error('Auth not ready')
        const attempt = await signIn.create({ identifier: phone })
        const phoneFactor = attempt.supportedFirstFactors?.find(
          (f) => f.strategy === 'phone_code',
        ) as { phoneNumberId: string } | undefined
        if (!phoneFactor) throw new Error('Phone OTP not available for this number')
        await signIn.prepareFirstFactor({
          strategy: 'phone_code',
          phoneNumberId: phoneFactor.phoneNumberId,
        })
        modeRef.current = 'signin'
        return
      }
      const { signUp } = signUpHook
      if (!signUp) throw new Error('Auth not ready')
      await signUp.create({ phoneNumber: phone })
      await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' })
      modeRef.current = 'signup'
    },
    [isLoaded, signInHook, signUpHook],
  )

  const verifyPhoneOtp = useCallback(
    async (code: string) => {
      if (!isLoaded) throw new Error('Auth not ready')
      if (modeRef.current === 'signin') {
        const { signIn } = signInHook
        if (!signIn) throw new Error('Auth not ready')
        await signIn.attemptFirstFactor({ strategy: 'phone_code', code })
        return
      }
      const { signUp } = signUpHook
      if (!signUp) throw new Error('Auth not ready')
      await signUp.attemptPhoneNumberVerification({ code })
    },
    [isLoaded, signInHook, signUpHook],
  )

  const setBasicProfile = useCallback(
    async (input: { firstName: string }) => {
      if (!isLoaded) throw new Error('Auth not ready')
      if (modeRef.current === 'signin') return
      const { signUp } = signUpHook
      if (!signUp) throw new Error('Auth not ready')
      await signUp.update({ firstName: input.firstName })
    },
    [isLoaded, signUpHook],
  )

  const finalizeSession = useCallback(async () => {
    if (!isLoaded) throw new Error('Auth not ready')
    if (modeRef.current === 'signin') {
      const { signIn, setActive } = signInHook
      if (signIn?.createdSessionId && setActive) {
        await setActive({ session: signIn.createdSessionId })
      }
      return
    }
    const { signUp, setActive } = signUpHook
    if (signUp?.createdSessionId && setActive) {
      await setActive({ session: signUp.createdSessionId })
    }
  }, [isLoaded, signInHook, signUpHook])

  return {
    startPhoneOtp,
    verifyPhoneOtp,
    setBasicProfile,
    finalizeSession,
    isLoaded,
    mode: modeRef.current,
  }
}
