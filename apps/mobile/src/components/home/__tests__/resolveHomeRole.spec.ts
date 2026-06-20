import { resolveHomeRole } from '../resolveHomeRole'

describe('resolveHomeRole', () => {
  it('maps OWNER -> ADMIN', () => {
    expect(resolveHomeRole({ clubRole: 'OWNER', registrationRole: null })).toBe('ADMIN')
  })
  it('maps ADMIN -> ADMIN', () => {
    expect(resolveHomeRole({ clubRole: 'ADMIN', registrationRole: null })).toBe('ADMIN')
  })
  it('maps COACH -> COACH', () => {
    expect(resolveHomeRole({ clubRole: 'COACH', registrationRole: null })).toBe('COACH')
  })
  it('maps PARENT -> PARENT', () => {
    expect(resolveHomeRole({ clubRole: 'PARENT', registrationRole: null })).toBe('PARENT')
  })
  it('maps PARENT with coach team access -> COACH', () => {
    expect(
      resolveHomeRole({
        clubRole: 'PARENT',
        registrationRole: null,
        teamRole: 'ASSISTANT_COACH',
      }),
    ).toBe('COACH')
    expect(
      resolveHomeRole({
        clubRole: 'PARENT',
        registrationRole: null,
        teamRole: 'HEAD_COACH',
      }),
    ).toBe('COACH')
  })
  it('maps PARENT with player team access -> PLAYER', () => {
    expect(
      resolveHomeRole({
        clubRole: 'PARENT',
        registrationRole: null,
        teamRole: 'PLAYER',
      }),
    ).toBe('PLAYER')
  })
  it('maps PLAYER -> PLAYER', () => {
    expect(resolveHomeRole({ clubRole: 'PLAYER', registrationRole: null })).toBe('PLAYER')
  })
  it('no club + FREE_AGENT registrationRole -> FREE_AGENT', () => {
    expect(resolveHomeRole({ clubRole: null, registrationRole: 'FREE_AGENT' })).toBe('FREE_AGENT')
  })
  it('no club + PLAYER registrationRole -> PLAYER default', () => {
    expect(resolveHomeRole({ clubRole: null, registrationRole: 'PLAYER' })).toBe('PLAYER')
  })
  it('unknown club role falls back to PLAYER', () => {
    expect(resolveHomeRole({ clubRole: 'GHOST', registrationRole: null })).toBe('PLAYER')
  })
})
