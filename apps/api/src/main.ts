import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { initSentry } from './logging/sentry'
import { assertProductionSecrets, collectProductionEnvWarnings } from './env-validation'

// Sentry must init before NestJS bootstrap
initSentry()

// CORS allowlist — production origins explicit, no `origin: true` reflection.
// Local dev (Metro / web admin / curl) is allowed in non-prod only.
const PROD_ORIGINS: Array<string | RegExp> = [
  'https://anstoss.io',
  'https://app.anstoss.io',
  /\.anstoss\.app$/,
]
const DEV_ORIGINS: Array<string | RegExp> = [
  'http://localhost:8081', // Expo Metro
  'http://localhost:3000', // Next.js dev
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
]

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production'

  // Validate secrets BEFORE building the app so a misconfigured deploy fails
  // fast (red) instead of booting green with broken/forgeable auth.
  if (isProd) {
    assertProductionSecrets()
    for (const warning of collectProductionEnvWarnings()) {
      console.warn(`[WARN] ${warning}`)
    }
  }

  const app = await NestFactory.create(AppModule, { rawBody: true })

  // Trust the edge proxy (Railway) so `req.ip` is the real client IP rather
  // than the immediate hop. The rate-limit guard keys anonymous requests on
  // `req.ip`; without this, every request looks like it comes from the proxy.
  app.getHttpAdapter().getInstance().set('trust proxy', 1)

  // Helmet: secure headers (CSP, X-Frame-Options, HSTS, etc). Default
  // policy is sane for a JSON API; CSP is loosened slightly for /docs
  // when Swagger is mounted in non-prod.
  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", 'data:', 'https:'],
              connectSrc: ["'self'", 'https://*.clerk.accounts.dev'],
            },
          }
        : false, // Swagger UI needs inline + CDN scripts
      crossOriginEmbedderPolicy: false,
    }),
  )

  // CORS: explicit allowlist. Reflecting the Origin header (was
  // origin: true) lets any third-party site make authenticated
  // cross-site requests when paired with credentials: true.
  const allowed = isProd ? PROD_ORIGINS : [...PROD_ORIGINS, ...DEV_ORIGINS]
  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin / mobile / curl requests have no Origin header — allow.
      if (!origin) return callback(null, true)
      const ok = allowed.some((rule) =>
        typeof rule === 'string' ? rule === origin : rule.test(origin),
      )
      callback(ok ? null : new Error(`CORS: origin ${origin} not allowed`), ok)
    },
    credentials: true,
  })

  // Swagger /docs is reconnaissance gold for attackers — every route,
  // payload, auth scheme. Mount in non-prod only.
  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Anstoss API')
      .setDescription('White-label mobile platform for amateur football clubs')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'clerk-jwt')
      .build()
    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('docs', app, document)
  }

  const port = process.env.PORT || 3001
  await app.listen(port)
  console.log(`Anstoss API running on port ${port}`)
}
bootstrap()
