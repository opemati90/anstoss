import { Injectable, NotFoundException } from '@nestjs/common'
import {
  COMPLIANCE_REMINDER_COOLDOWN_HOURS,
  FUEHRUNGSZEUGNIS_VALIDITY_YEARS,
  complianceStatus as sharedComplianceStatus,
  type ComplianceItem,
  type ComplianceKind,
  type RemindComplianceInput,
  type RemindComplianceResult,
  type UpdateComplianceRecordInput,
  type UpsertComplianceRecordInput,
} from '@anstoss/shared'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { PushService } from '../push/push.service'
import { resolveLocale, type Locale } from '../i18n/translations'

const HOUR_MS = 60 * 60 * 1000

type LabelLocale = Locale

/** Localized document names used inside the reminder push body. */
const DOCUMENT_LABELS: Record<ComplianceKind, Record<LabelLocale, string>> = {
  FUEHRUNGSZEUGNIS: {
    de: 'erweitertes Führungszeugnis',
    en: 'enhanced criminal record certificate',
    fr: 'extrait de casier judiciaire',
    it: 'certificato del casellario giudiziale',
    pt: 'certificado de registo criminal',
    tr: 'genişletilmiş adli sicil kaydı',
  },
  SPIELERPASS: {
    de: 'Spielerpass',
    en: 'player pass',
    fr: 'licence de joueur',
    it: 'cartellino',
    pt: 'cartão de jogador',
    tr: 'oyuncu lisansı',
  },
  MEDICAL_CHECK: {
    de: 'ärztliches Attest',
    en: 'medical certificate',
    fr: 'certificat médical',
    it: 'certificato medico',
    pt: 'atestado médico',
    tr: 'sağlık raporu',
  },
  VACCINATION_TETANUS: {
    de: 'Tetanus-Impfnachweis',
    en: 'tetanus vaccination record',
    fr: 'certificat de vaccination antitétanique',
    it: 'certificato di vaccinazione antitetanica',
    pt: 'comprovativo de vacina do tétano',
    tr: 'tetanoz aşı belgesi',
  },
  FIRST_AID_CERT: {
    de: 'Erste-Hilfe-Nachweis',
    en: 'first-aid certificate',
    fr: 'certificat de secourisme',
    it: 'attestato di primo soccorso',
    pt: 'certificado de primeiros socorros',
    tr: 'ilk yardım sertifikası',
  },
  SEPA_MANDATE: {
    de: 'SEPA-Lastschriftmandat',
    en: 'SEPA direct debit mandate',
    fr: 'mandat de prélèvement SEPA',
    it: 'mandato SEPA',
    pt: 'autorização de débito SEPA',
    tr: 'SEPA otomatik ödeme talimatı',
  },
  DATA_CONSENT: {
    de: 'Einwilligung zum Datenschutz',
    en: 'data protection consent',
    fr: 'consentement à la protection des données',
    it: 'consenso al trattamento dei dati',
    pt: 'consentimento de proteção de dados',
    tr: 'veri koruma onayı',
  },
}

/** Shared with the app so the "läuft ab" window cannot drift. */
export const complianceStatus = sharedComplianceStatus

export function defaultExpiry(kind: ComplianceKind, issuedAt: Date): Date | null {
  if (kind !== 'FUEHRUNGSZEUGNIS') return null
  const next = new Date(issuedAt)
  next.setFullYear(next.getFullYear() + FUEHRUNGSZEUGNIS_VALIDITY_YEARS)
  return next
}

