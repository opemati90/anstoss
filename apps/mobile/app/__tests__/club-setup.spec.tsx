import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Alert, Text, TextInput } from 'react-native'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      ({
        'club.setupWizard.createTitle': 'Create club',
        'club.setupWizard.createSubtitle': 'Club details',
        'club.setupWizard.teamTitle': 'Create team',
        'club.setupWizard.teamSubtitle': 'Team details',
        'club.setupWizard.clubNamePlaceholder': 'FC Example',
        'club.setupWizard.teamNamePlaceholder': 'First team',
        'club.setupWizard.ageGroup': 'Age group',
        'club.setupWizard.nextButton': 'Next',
        'club.setupWizard.createButton': 'Submit claim',
        'club.clubName': 'Club name',
        'club.primaryColor': 'Club colour',
        'team.teamName': 'Team name',
        'common.back': 'Back',
        'errors.server': 'Server error',
      })[key] ??
      options?.defaultValue ??
      key,
  }),
}))
jest.mock('../../src/i18n', () => ({ getAppLanguage: () => 'en' }))
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn() },
}))

const mockReplace = jest.fn()
const searchParams: { clubName?: string; directoryEntryId?: string } = {}
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), back: jest.fn() },
  useLocalSearchParams: () => searchParams,
}))

const mockApi = jest.fn()
jest.mock('../../src/api/client', () => ({
  ...jest.requireActual('../../src/api/client'),
  api: (...args: unknown[]) => mockApi(...args),
}))

import ClubSetupScreen from '../club-setup'

function text(node: any): string {
  return node.children
    .map((child: any) => (typeof child === 'string' ? child : text(child)))
    .join('')
}

function button(tree: any, label: string) {
  const match = tree.root
    .findAll((node: any) => node.props?.accessibilityRole === 'button')
    .find((node: any) => node.findAllByType(Text).some((item: any) => text(item) === label))
  if (!match) throw new Error(`Button ${label} not found`)
  return match
}

describe('ClubSetupScreen verified activation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete searchParams.clubName
    delete searchParams.directoryEntryId
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn())
  })

  afterEach(() => jest.restoreAllMocks())

  it('requires an official directory selection before continuing', async () => {
    let tree: any
    await act(async () => {
      tree = renderer.create(<ClubSetupScreen />)
    })
    await act(async () => {
      tree.root.findAllByType(TextInput)[0].props.onChangeText('FC QA')
    })
    await act(async () => {
      button(tree, 'Next').props.onPress()
    })
    expect(Alert.alert).toHaveBeenCalledWith(
      'Select your official club',
      'Club activation starts from a verified directory result.',
      expect.any(Array),
    )
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('submits an inert authority claim and routes to review status', async () => {
    searchParams.clubName = 'SV Directory'
    searchParams.directoryEntryId = 'dir-1'
    mockApi.mockResolvedValue({ id: 'claim-1' })
    let tree: any
    await act(async () => {
      tree = renderer.create(<ClubSetupScreen />)
    })
    await act(async () => {
      button(tree, 'Next').props.onPress()
    })
    await act(async () => {
      tree.root.findAllByType(TextInput)[0].props.onChangeText('Herren III')
    })
    await act(async () => {
      await button(tree, 'Submit claim').props.onPress()
    })
    expect(mockApi).toHaveBeenCalledWith('/club-claims/first', {
      method: 'POST',
      body: {
        directoryEntryId: 'dir-1',
        teamName: 'Herren III',
        teamGroupType: 'SENIOR',
        teamRoles: [],
        primaryColor: '#1E3A5F',
      },
    })
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(auth)/claim-pending',
      params: { claimId: 'claim-1' },
    })
  })

  it('shows claim submission failures inline', async () => {
    searchParams.clubName = 'SV Directory'
    searchParams.directoryEntryId = 'dir-1'
    mockApi.mockRejectedValue(new Error('Claim already under review'))
    let tree: any
    await act(async () => {
      tree = renderer.create(<ClubSetupScreen />)
    })
    await act(async () => {
      button(tree, 'Next').props.onPress()
    })
    await act(async () => {
      tree.root.findAllByType(TextInput)[0].props.onChangeText('Herren III')
    })
    await act(async () => {
      await button(tree, 'Submit claim').props.onPress()
    })
    expect(
      tree.root
        .findAllByType(Text)
        .some((node: any) => text(node) === 'Claim already under review'),
    ).toBe(true)
  })
})
