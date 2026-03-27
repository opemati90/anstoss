import React from 'react'
import renderer, { act } from 'react-test-renderer'
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native'

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

import ClubSetupScreen from '../club-setup'
import i18n from '../../src/i18n'
import { useAuth } from '../../src/context/AuthContext'
import { ApiError, api } from '../../src/api/client'

jest.useFakeTimers()

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
    replace: jest.fn(),
    back: jest.fn(),
  },
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
  const button = root.root.findAllByType(TouchableOpacity).find((node: any) =>
    node.findAllByType(Text).some((textNode: any) => collectText(textNode) === label),
  )

  if (!button) {
    throw new Error(`Button "${label}" not found`)
  }

  return button
}

function getInputs(root: any) {
  return root.root.findAllByType(TextInput)
}

describe('ClubSetupScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks()
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

    expect(mockAlert).toHaveBeenLastCalledWith(
      'Fehler',
      'Club slug already exists',
    )
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

    expect(mockAlert).toHaveBeenLastCalledWith(
      'Fehler',
      'Unexpected end of JSON input',
    )
  })
})
