import type React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'

const mockBack = jest.fn()
const mockCanGoBack = jest.fn()
const mockReplace = jest.fn()

jest.mock('expo-router', () => ({
  router: {
    back: mockBack,
    canGoBack: mockCanGoBack,
    replace: mockReplace,
  },
}))

jest.mock('../../utils/useSafeAreaInsetsSafe', () => ({
  useSafeAreaInsetsSafe: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    borderDefault: '#dddddd',
    surface: '#ffffff',
    textPrimary: '#111111',
  }),
}))

jest.mock('../ui', () => ({
  Icon: () => null,
}))

jest.mock('../ui/Text', () => ({
  Text: (props: { children?: React.ReactNode }) => {
    const { Text } = require('react-native')
    return <Text {...props}>{props.children}</Text>
  },
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({ 'common.back': 'Back', 'common.close': 'Close' })[key] ?? key,
  }),
}))

const { ModalHeader } = require('../ModalHeader') as typeof import('../ModalHeader')

describe('ModalHeader', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockCanGoBack.mockReset().mockReturnValue(true)
    mockReplace.mockReset()
  })

  it('uses native back when history is available', () => {
    render(<ModalHeader mode="back" />)

    fireEvent.press(screen.getByLabelText('Back'))

    expect(mockBack).toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('falls back to the app root when there is no back history', () => {
    mockCanGoBack.mockReturnValue(false)

    render(<ModalHeader mode="back" />)

    fireEvent.press(screen.getByLabelText('Back'))

    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })

  it('honors custom close handlers', () => {
    const onClose = jest.fn()

    render(<ModalHeader onClose={onClose} />)

    fireEvent.press(screen.getByLabelText('Close'))

    expect(onClose).toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
