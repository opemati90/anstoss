import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Anstoss API')
    .setDescription('White-label mobile platform for amateur football clubs')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'clerk-jwt')
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('docs', app, document)

  const port = process.env.PORT || 3001
  await app.listen(port)
  console.log(`Anstoss API running on port ${port}`)
}
bootstrap()
