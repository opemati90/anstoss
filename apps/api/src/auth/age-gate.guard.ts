import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AgeGateError, AGE_GATE } from '@anstoss/shared'

/**
 * Age gate guard — blocks users under MIN_AGE (16, GDPR Article 8 Germany).
 *
 * Checks the authenticated user's dateOfBirth. If under MIN_AGE,
 * throws AgeGateError. Applied to registration/onboarding endpoints.
 *
 * The DOB is set during registration and stored on the User record.
 * JIT-created users get a default DOB of 1990-01-01 — they must
 * complete the age gate during onboarding.
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

    if (age < AGE_GATE.MIN_AGE) {
      throw new AgeGateError(
        `You must be at least ${AGE_GATE.MIN_AGE} years old to use Anstoss`,
      )
    }

    return true
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
