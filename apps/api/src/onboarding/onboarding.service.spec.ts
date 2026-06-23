import { ConflictException } from '@nestjs/common'
import { OnboardingService } from './onboarding.service'

/**
 * Fix #2 coverage: phone-roster claims must work for OTP users (clerkId = null)
 * using a client-supplied phone, matched (normalized) against unclaimed slots —
 * NO Clerk lookup. The previous resolvePhone(clerkId) returned null for OTP
 * users so claims were dead.
 */
describe('OnboardingService — phone-roster claims (OTP users)', () => {
  function makeSlot(over: Partial<any> = {}) {
    return {
      id: 'slot_1',
      fullName: 'Max Mustermann',
      position: 'MID',
      jerseyNumber: 10,
      phone: '+491234567',
      dateOfBirth: null,
      claimedByUserId: null,
      team: {
        id: 'team_1',
        clubId: 'club_1',
        name: 'U19',
        club: { id: 'club_1', name: 'FC Test', primaryColor: null, badgeUrl: null },
      },
      ...over,
    }
  }

  function makePrisma(slots: any[]) {
    return {
      rosterSlot: {
        findMany: async ({ where }: any) =>
          slots.filter(
            (s) => s.phone === where.phone && s.claimedByUserId === null,
          ),
        findUnique: async ({ where }: any) =>
          slots.find((s) => s.id === where.id) ?? null,
        updateMany: async ({ where, data }: any) => {
          const s = slots.find(
            (x) => x.id === where.id && x.claimedByUserId === null,
          )
          if (!s) return { count: 0 }
          Object.assign(s, data)
          return { count: 1 }
        },
      },
      user: {
        findUnique: async () => ({ id: 'u1', name: 'Player', dateOfBirth: null }),
        update: async () => ({}),
      },
      membership: { findFirst: async () => null, create: async () => ({}) },
      teamAccess: { findFirst: async () => null, create: async () => ({}) },
      parentalConsent: { findMany: async () => [] },
      $transaction: async (cb: any) => cb(thisPrisma),
    } as any
  }

  let thisPrisma: any
  const channels = { postSystemMessage: jest.fn(async () => {}) } as any

  it('lists pending claims by client-supplied phone (no Clerk)', async () => {
    thisPrisma = makePrisma([makeSlot()])
    const service = new OnboardingService(thisPrisma, channels)
    const claims = await service.listPendingClaims('+491234567')
    expect(claims).toHaveLength(1)
    expect(claims[0].slotId).toBe('slot_1')
    expect(claims[0].club.name).toBe('FC Test')
  })

  it('normalizes whitespace in the supplied phone before matching', async () => {
    thisPrisma = makePrisma([makeSlot()])
    const service = new OnboardingService(thisPrisma, channels)
    const claims = await service.listPendingClaims('+49 123 4567')
    expect(claims).toHaveLength(1)
  })

  it('returns [] for a blank/too-short phone (no claims)', async () => {
    thisPrisma = makePrisma([makeSlot()])
    const service = new OnboardingService(thisPrisma, channels)
    expect(await service.listPendingClaims('')).toEqual([])
    expect(await service.listPendingClaims(null)).toEqual([])
    expect(await service.listPendingClaims('123')).toEqual([])
  })

  it('claims a slot whose phone matches the supplied phone', async () => {
    const slots = [makeSlot()]
    thisPrisma = makePrisma(slots)
    const service = new OnboardingService(thisPrisma, channels)
    const result = await service.claimSlot('u1', '+491234567', 'slot_1')
    expect(result.clubId).toBe('club_1')
    expect(result.teamId).toBe('team_1')
    expect(slots[0].claimedByUserId).toBe('u1')
  })

  it('rejects a claim when the supplied phone does not match the slot', async () => {
    thisPrisma = makePrisma([makeSlot()])
    const service = new OnboardingService(thisPrisma, channels)
    await expect(
      service.claimSlot('u1', '+490000000', 'slot_1'),
    ).rejects.toThrow(ConflictException)
  })

  it('rejects a claim with no phone supplied', async () => {
    thisPrisma = makePrisma([makeSlot()])
    const service = new OnboardingService(thisPrisma, channels)
    await expect(service.claimSlot('u1', null, 'slot_1')).rejects.toThrow(
      ConflictException,
    )
  })
})
