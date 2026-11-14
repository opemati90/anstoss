import { ForbiddenException } from '@nestjs/common'
import { ChatService } from './chat.service'

describe('channel lineup coaching permission', () => {
  function build(role: string, coachingRole?: string) {
    const prisma = {
      channel: { findUnique: jest.fn().mockResolvedValue({ id: 'channel', teamId: 'team', clubId: 'club' }) },
      message: { create: jest.fn() },
    }
    const teams = { assertReadableAccess: jest.fn().mockResolvedValue({
      team: { clubId: 'club' }, membership: { role },
      activeTeamAccess: coachingRole ? [{ role: coachingRole }] : [],
    }) }
    const billing = { getEntitlements: jest.fn().mockResolvedValue({ features: [] }) }
    const service = new ChatService(prisma as never, teams as never, {} as never, {} as never,
      { assertWritable: jest.fn() } as never, billing as never)
    return { service, prisma, billing }
  }
  const input = { teamId: 'team', channelId: 'channel', formation: '4-4-2', xi: 'Team' }
  it.each(['PLAYER', 'COACH', 'ADMIN', 'OWNER'])('rejects %s without active team coaching access', async (role) => {
    const { service, prisma, billing } = build(role)
    await expect(service.postLineup('user', input)).rejects.toThrow('Only coaches can post lineups')
    expect(prisma.message.create).not.toHaveBeenCalled()
    expect(billing.getEntitlements).not.toHaveBeenCalled()
  })
  it.each(['HEAD_COACH', 'ASSISTANT_COACH'])('retains the premium check after authorised %s access', async (role) => {
    const { service, prisma, billing } = build('PLAYER', role)
    await expect(service.postLineup('user', input)).rejects.toThrow(ForbiddenException)
    expect(billing.getEntitlements).toHaveBeenCalledWith('club')
    expect(prisma.message.create).not.toHaveBeenCalled()
  })
})
