// Test de bout en bout : chat, réactions et nombre de spectateurs pendant un direct (passerelle temps réel /live). Voir README.md.
// Utilise socket.io-client du dossier frontend (le backend n'en a pas besoin).
const path = require('path');
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const { io } = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'socket.io-client'));
const BASE = E2E.BASE;
const ORIGIN = BASE.replace(/\/api$/, '');
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j };
}
/** Un spectateur : se connecte à /live, mémorise ce qu'il reçoit. */
function viewer(token) {
  const s = io(ORIGIN + '/live', { auth: { token }, transports: ['websocket'], reconnection: false });
  const got = { chat: [], reactions: [], errors: [], viewers: null, init: null, deleted: [], resets: 0 };
  let ready = false;
  s.on('live:ready', () => { ready = true; });
  s.on('live:init', (d) => { got.init = d; got.viewers = d.viewers; });
  s.on('live:viewers', (d) => { got.viewers = d.count; });
  s.on('live:chat', (m) => got.chat.push(m));
  s.on('live:reactions', (c) => got.reactions.push(c));
  s.on('live:error', (e) => got.errors.push(e));
  s.on('live:chat-delete', (d) => got.deleted.push(d.id));
  return { s, got, join: async () => { for (let i = 0; i < 60 && !ready; i++) await sleep(50); s.emit('live:join'); for (let i = 0; i < 40 && !got.init; i++) await sleep(50); } };
}

