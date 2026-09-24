import React from 'react'
import { Pressable, Text } from 'react-native'
import { fireEvent, render } from '@testing-library/react-native'
import { HomeErrorBoundary } from '../HomeErrorBoundary'

jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
}))

function Exploder(): React.ReactElement {
  throw new Error('boom')
}

describe('HomeErrorBoundary', () => {
  const originalError = console.error

  beforeAll(() => {
    console.error = jest.fn()
  })

  afterAll(() => {
    console.error = originalError
  })

  it('renders children when no error occurs', () => {
    const { getByText } = render(
      <HomeErrorBoundary fallback={() => <Text>fallback</Text>}>
        <Text>child</Text>
      </HomeErrorBoundary>,
    )
    expect(getByText('child')).toBeTruthy()
  })

  it('renders fallback when a child throws', () => {
    const { getByText } = render(
      <HomeErrorBoundary fallback={(error) => <Text>err:{error.message}</Text>}>
        <Exploder />
      </HomeErrorBoundary>,
    )
    expect(getByText('err:boom')).toBeTruthy()
  })

  it('remounts the children when the fallback calls reset', () => {
    let shouldThrow = true
    function Flaky(): React.ReactElement {
      if (shouldThrow) throw new Error('flaky')
      return <Text>recovered</Text>
    }
    const { getByText } = render(
      <HomeErrorBoundary
        fallback={(_error, reset) => (
          <Pressable accessibilityRole="button" onPress={reset}>
            <Text>retry</Text>
          </Pressable>
        )}
      >
        <Flaky />
      </HomeErrorBoundary>,
    )
    shouldThrow = false
    fireEvent.press(getByText('retry'))
    expect(getByText('recovered')).toBeTruthy()
  })
})
