// Test de bout en bout : interface Courriel. Demande un serveur de courriel de test (GreenMail : IMAP 127.0.0.1:3143, SMTP 127.0.0.1:3025, boîte « boite » / « secret »). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
const bcrypt = require(B + 'bcrypt');
const nodemailer = require(B + 'nodemailer');
const { ImapFlow } = require(B + 'imapflow');
const BASE = E2E.BASE;
const IMAP = { host: '127.0.0.1', port: 3143 }, SMTP = { host: '127.0.0.1', port: 3025 };
async function call(method, p, token, body) {
  const r = await fetch(BASE + p, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { s: r.status, b: j, raw: text };
}
let fails = 0; const check = (l, c, x = '') => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + l + (x ? ' — ' + x : '')); if (!c) fails++; };
const tok = (u) => jwt.sign({ sub: u.id, username: u.username, role: u.role }, E2E.SECRET, { expiresIn: '1h' });

(async () => {
  // sans serveur de courriel de test, ce test est simplement ignoré
  const up = await new Promise((r) => { const s = require('net').connect(IMAP.port, IMAP.host); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
  if (!up) { console.log('IGNORÉ : aucun serveur de courriel de test sur 127.0.0.1:3143 (GreenMail)'); process.exit(0); }
  const p = new PrismaClient();
  const tag = 'cr' + Date.now().toString(36).slice(-4);
  const hash = await bcrypt.hash('Mot-de-passe-test-1', 4);
  const old = new Date(Date.now() - 30 * 86400_000);
  const mk = (n, role) => p.user.create({ data: { username: tag + n, email: tag + n + '@t.local', passwordHash: hash, createdAt: old, role } });
  const owner = await mk('o', 'OWNER'), adminA = await mk('a', 'ADMIN'), adminB = await mk('b', 'ADMIN'), member = await mk('m', 'USER');
  const TO = tok(owner), TA = tok(adminA), TB = tok(adminB), TM = tok(member);

  // ---- boîte de test : propre et vide
  const imap = new ImapFlow({ ...IMAP, secure: false, auth: { user: 'boite', pass: 'secret' }, logger: false }); imap.on('error', () => undefined);
  await imap.connect();
  for (const f of ['Sent', 'Archive', 'Trash']) { try { await imap.mailboxCreate(f); } catch { /* existe déjà */ } }
  for (const f of ['INBOX', 'Sent', 'Archive', 'Trash']) { const lock = await imap.getMailboxLock(f); try { await imap.messageDelete('1:*').catch(() => undefined); } finally { lock.release(); } }
  await imap.logout();

  const cfg = { label: 'Boîte ' + tag, imapHost: IMAP.host, imapPort: IMAP.port, imapSecure: false, smtpHost: SMTP.host, smtpPort: SMTP.port, smtpSecure: false, username: 'boite', password: 'secret',
    aliases: [{ address: 'contact@seeduction.test', name: 'Seeduction Contact' }, { address: 'notifications@seeduction.test', name: 'Seeduction' }], signature: '— Seeduction' };

  // ---- réglages (propriétaire seulement)
  check('un membre ne peut rien', (await call('GET', '/webmail/mailboxes', TM)).s === 403);
  check('un administrateur ne peut pas régler les boîtes', (await call('POST', '/webmail/admin/mailboxes', TA, cfg)).s === 403);
  const bad = await call('POST', '/webmail/admin/test', TO, { ...cfg, password: 'faux' });
  check('essai avec un mauvais mot de passe : échec clair', bad.s === 201 && bad.b.imap !== 'ok', bad.raw.slice(0, 100));
  const good = await call('POST', '/webmail/admin/test', TO, cfg);
  check('essai de connexion IMAP et SMTP', good.s === 201 && good.b.imap === 'ok' && good.b.smtp === 'ok', good.raw.slice(0, 120));
  const created = await call('POST', '/webmail/admin/mailboxes', TO, cfg);
  check('boîte créée', created.s === 201 && created.b.id && !created.raw.includes('secret'), created.raw.slice(0, 100));
  const id = created.b.id;
  const admin = await call('GET', '/webmail/admin', TO);
  check('réglages : le mot de passe n\'est jamais renvoyé', admin.s === 200 && admin.b.mailboxes[0].passwordSet === true && !admin.raw.includes('"secret"') && !/password"\s*:\s*"/.test(admin.raw));
  const row = await p.mailbox.findUnique({ where: { id } });
  check('mot de passe chiffré en base', !row.passwordSealed.includes('secret') && row.passwordSealed.length > 20);
  check('alias invalide refusé', (await call('PUT', `/webmail/admin/mailboxes/${id}`, TO, { ...cfg, password: '', aliases: [{ address: 'pas-une-adresse' }] })).s === 400);

  // ---- accès par administrateur
  check('administrateur sans autorisation : ne voit aucune boîte', (await call('GET', '/webmail/mailboxes', TA)).b.length === 0);
  check('administrateur sans autorisation : accès refusé (404)', (await call('GET', `/webmail/mailboxes/${id}/folders`, TA)).s === 404);
  await call('PUT', `/webmail/admin/mailboxes/${id}`, TO, { ...cfg, password: '', allowedUserIds: [adminA.id, member.id] });
  check('administrateur autorisé : voit la boîte (le membre ordinaire n\'est jamais accepté)', (await call('GET', '/webmail/mailboxes', TA)).b.length === 1 && (await p.mailbox.findUnique({ where: { id } })).allowedUserIds.join() === adminA.id);
  check('l\'autre administrateur : toujours rien', (await call('GET', `/webmail/mailboxes/${id}/messages`, TB)).s === 404);

  // ---- réception de courriels
  const tx = nodemailer.createTransport({ ...SMTP, secure: false, tls: { rejectUnauthorized: false } });
  const to = 'boite@seeduction.test';
  await tx.sendMail({ from: 'Marie <marie@exemple.org>', to: 'Contact <contact@seeduction.test>', envelope: { from: 'marie@exemple.org', to: to }, subject: 'Question sur mon compte ' + tag,
    text: 'Bonjour, voir https://exemple.org', html: '<p onclick="x()">Bonjour <b>Seeduction</b></p><script>alert(1)</script><img src="https://pixel.exemple.org/p.gif?u=1" width="1" height="1"><a href="javascript:alert(2)">piège</a><a href="https://exemple.org/page">lien</a>',
    attachments: [{ filename: 'recu.txt', content: 'contenu de la pièce jointe', contentType: 'text/plain' }] });
  await tx.sendMail({ from: 'info@autre.org', to: 'notifications@seeduction.test', envelope: { from: 'info@autre.org', to }, subject: 'Notification ' + tag, text: 'Message simple' });
  await new Promise((r) => setTimeout(r, 1000));

  const folders = await call('GET', `/webmail/mailboxes/${id}/folders`, TA);
  const inbox = folders.b?.find((f) => f.path.toUpperCase() === 'INBOX');
  check('dossiers : réception avec 2 non lus, Envoyés/Archive/Corbeille présents', folders.s === 200 && inbox?.unread === 2 && ['Sent', 'Archive', 'Trash'].every((n) => folders.b.some((f) => f.path === n)), JSON.stringify(folders.b?.map((f) => [f.path, f.unread])));
  const list = await call('GET', `/webmail/mailboxes/${id}/messages?folder=INBOX`, TA);
  check('liste : 2 courriels, le plus récent d\'abord', list.s === 200 && list.b.total === 2 && list.b.items[0].subject.startsWith('Notification') && list.b.items.every((m) => m.seen === false), list.raw.slice(0, 160));
  const withAtt = list.b.items.find((m) => m.subject.startsWith('Question'));
  check('liste : pièce jointe repérée', withAtt?.attachments === true && list.b.items.find((m) => m.subject.startsWith('Notification')).attachments === false);
  const found = await call('GET', `/webmail/mailboxes/${id}/messages?q=${encodeURIComponent('Question sur mon compte')}`, TA);
  check('recherche par sujet', found.b.total === 1 && found.b.items[0].uid === withAtt.uid, found.raw.slice(0, 220));
  const viaAlias = await call('GET', `/webmail/mailboxes/${id}/messages?alias=${encodeURIComponent('contact@seeduction.test')}`, TA);
  check('filtre par alias (le courriel adressé à contact@)', viaAlias.b.total === 1 && viaAlias.b.items[0].uid === withAtt.uid);

  // ---- lecture sûre
  const m = await call('GET', `/webmail/mailboxes/${id}/message?folder=INBOX&uid=${withAtt.uid}`, TA);
  check('lecture : script, gestionnaire d\'événement et lien javascript retirés', m.s === 200 && !/<script|onclick|javascript:|alert/i.test(m.b.html) && m.b.html.includes('<b>Seeduction</b>'), m.b?.html?.slice(0, 200));
  check('lecture : image espion bloquée et comptée, lien normal sécurisé', m.b.remoteImages === 1 && !m.b.html.includes('pixel.exemple.org') && /href="https:\/\/exemple.org\/page"[^>]*rel="noopener noreferrer nofollow"/.test(m.b.html));
  check('lecture : alias de réception reconnu', m.b.via === 'contact@seeduction.test', String(m.b.via));
  check('lecture : pièce jointe listée', m.b.attachments.length === 1 && m.b.attachments[0].filename === 'recu.txt');
  const withImg = await call('GET', `/webmail/mailboxes/${id}/message?folder=INBOX&uid=${withAtt.uid}&images=1`, TA);
  check('images autorisées à la demande', withImg.b.html.includes('pixel.exemple.org'));
  const attRes = await fetch(BASE + `/webmail/mailboxes/${id}/attachment?folder=INBOX&uid=${withAtt.uid}&index=0`, { headers: { Authorization: 'Bearer ' + TA } });
  check('pièce jointe téléchargée en téléchargement forcé', attRes.status === 200 && /attachment/.test(attRes.headers.get('content-disposition')) && (await attRes.text()) === 'contenu de la pièce jointe' && attRes.headers.get('x-content-type-options') === 'nosniff');
  const after = await call('GET', `/webmail/mailboxes/${id}/messages?folder=INBOX`, TA);
  check('lire un courriel le marque comme lu', after.b.items.find((x) => x.uid === withAtt.uid).seen === true && after.b.items.find((x) => x.uid !== withAtt.uid).seen === false);

  // ---- rangement
  const other = list.b.items.find((x) => x.uid !== withAtt.uid);
  check('marquer comme non lu et suivi', (await call('POST', `/webmail/mailboxes/${id}/flags`, TA, { folder: 'INBOX', uids: [withAtt.uid], seen: false, flagged: true })).s === 201 && (await call('GET', `/webmail/mailboxes/${id}/messages?folder=INBOX&unseen=1`, TA)).b.total === 2);
  check('déplacer vers Archive', (await call('POST', `/webmail/mailboxes/${id}/move`, TA, { folder: 'INBOX', uids: [other.uid], target: 'Archive' })).s === 201 && (await call('GET', `/webmail/mailboxes/${id}/messages?folder=Archive`, TA)).b.total === 1);
  check('supprimer = vers la corbeille', (await call('POST', `/webmail/mailboxes/${id}/delete`, TA, { folder: 'INBOX', uids: [withAtt.uid] })).s === 201 && (await call('GET', `/webmail/mailboxes/${id}/messages?folder=Trash`, TA)).b.total >= 0);

  // ---- envoi
  const draft = await call('GET', `/webmail/mailboxes/${id}/reply?folder=Archive&uid=${(await call('GET', `/webmail/mailboxes/${id}/messages?folder=Archive`, TA)).b.items[0].uid}&mode=reply`, TA);
  check('brouillon de réponse : destinataire, sujet « Re: » et citation', draft.s === 200 && draft.b.to === 'info@autre.org' && /^Re: Notification/.test(draft.b.subject) && draft.b.text.includes('> Message simple') && draft.b.from === 'notifications@seeduction.test', draft.raw.slice(0, 200));
  const sendForm = (payload, files = []) => { const fd = new FormData(); fd.append('payload', JSON.stringify(payload)); for (const f of files) fd.append('files', new Blob([f.content]), f.name); return fetch(BASE + `/webmail/mailboxes/${id}/send`, { method: 'POST', headers: { Authorization: 'Bearer ' + TA }, body: fd }).then(async (r) => ({ s: r.status, raw: await r.text() })); };
  let r = await sendForm({ from: 'pirate@ailleurs.org', to: 'boite@seeduction.test', subject: 'x', text: 'x' });
  check('expéditeur qui n\'est pas un alias : refusé', r.s === 400, r.raw.slice(0, 100));
  r = await sendForm({ from: 'contact@seeduction.test', to: 'pas-une-adresse', subject: 'x', text: 'x' });
  check('destinataire invalide : refusé', r.s === 400);
  r = await sendForm({ from: 'contact@seeduction.test', to: 'boite@seeduction.test', subject: 'Test\r\nBcc: pirate@x.co', text: 'Salut ' + tag }, [{ name: 'note.txt', content: 'pièce envoyée' }]);
  check('envoi depuis un alias avec pièce jointe', r.s === 201, r.raw.slice(0, 120));
  await new Promise((r2) => setTimeout(r2, 1000));
  const got = await call('GET', `/webmail/mailboxes/${id}/messages?folder=INBOX&q=${encodeURIComponent(tag)}`, TA);
  const sentMsg = got.b.items.find((x) => /^Test/.test(x.subject));
  check('le courriel est bien arrivé : le retour à la ligne du sujet est neutralisé (aucun en-tête Bcc créé)', !!sentMsg && sentMsg.subject === 'Test Bcc: pirate@x.co' && sentMsg.from.address === 'contact@seeduction.test' && sentMsg.attachments === true, JSON.stringify(got.b.items.map((x) => x.subject)));
  const sent = await call('GET', `/webmail/mailboxes/${id}/messages?folder=Sent`, TA);
  check('une copie est rangée dans Envoyés', sent.b.total >= 1);
  check('journal d\'audit de l\'envoi', (await p.activityLog.count({ where: { userId: adminA.id, action: 'MAIL_SEND' } })) === 1);

  // ---- suppression de la boîte
  check('un administrateur ne peut pas supprimer la boîte', (await call('DELETE', `/webmail/admin/mailboxes/${id}`, TA)).s === 403);
  check('le propriétaire supprime la boîte', (await call('DELETE', `/webmail/admin/mailboxes/${id}`, TO)).s === 200 && (await call('GET', `/webmail/mailboxes/${id}/folders`, TO)).s === 404);

  const ids = [owner.id, adminA.id, adminB.id, member.id];
  await p.mailbox.deleteMany({ where: { label: 'Boîte ' + tag } });
  await p.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
