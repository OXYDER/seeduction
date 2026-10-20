// Test de bout en bout : recherche dans le courriel étendue aux pièces jointes (nom, contenu texte) et aux contacts. Demande GreenMail (IMAP 127.0.0.1:3143, SMTP 127.0.0.1:3025, boîte « boite » / « secret »). Voir README.md.
const E2E = require('./lib.cjs'); E2E.guard();
const B = E2E.NODE_MODULES;
const { PrismaClient } = require(B + '@prisma/client');
const jwt = require(B + 'jsonwebtoken');
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
  const up = await new Promise((r) => { const s = require('net').connect(IMAP.port, IMAP.host); s.once('connect', () => { s.destroy(); r(true); }); s.once('error', () => r(false)); });
  if (!up) { console.log('IGNORÉ : aucun serveur de courriel de test sur 127.0.0.1:3143 (GreenMail)'); process.exit(0); }
  const p = new PrismaClient();
  const tag = 'cs' + Date.now().toString(36).slice(-4);
  const owner = await p.user.create({ data: { username: tag + 'o', email: tag + 'o@t.local', passwordHash: 'x', role: 'OWNER', createdAt: new Date(Date.now() - 30 * 86400_000) } });
  const T = tok(owner);

  const imap = new ImapFlow({ ...IMAP, secure: false, auth: { user: 'boite', pass: 'secret' }, logger: false }); imap.on('error', () => undefined);
  await imap.connect();
  for (const f of ['Sent', 'Archive', 'Trash']) { try { await imap.mailboxCreate(f); } catch { /* existe déjà */ } }
  for (const f of ['INBOX', 'Sent', 'Archive', 'Trash']) { const lock = await imap.getMailboxLock(f); try { await imap.messageDelete('1:*').catch(() => undefined); } finally { lock.release(); } }
  await imap.logout();

  const cfg = { label: 'Recherche ' + tag, imapHost: IMAP.host, imapPort: IMAP.port, imapSecure: false, smtpHost: SMTP.host, smtpPort: SMTP.port, smtpSecure: false, username: 'boite', password: 'secret', aliases: [{ address: 'contact@seeduction.test', name: 'Seeduction' }], signature: '' };
  const created = await call('POST', '/webmail/admin/mailboxes', T, cfg);
  const id = created.b.id;

  const tx = nodemailer.createTransport({ ...SMTP, secure: false, tls: { rejectUnauthorized: false } });
  const to = 'boite@seeduction.test';
  const send = (o) => tx.sendMail({ envelope: { from: o.fromAddr, to }, to, ...o, fromAddr: undefined });
  await send({ fromAddr: 'compta@exemple.org', from: 'Compta <compta@exemple.org>', subject: 'Facture octobre ' + tag, text: 'Voir la pièce jointe.', attachments: [{ filename: 'Résumé-ventes-' + tag + '.pdf', content: Buffer.from('%PDF-1.4 faux'), contentType: 'application/pdf' }] });
  await send({ fromAddr: 'data@exemple.org', from: 'Data <data@exemple.org>', subject: 'Export ' + tag, text: 'Les chiffres sont joints.', attachments: [{ filename: 'export.csv', content: 'client;montant\nDupont;120\nTremblay;75', contentType: 'text/csv' }] });
  await send({ fromAddr: 'jean@exemple.test', from: 'Jean Tremblay <jean@exemple.test>', subject: 'Salut ' + tag, text: 'Un petit bonjour.' });
  await send({ fromAddr: 'photo@exemple.org', from: 'Photo <photo@exemple.org>', subject: 'Image ' + tag, text: 'Voici.', attachments: [{ filename: 'vacances.png', content: Buffer.from([137, 80, 78, 71]), contentType: 'image/png' }] });
  await new Promise((r) => setTimeout(r, 1200));
  const search = (q, extra = '') => call('GET', `/webmail/mailboxes/${id}/messages?folder=INBOX&q=${encodeURIComponent(q)}${extra}`, T);

  const byName = await search('resume ventes ' + tag);
  check('par le nom d\'une pièce jointe, sans accents ni casse', byName.s === 200 && byName.b.items.length === 1 && byName.b.items[0].subject.startsWith('Facture') && byName.b.items[0].attachmentMatch?.via === 'nom' && /Résumé/.test(byName.b.items[0].attachmentMatch.filename), JSON.stringify(byName.b.items.map((i) => [i.subject, i.attachmentMatch])));
  const byExt = await search('.csv');
  check('par une extension de fichier', byExt.b.items.some((i) => i.subject.startsWith('Export')), JSON.stringify(byExt.b.items.map((i) => i.subject)));
  const content = await search('Tremblay;75');
  const hitsNoDeep = content.b.items.filter((i) => i.subject.startsWith('Export'));
  const contentDeep = await search('Tremblay;75', '&pj=contenu');
  const deepHit = contentDeep.b.items.find((i) => i.subject.startsWith('Export'));
  check('contenu d\'une pièce jointe texte : trouvé avec l\'option, signalé « contenu »', !!deepHit && deepHit.attachmentMatch?.via === 'contenu' && deepHit.attachmentMatch.filename === 'export.csv', JSON.stringify(contentDeep.b.items.map((i) => [i.subject, i.attachmentMatch])));
  check('sans l\'option, le contenu des pièces jointes n\'est pas lu', hitsNoDeep.length === 0 || hitsNoDeep[0].attachmentMatch === undefined, JSON.stringify(hitsNoDeep.map((i) => i.attachmentMatch)));
  const nothing = await search('introuvable-' + tag, '&pj=contenu');
  check('aucun faux résultat', nothing.s === 200 && nothing.b.items.length === 0 && nothing.b.total === 0);
  const contact = await search('tremblay');
  check('contacts correspondants proposés (nom ou adresse)', Array.isArray(contact.b.contacts) && contact.b.contacts.some((c) => c.address === 'jean@exemple.test' && /Jean/.test(c.name)), JSON.stringify(contact.b.contacts));
  check('la recherche par contact retrouve aussi ses courriels', contact.b.items.some((i) => i.subject.startsWith('Salut')), JSON.stringify(contact.b.items.map((i) => i.subject)));
  const normal = await search('Facture octobre ' + tag);
  check('une recherche sur le sujet marche toujours, sans pièce jointe signalée', normal.b.items.length === 1 && normal.b.items[0].attachmentMatch === undefined);
  check('sans recherche : pas de contacts, liste normale', (await call('GET', `/webmail/mailboxes/${id}/messages?folder=INBOX`, T)).b.contacts === undefined);

  await p.mailbox.delete({ where: { id } }).catch(() => undefined);
  await p.activityLog.deleteMany({ where: { userId: owner.id } });
  await p.user.delete({ where: { id: owner.id } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
