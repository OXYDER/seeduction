import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { MetricsService } from './monitoring/metrics.service';
import { lockState } from './lockdown/lockdown-state';

// Les champs Prisma BigInt (ratio, tailles de torrent, ...) font planter
// JSON.stringify par défaut ; on les sérialise en string pour tous les endpoints.
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Adresse IP réelle du visiteur (limites de débit, journaux) : on fait confiance à N proxys devant le backend (2 par défaut : Nginx Proxy Manager + le nginx du site ; 3 avec Cloudflare).
  (app.getHttpAdapter().getInstance() as any).set('trust proxy', Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 2) || 2));
  (app.getHttpAdapter().getInstance() as any).disable('x-powered-by');
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  // Les navigateurs envoient les rapports de sécurité (CSP) avec un type de contenu particulier : on l'accepte en plus du JSON ordinaire.
  // (Ne pas ajouter un analyseur « json » avec app.use : Nest croirait le sien déjà installé et plus aucune requête JSON ne serait lue.)
  app.useBodyParser('json', { type: ['application/json', 'application/csp-report', 'application/reports+json'] });
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? '*' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api', { exclude: ['tracker/(.*)'] }); // le tracker BitTorrent reste hors /api

  // Alerte générale : tant que le site est verrouillé (ou en cours de verrouillage / de restauration), tout est refusé sauf
  // l'état du verrouillage et le déblocage par mot de passe. Placé avant tout le reste, y compris l'annonce des torrents.
  app.use((req: any, res: any, next: () => void) => {
    if (!lockState.blocking) return next();
    if (req.method === 'OPTIONS') return next();
    const url = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    if (url === '/api/lockdown/status' || url === '/api/lockdown/unlock') return next();
    res.status(503).set('Retry-After', '300').json({ lockdown: true, message: 'Site verrouillé : alerte de sécurité en cours.' });
  });

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
