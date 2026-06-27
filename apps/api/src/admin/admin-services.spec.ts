import { BadRequestException } from '@nestjs/common'
import { AdminService } from './admin.service'
import { BroadcastsService } from './broadcasts.service'
import { FeatureFlagsService } from './feature-flags.service'
import { PlatformSettingsService } from './platform-settings.service'
import type { PlatformAdminActor } from './platform-admin.types'

const ACTOR: PlatformAdminActor = {
  id: 'admin_1',
  email: 'admin@anstoss.app',
  name: 'Admin',
  authMethod: 'session',
}

describe('admin mutation services', () => {
  it('records support notes but rejects old no-op support actions', async () => {
    const prisma = {
      supportAction: {
        create: jest.fn(async ({ data }) => ({
          id: 'support_1',
          ...data,
          createdAt: new Date('2026-06-27T00:00:00.000Z'),
        })),
      },
      auditLog: { create: jest.fn(async () => ({})) },
    }
    const service = new AdminService(prisma as any)

    await expect(
      service.performSupportAction(ACTOR, {
        action: 'SUPPORT_NOTE',
        clubId: 'club_1',
        note: 'Owner cannot find invoices',
      }),
    ).resolves.toMatchObject({
      id: 'support_1',
      action: 'SUPPORT_NOTE',
      clubId: 'club_1',
    })
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'support.action',
          summary: expect.stringContaining('recorded a support note'),
        }),
      }),
    )

    await expect(
      service.performSupportAction(ACTOR, {
        action: 'SUSPEND_CLUB',
        clubId: 'club_1',
      } as any),
    ).rejects.toThrow(BadRequestException)
  })

  it('rejects unknown platform settings and audits valid updates', async () => {
    const prisma = {
      platformSetting: {
        findUnique: jest.fn(async () => ({ value: '1.0.0' })),
        upsert: jest.fn(async ({ create }) => ({
          ...create,
          updatedAt: new Date('2026-06-27T00:00:00.000Z'),
        })),
      },
    }
    const auditService = { log: jest.fn(async () => ({})) }
    const service = new PlatformSettingsService(prisma as any, auditService as any)

    await expect(
      service.set({ key: 'unknown_key', value: 'x', actor: ACTOR }),
    ).rejects.toThrow(BadRequestException)
    await expect(
      service.set({ key: 'min_app_version', value: 'not-a-version', actor: ACTOR }),
    ).rejects.toThrow(BadRequestException)

    await expect(
      service.set({ key: 'min_app_version', value: '1.2.3', actor: ACTOR }),
    ).resolves.toMatchObject({ key: 'min_app_version', value: '1.2.3' })
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'admin.setting.updated',
        actorId: 'admin_1',
      }),
    )
  })

  it('validates feature flag slugs and audits overrides', async () => {
    const prisma = {
      featureFlagOverride: {
        findUnique: jest.fn(async () => ({ enabled: false })),
        upsert: jest.fn(async ({ create }) => ({ id: 'flag_1', ...create })),
      },
    }
    const auditService = { log: jest.fn(async () => ({})) }
    const service = new FeatureFlagsService(prisma as any, auditService as any)

    await expect(
      service.upsert({
        clubId: 'club_1',
        featureSlug: 'made_up_feature',
        enabled: true,
        actor: ACTOR,
      }),
    ).rejects.toThrow(BadRequestException)

    await expect(
      service.upsert({
        clubId: 'club_1',
        featureSlug: 'sponsor_logos',
        enabled: true,
        actor: ACTOR,
      }),
    ).resolves.toMatchObject({
      id: 'flag_1',
      featureSlug: 'sponsor_logos',
      enabled: true,
    })
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        clubId: 'club_1',
        type: 'admin.feature_flag.updated',
        metadata: expect.objectContaining({
          previousEnabled: false,
        }),
      }),
    )
  })

  it('keeps broadcast sending disabled unless explicitly enabled', async () => {
    const original = process.env.ENABLE_ADMIN_BROADCASTS
    delete process.env.ENABLE_ADMIN_BROADCASTS
    const prisma = {
      broadcast: { create: jest.fn() },
    }
    const pushService = { sendToTokens: jest.fn() }
    const auditService = { log: jest.fn() }
    const service = new BroadcastsService(
      prisma as any,
      pushService as any,
      auditService as any,
    )

    await expect(
      service.createAndSend({
        title: 'Test',
        body: 'Hello',
        segment: 'ALL',
        actor: { ...ACTOR, id: 'admin_1' },
      }),
    ).rejects.toThrow('Admin broadcasts are disabled for launch')
    expect(prisma.broadcast.create).not.toHaveBeenCalled()
    process.env.ENABLE_ADMIN_BROADCASTS = original
  })
})
