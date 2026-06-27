import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Alert, Text, TextInput } from 'react-native'

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' }),
  ),
  launchImageLibraryAsync: jest.fn(() =>
    Promise.resolve({ canceled: true, assets: [] }),
  ),
}))

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { PNG: 'png' },
}))

function mockT(
  key: string,
  options?: { defaultValue?: string } & Record<string, unknown>,
) {
  const translations: Record<string, string> = {
    'club.setupWizard.createTitle': 'Verein erstellen',
    'club.setupWizard.createSubtitle': 'Club details',
    'club.setupWizard.teamTitle': 'Mannschaft anlegen',
    'club.setupWizard.teamSubtitle': 'Team details',
    'club.setupWizard.clubNameRequiredBody': 'Club name is required',
    'club.setupWizard.teamNameRequiredBody': 'Team name is required',
    'club.setupWizard.activationRefreshFailed':
      'Dein Verein wurde erstellt, aber wir konnten ihn auf diesem Gerät nicht aktivieren.',
    'club.setupWizard.badgeUploadFailed': 'Badge upload failed',
    'club.setupWizard.clubNamePlaceholder': 'FC Beispiel',
    'club.setupWizard.teamNamePlaceholder': 'Herren III',
    'club.setupWizard.ageGroup': 'Altersklasse',
    'club.setupWizard.nextButton': 'Weiter',
    'club.setupWizard.createButton': 'Verein erstellen',
    'club.setupWizard.activationRetryButton': 'Weiter',
    'club.clubName': 'Vereinsname',
    'club.primaryColor': 'Vereinsfarbe',
    'team.teamName': 'Mannschaftsname',
    'common.back': 'Zurück',
    'common.close': 'Schließen',
    'common.errorTitle': 'Fehler',
    'errors.server': 'Serverfehler',
  }

  return translations[key] ?? options?.defaultValue ?? key
}

function mockChangeLanguage() {
  return Promise.resolve()
}

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
  }),
}))

jest.mock('../../src/i18n', () => ({
  __esModule: true,
  default: {
    changeLanguage: mockChangeLanguage,
    resolvedLanguage: 'de',
    language: 'de',
    t: mockT,
  },
  getAppLanguage: () => 'de',
}))

import ClubSetupScreen from '../club-setup'
import i18n from '../../src/i18n'
import { useAuth } from '../../src/context/AuthContext'
import { ApiError, api } from '../../src/api/client'

jest.useFakeTimers()

const mockRouterReplace = jest.fn()
const mockSearchParams: { clubName?: string; directoryEntryId?: string } = {}

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
  },
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../../src/api/client', () => {
  const actual = jest.requireActual('../../src/api/client')
  return {
    ...actual,
    api: jest.fn(),
  }
})

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: any[]) => mockRouterReplace(...args),
    back: jest.fn(),
  },
  useLocalSearchParams: () => mockSearchParams,
}))

const mockedUseAuth = useAuth as jest.Mock
const mockedApi = api as jest.Mock
const mockRefreshUser = jest.fn()
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn())
const mountedRoots: Array<ReturnType<typeof renderer.create>> = []

function collectText(node: any): string {
  return node.children
    .map((child: any) => (typeof child === 'string' ? child : collectText(child)))
    .join('')
}

function findButton(root: any, label: string) {
  const button = root.root
    .findAll((node: any) => node.props?.accessibilityRole === 'button')
    .find((node: any) =>
      node
        .findAllByType(Text)
        .some((textNode: any) => collectText(textNode) === label),
    )

  if (!button) {
    throw new Error(`Button "${label}" not found`)
  }

  return button
}

