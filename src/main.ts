import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind the Cloudflare Worker, which sets X-Forwarded-For to the client IP;
  // rate limiting keys on req.ip.
  app.set('trust proxy', 1);
  app.useWebSocketAdapter(new WsAdapter(app));

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:8081', 'http://localhost:19006'];
  app.enableCors({ origin: allowedOrigins });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
