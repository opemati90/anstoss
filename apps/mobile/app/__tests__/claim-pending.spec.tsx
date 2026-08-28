import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import ClaimPendingScreen from '../(auth)/claim-pending'

const mockApi = jest.fn()
const mockReplace = jest.fn()
let mockClaimId: string | undefined = 'claim-1'

jest.mock('../../src/api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ claimId: mockClaimId }),
  useRouter: () => ({ replace: mockReplace }),
}))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ refreshUser: jest.fn() }),
}))
jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    background: '#fff',
    surface: '#fff',
    border: '#ddd',
    primary50: '#fee',
  }),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('claim pending flow', () => {
  beforeEach(() => {
    mockClaimId = 'claim-1'
    mockApi.mockReset()
    mockReplace.mockReset()
    mockApi.mockResolvedValueOnce([
      {
        id: 'claim-1',
        status: 'NEEDS_INFO',
        reviewNote: 'Upload the official team page.',
        directoryEntry: { name: 'FC Test' },
      },
    ])
  })

  it('loads NEEDS_INFO on mount and shows the response field without an extra tap', async () => {
    const screen = render(<ClaimPendingScreen />)
    await waitFor(() => expect(screen.getByText('Upload the official team page.')).toBeTruthy())
    expect(screen.getByText('claimPending.responseLabel')).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/club-claims/mine')
  })

  it('submits requested evidence and returns to review', async () => {
    mockApi.mockResolvedValueOnce({})
    const screen = render(<ClaimPendingScreen />)
    await waitFor(() => expect(screen.getByText('claimPending.responseLabel')).toBeTruthy())
    fireEvent.changeText(
      screen.getByPlaceholderText('claimPending.responsePlaceholder'),
      'Here is the official link',
    )
    fireEvent.press(screen.getByText('claimPending.sendResponse'))
    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/club-claims/claim-1/respond', {
        method: 'POST',
        body: { note: 'Here is the official link' },
      }),
    )
  })

  it('never falls back to another claim when the routed claim id is absent', async () => {
    mockClaimId = 'claim-does-not-exist'
    mockApi.mockReset()
    mockApi.mockResolvedValueOnce([
      {
        id: 'another-users-flow',
        status: 'NEEDS_INFO',
        reviewNote: 'This note must not be displayed.',
        directoryEntry: { name: 'Another club' },
      },
    ])

    const screen = render(<ClaimPendingScreen />)

    await waitFor(() => expect(screen.getByText('claimPending.missing')).toBeTruthy())
    expect(screen.queryByText('This note must not be displayed.')).toBeNull()
    expect(screen.queryByText('claimPending.withdraw')).toBeNull()
    expect(screen.queryByText('claimPending.sendResponse')).toBeNull()

    fireEvent.press(screen.getByText('claimPending.startAgain'))
    expect(mockReplace).toHaveBeenCalledWith('/find-club')
  })

  it('withdraws the exact pending staff claim', async () => {
    mockClaimId = 'staff-claim-1'
    mockApi.mockReset()
    mockApi
      .mockResolvedValueOnce([
        {
          id: 'staff-claim-1',
          status: 'SUBMITTED',
          directoryEntry: { name: 'FC Test' },
        },
      ])
      .mockResolvedValueOnce({})

    const screen = render(<ClaimPendingScreen />)
    const withdraw = await screen.findByText('claimPending.withdraw')
    fireEvent.press(withdraw)

    await waitFor(() =>
      expect(mockApi).toHaveBeenCalledWith('/club-claims/staff-claim-1/withdraw', {
        method: 'POST',
      }),
    )
    expect(mockReplace).toHaveBeenCalledWith('/find-club')
  })
})
