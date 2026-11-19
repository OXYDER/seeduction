// Test de bout en bout : avis aux membres avant le début d'une diffusion (Admin > Direct) et description de l'API d'envoi en tout format. Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const BASE = E2E.BASE;
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { s: r.status, b: j };
}

(async () => {
  const p = new PrismaClient();
  const tag = 'av' + Date.now().toString(36).slice(-5);
  const admin = await E2E.getAdmin(p, bcrypt);
  const member = await p.user.create({ data: { username: tag + 'm', email: tag + 'm@t.local', passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 30 * 86400_000) } });
  const muted = await p.user.create({ data: { username: tag + 'q', email: tag + 'q@t.local', passwordHash: 'x', role: 'USER', createdAt: new Date(Date.now() - 30 * 86400_000), notifPrefs: { announcements: false } } });
  const TA = tok(admin);
  const prevRelay = await p.siteSetting.findUnique({ where: { key: 'liveRelay' } });
  await p.liveStream.deleteMany({ where: { name: { startsWith: 'Avis ' } } });
  const slots = [];
  try {
    const cfg = await call('PUT', '/admin/live/config', TA, { enabled: true, controlUrl: 'http://127.0.0.1:9/controle', secret: 'x', playbackUrl: 'https://relais.test/live/x/index.m3u8', notifyMinutes: 10 });
    check('le réglage « prévenir N minutes avant » est enregistré', cfg.s === 200 && cfg.b.notifyMinutes === 10, JSON.stringify(cfg.b?.notifyMinutes));
    const st = (await call('POST', '/admin/live/streams', TA, { name: 'Avis ' + tag, url: 'http://100.64.0.2:9191/s/' + tag })).b;
    const soon = await call('POST', '/admin/live/slots', TA, { streamId: st.id, title: 'Canadiens ' + tag, startsAt: new Date(Date.now() + 6 * 60_000).toISOString(), durationMin: 60 });
    const far = await call('POST', '/admin/live/slots', TA, { streamId: st.id, title: 'Plus tard ' + tag, startsAt: new Date(Date.now() + 90 * 60_000).toISOString(), durationMin: 60 });
    slots.push(soon.b?.id, far.b?.id);
    check('les diffusions sont créées', soon.s < 300 && far.s < 300, `${soon.s}/${far.s}`);

    // Le site vérifie toutes les 20 s.
    let list = [];
    for (let i = 0; i < 40 && !list.length; i++) { await sleep(1000); list = await p.notification.findMany({ where: { userId: member.id, title: { contains: tag } } }); }
    check('le membre est prévenu avant le début', list.length === 1, `${list.length}`);
    check('…avec le titre, le délai et le lien vers Canadiens en direct', /Canadiens/.test(list[0]?.title ?? '') && /dans \d+ min/.test(list[0]?.title ?? '') && list[0]?.link === '/canadiens-en-direct', JSON.stringify(list[0]?.title));
    check('…rangé dans « Nouvelles et événements »', list[0]?.category === 'announcements');
    check('la diffusion lointaine ne prévient pas encore', !(await p.notification.findFirst({ where: { userId: member.id, title: { contains: 'Plus tard ' + tag } } })));
    check('un membre qui a coupé cette catégorie n\'est pas dérangé', !(await p.notification.findFirst({ where: { userId: muted.id, title: { contains: tag } } })));
    await sleep(45_000);
    check('une seule fois par diffusion', (await p.notification.count({ where: { userId: member.id, title: { contains: tag } } })) === 1);

    const off = await call('PUT', '/admin/live/config', TA, { notifyMinutes: 0 });
    check('0 minute : le réglage est conservé', off.b?.notifyMinutes === 0);
  } finally {
    for (const id of slots.filter(Boolean)) await call('DELETE', '/admin/live/slots/' + id, TA).catch(() => undefined);
    const stream = await p.liveStream.findFirst({ where: { name: 'Avis ' + tag } });
    if (stream) await call('DELETE', '/admin/live/streams/' + stream.id, TA).catch(() => undefined);
    await p.liveStream.deleteMany({ where: { name: 'Avis ' + tag } });
    if (prevRelay) await p.siteSetting.update({ where: { key: 'liveRelay' }, data: { value: prevRelay.value } }); else await p.siteSetting.deleteMany({ where: { key: 'liveRelay' } });
    await p.siteSetting.deleteMany({ where: { key: 'liveReminded' } });
    await p.notification.deleteMany({ where: { OR: [{ title: { contains: tag } }, { userId: { in: [member.id, muted.id] } }] } });
    await p.activityLog.deleteMany({ where: { userId: admin.id, action: { startsWith: 'LIVE_' }, createdAt: { gt: new Date(Date.now() - 300_000) } } });
    await p.user.deleteMany({ where: { id: { in: [member.id, muted.id] } } }).catch(() => undefined);
    await p.$disconnect();
  }
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
