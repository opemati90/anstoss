import { HttpException } from '@nestjs/common'

/** Capability negotiation, not authorization: normal membership checks still apply. */
export function requirePrivateMediaCapability(value: string | undefined): void {
  if (value === '1') return
  throw new HttpException({
    code: 'UPGRADE_REQUIRED',
    message: 'Update Anstoss to send private chat attachments.',
  }, 426)
}
