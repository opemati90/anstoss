import type { Namespace, Socket } from 'socket.io'
import { EventEmitter } from 'node:events'
import type { PrismaService } from '../../prisma/prisma.service'
import { ClerkAuthGuard } from '../clerk.guard'
import type { ExecutionContext } from '@nestjs/common'
import { OtpController } from '../otp/otp.controller'
import type { OtpService } from '../otp/otp.service'
import { signSessionToken, verifySessionToken } from '../otp/jwt.util'
import {
  APPLE_SOCKET_RECHECK_MS,
  APPLE_SOCKET_CHECK_TIMEOUT_MS,
  assertAppleSessionCurrent,
  bindAppleSocketSession,
  disconnectRevokedAppleSessions,
} from './apple-session'

describe('Apple-bound sessions', () => {
  const now = 1_800_000_000
  const env = { ...process.env }
  const user = { id: 'user', email: 'player@example.invalid', name: 'Player', clerkId: null }
  function setup() {
    const db = {
      socialIdentity: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'identity',
            provider: 'apple',
            userId: user.id,
            subjectHash: 'hash',
          }),
      },
      authIdentityTombstone: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue(user) },
    }
    const prisma = db as unknown as PrismaService
    const token = signSessionToken(user.id, {
      appleIdentity: 'identity',
      appleAuthenticatedAt: now - 100,
    })
    return { db, prisma, token, claims: verifySessionToken(token) }
  }
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now * 1000)
    process.env.AUTH_JWT_SECRET = 'test-apple-session'
  })
  afterEach(() => {
    jest.useRealTimers()
    process.env = { ...env }
  })

  it('rejects missing, foreign-user or wrong-provider identities', async () => {
    for (const identity of [
      null,
      { provider: 'apple', userId: 'other' },
      { provider: 'google', userId: user.id },
    ]) {
      const { db, prisma, claims } = setup()
      db.socialIdentity.findUnique.mockResolvedValue(identity)
      await expect(assertAppleSessionCurrent(prisma, claims)).rejects.toThrow(
        'Please sign in again',
      )
    }
  })
  it('does not query Apple state for email/Google sessions', async () => {
    const { db, prisma } = setup()
    await assertAppleSessionCurrent(prisma, verifySessionToken(signSessionToken(user.id)))
    expect(db.socialIdentity.findUnique).not.toHaveBeenCalled()
  })
  it('rejects revoked HTTP sessions, including at equal proof/event timestamps', async () => {
    const { db, prisma, token } = setup()
    db.authIdentityTombstone.findUnique.mockResolvedValue({
      createdAt: new Date((now - 100) * 1000),
    })
    const request = { headers: { authorization: `Bearer ${token}` } }
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext
    await expect(new ClerkAuthGuard(prisma).canActivate(context)).rejects.toThrow(
      'Invalid authentication token',
    )
    expect(db.user.findFirst).not.toHaveBeenCalled()
  })
  it('fails closed on revocation-database outages', async () => {
    const { db, prisma, claims } = setup()
    db.authIdentityTombstone.findUnique.mockRejectedValue(new Error('database unavailable'))
    await expect(assertAppleSessionCurrent(prisma, claims)).rejects.toThrow('database unavailable')
  })
  it('preserves Apple proof time and identity on session refresh', async () => {
    const { prisma, token } = setup()
    const request: {
      headers: { authorization: string }
      user?: Parameters<OtpController['refresh']>[0]
    } = {
      headers: { authorization: `Bearer ${token}` },
    }
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext
    await new ClerkAuthGuard(prisma).canActivate(context)
    const refreshed = await new OtpController({} as OtpService).refresh(request.user!)
    expect(verifySessionToken(refreshed.token)).toMatchObject({
      apple_identity: 'identity',
      apple_auth_time: now - 100,
    })
  })
  it.each([
    { appleIdentity: 'identity' },
    { appleAuthenticatedAt: now },
    { appleIdentity: '', appleAuthenticatedAt: now },
    { appleIdentity: 'identity', appleAuthenticatedAt: now + 31 },
    { appleIdentity: 'identity', appleAuthenticatedAt: -1 },
  ])('rejects malformed session bindings: %p', (binding) => {
    expect(() => verifySessionToken(signSessionToken(user.id, binding))).toThrow(
      'Invalid Apple session binding',
    )
  })
  function socket() {
    let middleware: (_packet: unknown, next: (error?: Error) => void) => void = () => undefined
    let disconnectHandler = () => undefined
    const client = {
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      conn: Object.assign(new EventEmitter(), { readyState: 'open' }),
      off: jest.fn(),
      use: jest.fn((fn: typeof middleware) => {
        middleware = fn
      }),
      once: jest.fn((_event: string, fn: () => undefined) => {
        disconnectHandler = fn
      }),
    }
    return {
      client: client as unknown as Socket,
      raw: client,
      packet: () =>
        new Promise<void>((resolve, reject) =>
          middleware([], (error) => (error ? reject(error) : resolve())),
        ),
      disconnected: () => disconnectHandler(),
    }
  }
  it('rechecks after joining the room, closing a concurrent revocation race', async () => {
    const { db, prisma, claims } = setup()
    db.authIdentityTombstone.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ createdAt: new Date(now * 1000) })
    const { client } = socket()
    await expect(bindAppleSocketSession(prisma, client, claims)).rejects.toThrow(
      'Please sign in again',
    )
    expect(client.join).toHaveBeenCalledWith('apple-session:identity')
  })
  it('denies packets after revocation without waiting for the periodic check', async () => {
    const { db, prisma, claims } = setup()
    const { client, packet, disconnected } = socket()
    await bindAppleSocketSession(prisma, client, claims)
    await packet()
    db.authIdentityTombstone.findUnique.mockResolvedValue({ createdAt: new Date(now * 1000) })
    await expect(packet()).rejects.toThrow('Unauthorized')
    expect(client.disconnect).toHaveBeenCalledWith(true)
    disconnected()
    expect(jest.getTimerCount()).toBe(0)
  })
  it('disconnects passive sockets when a cross-replica notification is missed', async () => {
    const { db, prisma, claims } = setup()
    const { client, disconnected } = socket()
    await bindAppleSocketSession(prisma, client, claims)
    db.authIdentityTombstone.findUnique.mockResolvedValue({ createdAt: new Date(now * 1000) })
    await jest.advanceTimersByTimeAsync(APPLE_SOCKET_RECHECK_MS)
    expect(client.disconnect).toHaveBeenCalledWith(true)
    disconnected()
  })
  it('cleans up an aborted handshake even when Socket.IO never emits disconnect', async () => {
    const { db, prisma, claims } = setup()
    const { client, raw } = socket()
    let finish: (value: null) => void = () => undefined
    db.authIdentityTombstone.findUnique.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const binding = bindAppleSocketSession(prisma, client, claims)
    await Promise.resolve()
    raw.conn.readyState = 'closed'
    raw.conn.emit('close')
    finish(null)
    await expect(binding).rejects.toThrow('Connection closed')
    expect(jest.getTimerCount()).toBe(0)
    expect(raw.conn.listenerCount('close')).toBe(0)
    expect(client.use).not.toHaveBeenCalled()
  })
  it('disconnects passive sockets if a database check hangs rather than rejects', async () => {
    const { db, prisma, claims } = setup()
    const { client } = socket()
    await bindAppleSocketSession(prisma, client, claims)
    db.authIdentityTombstone.findUnique.mockImplementation(() => new Promise(() => undefined))
    await jest.advanceTimersByTimeAsync(APPLE_SOCKET_RECHECK_MS + APPLE_SOCKET_CHECK_TIMEOUT_MS)
    expect(client.disconnect).toHaveBeenCalledWith(true)
    expect(jest.getTimerCount()).toBe(0)
  })
  it('keeps genuinely newer sessions when processing a delayed revocation', async () => {
    const { db, prisma, claims } = setup()
    db.authIdentityTombstone.findUnique.mockResolvedValue({
      createdAt: new Date((now - 50) * 1000),
    })
    const old = { data: { appleSessionClaims: claims }, disconnect: jest.fn() }
    const fresh = {
      data: { appleSessionClaims: { ...claims, apple_auth_time: now } },
      disconnect: jest.fn(),
    }
    const server = {
      in: jest.fn().mockReturnValue({ fetchSockets: async () => [old, fresh] }),
    } as unknown as Namespace
    await disconnectRevokedAppleSessions(prisma, server, 'identity')
    expect(old.disconnect).toHaveBeenCalledWith(true)
    expect(fresh.disconnect).not.toHaveBeenCalled()
  })
})
