import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import AdminBillingScreen from '../admin-billing'
import { api } from '../../src/api/client'
import { useAuth } from '../../src/context/AuthContext'

const mockApi = api as jest.Mock
const mockUseAuth = useAuth as jest.Mock
const mockRouterPush = jest.fn()

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
  useFocusEffect: (callback: () => void) => callback(),
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'adminBilling.periodEnd') {
        return `Current period ends ${options?.date}`
      }

      if (key === 'contributions.memberActionTitle') {
        return `Update ${options?.name}`
      }

      const map: Record<string, string> = {
        'common.accessDenied': 'Access denied',
        'common.accessDeniedDescription': 'Only billing managers can open this workspace.',
        'common.errorTitle': 'Error',
        'common.loading': 'Loading',
        'adminBilling.title': 'Billing',
        'adminBilling.platformBillingTitle': 'Platform billing',
        'adminBilling.freePlan': 'Free',
        'adminBilling.proPlan': 'Pro',
        'adminBilling.status.active': 'Active',
        'adminBilling.paymentSetup': 'Payment setup',
        'adminBilling.stripeConnected': 'Stripe connected',
        'adminBilling.stripeNotConnected': 'Stripe not connected',
        'adminBilling.setupStripe': 'Set up Stripe',
        'adminBilling.unavailable': 'Billing unavailable',
        'contributions.sectionTitle': 'Member contributions',
        'contributions.heroTitle': 'Track club dues',
        'contributions.heroBody': 'Finance workspace body',
        'contributions.settingsTitle': 'Contribution settings',
        'contributions.settingsBody': 'Settings body',
        'contributions.enabled': 'Tracking on',
        'contributions.disabled': 'Tracking off',
        'contributions.enableTracking': 'Enable tracking',
        'contributions.disableTracking': 'Disable tracking',
        'contributions.autoRemindersOn': 'Auto reminders on',
        'contributions.autoRemindersOff': 'Auto reminders off',
        'contributions.summaryAssigned': 'Assigned',
        'contributions.summaryPaid': 'Paid',
        'contributions.summaryOverdue': 'Overdue',
        'contributions.summaryOutstanding': 'Outstanding',
        'contributions.summaryCollected': 'Collected',
        'contributions.summaryExpected': 'Expected',
        'contributions.plansTitle': 'Contribution plans',
        'contributions.addPlan': 'Add plan',
        'contributions.editPlan': 'Edit',
        'contributions.emptyPlansTitle': 'No plans',
        'contributions.emptyPlansBody': 'Empty plans',
        'contributions.cadence.MONTHLY': 'Monthly',
        'contributions.cadence.YEARLY': 'Yearly',
        'contributions.targetRole.PLAYER': 'Players',
        'contributions.targetRole.PARENT': 'Parents',
        'contributions.targetRole.COACH': 'Coaches',
        'contributions.targetRole.ADMIN': 'Admins',
        'contributions.targetRole.CUSTOM': 'Custom',
        'contributions.dueLabel': 'Due',
        'contributions.assignedLabel': 'Assigned',
        'contributions.remindersLabel': 'Reminders',
        'contributions.membersTitle': 'Current period',
        'contributions.membersBody': 'Member payment tracking',
        'contributions.sendOverdueReminders': 'Remind overdue',
        'contributions.emptyMembersTitle': 'No members',
        'contributions.emptyMembersBody': 'Empty members',
        'contributions.memberDueDate': `Due ${options?.date}`,
        'contributions.memberNoDueDate': 'No due date',
        'contributions.manageMember': 'Manage',
        'contributions.markPaid': 'Mark paid',
        'contributions.markPending': 'Mark unpaid',
        'contributions.markPartial': 'Mark partial',
        'contributions.markWaived': 'Waive',
        'contributions.markExempt': 'Exempt',
        'contributions.sendReminder': 'Send reminder',
        'contributions.status.PENDING': 'Pending',
        'contributions.status.PAID': 'Paid',
        'contributions.status.PARTIAL': 'Partial',
        'contributions.status.WAIVED': 'Waived',
        'contributions.status.EXEMPT': 'Exempt',
        'contributions.status.OVERDUE': 'Overdue',
        'contributions.monthlyShort': 'Monthly',
        'contributions.loadError': 'Could not load contributions',
      }

      return map[key] ?? key
    },
  }),
}))

jest.mock('../../src/context/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../../src/context/ClubThemeContext', () => ({
  useClubColors: () => ({
    clubPrimary: '#1E3A5F',
    clubPrimaryLight: '#DDE7F1',
    background: '#FAFAF8',
    surface: '#FFFFFF',
    textPrimary: '#1A1A18',
    textSecondary: '#6B6B69',
    textTertiary: '#9E9E9C',
    border: '#E5E5E3',
    borderStrong: '#D1D1CC',
  }),
  useIsDark: () => false,
}))

