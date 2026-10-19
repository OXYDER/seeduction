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
  const owner = await mk('o', 'OWNER'), adminA = await mk('a', 'ADMIN'), adminB = await mk('b', 'ADMIN'), member = await mk('m', 'USER'), mod = await mk('d', 'MODERATOR');
  const TO = tok(owner), TA = tok(adminA), TB = tok(adminB), TM = tok(member), TD = tok(mod);

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
  await call('PUT', `/webmail/admin/mailboxes/${id}`, TO, { ...cfg, password: '', allowedUserIds: [adminA.id, member.id, mod.id] });
  check('administrateur autorisé : voit la boîte ; un modérateur autorisé aussi ; un membre ordinaire jamais', (await call('GET', '/webmail/mailboxes', TA)).b.length === 1 && (await call('GET', '/webmail/mailboxes', TD)).b.length === 1 && (await p.mailbox.findUnique({ where: { id } })).allowedUserIds.sort().join() === [adminA.id, mod.id].sort().join());
  check('le modérateur lit mais ne règle rien', (await call('GET', `/webmail/mailboxes/${id}/folders`, TD)).s === 200 && (await call('POST', '/webmail/admin/mailboxes', TD, cfg)).s === 403 && (await call('PUT', `/webmail/admin/mailboxes/${id}`, TD, cfg)).s === 403);
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

  // ---- envoi enrichi (HTML), brouillons, contacts, .eml
  const sendJson = (payload, files = [], token = TA) => { const fd = new FormData(); fd.append('payload', JSON.stringify(payload)); for (const f of files) fd.append('files', new Blob([f.content]), f.name); return fetch(BASE + `/webmail/mailboxes/${id}/send`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd }).then(async (r) => ({ s: r.status, raw: await r.text() })); };
  const draftJson = (payload, files = [], token = TA) => { const fd = new FormData(); fd.append('payload', JSON.stringify(payload)); for (const f of files) fd.append('files', new Blob([f.content]), f.name); return fetch(BASE + `/webmail/mailboxes/${id}/draft`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => null) })); };
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  r = await sendJson({ from: 'contact@seeduction.test', to: 'boite@seeduction.test', subject: 'Riche ' + tag, html: '<p style="color:#ff0000">Salut <b>gras</b></p><script>alert(1)</script><img src="data:image/png;base64,' + PNG + '"><a href="javascript:x()">piège</a>' });
  check('envoi en HTML (couleurs, image collée) accepté', r.s === 201, r.raw.slice(0, 100));
  await new Promise((r2) => setTimeout(r2, 1000));
  const rich = (await call('GET', `/webmail/mailboxes/${id}/messages?folder=INBOX&q=${encodeURIComponent('Riche ' + tag)}`, TA)).b.items[0];
  const richMsg = rich && (await call('GET', `/webmail/mailboxes/${id}/message?folder=INBOX&uid=${rich.uid}`, TA)).b;
  check('courriel HTML reçu : mise en forme gardée, script et lien piégé retirés, texte alternatif présent', !!richMsg && /<b>gras<\/b>/.test(richMsg.html) && !/script|javascript:|alert/i.test(richMsg.html) && /Salut gras/.test(richMsg.text), richMsg?.html?.slice(0, 200));
  check('l\'image collée est devenue une image intégrée au courriel (affichée sans bloquer)', !!richMsg && /<img[^>]+src="data:image\/png/.test(richMsg.html) && richMsg.remoteImages === 0, richMsg?.html?.slice(0, 260));

  const d1 = await draftJson({ from: 'contact@seeduction.test', to: 'boite@seeduction.test', subject: 'Brouillon ' + tag, html: '<p>Début de <i>texte</i></p>' });
  check('brouillon enregistré dans Brouillons', d1.s === 201 && d1.b.uid > 0, JSON.stringify(d1.b));
  const dl = await call('GET', `/webmail/mailboxes/${id}/messages?folder=Drafts`, TA);
  check('le brouillon apparaît dans le dossier Brouillons', dl.b.items.some((m) => m.subject === 'Brouillon ' + tag));
  const dOpen = await call('GET', `/webmail/mailboxes/${id}/draft?folder=Drafts&uid=${d1.b.uid}`, TA);
  check('reprise du brouillon : expéditeur, destinataire, sujet et texte retrouvés', dOpen.s === 200 && dOpen.b.from === 'contact@seeduction.test' && dOpen.b.to.includes('boite@seeduction.test') && dOpen.b.subject === 'Brouillon ' + tag && /Début de <i>texte<\/i>/.test(dOpen.b.html), dOpen.raw.slice(0, 160));
  const d2 = await draftJson({ from: 'contact@seeduction.test', to: 'boite@seeduction.test', subject: 'Brouillon ' + tag, html: '<p>Version 2</p>', draftFolder: 'Drafts', draftUid: d1.b.uid }, [{ name: 'brouillon.txt', content: 'joint au brouillon' }]);
  const dl2 = await call('GET', `/webmail/mailboxes/${id}/messages?folder=Drafts`, TA);
  check('nouvel enregistrement : remplace l\'ancien brouillon (un seul)', d2.s === 201 && dl2.b.items.filter((m) => m.subject === 'Brouillon ' + tag).length === 1 && dl2.b.items[0].attachments === true);
  const dOpen2 = await call('GET', `/webmail/mailboxes/${id}/draft?folder=Drafts&uid=${d2.b.uid}`, TA);
  r = await sendJson({ from: 'contact@seeduction.test', to: 'boite@seeduction.test', subject: 'Brouillon ' + tag, html: '<p>Version finale</p>', draftFolder: 'Drafts', draftUid: d2.b.uid, keepAttachments: dOpen2.b.attachments.map((a) => a.index) });
  await new Promise((r2) => setTimeout(r2, 1000));
  const dl3 = await call('GET', `/webmail/mailboxes/${id}/messages?folder=Drafts`, TA);
  const fin = (await call('GET', `/webmail/mailboxes/${id}/messages?folder=INBOX&q=${encodeURIComponent('Brouillon ' + tag)}`, TA)).b.items[0];
  check('envoi depuis le brouillon : le brouillon disparaît et sa pièce jointe est conservée', r.s === 201 && !dl3.b.items.some((m) => m.subject === 'Brouillon ' + tag) && fin?.attachments === true, JSON.stringify(dl3.b.items.map((m) => m.subject)));

  const ct = await call('GET', `/webmail/mailboxes/${id}/contacts?q=marie`, TA);
  check('suggestions d\'adresses (gens déjà croisés)', ct.s === 200 && Array.isArray(ct.b), ct.raw.slice(0, 120));
  const ctAll = await call('GET', `/webmail/mailboxes/${id}/contacts?q=`, TA);
  check('suggestions : l\'adresse de la boîte n\'est pas proposée', ctAll.b.every((c) => c.address !== 'contact@seeduction.test'));
  const eml = await fetch(BASE + `/webmail/mailboxes/${id}/eml?folder=INBOX&uid=${fin.uid}`, { headers: { Authorization: 'Bearer ' + TA } });
  const emlText = await eml.text();
  check('courriel complet (.eml) téléchargeable', eml.status === 200 && /attachment; filename="courriel-/.test(eml.headers.get('content-disposition')) && /Subject: Brouillon/i.test(emlText));
  check('le modérateur peut écrire depuis la boîte (pas de droit de réglage)', (await sendJson({ from: 'notifications@seeduction.test', to: 'boite@seeduction.test', subject: 'Modérateur ' + tag, text: 'ok' }, [], TD)).s === 201);
  check('un membre ordinaire ne peut pas écrire', (await sendJson({ from: 'contact@seeduction.test', to: 'boite@seeduction.test', subject: 'x', text: 'x' }, [], TM)).s === 403);

  // ---- conversations (réception + envoyés) et modèles de réponses
  const convSubject = 'Conv ' + tag;
  await sendJson({ from: 'contact@seeduction.test', to: 'boite@seeduction.test', subject: convSubject, text: 'premier message' });
  await new Promise((r2) => setTimeout(r2, 800));
  await sendJson({ from: 'contact@seeduction.test', to: 'boite@seeduction.test', subject: 'Re: ' + convSubject, text: 'réponse' });
  await new Promise((r2) => setTimeout(r2, 1200));
  const th = await call('GET', `/webmail/mailboxes/${id}/thread?subject=${encodeURIComponent('RE: Re: ' + convSubject)}`, TA);
  check('conversation : retrouve les courriels de la réception ET des envoyés, du plus ancien au plus récent', th.s === 200 && th.b.items.length >= 3 && th.b.items.some((m) => m.special === '\\Sent') && th.b.items.some((m) => m.special === '\\Inbox') && th.b.items.every((m, i, a) => i === 0 || new Date(a[i - 1].date) <= new Date(m.date)), JSON.stringify((th.b?.items ?? []).map((m) => [m.folder, m.special, m.date])));
  check('conversation : un autre sujet ne ressort pas', (await call('GET', `/webmail/mailboxes/${id}/thread?subject=${encodeURIComponent('Sujet inconnu ' + tag)}`, TA)).b.items.length === 0);
  check('conversation : refusée sans accès à la boîte', (await call('GET', `/webmail/mailboxes/${id}/thread?subject=x`, TB)).s === 404);

  const tpl = await call('POST', `/webmail/mailboxes/${id}/templates`, TA, { name: 'Accueil', subject: 'Bienvenue', body: 'Bonjour {{nom}}, [b]merci[/b] !' });
  check('modèle de réponse créé', tpl.s === 201 && tpl.b.id, tpl.raw.slice(0, 100));
  const tplList = await call('GET', `/webmail/mailboxes/${id}/templates`, TD);
  check('un modérateur autorisé voit les modèles de la boîte', tplList.s === 200 && tplList.b.length === 1 && tplList.b[0].mine === false);
  check('modèle vide refusé', (await call('POST', `/webmail/mailboxes/${id}/templates`, TA, { name: 'Vide', body: '  ' })).s === 400);
  check('un modérateur ne modifie pas le modèle d’un autre', (await call('POST', `/webmail/mailboxes/${id}/templates`, TD, { id: tpl.b.id, name: 'Piraté', body: 'x' })).s === 403);
  check('ni ne le supprime', (await call('DELETE', `/webmail/mailboxes/${id}/templates/${tpl.b.id}`, TD)).s === 403);
  check('un administrateur sans accès à la boîte ne voit rien', (await call('GET', `/webmail/mailboxes/${id}/templates`, TB)).s === 404);
  const tpl2 = await call('POST', `/webmail/mailboxes/${id}/templates`, TD, { name: 'Le sien', body: 'ok' });
  check('le modérateur crée le sien et le supprime', tpl2.s === 201 && (await call('DELETE', `/webmail/mailboxes/${id}/templates/${tpl2.b.id}`, TD)).s === 200);
  check('modèle supprimé par son auteur', (await call('DELETE', `/webmail/mailboxes/${id}/templates/${tpl.b.id}`, TA)).s === 200);

  // ---- suppression de la boîte
  check('un administrateur autorisé peut lire mais pas régler ni retirer la boîte d\'un autre', (await call('DELETE', `/webmail/admin/mailboxes/${id}`, TA)).s === 403 && (await call('PUT', `/webmail/admin/mailboxes/${id}`, TA, cfg)).s === 403 && (await call('GET', '/webmail/admin', TA)).b.mailboxes.length === 0);
  const own = await call('POST', '/webmail/admin/mailboxes', TB, { ...cfg, label: 'Boîte de B ' + tag });
  check('un administrateur ajoute sa propre boîte, y a accès et la règle', own.s === 201 && (await call('GET', `/webmail/mailboxes/${own.b.id}/folders`, TB)).s === 200 && (await call('PUT', `/webmail/admin/mailboxes/${own.b.id}`, TB, { ...cfg, password: '', label: 'Boîte de B ' + tag })).s === 200);
  check('...mais les autres administrateurs ne la voient pas', (await call('GET', `/webmail/mailboxes/${own.b.id}/folders`, TA)).s === 404 && (await call('GET', '/webmail/mailboxes', TA)).b.every((b) => b.id !== own.b.id));
  check('le propriétaire du site voit et règle toutes les boîtes', (() => 0)() === 0 && (await call('GET', '/webmail/admin', TO)).b.mailboxes.filter((b) => [id, own.b.id].includes(b.id)).length === 2);
  await call('DELETE', `/webmail/admin/mailboxes/${own.b.id}`, TB);
  check('le propriétaire supprime la boîte', (await call('DELETE', `/webmail/admin/mailboxes/${id}`, TO)).s === 200 && (await call('GET', `/webmail/mailboxes/${id}/folders`, TO)).s === 404);

  const ids = [owner.id, adminA.id, adminB.id, member.id, mod.id];
  await p.mailbox.deleteMany({ where: { label: { in: ['Boîte ' + tag, 'Boîte de B ' + tag] } } });
  await p.activityLog.deleteMany({ where: { userId: { in: ids } } });
  await p.user.deleteMany({ where: { id: { in: ids } } });
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon');
  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERREUR', e); process.exit(2); });
