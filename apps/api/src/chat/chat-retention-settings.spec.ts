import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ChatService } from './chat.service'

function makeService(role: 'OWNER' | 'ADMIN' | 'COACH' | null) {
  const prisma: any = {
    membership: {
      findUnique: jest.fn().mockResolvedValue(
        role
          ? {
              id: 'membership-1',
              userId: 'user-1',
              clubId: 'club-1',
              role,
              operationalRoles: [],
            }
          : null,
      ),
    },
    clubChatRetentionSettings: {
      upsert: jest.fn((args) =>
        Promise.resolve({
          clubId: 'club-1',
          enabled: args.update?.enabled ?? args.create?.enabled ?? false,
          messageRetentionDays: args.update?.messageRetentionDays ?? args.create?.messageRetentionDays ?? 365,
          attachmentRetentionDays:
            args.update?.attachmentRetentionDays ?? args.create?.attachmentRetentionDays ?? 90,
        }),
      ),
    },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  }
  prisma.$transaction = jest.fn((operation: (tx: typeof prisma) => unknown) => operation(prisma))

  const service = new ChatService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )

  return { service, prisma }
}

describe('ChatService retention settings', () => {
  it('creates disabled-by-default settings and audits explicit admin changes', async () => {
    const { service, prisma } = makeService('OWNER')

    await expect(service.getRetentionSettings('user-1', 'club-1')).resolves.toEqual({
      clubId: 'club-1',
      enabled: false,
      messageRetentionDays: 365,
      attachmentRetentionDays: 90,
    })

    await service.updateRetentionSettings('user-1', 'club-1', { enabled: true })

    expect(prisma.clubChatRetentionSettings.upsert).toHaveBeenLastCalledWith({
      where: { clubId: 'club-1' },
      create: {
        clubId: 'club-1',
        enabled: true,
        messageRetentionDays: 365,
        attachmentRetentionDays: 90,
      },
      update: { enabled: true },
    })
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clubId: 'club-1',
        type: 'admin.setting.updated',
        actorType: 'user',
        actorId: 'user-1',
        summary: 'Updated chat retention settings',
        metadata: expect.objectContaining({ enabled: true }),
      }),
    })
    expect(prisma.$transaction).toHaveBeenCalled()
  })

  it('rolls retention setting changes back when the required audit write fails', async () => {
    const { service, prisma } = makeService('OWNER')
    prisma.auditLog.create.mockRejectedValueOnce(new Error('audit down'))

    await expect(
      service.updateRetentionSettings('user-1', 'club-1', {
        enabled: true,
        messageRetentionDays: 30,
      }),
    ).rejects.toThrow('audit down')

    expect(prisma.$transaction).toHaveBeenCalled()
    expect(prisma.clubChatRetentionSettings.upsert).toHaveBeenCalledWith({
      where: { clubId: 'club-1' },
      create: {
        clubId: 'club-1',
        enabled: true,
        messageRetentionDays: 30,
        attachmentRetentionDays: 90,
      },
      update: { enabled: true, messageRetentionDays: 30 },
    })
  })

  it('rejects coaches and non-members', async () => {
    await expect(makeService('COACH').service.getRetentionSettings('user-1', 'club-1')).rejects.toThrow(
      ForbiddenException,
    )
    await expect(makeService(null).service.getRetentionSettings('user-1', 'club-1')).rejects.toThrow(
      NotFoundException,
    )
  })
})
