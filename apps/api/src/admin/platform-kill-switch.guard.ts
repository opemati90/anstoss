import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'
import { PlatformSettingsService } from './platform-settings.service'

type KillSwitchKey =
  | 'kill_switch_claims'
  | 'kill_switch_invites'
  | 'kill_switch_official_pages'
  | 'kill_switch_contributions'
  | 'kill_switch_billing'
  | 'kill_switch_chat'

const ROUTES: Array<{ key: KillSwitchKey; pattern: RegExp }> = [
  {
    key: 'kill_switch_claims',
    pattern: /^\/(?:club-claims|ownership-transfers|clubs\/[^/]+\/(?:staff-access-requests|ownership-transfers))(?:\/|$)/,
  },
  {
    key: 'kill_switch_invites',
    pattern: /^\/(?:invites|invite-campaigns|clubs\/[^/]+\/(?:invites|invite-campaigns))(?:\/|$)/,
  },
  {
    key: 'kill_switch_official_pages',
    pattern: /^\/integrations\/fussball(?:\/|$)/,
  },
  {
    key: 'kill_switch_contributions',
    pattern: /^\/clubs\/[^/]+\/contributions(?:\/|$)/,
  },
  {
    key: 'kill_switch_billing',
    pattern: /^\/(?:billing|clubs\/[^/]+\/(?:billing|entitlements))(?:\/|$)/,
  },
  {
    key: 'kill_switch_chat',
    pattern: /^\/(?:chat|channels|dm|conversations|messages)(?:\/|$)/,
  },
]

@Injectable()
export class PlatformKillSwitchGuard implements CanActivate {
  private readonly cache = new Map<KillSwitchKey, { disabled: boolean; expiresAt: number }>()

  constructor(private readonly settings: PlatformSettingsService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      path?: string
      originalUrl?: string
    }>()
    const path = normalizePath(request.path ?? request.originalUrl ?? '/')
    if (path.startsWith('/admin/')) return true

    const route = ROUTES.find((candidate) => candidate.pattern.test(path))
    if (!route) return true

    const disabled = await this.isDisabled(route.key)
    if (disabled) {
      throw new ServiceUnavailableException({
        code: 'FEATURE_TEMPORARILY_UNAVAILABLE',
        message: 'This feature is temporarily unavailable. Please try again later.',
      })
    }
    return true
  }

  private async isDisabled(key: KillSwitchKey) {
    const now = Date.now()
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > now) return cached.disabled

    const disabled = (await this.settings.get(key)) === 'true'
    this.cache.set(key, { disabled, expiresAt: now + 5_000 })
    return disabled
  }
}

function normalizePath(value: string) {
  const withoutQuery = value.split('?')[0] ?? '/'
  return withoutQuery.startsWith('/api/') ? withoutQuery.slice(4) : withoutQuery
}
