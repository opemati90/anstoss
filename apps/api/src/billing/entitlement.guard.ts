import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BillingService } from './billing.service'

export const REQUIRED_FEATURE_KEY = 'requiredFeature'
export const RequireFeature = (feature: string) =>
  SetMetadata(REQUIRED_FEATURE_KEY, feature)

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billingService: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (!requiredFeature) return true

    const request = context.switchToHttp().getRequest()
    const clubId = request.params?.clubId

    if (!clubId) {
      throw new ForbiddenException('Club context required for entitlement check')
    }

    const entitlements = await this.billingService.getEntitlements(clubId)

    if (!entitlements.features.includes(requiredFeature)) {
      throw new ForbiddenException(
        `Feature '${requiredFeature}' requires a premium plan`,
      )
    }

    return true
  }
}
