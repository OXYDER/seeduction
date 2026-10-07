import { titleKey } from './metadata.service';

describe('comparaison de titres (fiches TMDB)', () => {
  it('ligature : « Cœur de motard » = « Coeur.de.Motard »', () => {
    expect(titleKey('Cœur de motard')).toBe(titleKey('Coeur de Motard'));
    expect(titleKey("L'Œuvre")).toBe(titleKey('Oeuvre'));
  });

  it('accents, casse, ponctuation et « & »', () => {
    expect(titleKey('Amélie')).toBe(titleKey('amelie'));
    expect(titleKey('Fast & Furious')).toBe(titleKey('Fast.and.Furious'));
    expect(titleKey('Spider-Man: No Way Home')).toBe(titleKey('Spider Man No Way Home'));
  });

  it("article du début ignoré, mais pas un titre d'un seul mot", () => {
    expect(titleKey('The Mean One')).toBe(titleKey('Mean One'));
    expect(titleKey('La Maison des Vilains')).toBe(titleKey('Maison des Vilains'));
    expect(titleKey('Les')).toBe('les');
  });

  it('deux titres differents restent differents', () => {
    expect(titleKey('Fall')).not.toBe(titleKey('Fall 2'));
    expect(titleKey('Colony')).not.toBe(titleKey('Colonie'));
  });
});
