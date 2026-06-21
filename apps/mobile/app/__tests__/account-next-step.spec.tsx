import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { RegistrationRole } from '@anstoss/shared'
import AccountNextStepScreen from '../account-next-step'

const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockSignOut = jest.fn(() => Promise.resolve())
const mockSetAuthExpiryHandlingSuspended = jest.fn()
let mockRegistrationRole: RegistrationRole | '' | undefined = RegistrationRole.PLAYER

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'accountNextStep.title': 'Next step',
        'accountNextStep.playerTitle': 'Join your club',
        'accountNextStep.playerBody':
          'Your account is ready. Request to join your team and the club will review it.',
        'accountNextStep.parentTitle': "Join your child's club",
        'accountNextStep.parentBody':
          "Your account is ready. Request access and the club will connect you to your child's team.",
        'accountNextStep.coachTitle': 'Get your coach invite',
        'accountNextStep.coachBody':
          'Coach access is invite only. Ask a club admin or head coach for your invite link, then open it in Anstoss.',
        'accountNextStep.joinClubAction': 'Find your club',
        'accountNextStep.nextUp': 'Next up',
        'accountNextStep.playerStepSearch': 'Search for your club by name or city.',
        'accountNextStep.playerStepRequest': 'Send a request to the right team.',
        'accountNextStep.playerStepApproval': 'You get access as soon as the club approves.',
        'accountNextStep.parentStepCode': "Use your child's setup code.",
        'accountNextStep.parentStepConfirm': 'Confirm your parent account.',
        'accountNextStep.parentStepSchedule': 'The team schedule appears once you are linked.',
        'accountNextStep.coachStepAsk': 'Ask a club admin or head coach for your invite.',
        'accountNextStep.coachStepOpen': 'Open the invite link or enter the code here.',
        'accountNextStep.coachStepUnlock': 'Coach tools unlock after the club confirms you.',
        'joinCode.title': 'Enter invite code',
        'parentHandoff.title': 'Set up your child',
        'more.signOut': 'Sign out',
        'more.signOutTitle': 'Sign out?',
        'more.signOutBody': 'You can come back later.',
        'common.cancel': 'Cancel',
      }
      return map[key] ?? opts?.defaultValue ?? key
    },
  }),
}))

jest.mock('../../src/components/ModalHeader', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    ModalHeader: (props: { title?: string }) =>
      React.createElement(Text, null, props.title),
  }
})

jest.mock('../../src/components/ui', () => {
  const React = require('react')
  const { Pressable, Text, View } = require('react-native')
  return {
    Screen: (props: { children?: React.ReactNode; header?: React.ReactNode }) =>
      React.createElement(View, null, props.header, props.children),
    Button: (props: { label: string; onPress?: () => void }) =>
      React.createElement(
        Pressable,
        { accessibilityRole: 'button', onPress: props.onPress },
        React.createElement(Text, null, props.label),
      ),
    Text: (props: { children?: React.ReactNode }) =>
      React.createElement(Text, props, props.children),
    Icon: (props: { name?: string }) =>
      React.createElement(Text, null, props.name ?? 'icon'),
  }
})

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({
    user: { registrationRole: mockRegistrationRole },
    signOut: mockSignOut,
  }),
}))

jest.mock('../../src/api/client', () => ({
  setAuthExpiryHandlingSuspended: (...args: unknown[]) =>
    mockSetAuthExpiryHandlingSuspended(...args),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    background: '#ffffff',
    borderDefault: '#dddddd',
    primary50: '#f0f1f3',
    success: '#15803d',
    successBg: '#dcfce7',
    textPrimary: '#111111',
    textSecondary: '#555555',
    textTertiary: '#777777',
  }),
}))

describe('AccountNextStepScreen', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})

  beforeEach(() => {
    mockRegistrationRole = RegistrationRole.PLAYER
    jest.clearAllMocks()
    mockSignOut.mockResolvedValue(undefined)
  })

  afterAll(() => {
    alertSpy.mockRestore()
  })

  it('guides players to request their club', () => {
    render(<AccountNextStepScreen />)

    expect(screen.getByText('Join your club')).toBeOnTheScreen()
    expect(screen.getByText('Search for your club by name or city.')).toBeOnTheScreen()

    fireEvent.press(screen.getByText('Find your club'))

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/join-club',
      params: { role: RegistrationRole.PLAYER },
    })
    expect(screen.queryByText('Enter invite code')).toBeNull()
  })

  it('guides coaches to their invite code', () => {
    mockRegistrationRole = RegistrationRole.COACH

    render(<AccountNextStepScreen />)

    expect(screen.getByText('Get your coach invite')).toBeOnTheScreen()
    expect(screen.getByText('Ask a club admin or head coach for your invite.')).toBeOnTheScreen()
    expect(screen.queryByText('Find your club')).toBeNull()

    fireEvent.press(screen.getByText('Enter invite code'))

    expect(mockPush).toHaveBeenCalledWith('/join-code')
  })

  it('guides parents to child setup', () => {
    mockRegistrationRole = RegistrationRole.PARENT

    render(<AccountNextStepScreen />)

    expect(screen.getByText("Join your child's club")).toBeOnTheScreen()
    expect(screen.getByText("Use your child's setup code.")).toBeOnTheScreen()

    fireEvent.press(screen.getByText('Set up your child'))

    expect(mockPush).toHaveBeenCalledWith('/(auth)/parent-handoff')
  })

  it('falls back to a useful player-style handoff when the role is missing', () => {
    mockRegistrationRole = undefined

    render(<AccountNextStepScreen />)

    expect(screen.getByText('Join your club')).toBeOnTheScreen()
    expect(screen.getByText('Search for your club by name or city.')).toBeOnTheScreen()

    fireEvent.press(screen.getByText('Find your club'))

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/join-club',
      params: { role: RegistrationRole.PLAYER },
    })
  })

  it('normalizes empty-string roles to the player fallback', () => {
    mockRegistrationRole = ''

    render(<AccountNextStepScreen />)

    fireEvent.press(screen.getByText('Find your club'))

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/join-club',
      params: { role: RegistrationRole.PLAYER },
    })
  })

  it('keeps sign-out available without expiring the session mid-confirmation', async () => {
    render(<AccountNextStepScreen />)

    fireEvent.press(screen.getByText('Sign out'))

    expect(mockSetAuthExpiryHandlingSuspended).toHaveBeenCalledWith(true)
    expect(alertSpy).toHaveBeenCalledWith(
      'Sign out?',
      'You can come back later.',
      expect.any(Array),
    )

    const actions = alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void; text: string }>
    const signOutAction = actions.find((action) => action.text === 'Sign out')
    expect(signOutAction).toBeTruthy()

    await act(async () => {
      signOutAction?.onPress?.()
    })

    expect(mockSignOut).toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome')
  })
})
