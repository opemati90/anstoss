import { ChatGateway } from './chat.gateway'

function fixture() {
  const channel = { id: 'channel', clubId: 'club', teamId: 'canonical-team' }
  const channels = { getChannelAccess: jest.fn().mockResolvedValue({ canRead: true, channel }) }
  const ageGate = { isAllowed: jest.fn().mockResolvedValue(true) }
  const socket = { data: { userId: 'user' }, join: jest.fn() }
  const fetchSockets = jest.fn().mockResolvedValue([socket])
  const gateway = Object.assign(Object.create(ChatGateway.prototype), {
    channelsService: channels, ageGate, server: { in: jest.fn(() => ({ fetchSockets })) },
    logger: { warn: jest.fn() },
  }) as ChatGateway
  return { gateway, channels, ageGate, socket, fetchSockets }
}

describe('channel lifecycle autojoin reauthorization', () => {
  const event = { userId: 'user', channelId: 'channel', teamId: 'untrusted-event-team' }
  it('ignores an add event whose member has already lost access', async () => {
    const { gateway, channels, socket, fetchSockets } = fixture()
    channels.getChannelAccess.mockResolvedValue({ canRead: false, channel: null } as never)
    await gateway.onChannelMemberAdded(event)
    expect(socket.join).not.toHaveBeenCalled(); expect(fetchSockets).not.toHaveBeenCalled()
  })
  it('rechecks access after delayed Redis socket discovery', async () => {
    const { gateway, channels, socket } = fixture()
    channels.getChannelAccess.mockResolvedValueOnce({ canRead: true, channel: { id: 'channel', clubId: 'club', teamId: 'team' } })
      .mockResolvedValueOnce({ canRead: false, channel: null } as never)
    await gateway.onChannelMemberAdded(event)
    expect(channels.getChannelAccess).toHaveBeenCalledTimes(2)
    expect(socket.join).not.toHaveBeenCalled()
  })
  it('denies a scoped age/participation failure', async () => {
    const { gateway, ageGate, socket } = fixture()
    ageGate.isAllowed.mockResolvedValue(false)
    await gateway.onChannelMemberAdded(event)
    expect(socket.join).not.toHaveBeenCalled()
  })
  it('joins only server-derived rooms for the authenticated socket', async () => {
    const { gateway, ageGate, socket } = fixture()
    await gateway.onChannelMemberAdded(event)
    expect(ageGate.isAllowed).toHaveBeenCalledWith('user', { clubId: 'club', teamId: 'canonical-team' })
    expect(socket.join.mock.calls).toEqual([['channel:channel'], ['team:canonical-team:channel:channel']])
  })
  it('fails closed on a lookup error or a mismatched socket identity', async () => {
    const { gateway, channels, socket } = fixture()
    socket.data.userId = 'different-user'
    await gateway.onChannelMemberAdded(event)
    channels.getChannelAccess.mockRejectedValue(new Error('database unavailable'))
    await gateway.onChannelMemberAdded(event)
    expect(socket.join).not.toHaveBeenCalled()
  })
})
