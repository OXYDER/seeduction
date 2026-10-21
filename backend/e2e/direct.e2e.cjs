// Test de bout en bout : directs planifiés (Admin > Direct). Un faux relais local reçoit ce que le site lui envoie. Voir README.md.
const http = require('http');
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j, raw: t };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });

(async () => {
  const p = new PrismaClient();
  const tag = 'lv' + Date.now().toString(36).slice(-5);
  const admin = await E2E.getAdmin(p, bcrypt);
  const member = await p.user.create({ data: { username: tag + 'm', email: tag + 'm@t.local', passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 30 * 86400_000) } });
  const TA = tok(admin), TM = tok(member);
  const before = await p.siteSetting.findUnique({ where: { key: 'liveRelay' } });

  // Faux relais : garde ce qu'il reçoit et vérifie le secret.
  const SECRET = 'secret-de-test-' + tag;
  const received = []; let relayUp = true;
  const relay = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (!relayUp) { res.writeHead(500); return res.end('panne'); }
      if (req.headers.authorization !== 'Bearer ' + SECRET) { res.writeHead(401); return res.end('Secret refuse'); }
      if (req.method === 'PUT' && req.url === '/controle/source') { received.push(JSON.parse(body)); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
      if (req.method === 'GET' && req.url === '/controle/etat') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"canal":true,"actif":false}'); }
      res.writeHead(404); res.end();
    });
  });
  await new Promise((r) => relay.listen(0, '127.0.0.1', r));
  const relayUrl = `http://127.0.0.1:${relay.address().port}/controle`;
  const last = () => received[received.length - 1];

  try {
    check('un membre ordinaire ne peut pas ouvrir l\'administration des directs', (await call('GET', '/admin/live', TM)).s === 403);
    check('mais il peut voir la page Direct (rien en cours)', (await call('GET', '/live', TM)).b?.live === false);

    // Réglages
    const noSecret = await call('PUT', '/admin/live/config', TA, { enabled: true, controlUrl: relayUrl });
    check('activer sans secret : refusé', noSecret.s === 400, noSecret.raw.slice(0, 80));
    const cfg = await call('PUT', '/admin/live/config', TA, { enabled: true, controlUrl: relayUrl, secret: SECRET, playbackUrl: 'https://relais.test/live/abc/index.m3u8', onDemand: true, timezone: 'America/Toronto' });
    check('réglages enregistrés, secret jamais renvoyé', cfg.s === 200 && cfg.b.secretSet === true && !('secret' in cfg.b) && !cfg.raw.includes(SECRET), cfg.raw.slice(0, 120));
    const keep = await call('PUT', '/admin/live/config', TA, { secret: '', onDemand: true });
    check('un secret vide garde le secret existant', keep.s === 200 && keep.b.secretSet === true);
    check('le test du relais fonctionne (secret accepté)', (await call('POST', '/admin/live/test', TA)).b?.ok === true);
    await call('PUT', '/admin/live/config', TA, { secret: 'mauvais' });
    const bad = await call('POST', '/admin/live/test', TA);
    check('un mauvais secret est signalé', bad.b?.ok === false && /401/.test(bad.b.error));
    await call('PUT', '/admin/live/config', TA, { secret: SECRET });

    // Flux
    check('adresse de flux piégée refusée', (await call('POST', '/admin/live/streams', TA, { name: 'x', url: 'file:///etc/passwd' })).s === 400 && (await call('POST', '/admin/live/streams', TA, { name: 'x', url: 'http://a/b c' })).s === 400);
    check('un flux sans nom est refusé', (await call('POST', '/admin/live/streams', TA, { name: ' ', url: 'http://a/b' })).s === 400);
    const URL_A = 'http://100.64.0.2:9191/proxy/ts/stream/' + tag + 'A', URL_B = 'http://100.64.0.2:9191/proxy/ts/stream/' + tag + 'B';
    const sa = (await call('POST', '/admin/live/streams', TA, { name: 'Podcast A', url: URL_A })).b;
    const sb = (await call('POST', '/admin/live/streams', TA, { name: 'Podcast B', url: URL_B })).b;
    check('deux flux créés', !!sa?.id && !!sb?.id);

    // Calendrier
    const now = Date.now();
    check('créneau sur un flux inconnu : refusé', (await call('POST', '/admin/live/slots', TA, { streamId: 'inconnu', startsAt: new Date(now).toISOString(), durationMin: 60 })).s === 404);
    check('durée invalide refusée', (await call('POST', '/admin/live/slots', TA, { streamId: sa.id, startsAt: new Date(now).toISOString(), durationMin: 2 })).s === 400);
    const slotFuture = (await call('POST', '/admin/live/slots', TA, { streamId: sb.id, title: 'Émission du soir', startsAt: new Date(now + 3 * 3600_000).toISOString(), durationMin: 60 })).b;
    const syncIdle = await call('POST', '/admin/live/sync', TA);
    check('rien en cours : le relais reçoit « rien »', syncIdle.s === 201 && last()?.url === null, JSON.stringify(last()));
    const mIdle = await call('GET', '/live', TM);
    check('côté membre : pas de direct, mais la prochaine émission est annoncée', mIdle.b.live === false && mIdle.b.playbackUrl === null && mIdle.b.next[0]?.title === 'Émission du soir');

    // Un créneau en cours
    const slotNow = (await call('POST', '/admin/live/slots', TA, { streamId: sa.id, startsAt: new Date(now - 10 * 60_000).toISOString(), durationMin: 60, repeat: 'NONE' })).b;
    await call('POST', '/admin/live/sync', TA);
    check('un créneau en cours : le relais reçoit l\'adresse du flux et le mode à la demande', last()?.url === URL_A && last()?.onDemand === true, JSON.stringify(last()));
    const mLive = await call('GET', '/live', TM);
    check('côté membre : direct en cours avec l\'adresse du relais', mLive.b.live === true && mLive.b.playbackUrl === 'https://relais.test/live/abc/index.m3u8' && mLive.b.title === 'Podcast A');
    check('l\'adresse du flux source n\'est JAMAIS montrée aux membres', !mLive.raw.includes(URL_A) && !mLive.raw.includes('100.64.0.2') && !(await call('GET', '/live', TM)).raw.includes(tag + 'A'));
    const ov = await call('GET', '/admin/live', TA);
    check('l\'administration voit le direct en cours et l\'envoi réussi', ov.b.now?.streamName === 'Podcast A' && ov.b.relay.lastOk === true && ov.b.config.secretSet === true && !ov.raw.includes(SECRET));

    // Chevauchement : le plus récent l'emporte
    const slotB = (await call('POST', '/admin/live/slots', TA, { streamId: sb.id, startsAt: new Date(now - 2 * 60_000).toISOString(), durationMin: 30 })).b;
    await call('POST', '/admin/live/sync', TA);
    check('deux créneaux qui se chevauchent : le plus récent remplace l\'autre', last()?.url === URL_B);
    await call('DELETE', `/admin/live/slots/${slotB.id}`, TA);
    await call('POST', '/admin/live/sync', TA);
    check('en le supprimant, l\'ancien reprend', last()?.url === URL_A);

    // Désactivation d'un flux, mode continu
    await call('PUT', `/admin/live/streams/${sa.id}`, TA, { enabled: false });
    await call('POST', '/admin/live/sync', TA);
    check('un flux désactivé n\'est pas diffusé', last()?.url === null && (await call('GET', '/live', TM)).b.live === false);
    await call('PUT', `/admin/live/streams/${sa.id}`, TA, { enabled: true });
    await call('PUT', '/admin/live/config', TA, { onDemand: false });
    await call('POST', '/admin/live/sync', TA);
    check('mode continu transmis au relais', last()?.url === URL_A && last()?.onDemand === false);
    await call('PUT', '/admin/live/config', TA, { onDemand: true });

    // Panne du relais
    relayUp = false;
    const down = await call('POST', '/admin/live/sync', TA);
    const ovDown = await call('GET', '/admin/live', TA);
    check('relais en panne : l\'erreur est visible dans l\'administration', down.s >= 400 && ovDown.b.relay.lastOk === false && !!ovDown.b.relay.lastError, ovDown.b.relay.lastError);
    relayUp = true;
    check('le relais revenu : l\'envoi reprend', (await call('POST', '/admin/live/sync', TA)).s === 201 && (await call('GET', '/admin/live', TA)).b.relay.lastOk === true);

    // Répétition hebdomadaire : une occurrence passée il y a 7 jours est active maintenant
    await call('DELETE', `/admin/live/slots/${slotNow.id}`, TA);
    const weekly = (await call('POST', '/admin/live/slots', TA, { streamId: sb.id, startsAt: new Date(now - 7 * 86400_000 - 5 * 60_000).toISOString(), durationMin: 30, repeat: 'WEEKLY' })).b;
    await call('POST', '/admin/live/sync', TA);
    check('une diffusion hebdomadaire est active à la même heure une semaine plus tard', last()?.url === URL_B);
    const ended = (await call('PUT', `/admin/live/slots/${weekly.id}`, TA, { repeatUntil: new Date(now - 86400_000).toISOString() })).b;
    await call('POST', '/admin/live/sync', TA);
    check('« jusqu\'au » arrête la répétition', ended?.repeatUntil && last()?.url === null);

    // Suppression d'un flux : ses créneaux partent aussi
    await call('DELETE', `/admin/live/streams/${sb.id}`, TA);
    check('supprimer un flux supprime ses créneaux', (await p.liveSlot.count({ where: { streamId: sb.id } })) === 0 && (await call('GET', '/admin/live', TA)).b.slots.every((s) => s.streamId !== sb.id));
    await call('PUT', '/admin/live/config', TA, { enabled: false });
    await call('POST', '/admin/live/sync', TA);
    check('directs désactivés : le relais reçoit « rien »', last()?.url === null && (await call('GET', '/live', TM)).b.live === false);
    check('les actions sont dans le journal', (await p.activityLog.count({ where: { userId: admin.id, action: { in: ['LIVE_CONFIG', 'LIVE_STREAM_SAVE', 'LIVE_SLOT_SAVE'] }, createdAt: { gt: new Date(now - 60_000) } } })) >= 5);
  } finally {
    await p.liveStream.deleteMany({ where: { name: { in: ['Podcast A', 'Podcast B'] }, url: { contains: tag } } });
    if (before) await p.siteSetting.update({ where: { key: 'liveRelay' }, data: { value: before.value } }); else await p.siteSetting.deleteMany({ where: { key: 'liveRelay' } });
    await p.activityLog.deleteMany({ where: { userId: admin.id, action: { startsWith: 'LIVE_' }, createdAt: { gt: new Date(Date.now() - 300_000) } } });
    await p.user.delete({ where: { id: member.id } }).catch(() => undefined);
    relay.close();
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
