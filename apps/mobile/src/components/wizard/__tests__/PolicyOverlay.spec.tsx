import { fireEvent, render, screen } from '@testing-library/react-native'
import { PolicyOverlay } from '../PolicyOverlay'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string) => ({ 'common.close': 'Close' })[key] ?? key,
  }),
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

describe('PolicyOverlay', () => {
  it('uses the localized close label', () => {
    const onClose = jest.fn()

    render(<PolicyOverlay visible kind="privacy" onClose={onClose} />)

    fireEvent.press(screen.getByLabelText('Close'))

    expect(onClose).toHaveBeenCalled()
  })
})
