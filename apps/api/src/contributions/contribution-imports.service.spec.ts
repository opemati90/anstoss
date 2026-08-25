import {
  ContributionImportsService,
  parseCamt053,
  parseCsv,
} from './contribution-imports.service'

describe('bank statement parsing', () => {
  it('accepts German dates and skips outgoing CSV transactions', () => {
    const parsed = parseCsv(
      [
        'Buchungstag;Betrag;Währung;Auftraggeber;Verwendungszweck;Soll/Haben',
        '24.08.2026;25,00;EUR;Max Mustermann;Beitrag August;HABEN',
        '24.08.2026;-10,00;EUR;Sportshop;Trikots;SOLL',
      ].join('\n'),
    )
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ amount: 2500, payerName: 'Max Mustermann' })
    expect(parsed[0].bookedAt.toISOString()).toBe('2026-08-24T00:00:00.000Z')
  })

  it('preserves English decimal amounts instead of inflating them by 100x', () => {
    const parsed = parseCsv(
      ['date,amount,currency,payer,direction', '2026-08-24,123.45,EUR,Alex,CRDT'].join(
        '\n',
      ),
    )
    expect(parsed).toHaveLength(1)
    expect(parsed[0].amount).toBe(12_345)
  })

  it('accepts English thousands separators when the field is quoted', () => {
    const parsed = parseCsv(
      ['date,amount,currency,payer,direction', '2026-08-24,"1,234.56",EUR,Alex,CRDT'].join(
        '\n',
      ),
    )
    expect(parsed[0].amount).toBe(123_456)
  })

  it('accepts only explicit CAMT credits and ignores debits', () => {
    const parsed = parseCamt053(`
      <Document><BkToCstmrStmt><Stmt>
        <Ntry><Amt Ccy="EUR">25.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-08-24</Dt></BookgDt><Nm>Max</Nm><Ustrd>Dues</Ustrd></Ntry>
        <Ntry><Amt Ccy="EUR">10.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-08-24</Dt></BookgDt><Nm>Shop</Nm></Ntry>
      </Stmt></BkToCstmrStmt></Document>
    `)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({ amount: 2500, payerName: 'Max' })
  })

  it('rejects CAMT entries without an explicit credit/debit direction', () => {
    expect(() =>
      parseCamt053(
        '<Document><Ntry><Amt Ccy="EUR">25</Amt><BookgDt><Dt>2026-08-24</Dt></BookgDt></Ntry></Document>',
      ),
    ).toThrow('Unsupported CAMT transaction direction')
  })
})

describe('ContributionImportsService.confirm', () => {
  it('re-confirming the same match replaces its amount instead of double-counting it', async () => {
    const transaction = { id: 'bank-1', clubId: 'club-1', amount: 10_000, currency: 'eur' }
    const record = {
      id: 'record-1',
      clubId: 'club-1',
      amount: 10_000,
      paidAmount: 4_000,
      currency: 'eur',
      paidAt: null,
    }
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      bankTransaction: { findFirst: jest.fn().mockResolvedValue(transaction) },
      contributionRecord: {
        findFirst: jest.fn().mockResolvedValue(record),
        update: jest.fn().mockResolvedValue({}),
      },
      contributionMatch: {
        findUnique: jest.fn().mockResolvedValue({ amount: 4_000, status: 'CONFIRMED' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        upsert: jest.fn().mockResolvedValue({ id: 'match-1', amount: 5_000 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    }
    const prisma = {
      membership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    }
    const service = new ContributionImportsService(prisma as never)

    await service.confirm('club-1', 'owner-1', {
      transactionId: 'bank-1',
      recordId: 'record-1',
      amount: 5_000,
    })

    expect(tx.contributionRecord.update).toHaveBeenCalledWith({
      where: { id: 'record-1' },
      data: expect.objectContaining({ paidAmount: 5_000, status: 'PARTIAL' }),
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'contribution.bank_match_confirmed',
        actorId: 'owner-1',
      }),
    })
  })
})
