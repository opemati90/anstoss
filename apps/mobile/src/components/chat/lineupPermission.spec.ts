import { canShareChatLineup } from './lineupPermission'

describe('chat lineup permissions', () => {
  it.each(['PLAYER', 'CAPTAIN', 'PARENT', 'ADMIN', 'OWNER', 'COACH'])('does not grant coaching tools from %s alone', (role) => {
    expect(canShareChatLineup([{ role, status: 'ACTIVE', team: { id: 'a' } }], 'dm', null)).toBe(false)
  })
  it.each(['HEAD_COACH', 'ASSISTANT_COACH'])('allows active %s in DMs and their team channel', (role) => {
    const accesses = [{ role, status: 'ACTIVE', team: { id: 'a' } }]
    expect(canShareChatLineup(accesses, 'dm', null)).toBe(true)
    expect(canShareChatLineup(accesses, 'channel', 'a')).toBe(true)
    expect(canShareChatLineup(accesses, 'channel', 'b')).toBe(false)
  })
  it.each(['SUSPENDED', 'REMOVED', 'PENDING'])('denies %s coaching access', (status) => {
    expect(canShareChatLineup([{ role: 'HEAD_COACH', status, team: { id: 'a' } }], 'dm', null)).toBe(false)
  })
  it('fails closed while access is loading or absent', () => {
    expect(canShareChatLineup(undefined, 'dm', null)).toBe(false)
    expect(canShareChatLineup([], 'channel', 'a')).toBe(false)
  })
})
