export type HomeRole = 'ADMIN' | 'COACH' | 'PLAYER' | 'PARENT' | 'FREE_AGENT'

export type ResolveHomeRoleInput = {
  clubRole: string | null | undefined
  registrationRole: string | null | undefined
}

export function resolveHomeRole({ clubRole, registrationRole }: ResolveHomeRoleInput): HomeRole {
  if (clubRole === 'OWNER' || clubRole === 'ADMIN') return 'ADMIN'
  if (clubRole === 'COACH') return 'COACH'
  if (clubRole === 'PARENT') return 'PARENT'
  if (clubRole === 'PLAYER') return 'PLAYER'
  if (!clubRole && registrationRole === 'FREE_AGENT') return 'FREE_AGENT'
  return 'PLAYER'
}
