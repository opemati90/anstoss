import React from 'react'
import { fireEvent, render } from '@testing-library/react-native'
import { ReleaseNotices } from '../ReleaseNotices'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version?: string }) => {
      if (key === 'update.available') return 'Update available'
      if (key === 'update.availableBody') return `Version ${options?.version}`
      if (key === 'update.openStore') return 'Update now'
      return key
    },
  }),
}))

jest.mock('../../utils/useSafeAreaInsetsSafe', () => ({
  useSafeAreaInsetsSafe: () => ({ top: 20, right: 0, bottom: 0, left: 0 }),
}))

jest.mock('../ui/Banner', () => ({
  Banner: (props: {
    title: string
    description?: string
    action?: { label: string; onPress: () => void }
    onDismiss?: () => void
    testID?: string
  }) => {
    const ReactRuntime = require('react')
    const { Pressable, Text, View } = require('react-native')
    return ReactRuntime.createElement(
      View,
      { testID: props.testID },
      ReactRuntime.createElement(Text, null, props.title),
      props.description
        ? ReactRuntime.createElement(Text, null, props.description)
        : null,
      props.action
        ? ReactRuntime.createElement(
            Pressable,
            {
              accessibilityLabel: props.action.label,
              onPress: props.action.onPress,
            },
            ReactRuntime.createElement(Text, null, props.action.label),
          )
        : null,
      props.onDismiss
        ? ReactRuntime.createElement(Pressable, {
            accessibilityLabel: `dismiss-${props.testID}`,
            onPress: props.onDismiss,
          })
        : null,
    )
  },
}))

describe('ReleaseNotices', () => {
  it('renders and dismisses the live announcement', () => {
    const onDismissAnnouncement = jest.fn()
    const screen = render(
      <ReleaseNotices
        announcement="Maintenance at 20:00"
        softUpdate={false}
        onOpenStore={jest.fn()}
        onDismissAnnouncement={onDismissAnnouncement}
        onDismissSoftUpdate={jest.fn()}
      />,
    )

    expect(screen.getByText('Maintenance at 20:00')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('dismiss-release-announcement'))
    expect(onDismissAnnouncement).toHaveBeenCalledTimes(1)
  })

  it('renders the recommended version and opens the store', () => {
    const onOpenStore = jest.fn()
    const screen = render(
      <ReleaseNotices
        softUpdate
        recommendedVersion="1.4.0"
        onOpenStore={onOpenStore}
        onDismissAnnouncement={jest.fn()}
        onDismissSoftUpdate={jest.fn()}
      />,
    )

    expect(screen.getByText('Version 1.4.0')).toBeTruthy()
    fireEvent.press(screen.getByLabelText('Update now'))
    expect(onOpenStore).toHaveBeenCalledTimes(1)
  })
})
