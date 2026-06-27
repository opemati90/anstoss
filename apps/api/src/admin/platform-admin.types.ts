export type PlatformAdminAuthMethod = 'admin-key' | 'session'

export type PlatformAdminRequestUser = {
  id: string | null
  email: string | null
  name: string
  authMethod: PlatformAdminAuthMethod
}

export type PlatformAdminActor = {
  id: string | null
  email: string | null
  name: string
  authMethod: PlatformAdminAuthMethod
}

export function toPlatformAdminActor(
  user: PlatformAdminRequestUser,
): PlatformAdminActor {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    authMethod: user.authMethod,
  }
}
