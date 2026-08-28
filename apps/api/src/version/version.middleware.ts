import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'
import { PlatformSettingsService } from '../admin/platform-settings.service'

/**
 * Reads X-App-Version header and enforces minimum client version.
 *
 * - If version < MIN_APP_VERSION env → 426 Upgrade Required
 * - If version < RECOMMENDED_APP_VERSION env → adds X-Update-Available header
 * - If header missing → allow (web clients, health checks)
 *
 * Version format: semver (e.g. "1.0.0")
 * Env vars: MIN_APP_VERSION, RECOMMENDED_APP_VERSION
 */
@Injectable()
export class VersionMiddleware implements NestMiddleware {
  private cached:
    | {
        expiresAt: number
        revision: number
        value: Awaited<ReturnType<PlatformSettingsService['getRuntimeReleaseSettings']>>
      }
    | undefined

  constructor(private readonly settings: PlatformSettingsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const clientVersion = req.headers['x-app-version'] as string | undefined
    if (!clientVersion || clientVersion === '0.0.0') {
      // No header → allow (web clients, monitoring, health checks)
      // 0.0.0 → dev build (expo-application returns null), skip gate
      return next()
    }

    const release = await this.getReleaseSettings()
    const minVersion = release.minVersion
    if (minVersion && this.compareSemver(clientVersion, minVersion) < 0) {
      res.status(426).json({
        error: {
          code: 'UPGRADE_REQUIRED',
          message: release.forceUpdateMessage,
          minVersion,
        },
      })
      return
    }

    const recommendedVersion = release.recommendedVersion
    if (recommendedVersion && this.compareSemver(clientVersion, recommendedVersion) < 0) {
      res.setHeader('X-Update-Available', recommendedVersion)
    }
    if (release.announcementBanner) {
      res.setHeader('X-Anstoss-Announcement', encodeURIComponent(release.announcementBanner))
    }

    next()
  }

  private async getReleaseSettings() {
    const now = Date.now()
    const revision = this.settings.getRuntimeReleaseSettingsRevision()
    if (
      this.cached &&
      this.cached.expiresAt > now &&
      this.cached.revision === revision
    ) {
      return this.cached.value
    }
    let value: Awaited<ReturnType<PlatformSettingsService['getRuntimeReleaseSettings']>>
    try {
      value = await this.settings.getRuntimeReleaseSettings()
    } catch {
      // A release-control read must not turn a transient database outage into
      // a platform-wide API outage. Fall back to the deploy-time safety floor.
      value = {
        minVersion: process.env.MIN_APP_VERSION ?? '1.0.0',
        recommendedVersion: process.env.RECOMMENDED_APP_VERSION ?? '1.0.0',
        forceUpdateMessage:
          'A newer version of Anstoss is required. Please update to continue.',
        announcementBanner: '',
      }
    }
    this.cached = { expiresAt: now + 10_000, revision, value }
    return value
  }

  /**
   * Compare two semver strings. Returns:
   *  -1 if a < b
   *   0 if a == b
   *   1 if a > b
   */
  private compareSemver(a: string, b: string): number {
    const partsA = a.split('.').map(Number)
    const partsB = b.split('.').map(Number)
    for (let i = 0; i < 3; i++) {
      const va = partsA[i] || 0
      const vb = partsB[i] || 0
      if (va < vb) return -1
      if (va > vb) return 1
    }
    return 0
  }
}
