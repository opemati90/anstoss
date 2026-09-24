import { MembershipRole } from '@anstoss/shared'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { ROLES_KEY, RolesGuard } from '../auth/roles.guard'
import { UsersController } from './users.controller'
import { MemberExportService, buildCsv, csvCell } from './member-export'

describe('member export CSV escaping (H2)', () => {
  it.each([
    ['=HYPERLINK("http://evil")', `"'=HYPERLINK(""http://evil"")"`],
    ['+49 170 1234567', `"'+49 170 1234567"`],
    ['-2+3', `"'-2+3"`],
    ['@SUM(A1)', `"'@SUM(A1)"`],
    ['\tTab', `"'\tTab"`],
    ['\rCarriage', `"'\rCarriage"`],
  ])('neutralises a formula trigger in %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected)
  })

  it('leaves ordinary text alone but always quotes', () => {
    expect(csvCell('Tim Weber')).toBe('"Tim Weber"')
    expect(csvCell('Müller; Jörg')).toBe('"Müller; Jörg"')
    expect(csvCell('Sagt "Hallo"')).toBe('"Sagt ""Hallo"""')
    expect(csvCell('Zeile 1\nZeile 2')).toBe('"Zeile 1\nZeile 2"')
    expect(csvCell('a=b')).toBe('"a=b"')
    expect(csvCell('')).toBe('""')
    expect(csvCell(null)).toBe('""')
    expect(csvCell(undefined)).toBe('""')
  })

  it('starts with a UTF-8 BOM, uses ; and CRLF', () => {
    const csv = buildCsv([
      ['Name', 'Rolle'],
      ['Jürgen Groß', 'Spieler'],
    ])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toBe('﻿"Name";"Rolle"\r\n"Jürgen Groß";"Spieler"\r\n')
  })
})

describe('MemberExportService', () => {
  function createService(language = 'de') {
    const users = {
      listClubMembersPage: jest.fn().mockResolvedValue({
        items: [
          {
            role: 'PLAYER',
            createdAt: new Date('2024-03-01T10:00:00Z'),
            isActive: true,
            teamNames: ['Herren I', 'Ü32'],
            user: { name: 'Tim Weber', email: 'tim@example.com' },
          },
          {
            role: 'PARENT',
            createdAt: new Date('2025-08-15T10:00:00Z'),
            isActive: false,
            teamNames: [],
            user: { name: '=cmd|calc', email: '+evil@example.com' },
          },
        ],
        total: 2,
      }),
    }
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ preferredLanguage: language }) },
      club: { findUnique: jest.fn().mockResolvedValue({ slug: 'sv-albatros' }) },
    }
    const audit = { log: jest.fn().mockResolvedValue(undefined) }
    const service = new MemberExportService(users as never, prisma as never, audit as never)
    return { service, users, audit }
  }
  const now = new Date('2026-09-24T08:00:00Z')

  it('exports Name, Rolle, Mannschaften, Status, Eintritt without emails by default', async () => {
    const { service, users } = createService()
    const result = await service.exportMembers('club-1', 'admin-1', { includeEmails: false }, now)
    const lines = result.csv.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('"Name";"Rolle";"Mannschaften";"Status";"Eintritt"')
    expect(lines[1]).toBe('"Tim Weber";"Spieler";"Herren I, Ü32";"Aktiv";"01.03.2024"')
    expect(lines[2]).toBe(`"'=cmd|calc";"Elternteil";"";"Passiv";"15.08.2025"`)
    expect(result.csv).not.toContain('@example.com')
    expect(result).toEqual(
      expect.objectContaining({
        rowCount: 2,
        includeEmails: false,
        fileName: 'sv-albatros-mitglieder-2026-09-24.csv',
      }),
    )
    // Reuses the admin member list (which also enforces membership).
    expect(users.listClubMembersPage).toHaveBeenCalledWith(
      'club-1',
      'admin-1',
      expect.objectContaining({ offset: 0, filter: 'all' }),
    )
  })

  it('adds the email column only when explicitly requested, escaped', async () => {
    const { service } = createService()
    const result = await service.exportMembers('club-1', 'admin-1', { includeEmails: true }, now)
    const lines = result.csv.replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('"Name";"E-Mail";"Rolle";"Mannschaften";"Status";"Eintritt"')
    expect(lines[1]).toContain('"tim@example.com"')
    expect(lines[2]).toContain(`"'+evil@example.com"`)
  })

  it('writes an audit entry with who, when, row count and email flag', async () => {
    const { service, audit } = createService()
    await service.exportMembers('club-1', 'admin-1', { includeEmails: true }, now)
    expect(audit.log).toHaveBeenCalledWith({
      clubId: 'club-1',
      type: 'members.exported',
      actorType: 'user',
      actorId: 'admin-1',
      actorLabel: null,
      summary: expect.stringContaining('including email'),
      metadata: { rowCount: 2, includeEmails: true, exportedAt: '2026-09-24T08:00:00.000Z' },
    })
  })

  it('localizes headers for the exporting admin and falls back to German', async () => {
    const en = await createService('en').service.exportMembers('c', 'a', { includeEmails: false }, now)
    expect(en.csv).toContain('"Name";"Role";"Teams";"Status";"Joined"')
    expect(en.fileName).toBe('sv-albatros-members-2026-09-24.csv')
    const unknown = await createService('xx').service.exportMembers('c', 'a', { includeEmails: false }, now)
    expect(unknown.csv).toContain('"Eintritt"')
  })
})

describe('GET /clubs/:clubId/members/export route', () => {
  const handler = UsersController.prototype.exportMembers

  it('requires ADMIN via RolesGuard', () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toBe(MembershipRole.ADMIN)
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(RolesGuard)
    expect(Reflect.getMetadata('path', handler)).toBe('clubs/:clubId/members/export')
  })

  it('is declared before members/:userId so "export" is not read as a user id', () => {
    const names = Object.getOwnPropertyNames(UsersController.prototype)
    expect(names.indexOf('exportMembers')).toBeGreaterThan(-1)
    expect(names.indexOf('exportMembers')).toBeLessThan(names.indexOf('getMemberProfile'))
  })

  it('parses includeEmails strictly (anything but true/1 means no emails)', async () => {
    const exportMembers = jest.fn().mockResolvedValue({})
    const controller = new UsersController({} as never, {} as never, { exportMembers } as never)
    await controller.exportMembers({ id: 'admin-1' }, 'club-1', {})
    await controller.exportMembers({ id: 'admin-1' }, 'club-1', { includeEmails: 'true' })
    expect(exportMembers.mock.calls[0][2]).toEqual({ includeEmails: false })
    expect(exportMembers.mock.calls[1][2]).toEqual({ includeEmails: true })
    await expect(
      controller.exportMembers({ id: 'admin-1' }, 'club-1', { includeEmails: 'yes' }),
    ).rejects.toThrow()
  })
})
