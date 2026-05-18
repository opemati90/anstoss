import { Controller, Get, Header } from '@nestjs/common'

/**
 * Serves Apple App Site Association for universal link support.
 * Apple fetches this file when the user taps an https://api.anstoss.io/join/…
 * link — it tells iOS that com.renuirug.anstoss owns the /join/* path space
 * so the OS opens the app directly instead of Safari.
 */
@Controller('.well-known')
export class WellKnownController {
  @Get('apple-app-site-association')
  @Header('Content-Type', 'application/json')
  appleAppSiteAssociation() {
    return {
      applinks: {
        apps: [],
        details: [
          {
            appID: 'A3H3NSC234.com.renuirug.anstoss',
            paths: ['/join/*'],
          },
        ],
      },
    }
  }
}