(async () => {
  const p = new PrismaClient();
  const admin = await E2E.getAdmin(p, bcrypt);
  const tag = 'lc' + Date.now().toString(36).slice(-5);
  const mk = (n, role = 'USER') => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: 'x', role, createdAt: new Date(Date.now() - 30 * 86400_000) } });
  const [a, b, mod] = [await mk('a'), await mk('b'), await mk('m', 'MODERATOR')];
  const TA = tok(admin);
  const prevRelay = await p.siteSetting.findUnique({ where: { key: 'liveRelay' } });
  const prevInter = await p.siteSetting.findUnique({ where: { key: 'liveInteractions' } });
  const sockets = [];
  // Restes d'une exécution interrompue : un autre direct en cours fausserait le test.
  await p.liveStream.deleteMany({ where: { name: { startsWith: 'Direct lc' } } });
  try {
    // Un direct en cours (le relais n'a pas besoin d'exister : seul le calendrier compte pour la page)
    await call('PUT', '/admin/live/config', TA, { enabled: true, controlUrl: 'http://127.0.0.1:9/controle', secret: 'x', playbackUrl: 'https://relais.test/live/x/index.m3u8' });
    await call('PUT', '/admin/live/interactions', TA, { chat: true, reactions: true, slowSeconds: 0, maxLen: 60, reactionsPerMinute: 30, emojis: ['👍', '🔥', '🏒'] });
    const st = (await call('POST', '/admin/live/streams', TA, { name: 'Direct ' + tag, url: 'http://100.64.0.2:9191/s/' + tag })).b;
    const slot = (await call('POST', '/admin/live/slots', TA, { streamId: st.id, startsAt: new Date(Date.now() - 10 * 60_000).toISOString(), durationMin: 60 })).b;

    const bad = io(ORIGIN + '/live', { auth: { token: 'invalide' }, transports: ['websocket'], reconnection: false });
    await sleep(800); check('un jeton invalide est déconnecté', bad.disconnected); bad.close();

    const A = viewer(tok(a)), Bv = viewer(tok(b)), M = viewer(tok(mod));
    sockets.push(A.s, Bv.s, M.s);
    await A.join();
    check('à l\'arrivée : le réglage et le nombre de spectateurs', A.got.init?.config.chat === true && A.got.init.config.emojis.length === 3 && A.got.init.viewers === 1 && A.got.init.staff === false);
    await Bv.join(); await M.join();
    await sleep(2300);
    check('le nombre de spectateurs est mis à jour pour tous (3)', A.got.viewers === 3 && Bv.got.viewers === 3);
    check('l\'équipe est reconnue', M.got.init.staff === true);

    // Chat
    A.s.emit('live:chat', { text: 'Allez les Habs !' }); await sleep(500);
    check('un message arrive à tous les spectateurs, avec son auteur', Bv.got.chat[0]?.text === 'Allez les Habs !' && Bv.got.chat[0].userId === a.id && A.got.chat.length === 1);
    A.s.emit('live:chat', { text: 'regarde https://exemple.com' }); await sleep(300);
    check('les liens sont refusés', A.got.errors.some((e) => /liens/.test(e)) && Bv.got.chat.length === 1);
    A.s.emit('live:chat', { text: 'x'.repeat(61) }); await sleep(300);
    check('un message trop long est refusé', A.got.errors.some((e) => /trop long/.test(e)));
    M.s.emit('live:chat', { text: 'infos sur https://seeduction.org' }); await sleep(300);
    check('l\'équipe peut écrire un lien', Bv.got.chat.some((m) => /seeduction\.org/.test(m.text)));
    for (let i = 0; i < 7; i++) { Bv.s.emit('live:chat', { text: 'msg ' + i }); await sleep(120); }
    await sleep(300);
    check('au plus 6 messages par minute', Bv.got.errors.some((e) => /trop vite/.test(e)) && A.got.chat.filter((m) => m.userId === b.id).length === 6);

    // Réactions
    A.s.emit('live:react', { emoji: '🔥' }); await sleep(1200);
    check('une réaction arrive aux autres (envoi groupé)', Bv.got.reactions.some((c) => c['🔥'] >= 1));
    A.s.emit('live:react', { emoji: '💩' }); await sleep(300);
    check('un émoji hors liste est refusé', A.got.errors.some((e) => /inconnue/.test(e)));
    for (let i = 0; i < 4; i++) A.s.emit('live:react', { emoji: '👍' });
    await sleep(400);
    check('3 réactions par seconde au plus', A.got.errors.some((e) => /Doucement/.test(e)));

    // Couper le chat et les réactions chez un spectateur
    Bv.s.emit('live:prefs', { interactions: false }); await sleep(300);
    const before = Bv.got.chat.length, beforeR = Bv.got.reactions.length;
    M.s.emit('live:chat', { text: 'Bonne partie' }); A.s.emit('live:react', { emoji: '🏒' }); await sleep(1300);
    check('chat et réactions coupés : plus rien ne lui est envoyé', Bv.got.chat.length === before && Bv.got.reactions.length === beforeR && A.got.chat.some((m) => m.text === 'Bonne partie'));
    check('…mais il reste compté parmi les spectateurs', A.got.viewers === 3);
    Bv.s.emit('live:prefs', { interactions: true }); await sleep(500);

    // Équipe : supprimer, réduire au silence
    const target = A.got.chat.find((m) => m.text === 'Allez les Habs !');
    A.s.emit('live:delete', { id: target.id }); await sleep(300);
    check('un membre ne peut pas supprimer un message', !Bv.got.deleted.includes(target.id));
    M.s.emit('live:delete', { id: target.id }); await sleep(400);
    check('l\'équipe supprime un message chez tout le monde', Bv.got.deleted.includes(target.id) && A.got.deleted.includes(target.id));
    M.s.emit('live:mute', { userId: a.id, minutes: 10 }); await sleep(200);
    A.got.errors.length = 0; A.s.emit('live:chat', { text: 'encore moi' }); await sleep(300);
    check('un membre réduit au silence ne peut plus écrire', A.got.errors.some((e) => /silence/.test(e)));

    // Réglages de l'administration
    await call('PUT', '/admin/live/interactions', TA, { chat: false, reactions: false });
    await sleep(5500);
    const late = viewer(tok(b)); sockets.push(late.s); await late.join();
    check('chat et réactions désactivés par l\'administration', late.got.init.config.chat === false && late.got.init.config.reactions === false && late.got.init.messages.length === 0);
    late.s.emit('live:chat', { text: 'test' }); await sleep(300);
    check('…et refusés', late.got.errors.some((e) => /désactivé/.test(e)));
    await call('PUT', '/admin/live/interactions', TA, { chat: true, reactions: true });

    // Plus de diffusion : plus de chat
    await call('DELETE', `/admin/live/slots/${slot.id}`, TA);
    await sleep(5500);
    Bv.got.errors.length = 0; Bv.s.emit('live:chat', { text: 'quelqu\'un ?' }); await sleep(400);
    check('sans diffusion en cours, le chat est refusé', Bv.got.errors.some((e) => /Aucune diffusion/.test(e)));
  } finally {
    sockets.forEach((s) => s.close());
    await call('DELETE', '/admin/live/streams/' + (await p.liveStream.findFirst({ where: { name: 'Direct ' + tag } }))?.id, TA).catch(() => undefined);
    await p.liveStream.deleteMany({ where: { name: 'Direct ' + tag } });
    for (const [key, prev] of [['liveRelay', prevRelay], ['liveInteractions', prevInter]]) {
      if (prev) await p.siteSetting.update({ where: { key }, data: { value: prev.value } }); else await p.siteSetting.deleteMany({ where: { key } });
    }
    await p.activityLog.deleteMany({ where: { userId: admin.id, action: { startsWith: 'LIVE_' }, createdAt: { gt: new Date(Date.now() - 300_000) } } });
    await p.user.deleteMany({ where: { id: { in: [a.id, b.id, mod.id] } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
