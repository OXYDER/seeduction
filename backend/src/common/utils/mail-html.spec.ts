import { headerSafe, htmlToText, parseAddress, parseAddressList, prefixSubject, sanitizeMailHtml, textToHtml } from './mail-html';

describe('sanitizeMailHtml', () => {
  it('retire les scripts, formulaires, styles et gestionnaires d\'événements', () => {
    const r = sanitizeMailHtml('<p onclick="x()">Salut <script>alert(1)</script><form action="http://mal"><input name=a></form><style>p{display:none}</style><iframe src="http://x"></iframe></p>');
    expect(r.html).toContain('Salut');
    expect(r.html).not.toMatch(/script|onclick|<form|<input|<style|<iframe|alert/i);
  });
  it('les liens javascript: et data: sont neutralisés, les liens normaux s\'ouvrent dans un nouvel onglet sans fuite', () => {
    const r = sanitizeMailHtml('<a href="javascript:alert(1)">piège</a> <a href="data:text/html;base64,AAA">autre</a> <a href="https://exemple.com/x">ok</a> <a href="mailto:a@b.co">mail</a>');
    expect(r.html).not.toMatch(/javascript:|data:text/i);
    expect(r.blockedLinks).toBe(2);
    expect(r.html).toContain('href="https://exemple.com/x"');
    expect(r.html).toContain('rel="noopener noreferrer nofollow"');
    expect(r.html).toContain('target="_blank"');
  });
  it('bloque les images distantes (pixel espion) tant qu\'on ne les autorise pas, et les compte', () => {
    const html = '<p>Bonjour</p><img src="https://track.exemple.com/p.gif?u=42" width="1" height="1"><img src="http://x.com/a.png" alt="logo">';
    const blocked = sanitizeMailHtml(html);
    expect(blocked.remoteImages).toBe(2);
    expect(blocked.html).not.toMatch(/track\.exemple|x\.com/);
    expect(blocked.html).toContain('class="blocked-image"');
    const allowed = sanitizeMailHtml(html, { allowImages: true });
    expect(allowed.html).toContain('https://track.exemple.com/p.gif?u=42');
    expect(allowed.html).toContain('referrerpolicy="no-referrer"');
  });
  it('affiche les images intégrées (cid) et les petites images data: png, refuse data:image/svg', () => {
    const r = sanitizeMailHtml('<img src="cid:logo1"><img src="data:image/png;base64,AAAA"><img src="data:image/svg+xml;base64,PHN2Zz4=">', { inline: { logo1: 'data:image/png;base64,QUJD' } });
    expect(r.html).toContain('data:image/png;base64,QUJD');
    expect(r.html).toContain('data:image/png;base64,AAAA');
    expect(r.html).not.toMatch(/svg/i);
  });
  it('garde la mise en forme ordinaire (tableaux, listes, citations)', () => {
    const r = sanitizeMailHtml('<table><tr><td align="center"><b>Gras</b></td></tr></table><ul><li>un</li></ul><blockquote>cité</blockquote>');
    expect(r.html).toMatch(/<table>.*<b>Gras<\/b>.*<ul><li>un<\/li><\/ul><blockquote>cité<\/blockquote>/s);
  });
});

describe('textToHtml', () => {
  it('échappe le HTML, garde les sauts de ligne et rend les liens cliquables', () => {
    const h = textToHtml('<b>x</b>\nVoir https://exemple.com/a?b=1');
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;<br>');
    expect(h).toContain('<a href="https://exemple.com/a?b=1">');
  });
});

describe('adresses', () => {
  it('lit « Nom <a@b.co> » et « a@b.co »', () => {
    expect(parseAddress('Marie Tremblay <Marie@Exemple.CA>')).toEqual({ name: 'Marie Tremblay', address: 'marie@exemple.ca' });
    expect(parseAddress('"Dupont, Jean" <j@x.org>')).toEqual({ name: 'Dupont, Jean', address: 'j@x.org' });
    expect(parseAddress('a@b.co')).toEqual({ name: '', address: 'a@b.co' });
  });
  it('refuse l\'invalide et les tentatives d\'injection', () => {
    for (const bad of ['', 'pas une adresse', 'a@b', '<a@b>', 'a@b.co\nBcc: x@y.zz', 'a b@c.com', '"x" <a@@b.co>']) expect(parseAddress(bad)).toBeNull();
  });
  it('lit une liste, sans doublons, en séparant les invalides', () => {
    const r = parseAddressList('a@b.co, Marc <m@x.org>; a@b.co\nzzz');
    expect(r.ok.map((x) => x.address)).toEqual(['a@b.co', 'm@x.org']);
    expect(r.bad).toEqual(['zzz']);
  });
  it('neutralise les retours à la ligne dans un sujet et ajoute Re: une seule fois', () => {
    expect(headerSafe('Bonjour\r\nBcc: pirate@x.co')).toBe('Bonjour Bcc: pirate@x.co');
    expect(prefixSubject('Test', 'Re')).toBe('Re: Test');
    expect(prefixSubject('RE: Test', 'Re')).toBe('RE: Test');
    expect(prefixSubject('Test', 'Fwd')).toBe('Fwd: Test');
  });
});

describe('htmlToText', () => {
  it('garde les paragraphes et les sauts de ligne, retire les balises et les scripts', () => {
    expect(htmlToText('<p>Bonjour,</p><p>Je suis <b>Marie</b> &amp; Jean.<br>Merci</p><script>x()</script><ul><li>un</li><li>deux</li></ul>')).toBe('Bonjour,\n\nJe suis Marie & Jean.\nMerci\n\n• un\n• deux');
  });
  it('texte vide', () => { expect(htmlToText('')).toBe(''); });
});
