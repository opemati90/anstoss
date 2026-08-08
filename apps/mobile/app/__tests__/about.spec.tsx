import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockSetBasicProfile = jest.fn()
const mockFinalizeSession = jest.fn()
const mockSignOut = jest.fn()
const mockUpdate = jest.fn()
const mockReset = jest.fn()
const mockMarkStep = jest.fn()
const mockApi = jest.fn()
const mockSearchParams: { inviteCode?: string | string[] } = {}

const flowState: { firstName?: string; dateOfBirth?: string } = {}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockSearchParams,
}))

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'Light' },
  impactAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../src/auth/useOnboardingAuth', () => ({
  useOnboardingAuth: () => ({
    setBasicProfile: mockSetBasicProfile,
    finalizeSession: mockFinalizeSession,
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))

jest.mock('../../src/context/OnboardingFlowContext', () => ({
  useOnboardingFlow: () => ({
    state: flowState,
    update: mockUpdate,
    reset: mockReset,
    markStep: mockMarkStep,
  }),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    borderDefault: '#dddddd',
    primary: '#2255cc',
    surface: '#ffffff',
    surfaceSunken: '#f6f7f9',
    textPrimary: '#111111',
    textTertiary: '#777777',
  }),
}))

jest.mock('../../src/components/ui', () => {
  const { Text } = require('react-native')
  return {
    Icon: () => null,
    Text: (props: { children?: React.ReactNode }) => <Text {...props}>{props.children}</Text>,
  }
})

jest.mock('../../src/components/FormInput', () => {
  const { TextInput } = require('react-native')
  return {
    FormInput: (props: {
      label: string
      value: string
      onChangeText: (next: string) => void
      placeholder?: string
    }) => (
      <TextInput
        accessibilityLabel={props.label}
        placeholder={props.placeholder ?? props.label}
        value={props.value}
        onChangeText={props.onChangeText}
      />
    ),
  }
})

jest.mock('../../src/components/wizard/WizardStep', () => {
  const { Pressable, Text, View } = require('react-native')
  return {
    WizardStep: (props: {
      title: string
      ctaLabel?: string
      ctaDisabled?: boolean
      onCta?: () => void
      scrollEnabled?: boolean
      children: React.ReactNode
    }) => (
      <View>
        <Text>{props.title}</Text>
        <Text testID="wizard-scroll-state">
          {props.scrollEnabled === false ? 'locked' : 'enabled'}
        </Text>
        {props.children}
        {props.ctaLabel ? (
          <Pressable
            accessibilityState={{ disabled: !!props.ctaDisabled }}
            disabled={props.ctaDisabled}
            onPress={props.onCta}
            testID="wizard-cta"
          >
            <Text>{props.ctaLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    ),
  }
})

jest.mock('../../src/components/wizard/DobScrollPicker', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    DobScrollPicker: (props: {
      initialDay?: number
      initialMonth?: number
      initialYear?: number
      onChange?: (next: { day: number; month: number; year: number }) => void
      onInteractionChange?: (active: boolean) => void
    }) => {
      React.useEffect(() => {
        props.onChange?.({
          day: props.initialDay ?? 1,
          month: props.initialMonth ?? 1,
          year: props.initialYear ?? 2001,
        })
      }, [props.onChange])

      return (
        <View>
          <Pressable
            onPressIn={() => props.onInteractionChange?.(true)}
            onPressOut={() => props.onInteractionChange?.(false)}
            testID="dob-wheel"
          >
            <Text>DOB wheel</Text>
          </Pressable>
          <Pressable
            onPress={() => props.onChange?.({ day: 4, month: 5, year: 1995 })}
            testID="set-adult-dob"
          >
            <Text>Set adult DOB</Text>
          </Pressable>
          <Pressable
            onPress={() => props.onChange?.({ day: 1, month: 5, year: 2012 })}
            testID="set-under16-dob"
          >
            <Text>Set under-16 DOB</Text>
          </Pressable>
        </View>
      )
    },
  }
})

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'onboarding.about.cta': 'Continue',
        'onboarding.about.dobLabel': 'DATE OF BIRTH',
        'onboarding.about.firstNameLabel': 'NAME OR USERNAME',
        'onboarding.about.title': 'About you',
        'onboarding.dob.under16Body': 'Ask a parent to add you.',
        'onboarding.dob.under16Cta': 'Done',
        'onboarding.dob.under16Title': 'You are younger than 16',
        'onboarding.name.placeholder': 'Your name or username',
      }
      return map[key] ?? opts?.defaultValue ?? key
    },
  }),
}))

