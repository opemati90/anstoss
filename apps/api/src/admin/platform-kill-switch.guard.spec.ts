import { ServiceUnavailableException } from '@nestjs/common'
import { PlatformKillSwitchGuard } from './platform-kill-switch.guard'

function context(path: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ path }) }),
  } as never
}

describe('PlatformKillSwitchGuard', () => {
  it.each([
    ['/club-claims/first', 'kill_switch_claims'],
    ['/clubs/c1/invite-campaigns', 'kill_switch_invites'],
    ['/integrations/fussball/team-links', 'kill_switch_official_pages'],
    ['/clubs/c1/contributions/plans', 'kill_switch_contributions'],
    ['/billing/checkout', 'kill_switch_billing'],
    ['/teams/t1/messages/media', 'kill_switch_chat'],
    ['/teams/t1/channels', 'kill_switch_chat'],
    ['/teams/t1/channels/ch1/members', 'kill_switch_chat'],
    ['/teams/t1/channels/provision', 'kill_switch_chat'],
    ['/polls/p1', 'kill_switch_chat'],
    ['/polls/p1/vote', 'kill_switch_chat'],
    ['/clubs/c1/channels/ch1/messages', 'kill_switch_chat'],
    ['/clubs/c1/conversations', 'kill_switch_chat'],
    ['/clubs/c1/teams/t1/messages/pinned', 'kill_switch_chat'],
    ['/clubs/c1/teams/t1/messages/m1/pin', 'kill_switch_chat'],
    ['/clubs/c1/teams/t1/messages/m1/unpin', 'kill_switch_chat'],
  ])('blocks %s when %s is enabled', async (path, expectedKey) => {
    const settings = { get: jest.fn().mockResolvedValue('true') }
    const guard = new PlatformKillSwitchGuard(settings as never)

    await expect(guard.canActivate(context(path))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(settings.get).toHaveBeenCalledWith(expectedKey)
  })

  it('always allows Stripe lifecycle webhooks while billing mutations are paused', async () => {
    const settings = { get: jest.fn().mockResolvedValue('true') }
    const guard = new PlatformKillSwitchGuard(settings as never)

    await expect(guard.canActivate(context('/billing/webhooks/stripe'))).resolves.toBe(true)
    expect(settings.get).not.toHaveBeenCalled()
  })

  it('allows unrelated and admin recovery routes', async () => {
    const settings = { get: jest.fn().mockResolvedValue('true') }
    const guard = new PlatformKillSwitchGuard(settings as never)

    await expect(guard.canActivate(context('/health'))).resolves.toBe(true)
    await expect(guard.canActivate(context('/admin/settings'))).resolves.toBe(true)
    expect(settings.get).not.toHaveBeenCalled()
  })
})
