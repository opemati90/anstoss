import { PushService } from './push.service'
import { AgeGateService } from '../auth/age-gate.service'
import { createFakePrisma, dobForAge } from '../testing/fake-prisma'

// 16+ direct-account launch policy applies to push delivery as well as HTTP.
describe('PushService age-gate fan-out', () => {
  function build() {
    const prisma = createFakePrisma({
      user: [
        { id: 'coach', dateOfBirth: dobForAge(40), deletedAt: null, preferredLanguage: 'de' },
        { id: 'tim', dateOfBirth: dobForAge(14), deletedAt: null, preferredLanguage: 'de' },
      ],
      parentalConsent: [
        { id: 'c1', clubId: 'albatros', teamId: 'u15', playerUserId: 'tim', status: 'WITHDRAWN' },
        { id: 'c2', clubId: 'babelsberg', teamId: 'b-u15', playerUserId: 'tim', status: 'APPROVED' },
      ],
      teamAccess: [
        { id: 'a1', clubId: 'albatros', teamId: 'u15', userId: 'coach', role: 'HEAD_COACH', status: 'ACTIVE', loanEndDate: null },
        // A stale ACTIVE row (e.g. created by a path that skipped consent).
        { id: 'a2', clubId: 'albatros', teamId: 'u15', userId: 'tim', role: 'PLAYER', status: 'ACTIVE', loanEndDate: null },
      ],
      pushToken: [
        { token: 'tok-coach', userId: 'coach' },
        { token: 'tok-tim', userId: 'tim' },
      ],
    })
    const service = new PushService(prisma as never, undefined, new AgeGateService(prisma as never))
    const sent = jest.spyOn(service as any, 'sendPush').mockResolvedValue(undefined)
    return { service, sent }
  }

  it('team fan-out skips a child who fails the gate for that team', async () => {
    const { service, sent } = build()
    await service.sendToTeam('u15', 'Training', 'Heute 18 Uhr', undefined, undefined, { clubId: 'albatros' })
    expect(sent).toHaveBeenCalledWith(['tok-coach'], 'Training', 'Heute 18 Uhr', undefined)
  })

  it('drops direct pushes to minors even when historical consent was approved', async () => {
    const { service, sent } = build()
    await service.sendToUser('tim', 'x', 'y', undefined, { clubId: 'albatros' })
    expect(sent).not.toHaveBeenCalled()
    await service.sendToUser('tim', 'x', 'y', { teamId: 'b-u15' }, { clubId: 'babelsberg' })
    expect(sent).not.toHaveBeenCalled()
    await service.sendToUser('coach', 'x', 'y', { teamId: 'u15' }, { clubId: 'albatros' })
    expect(sent).toHaveBeenCalledWith(['tok-coach'], 'x', 'y', { teamId: 'u15' })
  })
})
