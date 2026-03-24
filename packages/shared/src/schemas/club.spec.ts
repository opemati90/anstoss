import {
  createInviteSchema,
  createClubSchema,
  createTeamSchema,
  updateGuardianRelationshipSchema,
  updateMembershipRoleSchema,
  updateTeamCoachAssignmentsSchema,
} from './club'

describe('createClubSchema', () => {
  it('accepts valid club', () => {
    const result = createClubSchema.safeParse({
      name: 'FC Bayern',
      primaryColor: '#D50000',
    })
    expect(result.success).toBe(true)
  })

  it('rejects short name', () => {
    const result = createClubSchema.safeParse({ name: 'F', primaryColor: '#D50000' })
    expect(result.success).toBe(false)
  })

  it('rejects name over 50 chars', () => {
    const result = createClubSchema.safeParse({
      name: 'A'.repeat(51),
      primaryColor: '#D50000',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid hex color (no hash)', () => {
    const result = createClubSchema.safeParse({ name: 'FC Test', primaryColor: 'D50000' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid hex color (short)', () => {
    const result = createClubSchema.safeParse({ name: 'FC Test', primaryColor: '#D50' })
    expect(result.success).toBe(false)
  })

  it('accepts lowercase hex', () => {
    const result = createClubSchema.safeParse({ name: 'FC Test', primaryColor: '#d5aabb' })
    expect(result.success).toBe(true)
  })
})

describe('createTeamSchema', () => {
  it('accepts valid team', () => {
    const result = createTeamSchema.safeParse({ name: 'U19 Herren' })
    expect(result.success).toBe(true)
  })

  it('rejects short name', () => {
    const result = createTeamSchema.safeParse({ name: 'A' })
    expect(result.success).toBe(false)
  })

  it('accepts optional ageGroup', () => {
    const result = createTeamSchema.safeParse({ name: 'Erste', ageGroup: 'U19' })
    expect(result.success).toBe(true)
  })
})

describe('updateTeamCoachAssignmentsSchema', () => {
  it('accepts head and assistant assignments', () => {
    const result = updateTeamCoachAssignmentsSchema.safeParse({
      headCoachUserId: 'coach_1',
      assistantCoachUserIds: ['coach_2', 'coach_3'],
    })

    expect(result.success).toBe(true)
  })

  it('rejects duplicate assistant assignments', () => {
    const result = updateTeamCoachAssignmentsSchema.safeParse({
      assistantCoachUserIds: ['coach_2', 'coach_2'],
    })

    expect(result.success).toBe(false)
  })

  it('rejects assigning the same user as head and assistant coach', () => {
    const result = updateTeamCoachAssignmentsSchema.safeParse({
      headCoachUserId: 'coach_1',
      assistantCoachUserIds: ['coach_1'],
    })

    expect(result.success).toBe(false)
  })
})

describe('updateMembershipRoleSchema', () => {
  it('accepts supported club roles', () => {
    const result = updateMembershipRoleSchema.safeParse({
      role: 'COACH',
    })

    expect(result.success).toBe(true)
  })

  it('rejects unknown role values', () => {
    const result = updateMembershipRoleSchema.safeParse({
      role: 'HEAD_COACH',
    })

    expect(result.success).toBe(false)
  })
})

describe('createInviteSchema', () => {
  it('accepts a parent invite linked to an existing player', () => {
    const result = createInviteSchema.safeParse({
      teamId: 'team_1',
      role: 'PARENT',
      phase: 'FULL',
      deliveryChannel: 'EMAIL',
      recipientEmail: 'parent@example.com',
      linkedPlayerUserId: 'player_1',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a parent invite without child context', () => {
    const result = createInviteSchema.safeParse({
      teamId: 'team_1',
      role: 'PARENT',
      phase: 'FULL',
      deliveryChannel: 'LINK',
    })

    expect(result.success).toBe(false)
  })

  it('rejects linked player ids on non-parent invites', () => {
    const result = createInviteSchema.safeParse({
      teamId: 'team_1',
      role: 'PLAYER',
      phase: 'FULL',
      deliveryChannel: 'EMAIL',
      recipientEmail: 'player@example.com',
      linkedPlayerUserId: 'player_1',
    })

    expect(result.success).toBe(false)
  })
})

describe('updateGuardianRelationshipSchema', () => {
  it('accepts linking a parent to a known player', () => {
    const result = updateGuardianRelationshipSchema.safeParse({
      playerUserId: 'player_1',
    })

    expect(result.success).toBe(true)
  })

  it('accepts clearing a manual child name', () => {
    const result = updateGuardianRelationshipSchema.safeParse({
      childName: null,
    })

    expect(result.success).toBe(true)
  })
})
