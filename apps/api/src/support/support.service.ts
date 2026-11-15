import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import type { CreateSupportTicketInput, SupportReplyInput, SupportStatus } from '@anstoss/shared'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import type { PlatformAdminActor } from '../admin/platform-admin.types'

const summarySelect = {
  id: true,
  subject: true,
  category: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const
const detailSelect = {
  ...summarySelect,
  messages: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, body: true, fromSupport: true, createdAt: true },
  },
} satisfies Prisma.SupportTicketSelect

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(requesterId: string, offset: number) {
    return this.prisma.supportTicket.findMany({
      where: { requesterId },
      select: summarySelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 50,
      skip: offset,
    })
  }

  async detail(id: string, requesterId?: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, ...(requesterId ? { requesterId } : {}) },
      select: detailSelect,
    })
    if (!ticket) throw new NotFoundException('Support request not found')
    return ticket
  }

  listForAdmin(status: SupportStatus | undefined, offset: number) {
    return this.prisma.supportTicket.findMany({
      where: { status },
      select: {
        ...summarySelect,
        requester: { select: { id: true, name: true, email: true } },
        appVersion: true,
        build: true,
        platform: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 50,
      skip: offset,
    })
  }

  async create(requesterId: string, input: CreateSupportTicketInput) {
    return this.prisma.$transaction(async (tx) => {
      // Coordinate with account erasure and concurrent submissions. No tenant
      // membership is needed to report a signup or free-agent problem.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${requesterId}))`
      const user = await tx.user.findFirst({
        where: { id: requesterId, deletedAt: null },
        select: { id: true },
      })
      if (!user) throw new UnauthorizedException('Account not available')
      const existing = await tx.supportTicket.findUnique({
        where: { requesterId_requestId: { requesterId, requestId: input.requestId } },
        select: detailSelect,
      })
      if (existing) return existing
      const count = await tx.supportTicket.count({
        where: {
          requesterId,
          createdAt: { gte: new Date(Date.now() - 86400000) },
        },
      })
      if (count >= 10)
        throw new ConflictException(
          'Support request limit reached. Please reply to an existing request.',
        )
      const { body, ...fields } = input
      return tx.supportTicket.create({
        data: {
          ...fields,
          requesterId,
          messages: { create: { requestId: input.requestId, body, fromSupport: false } },
        },
        select: detailSelect,
      })
    })
  }

  async reply(
    id: string,
    input: SupportReplyInput,
    requesterId: string | null,
    actor?: PlatformAdminActor,
  ) {
    if (!requesterId && !actor) throw new UnauthorizedException()
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${id} FOR UPDATE`
      const ticket = await tx.supportTicket.findFirst({
        where: { id, ...(requesterId ? { requesterId } : {}) },
      })
      if (!ticket) throw new NotFoundException('Support request not found')
      const existing = await tx.supportMessage.findUnique({
        where: { ticketId_requestId: { ticketId: id, requestId: input.requestId } },
      })
      if (existing && existing.fromSupport !== Boolean(actor))
        throw new ConflictException('Request ID already used')
      if (!existing) {
        const count = await tx.supportMessage.count({ where: { ticketId: id } })
        if (count >= 200)
          throw new ConflictException('Thread limit reached. Please start a new support request.')
        await tx.supportMessage.create({
          data: { ticketId: id, ...input, fromSupport: Boolean(actor) },
        })
        await tx.supportTicket.update({
          where: { id },
          data: { status: actor ? 'WAITING' : 'OPEN', updatedAt: new Date() },
        })
        if (actor) await this.audit(tx, id, actor, 'support.replied')
      }
      return tx.supportTicket.findUniqueOrThrow({ where: { id }, select: detailSelect })
    })
  }

  async setStatus(id: string, status: SupportStatus, actor: PlatformAdminActor) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${id} FOR UPDATE`
      const ticket = await tx.supportTicket.findUnique({ where: { id } })
      if (!ticket) throw new NotFoundException('Support request not found')
      if (ticket.status !== status) {
        await tx.supportTicket.update({ where: { id }, data: { status } })
        await this.audit(tx, id, actor, 'support.status_changed')
      }
      return tx.supportTicket.findUniqueOrThrow({ where: { id }, select: detailSelect })
    })
  }

  private audit(tx: Prisma.TransactionClient, id: string, actor: PlatformAdminActor, type: string) {
    return tx.auditLog.create({
      data: {
        clubId: null,
        type,
        actorType: 'PLATFORM_ADMIN',
        actorId: actor.id,
        actorLabel: actor.name,
        summary: type,
        // Never copy private message text into long-lived audit records.
        metadata: { ticketId: id, authMethod: actor.authMethod },
      },
    })
  }
}
