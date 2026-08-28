import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { PlatformAdminActor } from './platform-admin.types'

const SEMVER_RE = /^\d+\.\d+\.\d+$/

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
  private releaseSettingsRevision = 0
  // The default fallbacks mirror what apps/api/.env.example documents.
  // Used when no DB row exists yet, so the mobile gate doesn't break in
  // a fresh deploy.
  private static readonly DEFAULTS: Record<string, string> = {
    min_app_version: process.env.MIN_APP_VERSION ?? '1.0.0',
    recommended_app_version: process.env.RECOMMENDED_APP_VERSION ?? '1.0.0',
    force_update_message:
      'A newer version of Anstoss is required. Please update to continue.',
    announcement_banner: '',
    kill_switch_claims: 'false',
    kill_switch_invites: 'false',
    kill_switch_official_pages: 'false',
    kill_switch_contributions: 'false',
    kill_switch_billing: 'false',
    kill_switch_chat: 'false',
  }

  static readonly KNOWN_KEYS = Object.keys(PlatformSettingsService.DEFAULTS)

  constructor(private readonly prisma: PrismaService) {}

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

  async getRuntimeReleaseSettings() {
    const keys = [
      'min_app_version',
      'recommended_app_version',
      'force_update_message',
      'announcement_banner',
    ]
    const rows = await this.prisma.platformSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    })
    const values = new Map(rows.map((row: { key: string; value: string }) => [row.key, row.value]))
    return {
      minVersion: values.get('min_app_version') ?? PlatformSettingsService.DEFAULTS.min_app_version,
      recommendedVersion:
        values.get('recommended_app_version') ??
        PlatformSettingsService.DEFAULTS.recommended_app_version,
      forceUpdateMessage:
        values.get('force_update_message') ??
        PlatformSettingsService.DEFAULTS.force_update_message,
      announcementBanner:
        values.get('announcement_banner') ??
        PlatformSettingsService.DEFAULTS.announcement_banner,
    }
  }

  getRuntimeReleaseSettingsRevision() {
    return this.releaseSettingsRevision
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

    const setting = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('platform-release-settings'))`
      const [before, minRow, recommendedRow] = await Promise.all([
        tx.platformSetting.findUnique({ where: { key } }),
        tx.platformSetting.findUnique({ where: { key: 'min_app_version' } }),
        tx.platformSetting.findUnique({ where: { key: 'recommended_app_version' } }),
      ])

      if (key === 'min_app_version' || key === 'recommended_app_version') {
        const minVersion =
          key === 'min_app_version'
            ? value
            : minRow?.value ?? PlatformSettingsService.DEFAULTS.min_app_version
        const recommendedVersion =
          key === 'recommended_app_version'
            ? value
            : recommendedRow?.value ??
              PlatformSettingsService.DEFAULTS.recommended_app_version
        if (compareReleaseVersions(recommendedVersion, minVersion) < 0) {
          throw new BadRequestException(
            'Recommended app version must be equal to or newer than the minimum version',
          )
        }
      }

      const setting = await tx.platformSetting.upsert({
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

      await tx.auditLog.create({
        data: {
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
        },
      })

      return setting
    })
    this.releaseSettingsRevision += 1
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

  if (key.startsWith('kill_switch_')) {
    if (value !== 'true' && value !== 'false') {
      throw new BadRequestException('Kill switches must be true or false')
    }
    return
  }

  if (key === 'force_update_message' && value.length === 0) {
    throw new BadRequestException('Force update message cannot be empty')
  }

  const maxLength = key === 'force_update_message' ? 240 : 280
  if (value.length > maxLength) {
    throw new BadRequestException(
      `Setting value must be ${maxLength} characters or fewer`,
    )
  }
}

function compareReleaseVersions(a: string, b: string) {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = (aParts[index] ?? 0) - (bParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}
