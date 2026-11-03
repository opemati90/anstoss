import { TeamsService } from './teams.service'

describe('coach team scope', () => {
  const service = new TeamsService({} as never)
  const context = jest.spyOn(service as any, 'getTeamContext')

  it('does not give a club-level coach access to an unrelated team', async () => {
    context.mockResolvedValue({ membership: { role: 'COACH', operationalRoles: [] }, activeTeamAccess: [] })
    await expect(service.assertReadableAccess('coach', 'other-team')).rejects.toThrow()
    await expect(service.assertManageAccess('coach', 'other-team')).rejects.toThrow()
    await expect(service.assertEventManagementAccess('coach', 'other-team')).rejects.toThrow()
  })

  it('allows an assigned coach and retains club-wide owner access', async () => {
    context.mockResolvedValue({ membership: { role: 'COACH', operationalRoles: [] }, activeTeamAccess: [{ role: 'HEAD_COACH', phase: 'FULL' }] })
    await expect(service.assertReadableAccess('coach', 'team')).resolves.toBeDefined()
    await expect(service.assertManageAccess('coach', 'team')).resolves.toBeDefined()
    await expect(service.assertEventManagementAccess('coach', 'team')).resolves.toBeDefined()
    context.mockResolvedValue({ membership: { role: 'OWNER', operationalRoles: [] }, activeTeamAccess: [] })
    await expect(service.assertReadableAccess('owner', 'team')).resolves.toBeDefined()
  })

  it('does not let a coach manage events solely through a player or trial role', async () => {
    for (const entry of [{ role: 'PLAYER', phase: 'FULL' }, { role: 'HEAD_COACH', phase: 'TRIAL' }]) {
      context.mockResolvedValue({ membership: { role: 'COACH', operationalRoles: [] }, activeTeamAccess: [entry] })
      await expect(service.assertManageAccess('coach', 'team')).rejects.toThrow()
      await expect(service.assertEventManagementAccess('coach', 'team')).rejects.toThrow()
    }
  })
})
