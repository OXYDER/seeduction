// Test de bout en bout : installateurs des lecteurs hébergés par le site (Admin > Lecteurs) : envoi par morceaux, vérifications, versions, téléchargement. Voir README.md.
const crypto = require('crypto');
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
async function call(method, p, token, body, raw, extra) {
  const headers = { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(extra || {}) };
  if (body && !raw) headers['Content-Type'] = 'application/json';
  if (raw) headers['Content-Type'] = 'application/octet-stream';
  const r = await fetch(BASE + p, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const buf = Buffer.from(await r.arrayBuffer()); let j = null; try { j = JSON.parse(buf.toString('utf8')); } catch {}
  return { s: r.status, b: j, buf, h: r.headers };
}
const fake = (magic, size) => Buffer.concat([Buffer.from(magic), crypto.randomBytes(size - magic.length)]);

/** Envoie un fichier par morceaux (comme la page d'administration) puis le publie. */
async function publish(T, platform, data, version, chunk = 1024 * 1024) {
  const start = (await call('POST', `/admin/players/${platform}/start`, T)).b;
  for (let i = 0, off = 0; off < data.length; i++, off += chunk) {
    const r = await call('POST', `/admin/players/chunk?upload=${start.upload}&index=${i}`, T, null, data.subarray(off, off + chunk));
    if (r.s >= 300) return { chunkError: r };
  }
  return call('POST', '/admin/players/finish', T, { upload: start.upload, version, notes: 'Essai' });
}

(async () => {
  const p = new PrismaClient();
  const admin = await E2E.getAdmin(p, bcrypt);
  const tag = 'pl' + Date.now().toString(36).slice(-5);
  const member = await p.user.create({ data: { username: tag + 'm', email: tag + 'm@t.local', passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 30 * 86400_000) } });
  const TA = tok(admin), TM = tok(member);
  try {
    check('un membre ordinaire ne peut pas publier', (await call('POST', '/admin/players/windows/start', TM)).s === 403 && (await call('GET', '/admin/players', TM)).s === 403);
    check('la liste des versions est publique (aucune session)', (await call('GET', '/downloads/players')).s === 200);
    check('système inconnu refusé', (await call('POST', '/admin/players/linux/start', TA)).s === 400 && (await call('GET', '/downloads/players/linux')).s === 400);

    // Envoi par morceaux d'un faux .exe
    const exe = fake('MZ', 3_500_000);
    const sha = crypto.createHash('sha256').update(exe).digest('hex');
    const start = (await call('POST', '/admin/players/windows/start', TA)).b;
    const outOfOrder = await call('POST', `/admin/players/chunk?upload=${start.upload}&index=1`, TA, null, exe.subarray(0, 1000));
    check('un morceau hors séquence est refusé', outOfOrder.s === 409);
    check('un envoi inconnu est refusé', (await call('POST', '/admin/players/chunk?upload=inconnu&index=0', TA, null, exe.subarray(0, 100))).s === 404);
    let ok = true; for (let i = 0, off = 0; off < exe.length; i++, off += 1_200_000) ok = ok && (await call('POST', `/admin/players/chunk?upload=${start.upload}&index=${i}`, TA, null, exe.subarray(off, off + 1_200_000))).s === 201;
    check('4 morceaux acceptés dans l\'ordre', ok);
    check('un numéro de version invalide est refusé', (await call('POST', '/admin/players/finish', TA, { upload: start.upload, version: '1.0.0-beta' })).s === 400);
    const fin = await call('POST', '/admin/players/finish', TA, { upload: start.upload, version: '0.9.1', notes: 'Première version' });
    check('publication : version, taille et empreinte exactes', fin.s === 201 && fin.b.version === '0.9.1' && fin.b.size === exe.length && fin.b.sha256 === sha, fin.buf.toString().slice(0, 120));

    const list = await call('GET', '/downloads/players');
    check('liste publique : version, taille, empreinte, adresse, jamais le chemin du serveur', list.b.windows?.version === '0.9.1' && list.b.windows.sha256 === sha && list.b.windows.url === '/api/downloads/players/windows' && !('file' in list.b.windows) && !list.buf.toString().includes('windows-0.9.1.exe'));
    const dl = await call('GET', '/downloads/players/windows');
    check('le téléchargement donne exactement le fichier, sous un nom clair', dl.s === 200 && dl.buf.equals(exe) && /Seeduction Player Setup 0\.9\.1\.exe/.test(dl.h.get('content-disposition') ?? ''), String(dl.s));

    // Vérifications du contenu
    const bad = await publish(TA, 'windows', fake('XX', 5000), '0.9.2');
    check('un fichier qui n\'est pas un .exe est refusé (début du fichier)', bad.s === 400, bad.buf?.toString().slice(0, 80));
    check('un fichier minuscule est refusé', (await publish(TA, 'android', fake('PK', 200), '1.0.0')).s === 400);
    check('la version publiée n\'a pas changé après ces refus', (await call('GET', '/downloads/players')).b.windows.version === '0.9.1');

    // Nouvelle version : remplace l'ancienne
    const exe2 = fake('MZ', 2_000_000);
    const fin2 = await publish(TA, 'windows', exe2, '0.9.2');
    check('une nouvelle version remplace l\'ancienne', fin2.s === 201 && (await call('GET', '/downloads/players')).b.windows.version === '0.9.2' && (await call('GET', '/downloads/players/windows')).buf.equals(exe2));

    // Android
    const apk = fake('PK', 2_500_000);
    const finA = await publish(TA, 'android', apk, '1.1.0');
    const dlA = await call('GET', '/downloads/players/android');
    check('l\'APK est publié et téléchargeable sous son nom habituel', finA.s === 201 && dlA.buf.equals(apk) && /Seeduction\.Player\.apk/.test(dlA.h.get('content-disposition') ?? ''));
    check('l\'administration voit les deux versions', (await call('GET', '/admin/players', TA)).b.android?.version === '1.1.0');

    // Clé de publication : le script « publier-lecteurs » publie sans mot de passe
    check('sans clé ni session : refusé', (await call('POST', '/admin/players/windows/start')).s === 401);
    check('une mauvaise clé est refusée', (await call('POST', '/admin/players/windows/start', null, null, null, { 'X-Publish-Key': 'mauvaise' })).s === 401);
    check('un membre ne peut pas créer de clé', (await call('POST', '/admin/players/key', TM)).s === 403);
    const k = (await call('POST', '/admin/players/key', TA)).b;
    check('clé créée (64 caractères), montrée une seule fois', /^[0-9a-f]{64}$/.test(k?.key ?? ''));
    const ov = await call('GET', '/admin/players', TA);
    check('l\'administration voit qu\'une clé existe, sans jamais la revoir ; les versions du code sont indiquées', ov.b.key.set === true && !ov.buf.toString().includes(k.key) && 'code' in ov.b && 'windows' in ov.b.code);
    const KEY = { 'X-Publish-Key': k.key };
    const startK = await call('POST', '/admin/players/windows/start', null, null, null, KEY);
    check('la clé permet de publier (sans session)', startK.s === 201 && !!startK.b.upload);
    const exeK = fake('MZ', 1_500_000);
    await call('POST', `/admin/players/chunk?upload=${startK.b.upload}&index=0`, null, null, exeK, KEY);
    const finK = await call('POST', '/admin/players/finish', null, { upload: startK.b.upload, version: '3.0.0', notes: 'Script' }, null, KEY);
    check('publication par clé : version, taille exactes', finK.s === 201 && finK.b.version === '3.0.0' && finK.b.size === exeK.length);
    check('la clé lit la liste mais ne peut pas gérer les clés', (await call('GET', '/admin/players', null, null, null, KEY)).s === 200 && [401, 403].includes((await call('POST', '/admin/players/key', null, null, null, KEY)).s) && [401, 403].includes((await call('DELETE', '/admin/players/key', null, null, null, KEY)).s));
    check('la clé ne donne accès à rien d\'autre dans l\'administration', (await call('GET', '/admin/live', null, null, null, KEY)).s === 401);
    check('révocation de la clé', (await call('DELETE', '/admin/players/key', TA)).s === 200);
    check('après révocation, la clé est refusée', (await call('POST', '/admin/players/windows/start', null, null, null, KEY)).s === 401 && (await call('GET', '/admin/players', TA)).b.key.set === false);

    // Retrait
    check('retrait des installateurs', (await call('DELETE', '/admin/players/windows', TA)).s === 200 && (await call('DELETE', '/admin/players/android', TA)).s === 200);
    check('après retrait : liste vide et téléchargement introuvable', Object.keys((await call('GET', '/downloads/players')).b).length === 0 && (await call('GET', '/downloads/players/windows')).s === 404);
    check('les actions sont dans le journal', (await p.activityLog.count({ where: { userId: admin.id, action: { in: ['PLAYER_PUBLISH', 'PLAYER_REMOVE', 'PLAYER_KEY'] }, createdAt: { gt: new Date(Date.now() - 120_000) } } })) >= 6);
  } finally {
    await call('DELETE', '/admin/players/windows', TA).catch(() => undefined); await call('DELETE', '/admin/players/android', TA).catch(() => undefined);
    await p.activityLog.deleteMany({ where: { userId: admin.id, action: { in: ['PLAYER_PUBLISH', 'PLAYER_REMOVE', 'PLAYER_KEY'] }, createdAt: { gt: new Date(Date.now() - 300_000) } } });
    await p.user.delete({ where: { id: member.id } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
