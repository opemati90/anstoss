import { defaultRoleMode } from '../AuthContext'

// R1: without a saved preference a user lands in their highest role, so a club
// admin who also coaches starts in admin mode, never in a previous user's mode.
describe('defaultRoleMode', () => {
  it('prefers admin over coach over player over parent', () => {
    expect(defaultRoleMode(['COACH', 'ADMIN'])).toBe('ADMIN')
    expect(defaultRoleMode(['PLAYER', 'COACH'])).toBe('COACH')
    expect(defaultRoleMode(['PARENT', 'PLAYER'])).toBe('PLAYER')
    expect(defaultRoleMode([])).toBeNull()
  })
})
