import React from 'react'
import { render } from '@testing-library/react-native'

import ParentScheduleScreen from '../parent-schedule'

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const React = require('react')
    const { Text } = require('react-native')
    return React.createElement(Text, null, href)
  },
}))

describe('ParentScheduleScreen layout', () => {
  it('redirects the legacy route to the schedule tab', () => {
    const screen = render(<ParentScheduleScreen />)

    expect(screen.getByText('/(tabs)/events')).toBeTruthy()
  })
})
