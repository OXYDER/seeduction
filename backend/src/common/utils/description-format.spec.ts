import { descriptionToBbcode } from './description-format';
import { looksLikeBbcode, looksLikeMarkdown, markdownToBbcode } from './markdown-to-bbcode';

describe('markdownToBbcode', () => {
  it('titres, gras, italique, barré', () => {
    expect(markdownToBbcode('# Mon film\n\nUn **gras**, un *italique*, un _autre_, un ~~barré~~ et __gras aussi__.'))
      .toBe('[b]Mon film[/b]\n\nUn [b]gras[/b], un [i]italique[/i], un [i]autre[/i], un [s]barré[/s] et [b]gras aussi[/b].');
  });

  it('listes, citations, trait', () => {
    expect(markdownToBbcode('- un\n- deux\n  - sous-point\n1. trois\n\n> cité\n> encore\n\n---')).toBe('• un\n• deux\n   • sous-point\n• trois\n\n[quote]cité\nencore[/quote]\n\n[hr]');
  });

  it('liens et images (http(s) seulement)', () => {
    expect(markdownToBbcode('Voir [la fiche](https://exemple.org/a?x=1) et <https://exemple.org/b>\n![affiche](https://exemple.org/p.jpg)'))
      .toBe('Voir [url=https://exemple.org/a?x=1]la fiche[/url] et [url=https://exemple.org/b]https://exemple.org/b[/url]\n[img]https://exemple.org/p.jpg[/img]');
    const evil = markdownToBbcode('[x](javascript:alert(1)) ![y](data:image/png;base64,AAA)');
    expect(evil).not.toMatch(/javascript|data:|\[url|\[img/);
  });

  it('blocs de code et code en ligne ne sont pas interprétés', () => {
    expect(markdownToBbcode('```\n**pas gras**\n# pas titre\n```')).toBe('[code]**pas gras**\n# pas titre[/code]');
    expect(markdownToBbcode('Tape `a **b** c` ici')).toBe('Tape a **b** c ici');
  });

  it('tableaux : une ligne par rangée', () => {
    expect(markdownToBbcode('| Nom | Note |\n|---|---|\n| A | 5 |')).toBe('Nom | Note\nA | 5');
  });
});

describe('détection du format', () => {
  it('reconnaît le Markdown et pas le texte ordinaire', () => {
    expect(looksLikeMarkdown('## Titre')).toBe(true);
    expect(looksLikeMarkdown('Un **mot** en gras')).toBe(true);
    expect(looksLikeMarkdown('- un\n- deux')).toBe(true);
    expect(looksLikeMarkdown('[lien](https://exemple.org)')).toBe(true);
    expect(looksLikeMarkdown('Bonjour, voici mon film. 2 * 3 = 6 et un_nom_de_fichier.mkv')).toBe(false);
    expect(looksLikeMarkdown('- un seul tiret en début de phrase')).toBe(false);
    expect(looksLikeMarkdown('[b]déjà[/b] du **BBCode**')).toBe(false); // du BBCode : on n'y touche pas
    expect(looksLikeBbcode('[url=https://x.org]x[/url]')).toBe(true);
  });
});

describe('descriptionToBbcode', () => {
  it('reconnaît le format tout seul', () => {
    expect(descriptionToBbcode('<p>Un <b>gras</b></p>')).toBe('Un [b]gras[/b]');
    expect(descriptionToBbcode('# Titre\n\n**gras**')).toBe('[b]Titre[/b]\n\n[b]gras[/b]');
    expect(descriptionToBbcode('[b]déjà[/b] du BBCode')).toBe('[b]déjà[/b] du BBCode');
    expect(descriptionToBbcode('Du texte simple\nsur deux lignes')).toBe('Du texte simple\nsur deux lignes');
  });

  it('un format forcé l\'emporte', () => {
    expect(descriptionToBbcode('<b>x</b>', 'text')).toBe('<b>x</b>');
    expect(descriptionToBbcode('**x**', 'md')).toBe('[b]x[/b]');
    expect(descriptionToBbcode('**x**', 'bbcode')).toBe('**x**');
    expect(descriptionToBbcode('a <b>b</b>', 'html')).toBe('a [b]b[/b]');
    expect(descriptionToBbcode('**x**', 'inconnu')).toBe('[b]x[/b]'); // format inconnu : détection automatique
  });

  it('absent reste absent', () => {
    expect(descriptionToBbcode(undefined)).toBeUndefined();
    expect(descriptionToBbcode('')).toBe('');
  });
});
