import { BadRequestException } from '@nestjs/common'
import type { ZodType, ZodTypeDef } from 'zod'

/** Validate a request body with a shared Zod schema; 400 on failure. */
export function parseBody<T>(schema: ZodType<T, ZodTypeDef, unknown>, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '))
  }
  return parsed.data
}
