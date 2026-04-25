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
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedSlot),
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
    expect(tx.rosterSlot.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-1', claimedByUserId: null },
      data: expect.objectContaining({
        claimedByUserId: 'user-kid',
        claimedAt: expect.any(Date),
      }),
    })
    expect(tx.rosterSlot.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'slot-1' } })

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
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
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
    expect(tx.rosterSlot.updateMany).not.toHaveBeenCalled()
  })

  it('rejects when slot becomes claimed mid-transaction (race)', async () => {
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
    // findFirst sees the slot as unclaimed, but a concurrent transaction
    // claims it before our updateMany runs — count: 0 forces rollback.
    const tx = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue(slotRow),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
      user: {
        create: jest.fn().mockResolvedValue(newUser),
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

    expect(tx.rosterSlot.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot-1', claimedByUserId: null },
      data: expect.objectContaining({
        claimedByUserId: 'user-kid',
        claimedAt: expect.any(Date),
      }),
    })
    expect(tx.rosterSlot.findUniqueOrThrow).not.toHaveBeenCalled()
  })

  it('accepts a child who is 15 years and 364 days old', async () => {
    const { prisma, service } = createService()

    const slotRow = { id: 'slot-1', teamId: 'team-1', claimedByUserId: null }
    const newUser = {
      id: 'user-kid',
      name: 'Boundary Kid',
      managedById: 'parent-1',
      clerkId: null,
      email: null,
      dateOfBirth: new Date('2010-04-26'),
      registrationRole: 'PLAYER',
    }
    const updatedSlot = { id: 'slot-1', teamId: 'team-1', claimedByUserId: 'user-kid', claimedAt: new Date() }
    const tx = {
      rosterSlot: {
        findFirst: jest.fn().mockResolvedValue(slotRow),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedSlot),
      },
      user: {
        create: jest.fn().mockResolvedValue(newUser),
      },
    }
    prisma.$transaction.mockImplementation((fn: any) => fn(tx))

    // DOB exactly one day after the 16-year cutoff (frozen now = 2026-04-25).
    const result = await service.create('parent-1', {
      fullName: 'Boundary Kid',
      dateOfBirth: new Date('2010-04-26').toISOString(),
      teamId: 'team-1',
      rosterSlotId: 'slot-1',
    })

    expect(result.user).toBe(newUser)
    expect(tx.user.create).toHaveBeenCalled()
  })

  it('rejects a child who turns 16 today', async () => {
    const { prisma, service } = createService()

    // DOB exactly 16 years before frozen now — they turn 16 today, ageInYears === 16.
    await expect(
      service.create('parent-1', {
        fullName: 'Just Turned 16',
        dateOfBirth: new Date('2010-04-25').toISOString(),
        teamId: 'team-1',
        rosterSlotId: 'slot-1',
      }),
    ).rejects.toThrow(ManagedSubProfileAgeError)

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
