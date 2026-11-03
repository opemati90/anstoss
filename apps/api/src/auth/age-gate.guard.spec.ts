import '../../test/future-capabilities'

import { Controller, ExecutionContext, Get, UseGuards } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AgeGateError } from '@anstoss/shared'
import { AgeGateGuard, AllowWithoutConsent } from './age-gate.guard'
import { AgeGateService } from './age-gate.service'
import { ClerkAuthGuard } from './clerk.guard'
import { signSessionToken } from './otp/jwt.util'
import { createFakePrisma, dobForAge } from '../testing/fake-prisma'

// Privacy/safeguarding review 2026-09-24 (H1/H2): the age gate is global and
// per club. The fake Prisma evaluates the where clauses, so a query that
// forgets the club or team filter fails these specs.

function world() {
  return createFakePrisma({
    user: [
      { id: 'adult', dateOfBirth: dobForAge(30), adultConfirmedAt: null, deletedAt: null },
      { id: 'declared', dateOfBirth: null, adultConfirmedAt: new Date(), deletedAt: null },
      { id: 'no-dob', dateOfBirth: null, adultConfirmedAt: null, deletedAt: null },
      { id: 'kid12', dateOfBirth: dobForAge(12), adultConfirmedAt: null, deletedAt: null },
      { id: 'kid14-declared', dateOfBirth: dobForAge(14), adultConfirmedAt: new Date(), deletedAt: null },
      // Tim: approved on SV Albatros U15, consent withdrawn at SV Babelsberg.
      { id: 'tim', dateOfBirth: dobForAge(14), adultConfirmedAt: null, deletedAt: null },
      { id: 'lukas', dateOfBirth: dobForAge(14), adultConfirmedAt: null, deletedAt: null },
    ],
    parentalConsent: [
      { id: 'c1', clubId: 'albatros', teamId: 'u15', playerUserId: 'tim', status: 'APPROVED' },
      { id: 'c2', clubId: 'babelsberg', teamId: 'b-u15', playerUserId: 'tim', status: 'WITHDRAWN' },
      { id: 'c3', clubId: 'albatros', teamId: 'u15', playerUserId: 'lukas', status: 'WITHDRAWN' },
      { id: 'c4', clubId: 'albatros', teamId: 'u14', playerUserId: 'lukas', status: 'PENDING' },
    ],
    teamAccess: [
      // Tim is loaned from U15 to U16.
      {
        id: 'loan',
        clubId: 'albatros',
        teamId: 'u16',
        userId: 'tim',
        role: 'PLAYER',
        status: 'ACTIVE',
        loanedFromTeamId: 'u15',
      },
    ],
    team: [
      { id: 'u15', clubId: 'albatros' },
      { id: 'u16', clubId: 'albatros' },
      { id: 'b-u15', clubId: 'babelsberg' },
    ],
    channel: [{ id: 'b-chan', clubId: 'babelsberg', teamId: 'b-u15' }],
    event: [{ id: 'b-event', clubId: 'babelsberg', teamId: 'b-u15' }],
  })
}

describe('AgeGateService', () => {
  const svc = (prisma = world()) => new AgeGateService(prisma as never)

  it('admits adults and 16+ self-declared users without a DOB', async () => {
    await expect(svc().isAllowed('adult', { clubId: 'albatros' })).resolves.toBe(true)
    await expect(svc().isAllowed('declared')).resolves.toBe(true)
  })

  it('requires a DOB without a declaration, blocks under 13, and lets an under-16 DOB win', async () => {
    await expect(svc().assertAllowed('no-dob')).rejects.toThrow('Date of birth required')
    await expect(svc().assertAllowed('kid12')).rejects.toThrow(/under 13/)
    await expect(svc().assertAllowed('kid14-declared')).rejects.toBeInstanceOf(AgeGateError)
  })

  it('H2: an approved consent in club A does not open club B', async () => {
    const s = svc()
    await expect(s.isAllowed('tim', { clubId: 'albatros' })).resolves.toBe(true)
    await expect(s.isAllowed('tim', { clubId: 'albatros', teamId: 'u15' })).resolves.toBe(true)
    await expect(s.assertAllowed('tim', { clubId: 'babelsberg' })).rejects.toThrow(/withdrawn/)
  })

  it('H2: a team without its own consent is closed, unless it is a loan from a consented team', async () => {
    const s = svc()
    await expect(s.isAllowed('tim', { clubId: 'albatros', teamId: 'u16' })).resolves.toBe(true)
    await expect(s.isAllowed('tim', { clubId: 'albatros', teamId: 'u17' })).resolves.toBe(false)
  })

  it('reports the state of the consent for the requested team', async () => {
    const s = svc()
    await expect(s.assertAllowed('lukas', { clubId: 'albatros', teamId: 'u15' })).rejects.toThrow(
      /withdrawn/,
    )
    await expect(s.assertAllowed('lukas', { clubId: 'albatros', teamId: 'u14' })).rejects.toThrow(
      'Waiting for guardian approval',
    )
  })

  it('no club context: needs an approved consent somewhere', async () => {
    const s = svc()
    await expect(s.isAllowed('tim')).resolves.toBe(true)
    await expect(s.isAllowed('lukas')).resolves.toBe(false)
  })

  it('filters push recipients per club', async () => {
    const s = svc()
    await expect(
      s.filterAllowedUserIds(['adult', 'tim', 'lukas'], { clubId: 'babelsberg' }),
    ).resolves.toEqual(['adult'])
    await expect(
      s.filterAllowedUserIds(['adult', 'tim', 'lukas'], { clubId: 'albatros' }),
    ).resolves.toEqual(['adult', 'tim'])
  })
})

