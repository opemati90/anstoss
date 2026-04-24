import React from 'react'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { LoadingBoundary } from '../LoadingBoundary'

describe('LoadingBoundary', () => {
  it('renders the skeleton when isLoading is true', () => {
    const { getByTestId, queryByTestId } = render(
      <LoadingBoundary
        isLoading
        skeleton={<Text testID="skel">skeleton</Text>}
        testID="lb"
      >
        <Text testID="content">content</Text>
      </LoadingBoundary>,
    )
    expect(getByTestId('skel')).toBeTruthy()
    expect(queryByTestId('content')).toBeNull()
  })

  it('renders children when isLoading is false', () => {
    const { getByTestId, queryByTestId } = render(
      <LoadingBoundary
        isLoading={false}
        skeleton={<Text testID="skel">skeleton</Text>}
      >
        <Text testID="content">content</Text>
      </LoadingBoundary>,
    )
    expect(getByTestId('content')).toBeTruthy()
    expect(queryByTestId('skel')).toBeNull()
  })

  it('swaps skeleton for children when isLoading transitions true -> false', () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <LoadingBoundary
        isLoading
        skeleton={<Text testID="skel">skeleton</Text>}
      >
        <Text testID="content">content</Text>
      </LoadingBoundary>,
    )
    expect(getByTestId('skel')).toBeTruthy()

    rerender(
      <LoadingBoundary
        isLoading={false}
        skeleton={<Text testID="skel">skeleton</Text>}
      >
        <Text testID="content">content</Text>
      </LoadingBoundary>,
    )
    expect(getByTestId('content')).toBeTruthy()
    expect(queryByTestId('skel')).toBeNull()
  })

  it('attaches testID to the wrapping view', () => {
    const { getByTestId } = render(
      <LoadingBoundary isLoading skeleton={null} testID="lb">
        <Text>c</Text>
      </LoadingBoundary>,
    )
    expect(getByTestId('lb')).toBeTruthy()
  })
})
