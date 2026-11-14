import 'reflect-metadata'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ZodError } from 'zod'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { AgeGateGuard } from '../auth/age-gate.guard'
import { StudioController } from './studio.controller'

describe('StudioController', () => {
  const service = { context: jest.fn(), brandKit: jest.fn(), updateBrandKit: jest.fn() }
  const controller = new StudioController(service as never)
  beforeEach(() => jest.clearAllMocks())

  it('requires authentication and the existing age gate', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, StudioController)).toEqual([
      ClerkAuthGuard,
      AgeGateGuard,
    ])
  })
  it('forwards the authenticated user, never a body-supplied user', () => {
    controller.context('c1', { id: 'u1' }, { teamId: 't1', eventId: 'e1' })
    expect(service.context).toHaveBeenCalledWith('c1', 'u1', { teamId: 't1', eventId: 'e1' })
  })
  it.each([{ teamId: ['a', 'b'] }, { clubId: 'other' }, { eventId: '' }])(
    'rejects invalid context %j',
    (query) => {
      expect(() => controller.context('c1', { id: 'u1' }, query)).toThrow(ZodError)
      expect(service.context).not.toHaveBeenCalled()
    },
  )
  it.each([
    { clubId: 'other' },
    { accounts: [{ connected: true }] },
    { fontPairing: 'INVALID' },
    { sponsors: [{ id: 's1', name: 'X', logoUrl: 'https://evil.example/x' }] },
  ])('rejects privileged/invalid brand-kit fields %j', (body) => {
    expect(() => controller.updateBrandKit('c1', { id: 'u1' }, body)).toThrow(ZodError)
    expect(service.updateBrandKit).not.toHaveBeenCalled()
  })
})
