import { htmlToBbcode, looksLikeHtml } from './html-to-bbcode';

describe('htmlToBbcode', () => {
  it('convertit la mise en forme courante', () => {
    expect(htmlToBbcode('<p>Salut <b>toi</b> et <i>moi</i>, <u>vite</u> <s>fait</s></p>')).toBe('Salut [b]toi[/b] et [i]moi[/i], [u]vite[/u] [s]fait[/s]');
  });

  it('gère les paragraphes, les sauts de ligne, les titres et le trait', () => {
    expect(htmlToBbcode('<h2>Synopsis</h2><p>Une ligne<br>une autre</p><hr><p>Fin</p>')).toBe('[b]Synopsis[/b]\n\nUne ligne\nune autre\n\n[hr]\n\nFin');
  });

  it('convertit liens, images, listes, citations et code', () => {
    const out = htmlToBbcode('<a href="https://exemple.org/a?x=1&amp;y=2">lien</a><img src="https://exemple.org/p.jpg"><ul><li>un</li><li>deux</li></ul><blockquote>cité</blockquote><pre>a  b\nc</pre>');
    expect(out).toContain('[url=https://exemple.org/a?x=1&y=2]lien[/url]');
    expect(out).toContain('[img]https://exemple.org/p.jpg[/img]');
    expect(out).toContain('• un\n• deux');
    expect(out).toContain('[quote]cité[/quote]');
    expect(out).toContain('[code]a  b\nc[/code]');
  });

  it('gère couleur, taille et alignement', () => {
    expect(htmlToBbcode('<span style="color:#ff0000">rouge</span> <font color="blue" size="5">grand</font>')).toBe('[color=#ff0000]rouge[/color] [size=5][color=blue]grand[/color][/size]');
    expect(htmlToBbcode('<div style="text-align:center">au centre</div>')).toBe('[center]au centre[/center]');
    expect(htmlToBbcode('<center>centré</center>')).toBe('[center]centré[/center]');
  });

  it('ne laisse passer ni script, ni lien dangereux, ni image locale', () => {
    const out = htmlToBbcode('<script>alert(1)</script><a href="javascript:alert(1)">x</a><img src="javascript:alert(1)"><img src="data:image/png;base64,AAAA">ok');
    expect(out).not.toMatch(/alert|javascript|data:/);
    expect(out).toContain('ok');
  });

  it('ferme les balises mal imbriquées', () => {
    expect(htmlToBbcode('<b>gras <i>les deux</b> fin')).toBe('[b]gras [i]les deux[/i][/b] fin');
  });

  it('déplie un tableau en texte et décode les entités', () => {
    expect(htmlToBbcode('<table><tr><td>a</td><td>b &amp; c</td></tr></table>')).toBe('a b & c');
  });

  it('détecte le HTML', () => {
    expect(looksLikeHtml('<p>bonjour</p>')).toBe(true);
    expect(looksLikeHtml('Texte avec <b>gras</b>')).toBe(true);
    expect(looksLikeHtml('[b]déjà[/b] du BBCode, 1 < 2 et 3 > 2')).toBe(false);
  });
});
