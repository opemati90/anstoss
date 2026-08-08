import { fireEvent, render, screen, within } from '@testing-library/react-native'
import { KeyboardAvoidingView, ScrollView, Text } from 'react-native'
import { WizardStep } from '../WizardStep'

const mockBack = jest.fn()
const mockCanGoBack = jest.fn()
const mockReplace = jest.fn()

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    canGoBack: mockCanGoBack,
    push: jest.fn(),
    replace: mockReplace,
  }),
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: jest.fn() },
  useTranslation: () => ({
    t: (key: string) => ({ 'common.back': 'Back' })[key] ?? key,
  }),
}))

describe('WizardStep', () => {
  beforeEach(() => {
    mockBack.mockReset()
    mockCanGoBack.mockReset().mockReturnValue(true)
    mockReplace.mockReset()
  })

  it('renders title, hint, child body, and CTA', () => {
    render(
      <WizardStep
        title="Your phone"
        hint="We text a 6-digit code."
        ctaLabel="Continue"
        onCta={jest.fn()}
        progress={0.4}
      >
        <Text>body</Text>
      </WizardStep>,
    )
    expect(screen.getByText('Your phone')).toBeOnTheScreen()
    expect(screen.getByText('We text a 6-digit code.')).toBeOnTheScreen()
    expect(screen.getByText('body')).toBeOnTheScreen()
    expect(screen.getByText('Continue')).toBeOnTheScreen()
  })

  it('keeps the CTA outside the keyboard-avoiding form area', () => {
    const view = render(
      <WizardStep title="About you" ctaLabel="Continue" onCta={jest.fn()} scrollable>
        <Text>Date of birth</Text>
      </WizardStep>,
    )

    const keyboardArea = view.UNSAFE_getByType(KeyboardAvoidingView)
    expect(within(keyboardArea).queryByText('Continue')).toBeNull()
    expect(screen.getByText('Continue')).toBeOnTheScreen()
  })

  it('lets keyboard users dismiss a scrollable form interactively', () => {
    const view = render(
      <WizardStep title="About you" scrollable>
        <Text>Date of birth</Text>
      </WizardStep>,
    )

    expect(view.UNSAFE_getByType(ScrollView).props.keyboardDismissMode).toBeTruthy()
  })

  it('can temporarily lock a parent form scroll for nested wheel controls', () => {
    const view = render(
      <WizardStep title="About you" scrollable scrollEnabled={false}>
        <Text>Date of birth</Text>
      </WizardStep>,
    )

    expect(view.UNSAFE_getByType(ScrollView).props.scrollEnabled).toBe(false)
  })

  it('disables the CTA when ctaDisabled is true', () => {
    const onCta = jest.fn()
    render(
      <WizardStep title="t" ctaLabel="Next" onCta={onCta} ctaDisabled>
        <Text>x</Text>
      </WizardStep>,
    )
    fireEvent.press(screen.getByText('Next'))
    expect(onCta).not.toHaveBeenCalled()
  })

  it('calls onBack when the back chevron is pressed', () => {
    const onBack = jest.fn()
    render(
      <WizardStep title="t" ctaLabel="Next" onCta={jest.fn()} onBack={onBack}>
        <Text>x</Text>
      </WizardStep>,
    )
    fireEvent.press(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalled()
  })

  it('falls back to the app root when the back chevron has no history', () => {
    mockCanGoBack.mockReturnValue(false)

    render(
      <WizardStep title="t" ctaLabel="Next" onCta={jest.fn()}>
        <Text>x</Text>
      </WizardStep>,
    )

    fireEvent.press(screen.getByLabelText('Back'))

    expect(mockBack).not.toHaveBeenCalled()
    expect(mockReplace).toHaveBeenCalledWith('/')
  })
})
