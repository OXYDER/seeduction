import * as fs from 'fs';
import * as path from 'path';

/**
 * Garde-fou : le site entier est privé. Toute route de l'API doit exiger une session (JwtAuthGuard ou OptionalJwtAuthGuard, qui exige aussi une session) SAUF celles de cette liste,
 * qui sont publiques à dessein (connexion, tracker BitTorrent, API par clé, fichiers à nom secret...). Ajouter une route sans protection fait échouer ce test : soit on la protège,
 * soit on l'ajoute ici en sachant ce qu'on fait.
 */
const PUBLIC_ROUTES: Record<string, string> = {
  'POST /auth/register': 'inscription (code d\'invitation)', 'POST /auth/login': 'connexion', 'POST /auth/verify-email': 'confirmation du courriel (jeton)',
  'GET /auth/features': 'la page de connexion en a besoin', 'POST /auth/forgot-password': 'mot de passe oublié', 'POST /auth/reset-password': 'réinitialisation (jeton)',
  'GET /backup/download/:name': 'lien signé de 2 minutes', 'POST /backup/local-run': 'scripts du serveur (local seulement)', 'POST /backup/predeploy': 'scripts du serveur (local seulement)',
  'GET /chat/files/:filename': 'fichier à nom secret (aperçus, Telegram)', 'GET /covers/:filename': 'image à nom secret (aperçus, Telegram, *arr)', 'GET /messenger/files/:filename': 'fichier à nom secret',
  'GET /lockdown/status': 'écran d\'alerte générale', 'POST /lockdown/unlock': 'déblocage par mot de passe',
  'POST /security/csp-report': 'rapports envoyés par le navigateur', 'GET /system/status': 'bandeau de maintenance (avant la connexion)', 'GET /system/public-status': 'page d\'état « le site fonctionne » (services, disponibilité, incidents sans détail technique)', 'POST /system/maintenance': 'script de déploiement (local seulement)',
  'GET /sports/logo/:abbrev': 'image de logo (balise img)', 'GET /sports/goal-sound': 'son de but (balise audio)',
  'GET /public/torrents': 'API par clé', 'GET /public/torrents/:id': 'API par clé', 'GET /public/me': 'API par clé', 'GET /public/stats': 'API par clé', 'GET /public/rss/torrents.xml': 'flux RSS par clé',
  'POST /donations/webhook/kofi': 'Ko-fi (jeton vérifié)', 'POST /donations/webhook/bmc': 'Buy Me a Coffee (signature vérifiée)',
  'GET /stream/session/:token': 'jeton de lecture', 'POST /stream/watching': 'jeton de lecture', 'POST /stream/watching/stop': 'jeton de lecture', 'GET /stream/:torrentId': 'passkey', 'GET /subtitles/player': 'passkey du lecteur', 'GET /subtitles/:id/play': 'passkey du lecteur',
  'GET /tracker/:passkey/announce': 'tracker BitTorrent', 'GET /tracker/:passkey/scrape': 'tracker BitTorrent',
};
const PUBLIC_FILES = ['torznab/torznab.controller.ts']; // clé d'API Torznab sur chaque requête

function controllers(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) controllers(p, out); else if (p.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

describe('API privée par défaut', () => {
  const root = path.join(__dirname, '..', '..');
  const unguarded: string[] = [];
  for (const file of controllers(root)) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (PUBLIC_FILES.includes(rel)) continue;
    const s = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const cm = s.match(/((?:@\w+\([^)]*\)\s*\n)*)@Controller\(([^)]*)\)\s*\n\s*export class/);
    const classDeco = cm ? cm[1] : '';
    const base = cm ? cm[2].replace(/['"]/g, '') : '';
    const classGuard = /UseGuards\([^)]*(JwtAuthGuard|OptionalJwtAuthGuard)/.test(classDeco);
    const re = /((?:\s*@\w+(?:\([^)]*\))?\s*\n)+)\s*(?:async\s+)?\w+\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const verb = /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)/.exec(m[1]);
      if (!verb) continue;
      if (classGuard || /UseGuards\([^)]*(JwtAuthGuard|OptionalJwtAuthGuard)/.test(m[1])) continue;
      const sub = verb[2].replace(/['"]/g, '').trim();
      unguarded.push(`${verb[1].toUpperCase()} /${[base, sub].filter(Boolean).join('/')}`.replace(/\/+/g, '/'));
    }
  }

  it('aucune route sans session en dehors de la liste des routes publiques', () => {
    const unexpected = unguarded.filter((r) => !(r in PUBLIC_ROUTES));
    expect(unexpected).toEqual([]);
  });

  it('la liste des routes publiques ne contient pas de route disparue', () => {
    const missing = Object.keys(PUBLIC_ROUTES).filter((r) => !unguarded.includes(r));
    expect(missing).toEqual([]);
  });
});
