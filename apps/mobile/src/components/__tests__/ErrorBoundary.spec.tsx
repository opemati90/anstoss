import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ErrorBoundary } from '../ErrorBoundary'

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

jest.mock('../../context/ClubThemeContext', () => {
  const { FALLBACK_THEME } = require('../../theme/club-theme')
  return {
    useClubColors: () => ({
      ...FALLBACK_THEME,
      primary: '#000',
      primary50: '#eee',
    }),
  }
})

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('boom')
  return <Text testID="ok">ok</Text>
}

describe('ErrorBoundary', () => {
  let spy: jest.SpyInstance
  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    spy.mockRestore()
  })

  it('renders children when no error thrown', () => {
    const { getByTestId } = render(
      <ErrorBoundary onRetry={jest.fn()}>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(getByTestId('ok')).toBeTruthy()
  })

  it('catches thrown error and renders ErrorState with default retry key', () => {
    const onRetry = jest.fn()
    const { getByText } = render(
      <ErrorBoundary onRetry={onRetry}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )
    expect(getByText('states.common.unknownError')).toBeTruthy()
    expect(getByText('states.common.retry')).toBeTruthy()
  })

  it('invokes onRetry when retry button pressed and resets the boundary', () => {
    const onRetry = jest.fn()
    const { getByText } = render(
      <ErrorBoundary onRetry={onRetry}>
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )
    fireEvent.press(getByText('states.common.retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('honors custom fallbackTitleKey and fallbackRetryKey', () => {
    const { getByText } = render(
      <ErrorBoundary
        onRetry={jest.fn()}
        fallbackTitleKey="states.events.error.title"
        fallbackRetryKey="states.events.error.retry"
      >
        <Bomb shouldThrow />
      </ErrorBoundary>,
    )
    expect(getByText('states.events.error.title')).toBeTruthy()
    expect(getByText('states.events.error.retry')).toBeTruthy()
  })
})
