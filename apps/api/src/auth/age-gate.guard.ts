import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { AgeGateError } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { AgeGateService, type AgeGateScope } from './age-gate.service'
import { ClerkAuthGuard } from './clerk.guard'
import { verifySessionToken } from './otp/jwt.util'

export const ALLOW_WITHOUT_CONSENT_KEY = 'ageGate:allowWithoutConsent'

/**
 * Marks a route (or controller) a user who fails the age gate must still
 * reach: their own profile/status, the consent flows, account deletion, data
 * export, onboarding and invite redemption (which is how a child's consent
 * request is created), push token (un)registration and session refresh.
 * Everything else is gated. Keep this list short and reviewed.
 */
export const AllowWithoutConsent = () => SetMetadata(ALLOW_WITHOUT_CONSENT_KEY, true)

/** Request flag so the controller-scoped copies of the guard don't re-query. */
const CHECKED = Symbol.for('anstoss.ageGateChecked')

/**
 * Age gate guard (GDPR Art. 8, Germany: 16). Registered GLOBALLY (APP_GUARD in
 * AuthModule) so no controller can forget it; legacy `@UseGuards(AgeGateGuard)`
 * copies become no-ops after the global pass.
 *
 * Applies to routes authenticated by ClerkAuthGuard. APP_GUARDs run before
 * controller guards, so the caller is identified from the session token here
 * (the auth guard still returns the 401 for a bad token).
 *
 * The decision is per club: the club (and team) is taken from the route
 * params (:clubId, :teamId) or resolved from the addressed entity (:eventId,
 * :channelId, :messageId, :conversationId, :fixtureId, :rideId). Routes with no
 * club context use the strictest rule (see AgeGateService).
 */
@Injectable()
export class AgeGateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly ageGate: AgeGateService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // WebSocket / RPC contexts: the chat gateway calls AgeGateService itself.
    if (context.getType() !== 'http') return true

    const request = context.switchToHttp().getRequest()
    if (request[CHECKED]) return true

    const allowListed = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_WITHOUT_CONSENT_KEY,
      [context.getHandler(), context.getClass()],
    )
    if (allowListed) {
      request[CHECKED] = true
      return true
    }
    if (!this.requiresSession(context) && !request.user?.id) return true

    const userId = request.user?.id ?? (await this.identify(request))
    if (!userId) return true // The auth guard rejects the request.

    const scope = await this.resolveScope(request)
    const decision = await this.ageGate.evaluate(userId, scope)
    // A deleted or unknown account is the auth guard's 401, not an age gate 403.
    if (!decision.allowed && decision.code === 'unknown_user') return true
    if (!decision.allowed) throw new AgeGateError(decision.message)

    request[CHECKED] = true
    return true
  }

  /** True when the route is guarded by the session auth guard. */
  private requiresSession(context: ExecutionContext): boolean {
    const guards = [
      ...((Reflect.getMetadata(GUARDS_METADATA, context.getClass()) as unknown[]) ?? []),
      ...((Reflect.getMetadata(GUARDS_METADATA, context.getHandler()) as unknown[]) ?? []),
    ]
    return guards.some((g) => g === ClerkAuthGuard || g instanceof ClerkAuthGuard)
  }

  private async identify(request: {
    headers?: Record<string, string | string[] | undefined>
  }): Promise<string | null> {
    const raw = request.headers?.authorization
    const header = Array.isArray(raw) ? raw[0] : raw
    if (!header?.startsWith('Bearer ')) return null
    const token = header.slice(7)
    if (token.startsWith('dev_')) {
      if (process.env.NODE_ENV !== 'development') return null
      const email = token.replace('dev_', '') || 'dev@anstoss.app'
      const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
      return user?.id ?? null
    }
    try {
      return verifySessionToken(token).sub
    } catch {
      return null
    }
  }

  private async resolveScope(request: {
    params?: Record<string, string | undefined>
    path?: string
    originalUrl?: string
  }): Promise<AgeGateScope> {
    const params = request.params ?? {}
    const path = request.path ?? request.originalUrl ?? ''
    let clubId = params.clubId ?? null
    let teamId = params.teamId ?? null

    // Entity lookups run outside any tenant context; the ids come from the
    // URL and the result only narrows which consent is required.
    const lookup = <T>(fn: () => Promise<T>) => tenantContext.exit(fn)

    if (teamId && !clubId) {
      const team = await lookup(() =>
        this.prisma.team.findUnique({ where: { id: teamId! }, select: { clubId: true } }),
      )
      clubId = team?.clubId ?? null
      if (!clubId) teamId = null
    }
    if (!teamId && params.eventId) {
      const event = await lookup(() =>
        this.prisma.event.findUnique({
          where: { id: params.eventId! },
          select: { clubId: true, teamId: true },
        }),
      )
      if (event && (!clubId || clubId === event.clubId)) {
        clubId = event.clubId
        teamId = event.teamId
      }
    }
    if (!teamId && params.channelId) {
      const channel = await lookup(() =>
        this.prisma.channel.findUnique({
          where: { id: params.channelId! },
          select: { clubId: true, teamId: true },
        }),
      )
      if (channel && (!clubId || clubId === channel.clubId)) {
        clubId = channel.clubId
        teamId = channel.teamId
      }
    }
    if (!clubId && params.messageId) {
      if (/\/direct-messages\//.test(path)) {
        const dm = await lookup(() =>
          this.prisma.directMessage.findUnique({
            where: { id: params.messageId! },
            select: { conversation: { select: { clubId: true } } },
          }),
        )
        clubId = dm?.conversation?.clubId ?? null
      } else {
        const message = await lookup(() =>
          this.prisma.message.findUnique({
            where: { id: params.messageId! },
            select: { clubId: true, teamId: true },
          }),
        )
        clubId = message?.clubId ?? null
        teamId = message?.teamId ?? null
      }
    }
    if (!clubId && params.conversationId) {
      const conversation = await lookup(() =>
        this.prisma.conversation.findUnique({
          where: { id: params.conversationId! },
          select: { clubId: true },
        }),
      )
      clubId = conversation?.clubId ?? null
    }
    if (!clubId && params.fixtureId) {
      const fixture = await lookup(() =>
        this.prisma.importedFixture.findUnique({
          where: { id: params.fixtureId! },
          select: { clubId: true, teamId: true },
        }),
      )
      clubId = fixture?.clubId ?? null
      teamId = fixture?.teamId ?? null
    }
    if (!teamId && params.rideId) {
      const ride = await lookup(() =>
        this.prisma.carpoolRide.findUnique({
          where: { id: params.rideId! },
          select: { clubId: true, event: { select: { teamId: true } } },
        }),
      )
      if (ride && (!clubId || clubId === ride.clubId)) {
        clubId = ride.clubId
        teamId = ride.event?.teamId ?? null
      }
    }
    return { clubId, teamId: clubId ? teamId : null }
  }
}
