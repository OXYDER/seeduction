import { bbcodeToHtml, fillVariables, pruneEmptyLines } from './bbcode';

describe('bbcodeToHtml', () => {
  it('convertit le gras', () => {
    expect(bbcodeToHtml('[b]gras[/b]')).toContain('<strong>gras</strong>');
  });

  it('échappe le HTML brut (pas de script injecté)', () => {
    const html = bbcodeToHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuse les liens javascript:', () => {
    expect(bbcodeToHtml('[url=javascript:alert(1)]clic[/url]')).not.toContain('<a href');
  });

  it('accepte les liens http(s)', () => {
    expect(bbcodeToHtml('[url=https://exemple.com]site[/url]')).toContain('<a href="https://exemple.com"');
  });

  it('crée un bloc repliable avec [spoiler]', () => {
    const html = bbcodeToHtml('[spoiler=Dossier]contenu[/spoiler]');
    expect(html).toContain('<details><summary>Dossier</summary>');
    expect(html).toContain('</details>');
  });

  it('attribue une citation à son auteur', () => {
    const html = bbcodeToHtml('[quote=Bob]salut[/quote]');
    expect(html).toContain('data-author="Bob"');
    expect(html).toContain('Bob a écrit :');
  });
});

describe('modèles de description', () => {
  it('remplit les variables sans tenir compte des accents ni de la casse', () => {
    expect(fillVariables('Année : {année}', { annee: '2024' })).toBe('Année : 2024');
  });

  it('retire les lignes dont la valeur est vide', () => {
    const out = pruneEmptyLines('Année : {année}\nTitre : {titre}', { année: '', titre: 'Dune' });
    expect(out).not.toContain('Année');
    expect(out).toContain('{titre}');
  });
});
