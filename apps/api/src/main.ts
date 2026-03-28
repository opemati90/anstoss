import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { initSentry } from './logging/sentry'

// Sentry must init before NestJS bootstrap
initSentry()

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true })

  app.enableCors({
    origin: true,
    credentials: true,
  })

  const port = process.env.PORT || 3000
  await app.listen(port)
  console.log(`Anstoss API running on port ${port}`)
}
bootstrap()
