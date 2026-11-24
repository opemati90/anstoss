import { UnauthorizedException } from '@nestjs/common'
import type { PrismaClient, Prisma } from '@prisma/client'
import type { Namespace, Socket } from 'socket.io'
import type { SessionClaims } from '../otp/jwt.util'

// Separate from account-deletion markers: revoking a provider is not deleting
// the Anstoss account. Email/Google sessions remain valid.
export const APPLE_REVOCATION_MARKER = 'apple-consent-revoked'
export const appleSessionRoom = (identityId: string) => `apple-session:${identityId}`
export const APPLE_SOCKET_RECHECK_MS = 30_000
export const APPLE_SOCKET_CHECK_TIMEOUT_MS = 5_000

type IdentityDatabase = Pick<
  PrismaClient | Prisma.TransactionClient,
  'socialIdentity' | 'authIdentityTombstone'
>

export async function assertAppleProofCurrent(
  db: IdentityDatabase,
  subjectHash: string,
  authenticatedAt: number,
) {
  if (!Number.isSafeInteger(authenticatedAt) || authenticatedAt <= 0) {
    throw new UnauthorizedException('Please sign in again')
  }
  const revoked = await db.authIdentityTombstone.findUnique({
    where: {
      provider_subjectHash: { provider: APPLE_REVOCATION_MARKER, subjectHash },
    },
  })
  if (revoked && authenticatedAt * 1000 <= revoked.createdAt.getTime()) {
    throw new UnauthorizedException('Please sign in again')
  }
}

/** DB failures deliberately propagate; never turn an outage into auth bypass. */
export async function assertAppleSessionCurrent(db: IdentityDatabase, claims: SessionClaims) {
  if (!claims.apple_identity) return
  const identity = await db.socialIdentity.findUnique({ where: { id: claims.apple_identity } })
  if (!identity || identity.provider !== 'apple' || identity.userId !== claims.sub) {
    throw new UnauthorizedException('Please sign in again')
  }
  await assertAppleProofCurrent(db, identity.subjectHash, claims.apple_auth_time!)
}

/** Immediate cross-replica disconnects use the identity room. Per-packet and
 * bounded periodic checks cover missed pub/sub messages and DB outages. */
export async function bindAppleSocketSession(
  db: IdentityDatabase,
  client: Socket,
  claims: SessionClaims,
) {
  if (!claims.apple_identity) return
  let closed = false
  let timer: ReturnType<typeof setInterval> | undefined
  const cleanup = () => {
    closed = true
    if (timer) clearInterval(timer)
    client.conn.off('close', cleanup)
    client.off('disconnect', cleanup)
  }
  // A transport can close during namespace middleware, before Socket.IO emits
  // connect. That path has no socket disconnect event, so watch the transport too.
  client.conn.once('close', cleanup)
  client.once('disconnect', cleanup)
  const assertOpen = () => {
    if (closed || client.conn.readyState !== 'open')
      throw new UnauthorizedException('Connection closed')
  }
  const validate = async () => {
    if (claims.exp <= Math.floor(Date.now() / 1000))
      throw new UnauthorizedException('Session expired')
    let deadline: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        assertAppleSessionCurrent(db, claims),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(
            () => reject(new UnauthorizedException('Session check unavailable')),
            APPLE_SOCKET_CHECK_TIMEOUT_MS,
          )
          deadline.unref?.()
        }),
      ])
    } finally {
      if (deadline) clearTimeout(deadline)
    }
  }
  try {
    assertOpen()
    await validate()
    assertOpen()
    client.data.appleSessionClaims = claims
    await client.join(appleSessionRoom(claims.apple_identity))
    // Close the check-before-room-join race with a concurrent revocation.
    await validate()
    assertOpen()
  } catch (error) {
    cleanup()
    throw error
  }
  client.use((_packet, next) => {
    void validate().then(
      () => next(),
      () => {
        client.disconnect(true)
        next(new Error('Unauthorized'))
      },
    )
  })
  let checking = false
  timer = setInterval(() => {
    if (checking) return
    checking = true
    void validate()
      .catch(() => {
        cleanup()
        client.disconnect(true)
      })
      .finally(() => {
        checking = false
      })
  }, APPLE_SOCKET_RECHECK_MS)
  timer.unref?.()
}

export async function disconnectRevokedAppleSessions(
  db: IdentityDatabase,
  server: Namespace,
  identityId: string,
) {
  const sockets = await server.in(appleSessionRoom(identityId)).fetchSockets()
  for (const socket of sockets) {
    try {
      const claims = socket.data.appleSessionClaims as SessionClaims | undefined
      if (!claims || claims.apple_identity !== identityId) throw new UnauthorizedException()
      await assertAppleSessionCurrent(db, claims)
    } catch {
      socket.disconnect(true)
    }
  }
}
