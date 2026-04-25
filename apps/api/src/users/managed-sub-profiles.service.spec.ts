import {
  ManagedSubProfileAgeError,
  ManagedSubProfileSlotUnavailableError,
} from '@anstoss/shared'
import { ManagedSubProfilesService } from './managed-sub-profiles.service'

describe('ManagedSubProfilesService.create', () => {
  function createService() {
    const prisma = {
      rosterSlot: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    }
    const service = new ManagedSubProfilesService(prisma as never)
    return { prisma, service }
  }

  beforeAll(() => {
    // Freeze time so DOB age math doesn't drift over the years.
    jest.useFakeTimers().setSystemTime(new Date('2026-04-25T12:00:00.000Z'))
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('creates a managed sub-profile and claims the roster slot for an under-16 kid', async () => {
    const { prisma, service } = createService()

    const slotRow = {
      id: 'slot-1',
      teamId: 'team-1',
      claimedByUserId: null,
    }
    const newUser = {
      id: 'user-kid',
      name: 'Mara',
      managedById: 'parent-1',
      clerkId: null,
      email: null,
      dateOfBirth: new Date('2017-05-04'),
      registrationRole: 'PLAYER',
    }
    const updatedSlot = {
      id: 'slot-1',
      teamId: 'team-1',
      claimedByUserId: 'user-kid',
      claimedAt: new Date('2026-04-25T12:00:00.000Z'),
    }

    const tx = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue(slotRow),
        update: jest.fn().mockResolvedValue(updatedSlot),
      },
      user: {
        create: jest.fn().mockResolvedValue(newUser),
      },
    }
    prisma.$transaction.mockImplementation((fn: any) => fn(tx))

    const result = await service.create('parent-1', {
      fullName: 'Mara',
      dateOfBirth: new Date('2017-05-04').toISOString(),
      teamId: 'team-1',
      rosterSlotId: 'slot-1',
    })

    expect(tx.rosterSlot.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'slot-1',
        teamId: 'team-1',
        claimedByUserId: null,
      },
    })
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Mara',
        managedById: 'parent-1',
        registrationRole: 'PLAYER',
        dateOfBirth: expect.any(Date),
      }),
    })
    expect(tx.rosterSlot.update).toHaveBeenCalledWith({
      where: { id: 'slot-1' },
      data: expect.objectContaining({
        claimedByUserId: 'user-kid',
        claimedAt: expect.any(Date),
      }),
    })

    expect(result.user).toBe(newUser)
    expect(result.user.managedById).toBe('parent-1')
    expect(result.user.clerkId).toBeNull()
    expect(result.user.email).toBeNull()
    expect(result.slot).toBe(updatedSlot)
    expect(result.slot.claimedByUserId).toBe('user-kid')
  })

  it('rejects when DOB is 16 or older with ManagedSubProfileAgeError', async () => {
    const { prisma, service } = createService()

    await expect(
      service.create('parent-1', {
        fullName: 'Adult Person',
        dateOfBirth: new Date('2005-01-01').toISOString(),
        teamId: 'team-1',
        rosterSlotId: 'slot-1',
      }),
    ).rejects.toThrow(ManagedSubProfileAgeError)

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects when the roster slot is not available with ManagedSubProfileSlotUnavailableError', async () => {
    const { prisma, service } = createService()

    const tx = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      user: {
        create: jest.fn(),
      },
    }
    prisma.$transaction.mockImplementation((fn: any) => fn(tx))

    await expect(
      service.create('parent-1', {
        fullName: 'Mara',
        dateOfBirth: new Date('2017-05-04').toISOString(),
        teamId: 'team-1',
        rosterSlotId: 'slot-1',
      }),
    ).rejects.toThrow(ManagedSubProfileSlotUnavailableError)

    expect(tx.user.create).not.toHaveBeenCalled()
    expect(tx.rosterSlot.update).not.toHaveBeenCalled()
  })
})
