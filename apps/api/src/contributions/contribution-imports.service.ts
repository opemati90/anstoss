import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import type { ConfirmContributionMatchInput, CreateBankImportInput } from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { tenantContext } from '../prisma/tenant.context'
import { Prisma } from '@prisma/client'

type ParsedTransaction = {
  bookedAt: Date
  amount: number
  currency: string
  payerName: string | null
  ibanLast4: string | null
  reference: string | null
  externalId: string | null
}

const MAX_IMPORT_ROWS = 10_000
const MAX_BANK_TEXT_LENGTH = 500

@Injectable()
export class ContributionImportsService {
  constructor(private readonly prisma: PrismaService) {}

  async import(clubId: string, actorId: string, input: CreateBankImportInput) {
    await this.assertAdmin(clubId, actorId)
    const bytes = Buffer.from(input.contentBase64, 'base64')
    if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024) {
      throw new BadRequestException('Import must be between 1 byte and 10 MB')
    }
    const contentHash = createHash('sha256').update(bytes).digest('hex')
    const parsed =
      input.format === 'CSV'
        ? parseCsv(bytes.toString('utf8'))
        : parseCamt053(bytes.toString('utf8'))
    if (parsed.length === 0) throw new BadRequestException('No bank transactions found')
    if (parsed.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`Bank imports are limited to ${MAX_IMPORT_ROWS} incoming rows`)
    }

    return tenantContext.run({ clubId, userId: actorId }, async () => {
      try {
        return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.bankImportBatch.findUnique({
          where: { clubId_contentHash: { clubId, contentHash } },
          include: { transactions: true },
        })
        if (existing) return existing
        const batch = await tx.bankImportBatch.create({
          data: {
            clubId,
            importedById: actorId,
            contentHash,
            fileName: input.fileName,
            format: input.format,
            rowCount: parsed.length,
            rawExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            // Raw bytes are parsed in memory and discarded before this write.
            rawPurgedAt: new Date(),
          },
        })
        for (const row of parsed) {
          const fingerprint = createHash('sha256')
            .update(
              [
                row.bookedAt.toISOString(),
                row.amount,
                row.currency,
                row.payerName,
                row.reference,
                row.externalId,
              ].join('|'),
            )
            .digest('hex')
          await tx.bankTransaction.upsert({
            where: { clubId_fingerprint: { clubId, fingerprint } },
            create: { clubId, batchId: batch.id, fingerprint, ...row },
            update: {},
          })
        }
        await tx.auditLog.create({
          data: {
            clubId,
            type: 'contribution.bank_imported',
            actorType: 'user',
            actorId,
            actorLabel: null,
            summary: `Imported ${parsed.length} incoming bank transaction${parsed.length === 1 ? '' : 's'}.`,
            metadata: {
              batchId: batch.id,
              contentHash,
              rowCount: parsed.length,
              format: input.format,
            },
          },
        })
        return tx.bankImportBatch.findUniqueOrThrow({
          where: { id: batch.id },
          include: { transactions: true },
        })
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const existing = await this.prisma.bankImportBatch.findUnique({
            where: { clubId_contentHash: { clubId, contentHash } },
            include: { transactions: true },
          })
          if (existing) return existing
        }
        throw error
      }
    })
  }

  async suggestions(clubId: string, actorId: string, batchId: string) {
    await this.assertAdmin(clubId, actorId)
    const batch = await this.prisma.bankImportBatch.findFirst({
      where: { id: batchId, clubId },
      include: { transactions: true },
    })
    if (!batch) throw new NotFoundException('Import batch not found')
    const records = await this.prisma.contributionRecord.findMany({
      where: { clubId, status: { in: ['PENDING', 'PARTIAL'] } },
      include: {
        member: { select: { name: true, email: true } },
        plan: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    })
    return batch.transactions.flatMap((transaction) => {
      const haystack = `${transaction.payerName ?? ''} ${transaction.reference ?? ''}`.toLowerCase()
      return records
        .map((record) => {
          const name = record.member.name.toLowerCase()
          const email = record.member.email?.toLowerCase() ?? ''
          const amountDelta = Math.abs(record.amount - transaction.amount)
          let confidence = 0
          if (name && haystack.includes(name)) confidence += 60
          if (email && haystack.includes(email)) confidence += 25
          if (amountDelta === 0) confidence += 30
          else if (amountDelta <= 100) confidence += 10
          return { transaction, record, confidence: Math.min(confidence, 100) }
        })
        .filter((candidate) => candidate.confidence >= 40)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3)
    })
  }

  async confirm(clubId: string, actorId: string, input: ConfirmContributionMatchInput) {
    await this.assertAdmin(clubId, actorId)
    return tenantContext.run({ clubId, userId: actorId }, () =>
      this.prisma.$transaction(async (tx) => {
        // A match mutates both the bank transaction allocation and the target
        // contribution balance. Lock both in stable order so two transactions
        // cannot concurrently overwrite the same record's paid amount.
        for (const lockKey of [
          `contribution-record:${input.recordId}`,
          `bank-transaction:${input.transactionId}`,
        ].sort()) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`
        }
        const [transaction, record] = await Promise.all([
          tx.bankTransaction.findFirst({ where: { id: input.transactionId, clubId } }),
          tx.contributionRecord.findFirst({ where: { id: input.recordId, clubId } }),
        ])
        if (!transaction || !record)
          throw new NotFoundException('Transaction or contribution record not found')
        if (transaction.currency.toLowerCase() !== record.currency.toLowerCase()) {
          throw new ConflictException('Bank transaction and contribution currencies differ')
        }
        const existingMatch = await tx.contributionMatch.findUnique({
          where: {
            transactionId_recordId: {
              transactionId: transaction.id,
              recordId: record.id,
            },
          },
          select: { amount: true, status: true },
        })
        const used = await tx.contributionMatch.aggregate({
          where: {
            transactionId: transaction.id,
            status: 'CONFIRMED',
            recordId: { not: record.id },
          },
          _sum: { amount: true },
        })
        if ((used._sum.amount ?? 0) + input.amount > transaction.amount) {
          throw new ConflictException('Confirmed matches exceed the bank transaction amount')
        }
        const previousMatchAmount = existingMatch?.status === 'CONFIRMED' ? existingMatch.amount : 0
        const confirmedForRecord = await tx.contributionMatch.aggregate({
          where: {
            recordId: record.id,
            status: 'CONFIRMED',
            transactionId: { not: transaction.id },
          },
          _sum: { amount: true },
        })
        const importedPaidAmount = confirmedForRecord._sum.amount ?? 0
        const manualPaidAmount = record.manualPaidAmount ?? Math.max(
          0,
          (record.paidAmount ?? 0) - importedPaidAmount - previousMatchAmount,
        )
        if (manualPaidAmount + importedPaidAmount + input.amount > record.amount) {
          throw new ConflictException('Confirmed match exceeds the outstanding contribution amount')
        }
        const paidAmount = manualPaidAmount + importedPaidAmount + input.amount
        const match = await tx.contributionMatch.upsert({
          where: { transactionId_recordId: { transactionId: transaction.id, recordId: record.id } },
          create: {
            clubId,
            transactionId: transaction.id,
            recordId: record.id,
            amount: input.amount,
            confidence: 100,
            status: 'CONFIRMED',
            confirmedById: actorId,
            confirmedAt: new Date(),
          },
          update: {
            amount: input.amount,
            status: 'CONFIRMED',
            confirmedById: actorId,
            confirmedAt: new Date(),
          },
        })
        await tx.contributionRecord.update({
          where: { id: record.id },
          data: {
            paidAmount,
            paidAt: paidAmount >= record.amount ? new Date() : null,
            status: paidAmount >= record.amount ? 'PAID' : 'PARTIAL',
            note: `Matched from bank import ${transaction.id}`,
          },
        })
        await tx.auditLog.create({
          data: {
            clubId,
            type: 'contribution.bank_match_confirmed',
            actorType: 'user',
            actorId,
            actorLabel: null,
            summary: `Confirmed a bank transaction against contribution ${record.id}.`,
            metadata: {
              transactionId: transaction.id,
              recordId: record.id,
              previousAmount: previousMatchAmount,
              confirmedAmount: input.amount,
              resultingPaidAmount: paidAmount,
            },
          },
        })
        return match
      }),
    )
  }

  private async assertAdmin(clubId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { role: true },
    })
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new ForbiddenException(
        'Only club owners and administrators can reconcile contributions',
      )
    }
  }
}

export function parseCsv(value: string): ParsedTransaction[] {
  const rows = value
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseCsvRow)
  if (rows.length < 2) return []
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    throw new BadRequestException(`Bank imports are limited to ${MAX_IMPORT_ROWS} rows`)
  }
  const headers = rows[0].map((item) => item.trim().toLowerCase())
  return rows.slice(1).flatMap((columns, index) => {
    const get = (...names: string[]) => {
      const position = headers.findIndex((header) => names.includes(header))
      return position >= 0 ? (columns[position]?.trim() ?? '') : ''
    }
    const rawAmount = get('amount', 'betrag', 'umsatz')
    const amount = parseBankAmount(rawAmount)
    const bookedAt = parseBankDate(get('date', 'booking date', 'buchungstag', 'valuta'))
    if (!Number.isFinite(amount) || Number.isNaN(bookedAt.getTime())) {
      throw new BadRequestException(`Invalid transaction at CSV row ${index + 2}`)
    }
    const direction = get('credit/debit', 'direction', 'soll/haben').toUpperCase()
    if (amount < 0 || ['DBIT', 'DEBIT', 'SOLL', 'OUT'].includes(direction)) return []
    if (amount === 0) throw new BadRequestException(`Invalid transaction at CSV row ${index + 2}`)
    const iban = get('iban', 'payer iban', 'auftraggeber iban')
    return [
      {
        bookedAt,
        amount,
        currency: (get('currency', 'währung', 'waehrung') || 'eur').toLowerCase(),
        payerName: limitedText(get('payer', 'name', 'auftraggeber')),
        ibanLast4: iban ? iban.replace(/\s/g, '').slice(-4) : null,
        reference: limitedText(get('reference', 'purpose', 'verwendungszweck')),
        externalId: limitedText(get('id', 'transaction id', 'end-to-end-id')),
      },
    ]
  })
}

function parseBankAmount(raw: string) {
  const compact = raw.trim().replace(/\s/g, '').replace(/[^0-9,.-]/g, '')
  if (!compact || !/^-?[0-9.,]+$/.test(compact)) return Number.NaN
  const comma = compact.lastIndexOf(',')
  const dot = compact.lastIndexOf('.')
  const separator = Math.max(comma, dot)
  let normalized = compact
  if (separator >= 0) {
    const fractionalDigits = compact.length - separator - 1
    if (fractionalDigits === 1 || fractionalDigits === 2) {
      const integerPart = compact.slice(0, separator)
      const groupingMarks = integerPart.match(/[.,]/g) ?? []
      if (
        groupingMarks.length > 0 &&
        (!/^-?\d{1,3}([.,]\d{3})+$/.test(integerPart) ||
          (integerPart.includes('.') && integerPart.includes(',')))
      ) {
        return Number.NaN
      }
      const integer = integerPart.replace(/[.,]/g, '')
      normalized = `${integer}.${compact.slice(separator + 1)}`
    } else if (
      fractionalDigits === 3 &&
      !compact.slice(0, separator).includes(compact[separator] === ',' ? '.' : ',') &&
      /^-?\d{1,3}([.,]\d{3})+$/.test(compact)
    ) {
      normalized = compact.replace(/[.,]/g, '')
    } else {
      return Number.NaN
    }
  }
  return Math.round(Number(normalized) * 100)
}

function parseCsvRow(line: string) {
  const delimiter = line.includes(';') ? ';' : ','
  const fields: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && line[index + 1] === '"' && quoted) {
      current += '"'
      index += 1
    } else if (char === '"') quoted = !quoted
    else if (char === delimiter && !quoted) {
      fields.push(current)
      current = ''
    } else current += char
  }
  fields.push(current)
  return fields
}

export function parseCamt053(xml: string): ParsedTransaction[] {
  if (!/<(?:\w+:)?Document[\s>]/.test(xml))
    throw new BadRequestException('Invalid CAMT.053 document')
  const entries = xml.match(/<(?:\w+:)?Ntry\b[\s\S]*?<\/(?:\w+:)?Ntry>/g) ?? []
  if (entries.length > MAX_IMPORT_ROWS) {
    throw new BadRequestException(`Bank imports are limited to ${MAX_IMPORT_ROWS} rows`)
  }
  return entries.flatMap((entry, index) => {
    const direction = xmlValue(entry, 'CdtDbtInd')?.toUpperCase()
    if (direction === 'DBIT') return []
    if (direction !== 'CRDT') {
      throw new BadRequestException(`Unsupported CAMT transaction direction at entry ${index + 1}`)
    }
    const amountText = xmlValue(entry, 'Amt')
    const amount = Math.round(Number(amountText?.replace(',', '.')) * 100)
    const dateText = xmlValue(entry, 'BookgDt') || xmlValue(entry, 'Dt')
    const bookedAt = parseBankDate(dateText ?? '')
    if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(bookedAt.getTime())) {
      throw new BadRequestException(`Invalid CAMT transaction ${index + 1}`)
    }
    const iban = xmlValue(entry, 'IBAN')
    return [
      {
        bookedAt,
        amount,
        currency: (entry.match(/Ccy="([A-Z]{3})"/)?.[1] ?? 'EUR').toLowerCase(),
        payerName: limitedText(xmlValue(entry, 'Nm')),
        ibanLast4: iban ? iban.slice(-4) : null,
        reference: limitedText(xmlValue(entry, 'Ustrd') || xmlValue(entry, 'AddtlNtryInf')),
        externalId: limitedText(xmlValue(entry, 'EndToEndId') || xmlValue(entry, 'AcctSvcrRef')),
      },
    ]
  })
}

function parseBankDate(value: string) {
  const german = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (german) {
    const [, day, month, year] = german
    return strictUtcDate(Number(year), Number(month), Number(day))
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  if (iso) {
    const [, year, month, day] = iso
    return strictUtcDate(Number(year), Number(month), Number(day))
  }
  return new Date(Number.NaN)
}

function strictUtcDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day))
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    return new Date(Number.NaN)
  }
  return value
}

function limitedText(value: string | null) {
  if (!value) return null
  if (value.length > MAX_BANK_TEXT_LENGTH) {
    throw new BadRequestException(
      `Bank transaction text exceeds ${MAX_BANK_TEXT_LENGTH} characters`,
    )
  }
  return value
}

function xmlValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>(?:<(?:\\w+:)?Dt>)?([^<]+)`))
  return match?.[1]?.trim() || null
}
