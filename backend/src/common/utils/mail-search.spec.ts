import { attachmentsMatching, attachmentsOf, decodeText, fold, isSearchableText, matchesAll, termsOf } from './mail-search';

const structure = {
  type: 'multipart/mixed', childNodes: [
    { part: '1', type: 'multipart/alternative', childNodes: [{ part: '1.1', type: 'text/plain', size: 120 }, { part: '1.2', type: 'text/html', size: 300 }] },
    { part: '2', type: 'application/pdf', disposition: 'attachment', dispositionParameters: { filename: 'Facture-Résumé.pdf' }, size: 50_000 },
    { part: '3', type: 'text/csv', disposition: 'attachment', dispositionParameters: { filename: 'export.csv' }, size: 2_000 },
    { part: '4', type: 'image/png', disposition: 'inline', parameters: { name: 'logo.png' }, size: 9_000 },
  ],
};

describe('recherche par mots, sans accents', () => {
  it('fold et termsOf', () => {
    expect(fold('Résumé ÉTÉ')).toBe('resume ete');
    expect(termsOf('  Facture   Résumé ')).toEqual(['facture', 'resume']);
    expect(termsOf('')).toEqual([]);
  });
  it('tous les mots doivent être présents', () => {
    expect(matchesAll('Facture-Résumé.pdf', termsOf('resume facture'))).toBe(true);
    expect(matchesAll('Facture-Résumé.pdf', termsOf('resume contrat'))).toBe(false);
    expect(matchesAll('x', [])).toBe(false);
  });
});

describe('pièces jointes d\'un message', () => {
  it('repère les parties qui portent un nom de fichier, pas le corps', () => {
    const list = attachmentsOf(structure);
    expect(list.map((a) => a.filename)).toEqual(['Facture-Résumé.pdf', 'export.csv', 'logo.png']);
    expect(list[0]).toMatchObject({ part: '2', type: 'application/pdf', size: 50_000 });
  });
  it('un message sans pièce jointe, ou sans structure : liste vide', () => {
    expect(attachmentsOf({ type: 'text/plain', part: '1' })).toEqual([]);
    expect(attachmentsOf(null)).toEqual([]);
  });
  it('filtre par le nom (sans accents ni casse)', () => {
    const list = attachmentsOf(structure);
    expect(attachmentsMatching(list, termsOf('RESUME')).map((a) => a.filename)).toEqual(['Facture-Résumé.pdf']);
    expect(attachmentsMatching(list, termsOf('csv')).map((a) => a.filename)).toEqual(['export.csv']);
    expect(attachmentsMatching(list, termsOf('inexistant'))).toEqual([]);
  });
});

describe('contenu des pièces jointes', () => {
  it('seuls les textes de taille raisonnable sont lus ; PDF et images jamais', () => {
    expect(isSearchableText({ filename: 'export.csv', type: 'text/csv', size: 2000 })).toBe(true);
    expect(isSearchableText({ filename: 'notes.log', type: 'application/octet-stream', size: 2000 })).toBe(true);
    expect(isSearchableText({ filename: 'a.json', type: 'application/json', size: 2000 })).toBe(true);
    expect(isSearchableText({ filename: 'f.pdf', type: 'application/pdf', size: 2000 })).toBe(false);
    expect(isSearchableText({ filename: 'p.png', type: 'image/png', size: 2000 })).toBe(false);
    expect(isSearchableText({ filename: 'gros.txt', type: 'text/plain', size: 5_000_000 })).toBe(false);
  });
  it('décode l\'UTF-8, et le latin-1 quand ce n\'est pas de l\'UTF-8', () => {
    expect(decodeText(Buffer.from('café', 'utf8'))).toBe('café');
    expect(decodeText(Buffer.from('café', 'latin1'))).toBe('café');
  });
});
