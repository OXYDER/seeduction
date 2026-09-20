import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { MetricsService } from './monitoring/metrics.service';

// Les champs Prisma BigInt (ratio, tailles de torrent, ...) font planter
// JSON.stringify par défaut ; on les sérialise en string pour tous les endpoints.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api', { exclude: ['tracker/(.*)'] }); // le tracker BitTorrent reste hors /api

  const metrics = app.get(MetricsService);
  app.use((req: any, res: any, next: () => void) => {
    res.on('finish', () => metrics.record(req.originalUrl ?? req.url, res.statusCode));
    next();
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Mega Tracker backend démarré sur le port ${port}`);
}
bootstrap();