jest.mock('../../src/api/client', () => ({
  api: jest.fn(),
  // Real ApiError class — useEntitlements does `err instanceof ApiError`
  // and treating ApiError as undefined throws at runtime.
  ApiError: class ApiError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
}))

// Default to entitled club so existing happy-path tests reach the route
// they expect. Individual tests can override this mock to assert the
// paywall path.
jest.mock('../../src/hooks/useEntitlements', () => ({
  useEntitlements: () => ({
    data: null,
    loading: false,
    isPremium: true,
    plan: 'PREMIUM',
    features: ['contribution_intake'],
    has: (slug: string) => slug === 'contribution_intake',
    refresh: jest.fn(),
  }),
}))

jest.mock('../../src/components/ModalHeader', () => ({
  ModalHeader: () => null,
}))

jest.mock('../../src/components/ErrorState', () => ({
  ErrorState: ({ message }: { message: string }) => message,
}))

jest.mock('../../src/components/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
  }: {
    title: string
    description: string
  }) => {
    const React = require('react')
    const { View, Text } = require('react-native')
    return React.createElement(View, null, React.createElement(Text, null, title), React.createElement(Text, null, description))
  },
}))

jest.mock('../../src/components/Skeleton', () => ({
  AdminStatsSkeleton: () => null,
}))

jest.mock('../../src/i18n', () => ({
  getAppLanguage: () => 'en',
  getAppLocale: () => 'en-GB',
}))

describe('AdminBillingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the contribution workspace and links to the plan editor', async () => {
    mockUseAuth.mockReturnValue({
      activeClub: {
        role: 'OWNER',
        permissions: { BILLING: true },
        club: { id: 'club-1', name: 'FC QA' },
      },
    })
    mockApi.mockImplementation((path: string) => {
      if (path === '/clubs/club-1/billing/status') {
        return Promise.resolve({
          clubId: 'club-1',
          provider: 'STRIPE',
          plan: 'PRO',
          subscriptionStatus: 'active',
          connectStatus: 'active',
          currentPeriodEnd: '2026-08-31T00:00:00.000Z',
          billingContactEmail: 'finance@example.com',
        })
      }

      if (path === '/clubs/club-1/contributions') {
        return Promise.resolve({
          settings: {
            clubId: 'club-1',
            enabled: true,
            autoRemindersEnabled: true,
            defaultCurrency: 'eur',
          },
          summary: {
            assignedMembers: 8,
            paidMembers: 5,
            overdueMembers: 2,
            outstandingMembers: 3,
            expectedAmount: 12000,
            collectedAmount: 7500,
          },
          plans: [
            {
              id: 'plan-1',
              clubId: 'club-1',
              name: 'Annual youth fee',
              description: 'U17 annual contribution',
              amount: 15000,
              currency: 'eur',
              cadence: 'YEARLY',
              targetRole: 'PLAYER',
              dueDay: 15,
              dueMonth: 7,
              graceDays: 3,
              reminderPolicy: { daysBefore: [7, 1], daysAfter: [3] },
              active: true,
              assignedMemberCount: 8,
              createdAt: '2026-04-01T00:00:00.000Z',
              updatedAt: '2026-04-01T00:00:00.000Z',
            },
          ],
          members: [
            {
              memberUserId: 'user-1',
              name: 'Max Mustermann',
              email: 'max@example.com',
              avatarUrl: null,
              role: 'PLAYER',
              planId: 'plan-1',
              planName: 'Annual youth fee',
              cadence: 'YEARLY',
              amount: 15000,
              currency: 'eur',
              dueDate: '2026-07-15T12:00:00.000Z',
              status: 'OVERDUE',
              paidAmount: null,
              paidAt: null,
              note: null,
              lastReminderSentAt: null,
            },
          ],
        })
      }

      throw new Error(`Unexpected path: ${path}`)
    })

    const screen = render(<AdminBillingScreen />)

    await waitFor(() => {
      expect(screen.getByText('Track club dues')).toBeTruthy()
      expect(screen.getByText('Platform billing')).toBeTruthy()
      expect(screen.getByText('Annual youth fee')).toBeTruthy()
      expect(screen.getByText('Max Mustermann')).toBeTruthy()
    })

    fireEvent.press(screen.getByText('Add plan'))
    expect(mockRouterPush).toHaveBeenCalledWith('/admin-contribution-plan')
  })

  it('shows access denied for members without billing capability', () => {
    mockUseAuth.mockReturnValue({
      activeClub: {
        role: 'PLAYER',
        permissions: { BILLING: false },
        club: { id: 'club-1', name: 'FC QA' },
      },
    })

    const screen = render(<AdminBillingScreen />)

    expect(screen.getByText('Access denied')).toBeTruthy()
    expect(
      screen.getByText('Only billing managers can open this workspace.'),
    ).toBeTruthy()
  })
})
