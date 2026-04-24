import React from 'react'
import { Text } from 'react-native'
import { render } from '@testing-library/react-native'
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
})
