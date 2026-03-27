import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AgeGateError, AGE_GATE, ParentalConsentStatus } from '@anstoss/shared'

/**
 * Age gate guard — blocks users under MIN_AGE (16, GDPR Article 8 Germany)
 * unless they have approved parental consent.
 *
 * Checks the authenticated user's dateOfBirth. If under MIN_AGE:
 * 1. Check for approved ParentalConsent records → allow if found
 * 2. Check for pending ParentalConsent → throw with 'consent_pending'
 * 3. No consent at all → throw with 'consent_required'
 */
@Injectable()
export class AgeGateGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const userId: string | undefined = request.user?.id

    if (!userId) {
      return true // Let auth guard handle unauthenticated requests
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dateOfBirth: true },
    })

    if (!user?.dateOfBirth) {
      throw new AgeGateError('Date of birth required')
    }

    const age = getAge(user.dateOfBirth)

    if (age >= AGE_GATE.MIN_AGE) {
      return true
    }

    // Under 16: check for parental consent
    const consents = await this.prisma.parentalConsent.findMany({
      where: { playerUserId: userId },
      select: { status: true },
    })

    if (consents.length === 0) {
      throw new AgeGateError(
        'Parental consent is required for users under 16',
      )
    }

    const hasApproved = consents.some(
      (c) => c.status === ParentalConsentStatus.APPROVED,
    )

    if (hasApproved) {
      return true
    }

    const hasPending = consents.some(
      (c) => c.status === ParentalConsentStatus.PENDING,
    )

    if (hasPending) {
      throw new AgeGateError('Waiting for guardian approval')
    }

    throw new AgeGateError(
      'Parental consent was rejected. A guardian must approve your account.',
    )
  }
}

function getAge(dateOfBirth: Date): number {
  const today = new Date()
  let age = today.getFullYear() - dateOfBirth.getFullYear()
  const monthDiff = today.getMonth() - dateOfBirth.getMonth()

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())
  ) {
    age--
  }

  return age
}
