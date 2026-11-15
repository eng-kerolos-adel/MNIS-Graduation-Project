import 'reflect-metadata';
import { env, isProd } from './config/env';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Documents are uploaded as base64 JSON (~4MB file => ~5.4MB body); Nest's default limit is 100kb.
  app.useBodyParser('json', { limit: '8mb' });
  app.set('trust proxy', env.TRUST_PROXY_HOPS); // real client IP for rate limits & audit (must match the proxy chain)
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());

  const origins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || origins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type'],
    maxAge: 600,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('v1', { exclude: ['health'] });

  if (!isProd || env.SWAGGER_ENABLED === 'true') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('MNIS API').setVersion('1.0').addBearerAuth().build());
    SwaggerModule.setup('docs', app, doc); // /docs and /docs-json (feed openapi-generator for Dart & TS clients)
  }

  app.enableShutdownHooks();
  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`MNIS API listening on :${env.PORT}`);
}
bootstrap();