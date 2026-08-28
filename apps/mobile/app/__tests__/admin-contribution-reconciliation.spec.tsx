import React from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import Screen from '../admin-contribution-reconciliation'
import { api } from '../../src/api/client'

const mockApi = api as jest.Mock

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' }, readAsStringAsync: jest.fn(),
}))
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }))
jest.mock('../../src/api/client', () => ({ api: jest.fn() }))
jest.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ activeClub: { club: { id: 'club-1' }, role: 'OWNER' } }),
}))
jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    primary: '#111', surfaceSunken: '#fff', surface: '#fff', borderDefault: '#ddd',
    textPrimary: '#111', textSecondary: '#666', textTertiary: '#888',
  }),
  useIsDark: () => false,
}))
jest.mock('../../src/hooks/useEntitlements', () => ({
  useEntitlements: () => ({ data: {}, loading: false, error: null, has: () => true }),
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string, options?: { count?: number }) => ({
      'contributions.reconciliation.title': 'Bank reconciliation',
      'contributions.reconciliation.introTitle': 'Match bank transfers',
      'contributions.reconciliation.introBody': 'Intro',
      'contributions.reconciliation.importAction': 'Import',
      'contributions.reconciliation.recentImports': 'Recent imports',
      'contributions.reconciliation.manualTitle': 'Manual matching',
      'contributions.reconciliation.manualFooter': 'Footer',
      'contributions.reconciliation.unknownPayer': 'Unknown payer',
      'contributions.reconciliation.noReference': 'No reference',
      'contributions.reconciliation.match': 'Match',
      'contributions.reconciliation.suggestionsTitle': 'Suggested matches',
      'contributions.reconciliation.suggestionsFooter': 'Suggestions footer',
      'contributions.reconciliation.noSuggestionsTitle': 'No suggestions',
      'contributions.reconciliation.noSuggestionsBody': 'Reviewed',
      'contributions.reconciliation.manualSheetTitle': 'Match transfer manually',
      'contributions.reconciliation.manualSheetBody': 'Select contribution',
      'contributions.reconciliation.outstandingListLabel': 'Outstanding contributions',
      'contributions.reconciliation.amount': 'Amount',
      'contributions.reconciliation.confirmAllocation': 'Confirm allocation',
      'contributions.reconciliation.transactionCount': `${options?.count} transactions`,
      'common.cancel': 'Cancel',
    } as Record<string, string>)[key] ?? key,
  }),
}))

describe('bank reconciliation manual matching', () => {
  it('keeps every outstanding record reachable in the scrollable selector', async () => {
    const transaction = {
      id: 'tx-1', amount: 5000, currency: 'EUR', payerName: 'Alex', reference: null,
      bookedAt: '2026-08-28T00:00:00Z', matches: [],
    }
    const batch = {
      id: 'batch-1', fileName: 'bank.csv', format: 'CSV', rowCount: 1,
      createdAt: '2026-08-28T00:00:00Z', transactions: [transaction],
    }
    const records = Array.from({ length: 12 }, (_, index) => ({
      id: `record-${index + 1}`, amount: 5000, paidAmount: 0, currency: 'EUR',
      member: { id: `member-${index + 1}`, name: `Member ${index + 1}` },
    }))
    mockApi.mockImplementation((path: string, options?: { method?: string; body?: unknown }) => {
      if (options?.method === 'POST') return Promise.resolve({ ok: true })
      if (path.endsWith('/records/outstanding')) return Promise.resolve(records)
      if (path.endsWith('/suggestions')) return Promise.resolve([])
      if (path.endsWith('/batch-1')) return Promise.resolve(batch)
      return Promise.resolve([batch])
    })

    const view = render(<Screen />)
    await waitFor(() => expect(view.getByText('Alex')).toBeTruthy())
    fireEvent.press(view.getByText('Match'))
    expect(view.getByLabelText('Outstanding contributions')).toBeTruthy()
    expect(view.getByText('Member 12')).toBeTruthy()
    fireEvent.press(view.getByText('Member 12'))
    fireEvent.press(view.getByText('Confirm allocation'))

    await waitFor(() => expect(mockApi).toHaveBeenCalledWith(
      '/clubs/club-1/contributions/imports/matches/confirm',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ recordId: 'record-12', transactionId: 'tx-1' }),
      }),
    ))
  })
})
