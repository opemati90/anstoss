import { assessClubClaim, fussballTeamId, readVerifiedContact } from './claim-assessment'

const teamId = '01OMGSGV0S000000VV0AG811VTVBGE70'
const now = new Date('2026-11-07T12:00:00Z')
const contact = { email: 'coach@yahoo.com', clubName: 'FC Example', teamId,
  sourceUrl: 'https://example.org/contact', note: 'Club representative confirmed the applicant directly.',
  verifiedBy: 'admin-1', expiresAt: '2026-12-01T00:00:00Z' }
const claim = { kind: 'FIRST_CLAIM', status: 'SUBMITTED', expiresAt: new Date('2026-11-12'),
  teamName: 'III', teamGroupType: 'SENIOR', externalTeamUrl: `https://www.fussball.de/mannschaft/-/team-id/${teamId}/tab/overview/`,
  directoryEntry: { name: 'FC Example', activeClubId: null }, claimant: { email: 'coach@yahoo.com' } }

describe('club application assessment', () => {
  it('accepts a verified personal Yahoo address, without a custom domain', () => {
    expect(assessClubClaim(claim, contact, now).eligible).toBe(true)
  })
  it('does not treat an official-looking link or self-declared email as proof', () => {
    expect(assessClubClaim(claim, null, now).eligible).toBe(false)
  })
  it.each([
    { ...contact, email: 'other@yahoo.com' }, { ...contact, clubName: 'Another club' },
    { ...contact, teamId: 'A'.repeat(32) }, { ...contact, expiresAt: '2026-11-01T00:00:00Z' },
  ])('rejects mismatched or expired authority', record => {
    expect(assessClubClaim(claim, record, now).eligible).toBe(false)
  })
  it.each([
    { ...claim, teamName: '' }, { ...claim, teamGroupType: 'YOUTH' },
    { ...claim, kind: 'STAFF_CLAIM' }, { ...claim, status: 'NEEDS_INFO' },
    { ...claim, expiresAt: new Date('2026-11-01') },
    { ...claim, directoryEntry: { ...claim.directoryEntry, activeClubId: 'existing' } },
  ])('keeps incomplete, sensitive or conflicting claims in review', application => {
    expect(assessClubClaim(application, contact, now).eligible).toBe(false)
  })
  it.each([
    `https://fussball.de.evil.test/mannschaft/-/team-id/${teamId}`,
    `https://user:secret@www.fussball.de/mannschaft/-/team-id/${teamId}`,
    `http://www.fussball.de/mannschaft/-/team-id/${teamId}`, 'javascript:alert(1)',
  ])('rejects untrusted reference URLs', url => expect(fussballTeamId(url)).toBeNull())
  it('recognises the supplied FC Treptow format', () => expect(fussballTeamId(claim.externalTeamUrl)).toBe(teamId))
  it('fails closed on malformed persisted authority data', () => {
    expect(readVerifiedContact('{broken')).toBeNull()
    expect(readVerifiedContact(JSON.stringify({ ...contact, verifiedBy: '' }))).toBeNull()
    expect(readVerifiedContact(JSON.stringify(contact))).toEqual(contact)
  })
})
