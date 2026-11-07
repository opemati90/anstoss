import { ConflictException } from '@nestjs/common'
import { ClubActivationService } from './club-activation.service'
import * as clubs from '../clubs/clubs.service'
import { ClaimApprovalWorker } from './claim-approval.worker'

describe('automatic activation security boundary', () => {
  function setup() {
    const teamId = '01OMGSGV0S000000VV0AG811VTVBGE70'
    const contact = { email: 'coach@gmail.com', clubName: 'Test FC', teamId,
      sourceUrl: 'https://example.org/contact', note: 'Direct confirmation by club representative.',
      verifiedBy: 'admin-1', expiresAt: new Date(Date.now() + 86400000).toISOString() }
    const claim = { id: 'claim-1', claimantUserId: 'user-1', kind: 'FIRST_CLAIM', status: 'SUBMITTED',
      expiresAt: new Date(Date.now() + 86400000), directoryEntry: {id: 'dir-1', name: 'Test FC', activeClubId: null},
      teamName: 'III', teamGroupType: 'SENIOR', externalTeamUrl: `https://www.fussball.de/mannschaft/-/team-id/${teamId}`,
      requestedTeamRoles: [], evidence: [] }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      platformSetting: { findUnique: jest.fn().mockResolvedValue({ value: JSON.stringify(contact) }) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'user-1', email: contact.email, dateOfBirth: new Date('1990-01-01') }) },
      clubClaim: { findUnique: jest.fn().mockResolvedValue(claim), findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ ...claim, status: 'APPROVED' }) },
      externalTeamLink: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      clubDirectoryEntry: { updateMany: jest.fn().mockResolvedValue({count: 1}) },
      membership: { create: jest.fn() }, teamGroup: { create: jest.fn().mockResolvedValue({id: 'group-1', displayName: 'Herren'}) },
      team: { create: jest.fn().mockResolvedValue({id: 'team-1'}) },
      planDefinition: { findFirst: jest.fn().mockResolvedValue({id: 'plan-1'}) },
      entitlementGrant: { create: jest.fn() }, auditLog: { create: jest.fn() },
    }
    const prisma = { $transaction: jest.fn(async (fn: (db: typeof tx) => unknown) => fn(tx)) }
    const channels = { ensureClubChannels: jest.fn(), ensureTeamChannels: jest.fn() }
    const service = new ClubActivationService(prisma as never, {} as never, channels as never, {} as never)
    const createClub = jest.spyOn(clubs, 'createClubWithUniqueSlug').mockResolvedValue({id:'club-1',name:'Test FC'} as never)
    const approve = () => service.reviewFirstClaim('admin-1', claim.id, {decision:'APPROVE',note:contact.note}, true)
    return {service, tx, createClub, approve}
  }
  afterEach(() => jest.restoreAllMocks())
  it('creates owner, team, trial and channels through the existing audited activation path', async () => {
    const {tx, approve} = setup()
    expect(await approve()).toMatchObject({ claim: { status: 'APPROVED' } })
    expect(tx.membership.create).toHaveBeenCalledWith({data:{clubId:'club-1',userId:'user-1',role:'OWNER'}})
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({type:'club.claim_auto_approved',actorType:'system'})}))
  })
  it('rechecks authority inside the transaction instead of trusting a queue assessment', async () => {
    const {tx, approve, createClub} = setup()
    tx.platformSetting.findUnique.mockResolvedValue(null as never)
    await expect(approve()).rejects.toBeInstanceOf(ConflictException)
    expect(createClub).not.toHaveBeenCalled()
  })
  it('blocks a competing claimant even when the submitted contact matches', async () => {
    const {tx, approve, createClub} = setup()
    tx.clubClaim.findFirst.mockResolvedValue({id:'other-claim'} as never)
    await expect(approve()).rejects.toBeInstanceOf(ConflictException)
    expect(createClub).not.toHaveBeenCalled()
  })
  it('blocks reactivation through a new manual directory entry for an existing team', async () => {
    const {tx, approve, createClub} = setup()
    tx.externalTeamLink.findFirst.mockResolvedValue({id:'existing-team'} as never)
    await expect(approve()).rejects.toBeInstanceOf(ConflictException)
    expect(createClub).not.toHaveBeenCalled()
  })
  it('requires the verifying operator still to be an active platform admin', async () => {
    const {tx, approve, createClub} = setup()
    tx.user.findFirst.mockResolvedValueOnce({email:'coach@gmail.com'} as never).mockResolvedValueOnce(null as never)
    await expect(approve()).rejects.toBeInstanceOf(ConflictException)
    expect(createClub).not.toHaveBeenCalled()
  })
  it('honours the claims kill switch inside the activation transaction', async () => {
    const {tx, approve, createClub} = setup()
    tx.platformSetting.findUnique.mockResolvedValueOnce({value:'true'})
    await expect(approve()).rejects.toBeInstanceOf(ConflictException)
    expect(createClub).not.toHaveBeenCalled()
  })
  it('does not overlap worker passes', async () => {
    let finish!: () => void
    const runAutomaticApprovals = jest.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const worker = new ClaimApprovalWorker({runAutomaticApprovals} as never)
    const first = worker.tick()
    await worker.tick()
    expect(runAutomaticApprovals).toHaveBeenCalledTimes(1)
    finish()
    await first
  })
})
