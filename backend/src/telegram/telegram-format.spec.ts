import { escapeHtml, freeleechHtml, INVITE_URL, isStartCommand, newsHtml, outboundMessage, parseLinkCode, parseUpdate, torrentHtml } from './telegram-format';
import { TOKEN_FORMAT, openToken, sealToken } from './telegram-api';

const SITE = 'https://seeduction.example';
const base = { type: 'TEXT', content: 'Salut <tout le monde> & co', sender: { username: 'Alice' } };

describe('Seeduction vers Telegram', () => {
  it('texte : pseudo en gras, contenu échappé', () => {
    const o = outboundMessage(base, SITE);
    expect(o.kind).toBe('text');
    expect(o.text).toBe('<b>Alice</b> : Salut &lt;tout le monde&gt; &amp; co');
  });

  it('un pseudo ou un texte ne peut pas injecter de balise', () => {
    expect(outboundMessage({ ...base, sender: { username: '<script>' }, content: '<b>x</b>' }, SITE).text).toBe('<b>&lt;script&gt;</b> : &lt;b&gt;x&lt;/b&gt;');
  });

  it('torrent partagé : nom et lien ; torrent adulte : jamais détaillé, lien retiré du texte', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const ok = outboundMessage({ ...base, content: '', torrent: { id, adult: false, name: 'Mon Film 2020' } }, SITE);
    expect(ok.text).toContain('🎬 Mon Film 2020');
    expect(ok.text).toContain(`${SITE}/torrents/${id}`);
    const adult = outboundMessage({ ...base, content: `regarde ${SITE}/torrents/${id}`, torrent: { id, adult: true } }, SITE);
    expect(adult.text).toContain('Contenu adulte');
    expect(adult.text).not.toContain(id);
    expect(adult.text).not.toContain('Mon Film');
  });

  it('image du site : envoyée par adresse seulement si le site est en https, sinon texte', () => {
    const img = { ...base, type: 'IMAGE', content: 'ma photo', imageUrl: '/api/covers/a.webp' };
    expect(outboundMessage(img, SITE)).toMatchObject({ kind: 'photo', mediaUrl: `${SITE}/api/covers/a.webp` });
    const local = outboundMessage(img, 'http://localhost:5173');
    expect(local.kind).toBe('text');
    expect(local.text).toContain('Image à voir sur Seeduction');
    expect(outboundMessage({ ...img, type: 'GIF', imageUrl: 'https://media.klipy.com/x.gif' }, SITE)).toMatchObject({ kind: 'animation', mediaUrl: 'https://media.klipy.com/x.gif' });
  });

  it('fichier et vocal : jamais copiés', () => {
    expect(outboundMessage({ ...base, type: 'FILE', fileName: 'secret.zip' }, SITE).text).toContain('secret.zip');
    expect(outboundMessage({ ...base, type: 'VOICE' }, SITE).text).toContain('Message vocal');
  });

  it('messages très longs coupés à la limite de Telegram', () => {
    expect(outboundMessage({ ...base, content: 'x'.repeat(9000) }, SITE).text.length).toBeLessThanOrEqual(4000);
  });
});

describe('annonces', () => {
  it('nouvelle : titre, chapeau sans BBCode, lien', () => {
    const t = newsHtml({ id: 'n1', title: 'Mise à jour <v2>', kind: 'UPDATE', summary: null, content: '[b]Gros[/b] changement\n\nvoir [url=x]ici[/url]' }, SITE);
    expect(t).toContain('🛠️ <b>Mise à jour &lt;v2&gt;</b>');
    expect(t).toContain('Gros changement voir ici');
    expect(t).toContain(`href="${SITE}/news/n1"`);
  });

  it('freeleech : durée et message', () => {
    const t = freeleechHtml({ title: "L'action de grâce", message: '[i]24 h[/i]', endsAt: '2026-10-13T04:00:00Z' }, SITE);
    expect(t).toContain("🎉 <b>L'action de grâce</b>");
    expect(t).toContain('Freeleech global jusqu');
    expect(t).toContain('ratio');
  });

  it('torrent : taille lisible', () => {
    expect(torrentHtml({ id: 't', name: 'Film.2024', category: 'Films', size: 3 * 1024 ** 3 }, SITE)).toContain('Films · 3.00 Go');
    expect(torrentHtml({ id: 't', name: 'Petit', size: 5 * 1024 ** 2 }, SITE)).toContain('5 Mo');
  });
});