function getInputs(root: any) {
  return root.root.findAllByType(TextInput)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('ClubSetupScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
    mockedApi.mockReset()
    mockRefreshUser.mockReset()
    mockRouterReplace.mockReset()
    delete mockSearchParams.clubName
    delete mockSearchParams.directoryEntryId
    mockedUseAuth.mockReturnValue({
      refreshUser: mockRefreshUser,
    })
    await act(async () => {
      await i18n.changeLanguage('de')
    })
  })

  afterEach(() => {
    for (const root of mountedRoots.splice(0)) {
      act(() => {
        root.unmount()
      })
    }

    act(() => {
      jest.runOnlyPendingTimers()
    })
  })

  afterAll(() => {
    mockAlert.mockRestore()
  })

  it('surfaces ApiError messages from club setup failures', async () => {
    mockedApi.mockRejectedValue(new ApiError('Club slug already exists', 409))

    let tree: any

    await act(async () => {
      tree = renderer.create(<ClubSetupScreen />)
    })
    mountedRoots.push(tree)

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('FC QA')
    })

    await act(async () => {
      findButton(tree, 'Weiter').props.onPress()
    })

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('Herren III')
    })

    await act(async () => {
      await findButton(tree, 'Verein erstellen').props.onPress()
    })

    act(() => {
      jest.runOnlyPendingTimers()
    })

    // Errors are now shown inline via InlineError, not Alert.alert()
    const allText = tree.root.findAllByType(Text)
    const hasErrorText = allText.some((node: any) => collectText(node) === 'Club slug already exists')
    expect(hasErrorText).toBe(true)
  })

  it('surfaces non-ApiError messages from club setup failures', async () => {
    mockedApi.mockRejectedValue(new SyntaxError('Unexpected end of JSON input'))

    let tree: any

    await act(async () => {
      tree = renderer.create(<ClubSetupScreen />)
    })
    mountedRoots.push(tree)

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('FC QA')
    })

    await act(async () => {
      findButton(tree, 'Weiter').props.onPress()
    })

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('Herren III')
    })

    await act(async () => {
      await findButton(tree, 'Verein erstellen').props.onPress()
    })

    act(() => {
      jest.runOnlyPendingTimers()
    })

    // Errors are now shown inline via InlineError, not Alert.alert()
    const allText = tree.root.findAllByType(Text)
    const hasErrorText = allText.some((node: any) => collectText(node) === 'Unexpected end of JSON input')
    expect(hasErrorText).toBe(true)
  })

  it('refreshes into the newly created club before starting onboarding', async () => {
    mockedApi.mockResolvedValue({
      club: { id: 'club-new' },
    })

    let tree: any

    await act(async () => {
      tree = renderer.create(<ClubSetupScreen />)
    })
    mountedRoots.push(tree)

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('FC QA')
    })

    await act(async () => {
      findButton(tree, 'Weiter').props.onPress()
    })

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('Herren III')
    })

    await act(async () => {
      await findButton(tree, 'Verein erstellen').props.onPress()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockRefreshUser).toHaveBeenCalledWith(undefined, {
      preferredClubId: 'club-new',
      throwOnError: true,
    })
    // club-setup routes to '/' (root index re-routes by membership/role) — the
    // old '/onboarding' was a dead route.
    expect(mockRouterReplace).toHaveBeenCalledWith('/')
  })

  it('does not duplicate-create a club when activation refresh fails and is retried', async () => {
    mockedApi.mockResolvedValue({
      club: { id: 'club-new' },
    })
    mockRefreshUser
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)

    let tree: any

    await act(async () => {
      tree = renderer.create(<ClubSetupScreen />)
    })
    mountedRoots.push(tree)

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('FC QA')
    })

    await act(async () => {
      findButton(tree, 'Weiter').props.onPress()
    })

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('Herren III')
    })

    await act(async () => {
      await findButton(tree, 'Verein erstellen').props.onPress()
    })

    const allTextAfterFailure = tree.root.findAllByType(Text)
    expect(
      allTextAfterFailure.some((node: any) =>
        collectText(node).includes('Dein Verein wurde erstellt'),
      ),
    ).toBe(true)
    expect(() => findButton(tree, 'Zurück')).toThrow('Button "Zurück" not found')
    expect(findButton(tree, 'Weiter')).toBeTruthy()
    expect(mockRouterReplace).not.toHaveBeenCalled()

    const headerClose = tree.root
      .findAll((node: any) => node.props?.accessibilityRole === 'button')
      .find((node: any) => node.props.accessibilityLabel === 'Schließen')
    if (!headerClose) {
      throw new Error('Header close button not found')
    }

    await act(async () => {
      await headerClose.props.onPress()
    })

    const setupCalls = mockedApi.mock.calls.filter(
      ([path]) => path === '/clubs/setup',
    )
    expect(setupCalls).toHaveLength(1)
    expect(mockRefreshUser).toHaveBeenCalledTimes(2)
    expect(mockRefreshUser).toHaveBeenLastCalledWith(undefined, {
      preferredClubId: 'club-new',
      throwOnError: true,
    })
    expect(mockRouterReplace).toHaveBeenCalledWith('/')
  })

  it('does not allow backing out while club creation is still in flight', async () => {
    const setup = deferred<{ club: { id: string } }>()
    mockedApi.mockReturnValue(setup.promise)

    let tree: any

    await act(async () => {
      tree = renderer.create(<ClubSetupScreen />)
    })
    mountedRoots.push(tree)

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('FC QA')
    })

    await act(async () => {
      findButton(tree, 'Weiter').props.onPress()
    })

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('Herren III')
    })

    await act(async () => {
      findButton(tree, 'Verein erstellen').props.onPress()
      await Promise.resolve()
    })

    await act(async () => {
      findButton(tree, 'Zurück').props.onPress()
    })

    const headerBack = tree.root
      .findAll((node: any) => node.props?.accessibilityRole === 'button')
      .find((node: any) => node.props.accessibilityLabel === 'Zurück')
    if (!headerBack) {
      throw new Error('Header back button not found')
    }

    await act(async () => {
      headerBack.props.onPress()
    })

    expect(getInputs(tree)[0].props.value).toBe('Herren III')
    expect(mockRouterReplace).not.toHaveBeenCalled()

    await act(async () => {
      setup.resolve({ club: { id: 'club-new' } })
      await setup.promise
    })
  })

  it('prefills and links a directory club during setup', async () => {
    mockSearchParams.clubName = 'SV Directory'
    mockSearchParams.directoryEntryId = 'dir-1'
    mockedApi.mockResolvedValue({
      club: { id: 'club-new' },
    })

    let tree: any

    await act(async () => {
      tree = renderer.create(<ClubSetupScreen />)
    })
    mountedRoots.push(tree)

    expect(getInputs(tree)[0].props.value).toBe('SV Directory')

    await act(async () => {
      findButton(tree, 'Weiter').props.onPress()
    })

    await act(async () => {
      getInputs(tree)[0].props.onChangeText('Herren III')
    })

    await act(async () => {
      await findButton(tree, 'Verein erstellen').props.onPress()
    })

    expect(mockedApi).toHaveBeenCalledWith('/clubs/setup', {
      method: 'POST',
      body: {
        club: { name: 'SV Directory', primaryColor: '#1E3A5F' },
        team: { name: 'Herren III', ageGroup: 'Herren' },
        directoryEntryId: 'dir-1',
      },
    })
  })
})
