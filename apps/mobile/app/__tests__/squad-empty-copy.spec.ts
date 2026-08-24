import { getSquadEmptyCopy } from '../../src/lib/squadEmptyCopy'

describe('squad empty-state copy', () => {
  it('does not tell a player to manage or invite the roster', () => {
    expect(getSquadEmptyCopy('ACTIVE', false)).toEqual({
      title: 'No players to show yet',
      body: 'Your coach is still setting up this squad.',
    })
  })

  it('gives managers a direct setup instruction', () => {
    expect(getSquadEmptyCopy('ACTIVE', true)).toEqual({
      title: 'Build your squad',
      body: 'Invite players or let them claim an open roster slot.',
    })
  })

  it('keeps secondary buckets role-aware', () => {
    expect(getSquadEmptyCopy('TRIAL', false).body).toBe(
      'Your coach has not added any trial players.',
    )
    expect(getSquadEmptyCopy('INACTIVE', true).body).toBe(
      'Players you deactivate will remain available here.',
    )
  })
})
