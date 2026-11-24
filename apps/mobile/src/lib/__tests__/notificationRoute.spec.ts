const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }))
import { openNotificationTarget } from '../notificationRoute'

describe('notification destinations', () => {
  beforeEach(() => mockPush.mockClear())
  it.each([
    ['consent_requested', '/child-consent'],
    ['consent_withdrawn', '/notifications'],
    ['compliance_reminder', '/notifications'],
  ])('opens a user-scoped destination for %s', (type, path) => {
    const ensureClub = jest.fn()
    openNotificationTarget({ type }, ensureClub)
    expect(mockPush).toHaveBeenCalledWith(path)
    expect(ensureClub).not.toHaveBeenCalled()
  })
  it.each([
    'join_request',
    'JOIN_REQUEST_REMINDER',
    'event_updated',
    'moderation_report',
    'contribution',
    'CHAT_MESSAGE',
  ])('switches club before opening %s', (type) => {
    const ensureClub = jest.fn()
    openNotificationTarget({ type, eventId: 'event-1', channelId: 'channel-1' }, ensureClub)
    expect(ensureClub).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledTimes(1)
    expect(ensureClub.mock.invocationCallOrder[0]).toBeLessThan(
      mockPush.mock.invocationCallOrder[0],
    )
  })
  it.each([undefined, 'TRIAL_INVITE', 'TRIAL_RESPONSE'])(
    'opens trial detail for %s without requiring club membership',
    (type) => {
      const ensureClub = jest.fn()
      openNotificationTarget({ type, trialInviteId: 'trial-1' }, ensureClub)
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/trial/[id]', params: { id: 'trial-1' } })
      expect(ensureClub).not.toHaveBeenCalled()
    },
  )
})

it.each(['fixture-sync', 'GOAL_SCORED', 'MATCH_FINAL'])('ignores paused provider push %s', (kind) => {
  mockPush.mockClear()
  openNotificationTarget({ kind, fixtureId: 'fixture-1', teamId: 'team-1' }, jest.fn())
  expect(mockPush).not.toHaveBeenCalled()
})

it.each(['live_goal', 'live_full_time'])('keeps recorded-match push %s', (kind) => {
  mockPush.mockClear()
  openNotificationTarget({ kind, eventId: 'event-1' }, jest.fn())
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/match-live', params: { eventId: 'event-1' } })
})
