import { ZodError } from 'zod'
import { ActingController } from './acting.controller'

describe('ActingController', () => {
  const acting = {
    start: jest.fn().mockResolvedValue({ id: 'as1' }),
    end: jest.fn().mockResolvedValue({ id: 'as1' }),
    current: jest.fn().mockResolvedValue({ session: null }),
  }
  const controller = new ActingController(acting as never)
  const user = { id: 'u1' }

  beforeEach(() => jest.clearAllMocks())

  it('validates and forwards a start request', async () => {
    await controller.start(user, 'c1', { teamId: 't1', minutes: 30 })
    expect(acting.start).toHaveBeenCalledWith('c1', 'u1', { teamId: 't1', minutes: 30 })
  })

  it.each([10, 241, 30.5])('rejects %p minutes', (minutes) => {
    expect(() => controller.start(user, 'c1', { teamId: 't1', minutes })).toThrow(ZodError)
    expect(acting.start).not.toHaveBeenCalled()
  })

  it('rejects a missing team', () => {
    expect(() => controller.start(user, 'c1', { minutes: 30 })).toThrow(ZodError)
  })

  it('ends the current session and reads it', async () => {
    await controller.end(user, 'c1')
    expect(acting.end).toHaveBeenCalledWith('c1', 'u1')
    await expect(controller.current(user)).resolves.toEqual({ session: null })
  })
})
