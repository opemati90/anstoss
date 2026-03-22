import { MembershipRole, ROLE_HIERARCHY, hasRole } from './roles'

describe('ROLE_HIERARCHY', () => {
  it('OWNER > ADMIN > COACH > PLAYER > PARENT', () => {
    expect(ROLE_HIERARCHY[MembershipRole.OWNER]).toBeGreaterThan(
      ROLE_HIERARCHY[MembershipRole.ADMIN],
    )
    expect(ROLE_HIERARCHY[MembershipRole.ADMIN]).toBeGreaterThan(
      ROLE_HIERARCHY[MembershipRole.COACH],
    )
    expect(ROLE_HIERARCHY[MembershipRole.COACH]).toBeGreaterThan(
      ROLE_HIERARCHY[MembershipRole.PLAYER],
    )
    expect(ROLE_HIERARCHY[MembershipRole.PLAYER]).toBeGreaterThan(
      ROLE_HIERARCHY[MembershipRole.PARENT],
    )
  })
})

describe('hasRole', () => {
  it('OWNER has COACH role', () => {
    expect(hasRole(MembershipRole.OWNER, MembershipRole.COACH)).toBe(true)
  })

  it('COACH has COACH role (exact match)', () => {
    expect(hasRole(MembershipRole.COACH, MembershipRole.COACH)).toBe(true)
  })

  it('PLAYER does NOT have COACH role', () => {
    expect(hasRole(MembershipRole.PLAYER, MembershipRole.COACH)).toBe(false)
  })

  it('PARENT does NOT have PLAYER role', () => {
    expect(hasRole(MembershipRole.PARENT, MembershipRole.PLAYER)).toBe(false)
  })

  it('ADMIN has PLAYER role', () => {
    expect(hasRole(MembershipRole.ADMIN, MembershipRole.PLAYER)).toBe(true)
  })
})
