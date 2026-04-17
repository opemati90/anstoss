import { fireEvent, render } from '@testing-library/react-native'
import { ForceUpdateScreen } from '../ForceUpdateScreen'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'update.openStore': 'Open App Store',
        'update.required': 'Update required',
        'update.requiredBody': 'Install the latest version to continue.',
      }
      return map[key] ?? key
    },
  }),
}))

jest.mock('../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    background: '#FFFFFF',
    textInverse: '#FFFFFF',
    textPrimary: '#101828',
    textSecondary: '#475467',
  }),
}))

describe('ForceUpdateScreen', () => {
  it('blocks the app behind an update action', () => {
    const onUpdate = jest.fn()

    const screen = render(<ForceUpdateScreen onUpdate={onUpdate} />)

    expect(screen.getByText('Update required')).toBeTruthy()
    expect(screen.getByText('Install the latest version to continue.')).toBeTruthy()

    fireEvent.press(screen.getByLabelText('Open App Store'))

    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})
