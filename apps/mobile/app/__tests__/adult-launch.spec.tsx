/** Default launch capabilities: deliberately no future-capabilities import. */
import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { Alert, Share } from 'react-native'
import NameScreen from '../(auth)/name'
import AccountPrivacyScreen from '../account-privacy'
import MoreScreen from '../(tabs)/more/index'
import EnterDobScreen from '../enter-dob'
import { RsvpControl } from '../../src/components/events/RsvpControl'
import { needsDateOfBirth, resolveSignedInRoute } from '../../src/onboarding/routing'
import { parseOnboardingIntent } from '../../src/onboarding/intent'

const mockApi = jest.fn()
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockSignOut = jest.fn().mockResolvedValue(undefined)
const mockRefresh = jest.fn().mockResolvedValue(undefined)
const mockWrite = jest.fn().mockResolvedValue(undefined)
const mockShare = jest.fn().mockResolvedValue(undefined)
const mockRemove = jest.fn().mockResolvedValue(undefined)
const mockSharingAvailable = jest.fn().mockResolvedValue(true)
let mockUser = { id: 'adult', name: 'Chosen Name', email: 'new@example.com', dateOfBirth: null as string | null, registrationRole: 'PLAYER' }

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn() },
  useRouter: () => ({ push: mockPush, replace: mockReplace }), Redirect: 'Redirect' }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../../src/context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, isSignedIn: true,
  activeClub: null, memberships: [], refreshUser: mockRefresh, signOut: mockSignOut }) }))
jest.mock('../../src/context/ClubThemeContext', () => { const { FALLBACK_THEME } = require('../../src/theme/club-theme'); return { useClubColors: () => FALLBACK_THEME, useIsDark: () => false } })
jest.mock('../../src/components/home/childrenSummary', () => ({ useChildrenSummary: () => [] }))
jest.mock('../../src/components/ClubSwitcher', () => ({ ClubSwitcher: () => null }))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'en', getLanguageLabel: () => 'English' }))
jest.mock('../../src/api/client', () => ({ api: (...args: unknown[]) => mockApi(...args), ApiError: class extends Error {} }))
jest.mock('../../src/onboarding/sessionExpiry', () => ({ useSessionExpiryHandler: () => () => false }))
jest.mock('../../src/onboarding/intent', () => ({ ...jest.requireActual('../../src/onboarding/intent'), useOnboardingIntent: () => null }))
jest.mock('../../src/onboarding/ui', () => {
  const { View, Text, Button, TextInput } = require('react-native')
  return { OnboardingScreen: ({ title, subtitle, children, primary, testID }: any) => <View testID={testID}><Text>{title}</Text><Text>{subtitle}</Text>{children}{primary ? <Button title={primary.label} testID={primary.testID} disabled={primary.disabled} onPress={primary.onPress} /> : null}</View>,
    HeaderTextButton: () => null, OnboardingTextField: (props: any) => <TextInput {...props} /> }
})
jest.mock('../../src/onboarding/DateOfBirthInput', () => {
  const actual = jest.requireActual('../../src/onboarding/DateOfBirthInput')
  const { Button, View } = require('react-native')
  return { ...actual, DateOfBirthInput: ({ onChange }: any) => <View>
    <Button title="Choose 17" onPress={() => onChange({ day: '1', month: '1', year: String(new Date().getFullYear() - 17) })} />
    <Button title="Choose adult" onPress={() => onChange({ day: '1', month: '1', year: '1990' })} />
  </View> }
})
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: (...args: unknown[]) => mockWrite(...args), deleteAsync: (...args: unknown[]) => mockRemove(...args) }))
jest.mock('expo-sharing', () => ({ isAvailableAsync: () => mockSharingAvailable(), shareAsync: (...args: unknown[]) => mockShare(...args) }))

beforeEach(() => {
  jest.clearAllMocks()
  mockApi.mockResolvedValue({})
  mockSharingAvailable.mockResolvedValue(true)
  mockUser = { id: 'adult', name: 'Chosen Name', email: 'new@example.com', dateOfBirth: null, registrationRole: 'PLAYER' }
})

it('does not persist an under18 DOB or invoke a guardian handoff', () => {
  const screen = render(<NameScreen />)
  fireEvent.press(screen.getByText('Choose 17'))
  fireEvent.press(screen.getByTestId('name-continue'))
  expect(screen.getByTestId('adult-launch-notice')).toBeTruthy()
  expect(mockApi).not.toHaveBeenCalled()
  fireEvent.press(screen.getByTestId('adult-launch-privacy'))
  expect(mockPush).toHaveBeenCalledWith('/account-privacy')
})

