import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'

@Injectable()
export class InternalAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const userEmail: string | undefined = request.user?.email
    const adminEmails = (process.env.INTERNAL_ADMIN_EMAILS || '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)

    const adminKey = process.env.ADMIN_API_KEY
    const headerKey = request.headers['x-admin-key']
    const normalizedHeaderKey = Array.isArray(headerKey)
      ? headerKey[0]
      : headerKey

    const emailAllowed =
      !!userEmail && adminEmails.includes(userEmail.toLowerCase())
    const keyAllowed =
      !!adminKey && normalizedHeaderKey === adminKey

    if (!emailAllowed && !keyAllowed) {
      throw new ForbiddenException('Internal admin access required')
    }

    return true
  }
}
