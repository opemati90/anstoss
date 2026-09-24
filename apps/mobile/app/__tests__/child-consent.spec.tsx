import React from 'react'
import { ActionSheetIOS, Alert, Platform } from 'react-native'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockApi = jest.fn()

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}))

jest.mock('../../src/api/client', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    primary: '#2255cc',
    surface: '#ffffff',
    surfaceSunken: '#f6f7f9',
    textPrimary: '#111111',
    textTertiary: '#777777',
  }),
}))

jest.mock('../../src/components/ModalHeader', () => {
  const { Text } = require('react-native')
  return { ModalHeader: (props: { title: string }) => <Text>{props.title}</Text> }
})

jest.mock('../../src/components/Skeleton', () => ({ Skeleton: () => null }))

jest.mock('../../src/components/ui', () => {
  const { Pressable, Text, View } = require('react-native')
  return {
    Screen: (props: { header?: React.ReactNode; children: React.ReactNode }) => (
      <View>
        {props.header}
        {props.children}
      </View>
    ),
    SectionGroup: (props: { header?: string; children: React.ReactNode }) => (
      <View>
        {props.header ? <Text>{props.header}</Text> : null}
        {props.children}
      </View>
    ),
    ListRow: (props: {
      title: string
      subtitle?: string
      onPress?: () => void
      disabled?: boolean
      testID?: string
    }) =>
      props.onPress ? (
        <Pressable testID={props.testID} disabled={props.disabled} onPress={props.onPress}>
          <Text>{props.title}</Text>
        </Pressable>
      ) : (
        <View>
          <Text>{props.title}</Text>
          {props.subtitle ? <Text>{props.subtitle}</Text> : null}
        </View>
      ),
    Banner: (props: { title: string; action?: { label: string; onPress: () => void } }) => (
      <View>
        <Text>{props.title}</Text>
        {props.action ? (
          <Pressable testID="banner-retry" onPress={props.action.onPress}>
            <Text>{props.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    ),
    SoftIcon: () => null,
    Text: (props: { children?: React.ReactNode }) => <Text>{props.children}</Text>,
  }
})

import ChildConsentScreen from '../child-consent'

const consent = (overrides: Record<string, unknown> = {}) => ({
  id: 'consent-1',
  status: 'APPROVED',
  requestedAt: '2026-08-01T10:00:00.000Z',
  approvedAt: '2026-08-02T10:00:00.000Z',
  withdrawnAt: null,
  club: { id: 'club-1', name: 'SV Albatros', badgeUrl: null },
  team: { id: 'team-1', displayName: 'U15 I' },
  player: { id: 'child-1', name: 'Leo Becker', avatarUrl: null },
  ...overrides,
})

describe('ChildConsentScreen', () => {
  const originalOS = Platform.OS

  beforeEach(() => {
    mockApi.mockReset()
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  })

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS })
    jest.restoreAllMocks()
  })

  it('lists consents per child with a withdraw action only for approved ones', async () => {
    mockApi.mockResolvedValueOnce([
      consent(),
      consent({ id: 'consent-2', status: 'PENDING', approvedAt: null, team: { id: 'team-2', displayName: 'U17' } }),
    ])
    render(<ChildConsentScreen />)

    expect(await screen.findByText('Leo Becker')).toBeTruthy()
    expect(screen.getByText('U15 I')).toBeTruthy()
    expect(screen.getByText('U17')).toBeTruthy()
    expect(screen.getByTestId('child-consent-withdraw-consent-1')).toBeTruthy()
    expect(screen.queryByTestId('child-consent-withdraw-consent-2')).toBeNull()
    expect(mockApi).toHaveBeenCalledWith('/consent/mine')
  })

  it('withdraws only after the Android destructive confirmation', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' })
    mockApi
      .mockResolvedValueOnce([consent()])
      .mockResolvedValueOnce({ id: 'consent-1', status: 'WITHDRAWN', withdrawnAt: '2026-09-24T09:00:00.000Z' })
    render(<ChildConsentScreen />)

    fireEvent.press(await screen.findByTestId('child-consent-withdraw-consent-1'))
    expect(mockApi).toHaveBeenCalledTimes(1)
    const alertMock = Alert.alert as jest.Mock
    const buttons = alertMock.mock.calls[0][2] as Array<{ style?: string; onPress?: () => void }>
    expect(buttons.find((b) => b.style === 'cancel')).toBeTruthy()
    buttons.find((b) => b.style === 'destructive')!.onPress!()

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/consent/consent-1/withdraw', { method: 'POST', body: {} }),
    )
    await waitFor(() => expect(screen.queryByTestId('child-consent-withdraw-consent-1')).toBeNull())
  })

  it('uses a destructive action sheet on iOS and does nothing on cancel', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' })
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_opts, cb) => cb(1))
    mockApi.mockResolvedValueOnce([consent()])
    render(<ChildConsentScreen />)

    fireEvent.press(await screen.findByTestId('child-consent-withdraw-consent-1'))
    expect(sheet).toHaveBeenCalledWith(
      expect.objectContaining({ destructiveButtonIndex: 0, cancelButtonIndex: 1 }),
      expect.any(Function),
    )
    expect(mockApi).toHaveBeenCalledTimes(1)
  })

  it('keeps the consent when the withdrawal fails and tells the guardian', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' })
    mockApi.mockResolvedValueOnce([consent()]).mockRejectedValueOnce(new Error('500'))
    render(<ChildConsentScreen />)

    fireEvent.press(await screen.findByTestId('child-consent-withdraw-consent-1'))
    const alertMock = Alert.alert as jest.Mock
    const buttons = alertMock.mock.calls[0][2] as Array<{ style?: string; onPress?: () => void }>
    buttons.find((b) => b.style === 'destructive')!.onPress!()

    await waitFor(() => expect(alertMock).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('child-consent-withdraw-consent-1')).toBeTruthy()
  })

  it('resolves a failed load to an error with retry instead of a stuck skeleton', async () => {
    mockApi.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([consent()])
    render(<ChildConsentScreen />)

    fireEvent.press(await screen.findByTestId('banner-retry'))
    expect(await screen.findByText('Leo Becker')).toBeTruthy()
  })

  it('shows a composed empty state', async () => {
    mockApi.mockResolvedValueOnce([])
    render(<ChildConsentScreen />)
    expect(await screen.findByText('Noch keine Einwilligungen')).toBeTruthy()
    expect(screen.queryByTestId('banner-retry')).toBeNull()
    expect(screen.queryByTestId(/child-consent-withdraw/)).toBeNull()
  })
})
