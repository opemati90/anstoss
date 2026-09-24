import { Reflector } from '@nestjs/core'
import { OnboardingController } from './onboarding.controller'

// onboarding review fixes M4/M5.
describe('OnboardingController join-team', () => {
  it('is write-rate-limited (M5)', () => {
    const reflector = new Reflector()
    const handler = OnboardingController.prototype.joinTeam
    const keys = Reflect.getMetadataKeys(handler)
    const values = keys.map((key) => reflector.get(key, handler))
    expect(values).toContain('write')
  })

  it('defaults a coach to Co-Trainer and passes Cheftrainer through (M4)', async () => {
    const onboarding = { joinTeamByCode: jest.fn().mockResolvedValue({ status: 'PENDING' }) }
    const controller = new OnboardingController(onboarding as never)
    await controller.joinTeam({ id: 'u' }, { joinCode: 'AB23XC45ZK', role: 'COACH' })
    await controller.joinTeam(
      { id: 'u' },
      { joinCode: 'AB23XC45ZK', role: 'COACH', teamRole: 'HEAD_COACH' },
    )
    expect(onboarding.joinTeamByCode.mock.calls[0][1].teamRole).toBe('ASSISTANT_COACH')
    expect(onboarding.joinTeamByCode.mock.calls[1][1].teamRole).toBe('HEAD_COACH')
    await expect(
      controller.joinTeam({ id: 'u' }, { joinCode: 'AB23XC45ZK', role: 'COACH', teamRole: 'OWNER' }),
    ).rejects.toThrow('Unsupported coach role')
  })
})
