import { ApiError } from '../../../api/client'
import {
  adminActionErrorKey,
  complianceReminderLabelKey,
  complianceReminderState,
  duesReminderOutcome,
  shouldReloadAfterError,
} from '../adminActions'

jest.mock('../../../api/client', () => ({
  ApiError: class ApiError extends Error {
    status: number
    code?: string
    constructor(message: string, mockStatus: number, mockCode?: string) {
      super(message)
      this.status = mockStatus
      this.code = mockCode
    }
  },
}))

describe('adminActions (M3, M1, L4)', () => {
  it.each([
    [403, undefined, 'aufgaben.errorForbidden'],
    [404, undefined, 'aufgaben.errorNotFound'],
    [409, undefined, 'aufgaben.errorConflict'],
    [422, undefined, 'aufgaben.errorInvalid'],
    [400, undefined, 'aufgaben.errorInvalid'],
    [0, 'network_error', 'aufgaben.errorNetwork'],
    [504, 'timeout', 'aufgaben.errorNetwork'],
    [500, undefined, 'aufgaben.actionError'],
  ])('maps status %s to a translated key, never server text', (status, code, key) => {
    expect(adminActionErrorKey(new ApiError('Join request revision mismatch', status, code))).toBe(key)
  })

  it('falls back for unknown errors', () => {
    expect(adminActionErrorKey(new Error('boom'))).toBe('aufgaben.actionError')
  })

  it('reloads on 409 and 404 only', () => {
    expect(shouldReloadAfterError(new ApiError('x', 409))).toBe(true)
    expect(shouldReloadAfterError(new ApiError('x', 404))).toBe(true)
    expect(shouldReloadAfterError(new ApiError('x', 403))).toBe(false)
    expect(shouldReloadAfterError(new Error('x'))).toBe(false)
  })

  it('reads the dues reminder result', () => {
    expect(duesReminderOutcome({ requested: 3, sent: 3, skipped: 0 })).toEqual({ kind: 'sent', count: 3 })
    expect(duesReminderOutcome({ requested: 3, sent: 0, skipped: 3 })).toEqual({ kind: 'alreadyToday' })
    expect(duesReminderOutcome({ requested: 0, sent: 0, skipped: 0 })).toEqual({ kind: 'nobody' })
    expect(duesReminderOutcome(undefined)).toEqual({ kind: 'nobody' })
  })

  it('reads the compliance reminder cooldown', () => {
    expect(complianceReminderState({ sent: true })).toBe('sent')
    expect(complianceReminderState({ sent: false, reason: 'cooldown', retryAfter: 'x' })).toBe('cooldown')
    expect(complianceReminderState({ sent: false, reason: 'delivery_failed' })).toBe('failed')
    expect(complianceReminderLabelKey('cooldown')).toBe('aufgaben.remindedToday')
    expect(complianceReminderLabelKey('sent')).toBe('aufgaben.reminded')
    expect(complianceReminderLabelKey(undefined)).toBe('aufgaben.remind')
  })
})
