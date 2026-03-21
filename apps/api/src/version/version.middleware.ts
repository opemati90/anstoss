import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'

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
  use(req: Request, res: Response, next: NextFunction) {
    const clientVersion = req.headers['x-app-version'] as string | undefined
    if (!clientVersion) {
      // No header → allow (web clients, monitoring, health checks)
      return next()
    }

    const minVersion = process.env.MIN_APP_VERSION
    if (minVersion && this.compareSemver(clientVersion, minVersion) < 0) {
      res.status(426).json({
        error: {
          code: 'UPGRADE_REQUIRED',
          message: 'Please update the app to continue.',
          minVersion,
        },
      })
      return
    }

    const recommendedVersion = process.env.RECOMMENDED_APP_VERSION
    if (recommendedVersion && this.compareSemver(clientVersion, recommendedVersion) < 0) {
      res.setHeader('X-Update-Available', recommendedVersion)
    }

    next()
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
