import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { CoachAttendanceService } from './coach-attendance.service'
import { CoachAttendanceController } from './coach-attendance.controller'
import { lockAvailabilityAuthority, lockAvailabilityEvent, lockAvailabilityLifecycles } from './availability-policy'

jest.mock('./availability-policy', () => ({
  lockAvailabilityAuthority: jest.fn(), lockAvailabilityEvent: jest.fn(), lockAvailabilityLifecycles: jest.fn(),
}))

describe('coach attendance', () => {
  let db: any, teams: any, events: any, service: CoachAttendanceService
  const current = { id: 'event', clubId: 'club', teamId: 'team', date: new Date(Date.now() - 60000), cancelledAt: null, archivedAt: null }
  beforeEach(() => {
    jest.clearAllMocks()
    ;(lockAvailabilityEvent as jest.Mock).mockResolvedValue(current)
    db = { event: { findFirst: jest.fn().mockResolvedValue({ teamId: 'team' }) },
      coachAttendance: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ status: 'PRESENT' }) },
      coachAttendanceChange: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
      coachAttendanceRejection: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
      $executeRaw: jest.fn().mockResolvedValue(0) }
    db.$transaction = (fn: (tx: any) => Promise<unknown>) => fn(db)
    teams = { assertEventManagementAccess: jest.fn().mockResolvedValue(undefined) }
    events = { assertCurrentPlayerEligibility: jest.fn().mockResolvedValue(undefined) }
    service = new CoachAttendanceService(db, teams, events)
  })

  it('records a separate observation and an audit event after authorization and participant revalidation', async () => {
    await service.record('club', 'event', 'coach', 'player', 'PRESENT', null, 'op')
    expect(lockAvailabilityLifecycles).toHaveBeenCalledWith(db, ['coach', 'player'])
    expect(lockAvailabilityAuthority).toHaveBeenCalledTimes(2)
    expect(teams.assertEventManagementAccess).toHaveBeenCalledTimes(2)
    expect(events.assertCurrentPlayerEligibility).toHaveBeenCalledWith(db, 'club', 'team', 'event', 'player')
    expect(db.coachAttendanceChange.create).toHaveBeenCalledWith({ data: { eventId: 'event', userId: 'player', actorId: 'coach', previous: null, status: 'PRESENT', operationId: 'op', expectedVersion: null } })
  })

  it('advances the version on a reaffirmation and audits a change to UNKNOWN', async () => {
    db.coachAttendance.findUnique.mockResolvedValue({ status: 'PRESENT', version: 1 })
    await service.record('club', 'event', 'coach', 'player', 'PRESENT', 1, 'op-1')
    expect(db.coachAttendance.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ version: { increment: 1 } }) }))
    expect(db.coachAttendanceChange.create).toHaveBeenCalled()
    await service.record('club', 'event', 'coach', 'player', 'UNKNOWN', 1, 'op-2')
    expect(db.coachAttendanceChange.create).toHaveBeenCalledWith({ data: expect.objectContaining({ previous: 'PRESENT', status: 'UNKNOWN' }) })
    expect(db.eventCheckIn).toBeUndefined()
  })

  it('rejects revoked managers and ineligible participants before writing', async () => {
    teams.assertEventManagementAccess.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ForbiddenException())
    await expect(service.record('club', 'event', 'coach', 'player', 'ABSENT', null, 'op')).rejects.toBeInstanceOf(ForbiddenException)
    teams.assertEventManagementAccess.mockResolvedValue(undefined)
    events.assertCurrentPlayerEligibility.mockRejectedValue(new ForbiddenException())
    await expect(service.record('club', 'event', 'coach', 'player', 'ABSENT', null, 'op')).resolves.toEqual({ settled: true, rejected: true })
    expect(db.coachAttendance.upsert).not.toHaveBeenCalled()
  })

  it('rejects wrong-team, cancelled, archived and not-yet-started events', async () => {
    ;(lockAvailabilityEvent as jest.Mock).mockResolvedValueOnce({ ...current, teamId: 'other' })
    await expect(service.record('club', 'event', 'coach', 'player', 'PRESENT', null, 'op')).rejects.toBeInstanceOf(BadRequestException)
    for (const change of [{ cancelledAt: new Date() }, { archivedAt: new Date() }, { date: new Date(Date.now() + 60000) }]) {
      ;(lockAvailabilityEvent as jest.Mock).mockResolvedValueOnce({ ...current, ...change })
      await expect(service.record('club', 'event', 'coach', 'player', 'PRESENT', null, 'op')).resolves.toEqual({ settled: true, rejected: true })
    }
    expect(db.coachAttendance.upsert).not.toHaveBeenCalled()
  })

  it('validates allowed outcomes at the API boundary', () => {
    const controller = new CoachAttendanceController(service)
    expect(() => controller.record({ id: 'coach' }, 'club', 'event', 'player', { status: 'SICK' })).toThrow()
    expect(() => controller.record({ id: 'coach' }, 'club', 'event', 'player', { status: 'PRESENT', note: 'health' })).toThrow()
  })

  it('rejects a stale write even when an earlier response was lost', async () => {
    db.coachAttendance.findUnique.mockResolvedValue({ status: 'ABSENT', version: 2 })
    await expect(service.record('club', 'event', 'coach', 'player', 'PRESENT', 1, 'op')).rejects.toMatchObject({ status: 409 })
    expect(db.coachAttendance.upsert).not.toHaveBeenCalled()
  })

  it('replays an already committed operation without writing again', async () => {
    db.coachAttendance.findUnique.mockResolvedValue({ userId: 'player', status: 'PRESENT', version: 1 })
    db.coachAttendanceChange.findUnique.mockResolvedValue({ eventId: 'event', userId: 'player', actorId: 'coach', status: 'PRESENT', expectedVersion: null })
    await expect(service.record('club', 'event', 'coach', 'player', 'PRESENT', null, 'op')).resolves.toEqual({ settled: true })
    expect(db.coachAttendance.upsert).not.toHaveBeenCalled()
    expect(db.coachAttendanceChange.create).not.toHaveBeenCalled()
  })

  it('confirms an existing receipt after cancellation without exposing the player record', async () => {
    ;(lockAvailabilityEvent as jest.Mock).mockResolvedValue({ ...current, cancelledAt: new Date() })
    db.coachAttendanceChange.findUnique.mockResolvedValue({ eventId: 'event', userId: 'player', actorId: 'coach', status: 'PRESENT', expectedVersion: null })
    await expect(service.record('club', 'event', 'coach', 'player', 'PRESENT', null, 'op')).resolves.toEqual({ settled: true })
    expect(events.assertCurrentPlayerEligibility).not.toHaveBeenCalled()
    expect(db.coachAttendance.findUnique).not.toHaveBeenCalled()
  })

  it('rejects an operation ID reused with a different payload', async () => {
    db.coachAttendanceChange.findUnique.mockResolvedValue({ eventId: 'event', userId: 'player', actorId: 'coach', status: 'PRESENT', expectedVersion: null })
    await expect(service.record('club', 'event', 'coach', 'player', 'ABSENT', null, 'op')).rejects.toMatchObject({ status: 409 })
    expect(db.coachAttendance.upsert).not.toHaveBeenCalled()
  })

  it('fences an ineligible target without storing the target identity in the rejection', async () => {
    events.assertCurrentPlayerEligibility.mockRejectedValue(new ForbiddenException())
    await expect(service.record('club', 'event', 'coach', 'foreign-user', 'PRESENT', null, 'op')).resolves.toEqual({ settled: true, rejected: true })
    expect(db.coachAttendanceRejection.create).toHaveBeenCalledWith({ data: { operationId: 'op', eventId: 'event', actorId: 'coach' } })
    expect(db.coachAttendanceChange.create).not.toHaveBeenCalled()
  })

  it('replays a rejection without evaluating or identifying the target', async () => {
    db.coachAttendanceRejection.findUnique.mockResolvedValue({ operationId: 'op', eventId: 'event', actorId: 'coach' })
    await expect(service.record('club', 'event', 'coach', 'other-target', 'ABSENT', null, 'op')).resolves.toEqual({ settled: true, rejected: true })
    expect(events.assertCurrentPlayerEligibility).not.toHaveBeenCalled()
  })

  it('fails closed at the rejection quota without dropping existing fences', async () => {
    db.coachAttendanceRejection.count.mockResolvedValue(10_000)
    events.assertCurrentPlayerEligibility.mockRejectedValue(new ForbiddenException())
    await expect(service.record('club', 'event', 'coach', 'foreign-user', 'PRESENT', null, 'op')).rejects.toMatchObject({ status: 503 })
    expect(db.coachAttendanceRejection.create).not.toHaveBeenCalled()
  })
})
