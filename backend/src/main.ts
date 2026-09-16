import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api', { exclude: ['tracker/(.*)'] }); // le tracker BitTorrent reste hors /api

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Mega Tracker backend démarré sur le port ${port}`);
}
bootstrap();
