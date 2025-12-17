import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableCors(); // Enable CORS for frontend integration
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Video Parser API running on http://localhost:${port}`);
}
bootstrap();
