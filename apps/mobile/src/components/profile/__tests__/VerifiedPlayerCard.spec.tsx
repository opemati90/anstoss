import type React from 'react'
import { render, screen } from '@testing-library/react-native'
import { VerifiedPlayerCard } from '../VerifiedPlayerCard'

jest.mock('../../ui', () => {
  const { Text, View } = require('react-native')
  return {
    Avatar: () => <View />,
    Icon: () => <View />,
    StatusPill: ({ label }: { label: string }) => <Text>{label}</Text>,
    Text: ({ children }: { children?: React.ReactNode }) => <Text>{children}</Text>,
  }
})

jest.mock('../../../context/ClubThemeContext', () => ({
  useClubColors: () => ({
    borderSubtle: '#dddddd',
    primary: '#cc0000',
    surfaceRaised: '#ffffff',
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number; rank?: number; total?: number }) => {
      if (key === 'verifiedCard.verified') return 'Verified'
      if (key === 'verifiedCard.weeksUnit') return 'weeks'
      if (key === 'verifiedCard.longest') return `Best: ${values?.count ?? 0}`
      if (key === 'verifiedCard.rank') return `#${values?.rank} of ${values?.total}`
      return key
    },
  }),
}))

const streaks = {
  attendanceWeeks: 0,
  attendanceLongest: 0,
  motmWeeks: 0,
  motmLongest: 0,
  lastActivityAt: '',
}

describe('VerifiedPlayerCard', () => {
  it('does not claim verification when no backend verification state is supplied', () => {
    render(<VerifiedPlayerCard name="Opeyemi" streaks={streaks} />)

    expect(screen.queryByText('Verified')).not.toBeOnTheScreen()
  })

  it('shows the badge only when verification is explicitly confirmed', () => {
    render(<VerifiedPlayerCard name="Opeyemi" streaks={streaks} isVerified />)

    expect(screen.getByText('Verified')).toBeOnTheScreen()
  })
})
