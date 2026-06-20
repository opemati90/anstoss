import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockSetBasicProfile = jest.fn()
const mockFinalizeSession = jest.fn()
const mockSignOut = jest.fn()
const mockUpdate = jest.fn()
const mockReset = jest.fn()
const mockMarkStep = jest.fn()

const flowState: { firstName?: string; dateOfBirth?: string } = {}

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
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
      children: React.ReactNode
    }) => (
      <View>
        <Text>{props.title}</Text>
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
        'onboarding.about.firstNameLabel': 'FIRST NAME',
        'onboarding.about.title': 'About you',
        'onboarding.dob.under16Body': 'Ask a parent to add you.',
        'onboarding.dob.under16Cta': 'Done',
        'onboarding.dob.under16Title': 'You are younger than 16',
        'onboarding.name.placeholder': 'First name',
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
  })

  it('keeps continue disabled until the first name and DOB are both confirmed', () => {
    render(<About />)

    fireEvent.changeText(screen.getByPlaceholderText('First name'), 'M')
    fireEvent.press(screen.getByTestId('wizard-cta'))
    expect(screen.getByTestId('wizard-cta').props.accessibilityState).toEqual({
      disabled: true,
    })

    fireEvent.changeText(screen.getByPlaceholderText('First name'), 'Ma')
    fireEvent.press(screen.getByTestId('wizard-cta'))
    expect(screen.getByTestId('wizard-cta').props.accessibilityState).toEqual({
      disabled: true,
    })

    expect(mockSetBasicProfile).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('persists adult profile details and routes to role selection', async () => {
    render(<About />)

    fireEvent.changeText(screen.getByPlaceholderText('First name'), 'Mara')
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

  it('waits for under-16 sign-out before showing the parent handoff', async () => {
    let resolveSignOut: (() => void) | undefined
    mockSignOut.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSignOut = resolve
      }),
    )
    render(<About />)

    fireEvent.changeText(screen.getByPlaceholderText('First name'), 'Mara')
    fireEvent.press(screen.getByTestId('set-under16-dob'))
    fireEvent.press(screen.getByTestId('wizard-cta'))

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    expect(screen.queryByText('You are younger than 16')).toBeNull()

    await act(async () => {
      resolveSignOut?.()
    })

    expect(screen.getByText('You are younger than 16')).toBeTruthy()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

})
