import { MembershipRole } from '@anstoss/shared'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ClerkAuthGuard } from '../auth/clerk.guard'
import { ROLES_KEY, RolesGuard } from '../auth/roles.guard'
import { AdminInboxController } from './admin-inbox.controller'

describe('AdminInboxController authorization metadata', () => {
  it('requires ADMIN (OWNER passes via the hierarchy) on the whole controller', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminInboxController)).toBe(MembershipRole.ADMIN)
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminInboxController)
    expect(guards).toEqual(expect.arrayContaining([ClerkAuthGuard, RolesGuard]))
  })

  it('no route overrides the role with something weaker', () => {
    const routes = Object.getOwnPropertyNames(AdminInboxController.prototype).filter(
      (name) => name !== 'constructor',
    )
    expect(routes.length).toBeGreaterThan(0)
    for (const name of routes) {
      const override = Reflect.getMetadata(
        ROLES_KEY,
        (AdminInboxController.prototype as any)[name],
      )
      expect([undefined, MembershipRole.ADMIN, MembershipRole.OWNER]).toContain(override)
    }
  })
})