describe('AgeGateGuard (global)', () => {
  const secret = 'test-secret-for-age-gate-spec-0123456789'
  let previous: string | undefined
  beforeAll(() => {
    previous = process.env.AUTH_JWT_SECRET
    process.env.AUTH_JWT_SECRET = secret
  })
  afterAll(() => {
    process.env.AUTH_JWT_SECRET = previous
  })

  @Controller()
  @UseGuards(ClerkAuthGuard)
  class GatedController {
    @Get('x')
    gated() {
      return 1
    }

    @AllowWithoutConsent()
    @Get('me')
    me() {
      return 1
    }
  }

  @Controller()
  class PublicController {
    @Get('p')
    open() {
      return 1
    }
  }

  function ctx(
    cls: new () => unknown,
    handler: string,
    req: { userId?: string; params?: Record<string, string>; path?: string },
  ): ExecutionContext {
    const request = {
      headers: req.userId ? { authorization: `Bearer ${signSessionToken(req.userId)}` } : {},
      params: req.params ?? {},
      path: req.path ?? '/x',
    }
    return {
      getType: () => 'http',
      getClass: () => cls,
      getHandler: () => (cls.prototype as Record<string, unknown>)[handler],
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext
  }

  function guard() {
    const prisma = world()
    return new AgeGateGuard(new Reflector(), new AgeGateService(prisma as never), prisma as never)
  }

  it('H1: gates a route that never declared AgeGateGuard', async () => {
    await expect(
      guard().canActivate(ctx(GatedController, 'gated', { userId: 'tim', params: { clubId: 'babelsberg' } })),
    ).rejects.toBeInstanceOf(AgeGateError)
    await expect(
      guard().canActivate(ctx(GatedController, 'gated', { userId: 'tim', params: { clubId: 'albatros' } })),
    ).resolves.toBe(true)
  })

  it('H2: resolves the club from :channelId and :eventId', async () => {
    await expect(
      guard().canActivate(ctx(GatedController, 'gated', { userId: 'tim', params: { channelId: 'b-chan' } })),
    ).rejects.toThrow(/withdrawn/)
    await expect(
      guard().canActivate(ctx(GatedController, 'gated', { userId: 'tim', params: { eventId: 'b-event' } })),
    ).rejects.toThrow(/withdrawn/)
  })

  it('H2: resolves the club from :teamId', async () => {
    await expect(
      guard().canActivate(ctx(GatedController, 'gated', { userId: 'tim', params: { teamId: 'b-u15' } })),
    ).rejects.toBeInstanceOf(AgeGateError)
  })

  it('lets a blocked child reach @AllowWithoutConsent routes', async () => {
    await expect(guard().canActivate(ctx(GatedController, 'me', { userId: 'lukas' }))).resolves.toBe(true)
  })

  it('no club context: strict rule', async () => {
    await expect(guard().canActivate(ctx(GatedController, 'gated', { userId: 'lukas' }))).rejects.toBeInstanceOf(
      AgeGateError,
    )
  })

  it('leaves a deleted account to the auth guard (401, not an age-gate 403)', async () => {
    await expect(guard().canActivate(ctx(GatedController, 'gated', { userId: 'ghost' }))).resolves.toBe(true)
  })

  it('skips routes without session auth and unauthenticated requests', async () => {
    await expect(guard().canActivate(ctx(PublicController, 'open', { userId: 'lukas' }))).resolves.toBe(true)
    await expect(guard().canActivate(ctx(GatedController, 'gated', {}))).resolves.toBe(true)
  })
})

describe('AuthModule', () => {
  it('H1: registers the age gate as a global APP_GUARD', () => {
    const { APP_GUARD } = require('@nestjs/core')
    const { AuthModule } = require('./auth.module')
    const providers = Reflect.getMetadata('providers', AuthModule) as Array<{ provide?: unknown; useExisting?: unknown }>
    expect(providers).toContainEqual({ provide: APP_GUARD, useExisting: AgeGateGuard })
  })
})