type RecordRow = {
  id: string
  memberUserId: string
  kind: string
  issuedAt: Date | null
  expiresAt: Date | null
  documentUrl: string | null
  note: string | null
  member?: { name: string } | null
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly push: PushService,
  ) {}

  async list(clubId: string, kind?: ComplianceKind): Promise<ComplianceItem[]> {
    const [records, memberships] = await Promise.all([
      this.prisma.complianceRecord.findMany({
        where: { clubId, ...(kind ? { kind } : {}) },
        include: { member: { select: { name: true } } },
        orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.membership.findMany({
        where: { clubId },
        select: { userId: true, role: true },
      }),
    ])
    const roleByUser = new Map(memberships.map((m: any) => [m.userId, m.role]))
    return (records as RecordRow[])
      // Leaving/removal deletes a member's records in the same transaction and
      // the retention sweep removes stragglers; this filter is defense in
      // depth so a record without a membership is never shown.
      .filter((record) => roleByUser.has(record.memberUserId))
      .map((record) => this.toItem(record, roleByUser.get(record.memberUserId)))
  }

  async upsert(
    clubId: string,
    actorUserId: string,
    input: UpsertComplianceRecordInput,
  ): Promise<ComplianceItem> {
    const membership = await this.assertMember(clubId, input.memberUserId)
    const issuedAt = new Date(input.issuedAt)
    const expiresAt =
      input.expiresAt === undefined
        ? defaultExpiry(input.kind, issuedAt)
        : input.expiresAt === null
          ? null
          : new Date(input.expiresAt)
    const note = input.note ?? null

    const record = await this.prisma.complianceRecord.upsert({
      where: {
        clubId_memberUserId_kind: {
          clubId,
          memberUserId: input.memberUserId,
          kind: input.kind,
        },
      },
      create: {
        clubId,
        memberUserId: input.memberUserId,
        kind: input.kind,
        issuedAt,
        expiresAt,
        note,
        createdById: actorUserId,
      },
      update: { issuedAt, expiresAt, note },
      include: { member: { select: { name: true } } },
    })

    await this.audit.log({
      clubId,
      type: 'compliance.recorded',
      actorType: 'user',
      actorId: actorUserId,
      actorLabel: null,
      summary: `Recorded ${input.kind} for a member.`,
      metadata: { memberUserId: input.memberUserId, kind: input.kind },
    })

    return this.toItem(record as RecordRow, membership.role)
  }

  async update(
    clubId: string,
    recordId: string,
    actorUserId: string,
    input: UpdateComplianceRecordInput,
  ): Promise<ComplianceItem> {
    const existing = await this.prisma.complianceRecord.findFirst({
      where: { id: recordId, clubId },
      select: { id: true, memberUserId: true, kind: true },
    })
    if (!existing) throw new NotFoundException('Compliance record not found')
    const membership = await this.assertMember(clubId, existing.memberUserId)

    const data: Record<string, unknown> = {}
    if (input.issuedAt !== undefined) data.issuedAt = new Date(input.issuedAt)
    if (input.expiresAt !== undefined) {
      data.expiresAt = input.expiresAt === null ? null : new Date(input.expiresAt)
    }
    if (input.note !== undefined) data.note = input.note

    const record = await this.prisma.complianceRecord.update({
      where: { id: existing.id },
      data,
      include: { member: { select: { name: true } } },
    })

    await this.audit.log({
      clubId,
      type: 'compliance.recorded',
      actorType: 'user',
      actorId: actorUserId,
      actorLabel: null,
      summary: `Updated ${existing.kind} for a member.`,
      metadata: { memberUserId: existing.memberUserId, kind: existing.kind, recordId },
    })

    return this.toItem(record as RecordRow, membership.role)
  }

  /**
   * Push a reminder to present a document. Rate-limited to one per club +
   * member + kind every 24 hours (persisted in ComplianceReminder, claimed
   * atomically under an advisory lock) so an admin can't spam a volunteer.
   */
  async remind(
    clubId: string,
    actorUserId: string,
    input: RemindComplianceInput,
    now: Date = new Date(),
  ): Promise<RemindComplianceResult> {
    await this.assertMember(clubId, input.memberUserId)

    const cooldownMs = COMPLIANCE_REMINDER_COOLDOWN_HOURS * HOUR_MS
    const claim = await this.prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`compliance-remind:${clubId}:${input.memberUserId}:${input.kind}`}))`
      const key = {
        clubId_memberUserId_kind: {
          clubId,
          memberUserId: input.memberUserId,
          kind: input.kind,
        },
      }
      const previous = await tx.complianceReminder.findUnique({
        where: key,
        select: { sentAt: true },
      })
      if (previous && now.getTime() - previous.sentAt.getTime() < cooldownMs) {
        return { claimed: false as const, retryAfter: new Date(previous.sentAt.getTime() + cooldownMs) }
      }
      await tx.complianceReminder.upsert({
        where: key,
        create: { clubId, memberUserId: input.memberUserId, kind: input.kind, sentAt: now },
        update: { sentAt: now },
      })
      return { claimed: true as const, previousSentAt: (previous?.sentAt as Date | undefined) ?? null }
    })

    if (!claim.claimed) {
      return { sent: false, reason: 'cooldown', retryAfter: claim.retryAfter.toISOString() }
    }

    const [club, member] = await Promise.all([
      this.prisma.club.findUnique({ where: { id: clubId }, select: { name: true } }),
      this.prisma.user.findUnique({
        where: { id: input.memberUserId },
        select: { preferredLanguage: true },
      }),
    ])
    const locale = resolveLocale(member?.preferredLanguage)
    const labels = DOCUMENT_LABELS[input.kind]
    let sent = true
    try {
      await this.push.sendToUserLocalized(
        input.memberUserId,
        'COMPLIANCE_REMINDER',
        {
          clubName: club?.name ?? 'Anstoss',
          document: labels[locale] ?? labels.de,
        },
        { type: 'compliance_reminder', clubId, kind: input.kind },
        { clubId },
      )
    } catch {
      sent = false
      // Delivery failed: release the claim so the admin can retry right away.
      await this.prisma.complianceReminder
        .updateMany({
          where: { clubId, memberUserId: input.memberUserId, kind: input.kind, sentAt: now },
          data: { sentAt: claim.previousSentAt ?? new Date(0) },
        })
        .catch(() => undefined)
    }

    await this.audit.log({
      clubId,
      type: 'compliance.reminder_sent',
      actorType: 'user',
      actorId: actorUserId,
      actorLabel: null,
      summary: `Asked a member to present ${input.kind}.`,
      metadata: { memberUserId: input.memberUserId, kind: input.kind, sent },
    })

    return sent ? { sent: true } : { sent: false, reason: 'delivery_failed' }
  }

  private async assertMember(clubId: string, memberUserId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_clubId: { userId: memberUserId, clubId } },
      select: { role: true },
    })
    if (!membership) throw new NotFoundException('Member not found in this club')
    return membership
  }

  private toItem(record: RecordRow, role: unknown): ComplianceItem {
    return {
      id: record.id,
      memberUserId: record.memberUserId,
      memberName: record.member?.name ?? '',
      role: (role as ComplianceItem['role']) ?? 'PLAYER',
      kind: record.kind as ComplianceKind,
      expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
      issuedAt: record.issuedAt ? record.issuedAt.toISOString() : null,
      documentUrl: record.documentUrl,
      note: record.note,
    }
  }
}
