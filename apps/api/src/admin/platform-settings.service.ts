import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { PlatformAdminActor } from './platform-admin.types'

const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

/**
 * Runtime-tunable platform settings. Reads fall back to env vars so the
 * mobile app still works before any settings row is created. Writes
 * upsert into PlatformSetting. Common keys:
 *
 *   - min_app_version           (e.g. "1.0.0") — hard block below
 *   - recommended_app_version   (e.g. "1.2.0") — soft nag below
 *   - force_update_message      (banner copy users see if blocked)
 *   - announcement_banner       (any string; empty = no banner)
 *
 * Each setting is plain text. Callers parse to richer types as needed.
 */
@Injectable()
export class PlatformSettingsService {
  // The default fallbacks mirror what apps/api/.env.example documents.
  // Used when no DB row exists yet, so the mobile gate doesn't break in
  // a fresh deploy.
  private static readonly DEFAULTS: Record<string, string> = {
    min_app_version: process.env.MIN_APP_VERSION ?? '1.0.0',
    recommended_app_version: process.env.RECOMMENDED_APP_VERSION ?? '1.0.0',
    force_update_message:
      'A newer version of Anstoss is required. Please update to continue.',
    announcement_banner: '',
  }

  static readonly KNOWN_KEYS = Object.keys(PlatformSettingsService.DEFAULTS)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listAll() {
    const rows = await this.prisma.platformSetting.findMany({
      orderBy: { key: 'asc' },
    })

    // Surface every known key, even if there's no DB row yet — UI then
    // shows the default value with an "unset" hint.
    const byKey = new Map(rows.map((r: { key: string }) => [r.key, r]))
    return PlatformSettingsService.KNOWN_KEYS.map((key) => {
      const row = byKey.get(key) as
        | { value: string; description: string | null; updatedAt: Date }
        | undefined
      return {
        key,
        value: row?.value ?? PlatformSettingsService.DEFAULTS[key],
        defaultValue: PlatformSettingsService.DEFAULTS[key],
        description: row?.description ?? null,
        updatedAt: row?.updatedAt ?? null,
        isOverridden: !!row,
      }
    })
  }

  async get(key: string): Promise<string> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key } })
    return row?.value ?? PlatformSettingsService.DEFAULTS[key] ?? ''
  }

  async set(input: {
    key: string
    value: string
    description?: string | null
    actor: PlatformAdminActor
  }) {
    const key = input.key.trim()
    const value = input.value.trim()
    validateSetting(key, value)

    const before = await this.prisma.platformSetting.findUnique({
      where: { key },
    })

    const setting = await this.prisma.platformSetting.upsert({
      where: { key },
      update: {
        value,
        description: input.description ?? null,
        updatedById: input.actor.id,
      },
      create: {
        key,
        value,
        description: input.description ?? null,
        updatedById: input.actor.id,
      },
    })

    await this.auditService.log({
      clubId: null,
      type: 'admin.setting.updated',
      actorType: 'admin',
      actorId: input.actor.id,
      actorLabel: input.actor.email ?? input.actor.name,
      summary: `Updated platform setting ${key}.`,
      metadata: {
        key,
        previousValue: before?.value ?? null,
        value,
      },
    })

    return setting
  }
}

function validateSetting(key: string, value: string) {
  if (!PlatformSettingsService.KNOWN_KEYS.includes(key)) {
    throw new BadRequestException('Unknown platform setting')
  }

  if (key === 'min_app_version' || key === 'recommended_app_version') {
    if (!SEMVER_RE.test(value)) {
      throw new BadRequestException('Version settings must use semver')
    }
    return
  }

  const maxLength = key === 'force_update_message' ? 240 : 280
  if (value.length > maxLength) {
    throw new BadRequestException(
      `Setting value must be ${maxLength} characters or fewer`,
    )
  }
}