it('lets an adult complete the profile and move forward', async () => {
  const screen = render(<NameScreen />)
  fireEvent.press(screen.getByText('Choose adult'))
  fireEvent.press(screen.getByTestId('name-continue'))
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  expect(mockApi).toHaveBeenCalledWith('/me', { method: 'PATCH', body: { name: 'Chosen Name', dateOfBirth: '1990-01-01' } })
})

it('sends NO directly without collecting health reasons or free text', () => {
  const changed = jest.fn()
  const screen = render(<RsvpControl value={null} onChange={changed} testID="reply" />)
  fireEvent.press(screen.getByTestId('reply-NO'))
  expect(changed).toHaveBeenCalledWith('NO')
  expect(screen.queryByTestId('absence-note')).toBeNull()
  expect(screen.queryByTestId('absence-reason-injured')).toBeNull()
})

it('does not accept the old 16+ declaration or a stored parent-handoff intent', () => {
  expect(needsDateOfBirth({ adultConfirmedAt: new Date().toISOString(), dateOfBirth: null })).toBe(true)
  expect(parseOnboardingIntent('parent-handoff')).toBeNull()
  expect(resolveSignedInRoute({ user: mockUser, memberships: [], ageGate: { status: 'PENDING_PARENT_APPROVAL' }, pendingJoinRequest: null, pendingClubClaim: null })).toBe('/access-blocked')
})

it('keeps privacy actions reachable for a legacy member whose DOB is required', () => {
  const screen = render(<EnterDobScreen />)
  fireEvent.press(screen.getByTestId('required-dob-privacy'))
  expect(mockPush).toHaveBeenCalledWith('/account-privacy')
  expect(mockApi).not.toHaveBeenCalled()
})

it('keeps existing guardian consent accessible from adult Profile with youth participation disabled', () => {
  const screen = render(<MoreScreen />)
  fireEvent.press(screen.getByText('childConsent.moreRowTitle'))
  expect(mockPush).toHaveBeenCalledWith('/child-consent')
})

it('keeps a privacy-only export reachable without loading club or child data and clears its temporary file', async () => {
  mockUser.dateOfBirth = '2010-01-01'
  mockApi.mockResolvedValue({ user: { name: 'Private fixture' } })
  const screen = render(<AccountPrivacyScreen />)
  fireEvent.press(screen.getByTestId('privacy-export'))
  await waitFor(() => expect(mockRemove).toHaveBeenCalled())
  expect(mockApi.mock.calls).toEqual([['/me/export-bound', { headers: { 'x-expected-actor-id': 'adult' } }]])
  expect(mockWrite).toHaveBeenCalledWith(expect.stringMatching(/^file:\/\/\/cache\/anstoss-data-export-\d+\.json$/), expect.stringContaining('Private fixture'), { encoding: 'utf8' })
  expect(mockRemove).toHaveBeenCalledWith(mockShare.mock.calls[0][0], { idempotent: true })
  fireEvent.press(screen.getByTestId('privacy-existing-consent'))
  expect(mockPush).toHaveBeenCalledWith('/child-consent')
})

it('keeps explicit account deletion available to an under18 blocked account', async () => {
  mockUser.dateOfBirth = '2010-01-01'
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined)
  try {
    const screen = render(<AccountPrivacyScreen />)
    fireEvent.press(screen.getByTestId('privacy-delete'))
    const confirm = alert.mock.calls[0][2]?.find((button) => button.style === 'destructive')
    await act(async () => { await confirm?.onPress?.() })
    expect(mockApi).toHaveBeenCalledWith('/me/bound', { method: 'DELETE', headers: { 'x-expected-actor-id': 'adult' } })
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome')
  } finally { alert.mockRestore() }
})

it.each(['switch', 'revisit', 'unmount'])('does not share a stale export after %s during a capability check', async (action) => {
  let complete!: (value: boolean) => void
  mockSharingAvailable.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve }))
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction })
  try {
    const screen = render(<AccountPrivacyScreen />)
    fireEvent.press(screen.getByTestId('privacy-export'))
    await waitFor(() => expect(mockSharingAvailable).toHaveBeenCalled())
    if (action === 'unmount') screen.unmount()
    else {
      mockUser = { ...mockUser, id: 'second' }
      screen.rerender(<AccountPrivacyScreen />)
      if (action === 'revisit') { mockUser = { ...mockUser, id: 'adult' }; screen.rerender(<AccountPrivacyScreen />) }
    }
    await act(async () => { complete(false) })
    expect(share).not.toHaveBeenCalled()
    expect(mockShare).not.toHaveBeenCalled()
    expect(mockWrite).not.toHaveBeenCalled()
  } finally { share.mockRestore() }
})
