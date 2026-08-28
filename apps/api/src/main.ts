import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { initSentry } from './logging/sentry'
import { assertProductionSecrets, collectProductionEnvWarnings } from './env-validation'
import { isHttpOriginAllowed } from './http-cors'
import { defaultHttpBodyParsers, httpBodyParsers } from './http-body-parsers'

// Sentry must init before NestJS bootstrap
initSentry()

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

  const app = await NestFactory.create(AppModule, { rawBody: true, bodyParser: false })

  const express = app.getHttpAdapter().getInstance()

  // Reduce framework fingerprinting on the public API surface.
  express.disable('x-powered-by')

  // Trust the edge proxy (Railway) so `req.ip` is the real client IP rather
  // than the immediate hop. The rate-limit guard keys anonymous requests on
  // `req.ip`; without this, every request looks like it comes from the proxy.
  express.set('trust proxy', 1)

  // Only the bank-statement import accepts a large JSON envelope. Mount this
  // parser first so uploads up to the service's strict 10 MB decoded-file
  // limit reach validation; every other API route keeps the 100 KB ceiling.
  express.post('/clubs/:clubId/contributions/imports', ...httpBodyParsers())
  app.use(...defaultHttpBodyParsers())

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
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const ok = isHttpOriginAllowed(origin, process.env.NODE_ENV)
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