describe('Telegram vers Seeduction', () => {
  const msg = (extra: any = {}) => ({ update_id: 1, message: { message_id: 7, date: 1, chat: { id: -100123, type: 'supergroup', title: 'Seeduction' }, from: { id: 42, username: 'bob', first_name: 'Bob', is_bot: false }, text: 'salut', ...extra } });

  it('texte, réponse et auteur', () => {
    const e = parseUpdate(msg({ reply_to_message: { message_id: 3 } }))!;
    expect(e).toMatchObject({ kind: 'message', text: 'salut', messageId: 7, replyToMessageId: 3, from: { id: '42', username: 'bob', isBot: false }, chat: { id: '-100123', type: 'supergroup' } });
  });

  it('photo : la plus grande taille ; légende comme texte', () => {
    const e = parseUpdate(msg({ text: undefined, caption: 'regarde', photo: [{ file_id: 'p1' }, { file_id: 'p2' }] }))!;
    expect(e.photoFileId).toBe('p2');
    expect(e.text).toBe('regarde');
    expect(parseUpdate(msg({ text: '', caption: 'avec champ vide', photo: [{ file_id: 'p' }] }))!.text).toBe('avec champ vide');
  });

  it('autres médias signalés, messages de service ignorés, modification reconnue', () => {
    expect(parseUpdate(msg({ text: undefined, voice: {} }))!.otherMedia).toContain('vocal');
    expect(parseUpdate(msg({ text: undefined, new_chat_members: [{}] }))).toBeNull();
    expect(parseUpdate({ update_id: 2, edited_message: msg().message })!.kind).toBe('edited');
    expect(parseUpdate({ update_id: 3, my_chat_member: { chat: { id: -5, type: 'group', title: 'G' }, date: 1 } })!.kind).toBe('member');
  });

  it('commande de liaison : /lier, /link et lien profond /start', () => {
    expect(parseLinkCode('/lier abcd2345')).toBe('ABCD2345');
    expect(parseLinkCode('/link@SeeductionBot ABCD2345')).toBe('ABCD2345');
    expect(parseLinkCode('/start ABCD2345')).toBe('ABCD2345');
    expect(parseLinkCode('/lier')).toBeNull();
    expect(parseLinkCode('lier ABCD2345')).toBeNull();
    expect(parseLinkCode('/lier ab')).toBeNull();
    expect(isStartCommand('/start')).toBe(true);
    expect(isStartCommand('/start CODE1234')).toBe(false);
  });
});

describe('réglages', () => {
  it('adresse d\'invitation : seulement t.me / telegram.me en https', () => {
    expect(INVITE_URL.test('https://t.me/+AbCdEf123')).toBe(true);
    expect(INVITE_URL.test('https://telegram.me/seeduction')).toBe(true);
    expect(INVITE_URL.test('http://t.me/+abc')).toBe(false);
    expect(INVITE_URL.test('https://evil.example/t.me/+abc')).toBe(false);
    expect(INVITE_URL.test('javascript:alert(1)')).toBe(false);
  });

  it('jeton : forme vérifiée, chiffré en base et relu', () => {
    const token = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw0';
    expect(TOKEN_FORMAT.test(token)).toBe(true);
    expect(TOKEN_FORMAT.test('pas-un-jeton')).toBe(false);
    const sealed = sealToken(token);
    expect(sealed).not.toContain('AAH');
    expect(openToken(sealed)).toBe(token);
    expect(openToken('n-importe-quoi')).toBe('');
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });
});
