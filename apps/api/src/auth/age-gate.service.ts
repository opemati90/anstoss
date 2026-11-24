import { Injectable } from '@nestjs/common'
import { AGE_GATE, AgeGateError } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'

/** Scope remains part of the contract for HTTP, sockets and push callers. */
export interface AgeGateScope {
  clubId?: string | null
  teamId?: string | null
}

export type AgeGateBlockCode = 'unknown_user' | 'dob_required' | 'under_16'
export type AgeGateDecision =
  | { allowed: true; minor: boolean }
  | { allowed: false; code: AgeGateBlockCode; message: string }

type GateUser = { dateOfBirth: Date | null; adultConfirmedAt: Date | null }

const MESSAGES: Record<AgeGateBlockCode, string> = {
  unknown_user: 'Account not found',
  dob_required: 'Date of birth required',
  under_16: 'Direct accounts are available from age 16. A parent or guardian can manage a child’s profile.',
}

/**
 * Launch policy: direct accounts are 16+, on HTTP, sockets and push alike.
 * Historical parental consent cannot override this floor. Guardian-managed
 * child records and their consent history are not removed or changed here.
 */
@Injectable()
export class AgeGateService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(userId: string, scope: AgeGateScope = {}): Promise<void> {
    const decision = await this.evaluate(userId, scope)
    if (!decision.allowed) throw new AgeGateError(decision.message)
  }

  async isAllowed(userId: string, scope: AgeGateScope = {}): Promise<boolean> {
    return (await this.evaluate(userId, scope)).allowed
  }

  async evaluate(userId: string, _scope: AgeGateScope = {}): Promise<AgeGateDecision> {
    const users = await this.readUsers([userId])
    return decide(users.get(userId) ?? null)
  }

  async filterAllowedUserIds(userIds: string[], _scope: AgeGateScope = {}): Promise<string[]> {
    if (userIds.length === 0) return []
    const users = await this.readUsers(Array.from(new Set(userIds)))
    return userIds.filter((id) => decide(users.get(id) ?? null).allowed)
  }

  private async readUsers(userIds: string[]): Promise<Map<string, GateUser>> {
    const rows: Array<GateUser & { id: string }> = await this.prisma.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      select: { id: true, dateOfBirth: true, adultConfirmedAt: true },
    })
    return new Map(rows.map((row) => [row.id, row]))
  }
}

function decide(user: GateUser | null): AgeGateDecision {
  if (!user) return block('unknown_user')
  // Preserve historical declarations only when no DOB exists. New declarations
  // are refused by UsersService; a known DOB always takes precedence.
  if (!user.dateOfBirth) {
    return user.adultConfirmedAt ? { allowed: true, minor: false } : block('dob_required')
  }
  if (!Number.isFinite(user.dateOfBirth.getTime())) return block('dob_required')
  return getAge(user.dateOfBirth) >= AGE_GATE.MIN_AGE
    ? { allowed: true, minor: false }
    : block('under_16')
}

function block(code: AgeGateBlockCode): AgeGateDecision {
  return { allowed: false, code, message: MESSAGES[code] }
}

export function getAge(dateOfBirth: Date, today = new Date()): number {
  let age = today.getFullYear() - dateOfBirth.getFullYear()
  const monthDiff = today.getMonth() - dateOfBirth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) age--
  return age
}