import About from '../(auth)/about'

describe('About', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-25'))
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  beforeEach(() => {
    delete flowState.firstName
    delete flowState.dateOfBirth
    mockPush.mockReset()
    mockReplace.mockReset()
    mockSetBasicProfile.mockReset().mockResolvedValue(undefined)
    mockFinalizeSession.mockReset().mockResolvedValue(undefined)
    mockSignOut.mockReset().mockResolvedValue(undefined)
    mockUpdate.mockReset()
    mockReset.mockReset()
    mockMarkStep.mockReset()
    mockApi.mockReset().mockResolvedValue(undefined)
    delete mockSearchParams.inviteCode
  })

  it('keeps continue disabled until the display name and DOB are both confirmed', () => {
    render(<About />)

    fireEvent.changeText(screen.getByPlaceholderText('Your name or username'), 'M')
    fireEvent.press(screen.getByTestId('wizard-cta'))
    expect(screen.getByTestId('wizard-cta').props.accessibilityState).toEqual({
      disabled: true,
    })

    fireEvent.changeText(screen.getByPlaceholderText('Your name or username'), 'Ma')
    fireEvent.press(screen.getByTestId('wizard-cta'))
    expect(screen.getByTestId('wizard-cta').props.accessibilityState).toEqual({
      disabled: true,
    })

    expect(mockSetBasicProfile).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('locks the parent form scroll while the DOB wheels own the gesture', () => {
    render(<About />)

    expect(screen.getByTestId('wizard-scroll-state')).toHaveTextContent('enabled')
    fireEvent(screen.getByTestId('dob-wheel'), 'pressIn')
    expect(screen.getByTestId('wizard-scroll-state')).toHaveTextContent('locked')
    fireEvent(screen.getByTestId('dob-wheel'), 'pressOut')
    expect(screen.getByTestId('wizard-scroll-state')).toHaveTextContent('enabled')
  })

  it('persists adult profile details and routes to role selection', async () => {
    render(<About />)

    fireEvent.changeText(screen.getByPlaceholderText('Your name or username'), 'Mara')
    fireEvent.press(screen.getByTestId('set-adult-dob'))
    fireEvent.press(screen.getByTestId('wizard-cta'))

    await waitFor(() => expect(mockSetBasicProfile).toHaveBeenCalledWith({ firstName: 'Mara' }))
    expect(mockFinalizeSession).toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith({
      firstName: 'Mara',
      dateOfBirth: '1995-05-04',
    })
    expect(mockPush).toHaveBeenCalledWith('/(auth)/role')
  })

  it('persists profile details and returns to invite redemption when invite code is present', async () => {
    mockSearchParams.inviteCode = 'INVITE123'

    render(<About />)

    fireEvent.changeText(screen.getByPlaceholderText('Your name or username'), 'Mara')
    fireEvent.press(screen.getByTestId('set-adult-dob'))
    fireEvent.press(screen.getByTestId('wizard-cta'))

    await waitFor(() => expect(mockSetBasicProfile).toHaveBeenCalledWith({ firstName: 'Mara' }))
    expect(mockFinalizeSession).toHaveBeenCalled()
    expect(mockUpdate).toHaveBeenCalledWith({
      firstName: 'Mara',
      dateOfBirth: '1995-05-04',
    })
    expect(mockApi).toHaveBeenCalledWith('/me', {
      method: 'PATCH',
      body: { name: 'Mara', dateOfBirth: '1995-05-04' },
    })
    expect(mockReplace).toHaveBeenCalledWith('/join/INVITE123')
    expect(mockPush).not.toHaveBeenCalledWith('/(auth)/role')
  })

  it('shows the parent-handoff form on under-16 without signing out yet', async () => {
    render(<About />)

    fireEvent.changeText(screen.getByPlaceholderText('Your name or username'), 'Mara')
    fireEvent.press(screen.getByTestId('set-under16-dob'))
    fireEvent.press(screen.getByTestId('wizard-cta'))

    // New flow: detecting under-16 reveals the guardian-email handoff form
    // immediately. Sign-out happens later (on send / "not now"), NOT on age
    // detection, so the child stays authenticated just long enough to mint the
    // handoff. No profile update or navigation occurs here.
    await waitFor(() => expect(screen.getByText('You are younger than 16')).toBeTruthy())
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
