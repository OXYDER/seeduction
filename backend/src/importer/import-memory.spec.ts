import { guessType, typeFromFeedLabel, cleanTitle } from './category-guess';
import { memoryKeyOf } from './import-memory';

describe('mémoire des choix du staff : quand deux releases se ressemblent', () => {
  it('une série : tous ses épisodes et toutes ses saisons partagent la même clé', () => {
    const a = memoryKeyOf('Ma.Super.Serie.S01E01.FRENCH.1080p.WEB-GRP', 'SERIE');
    const b = memoryKeyOf('Ma.Super.Serie.S03E12.MULTi.720p.HDTV-AUTRE', 'SERIE');
    expect(a).not.toBeNull();
    expect(a!.key).toBe(b!.key);
    expect(a!.withFiche).toBe(true);
    expect(a!.key).toMatch(/^T\|serie\|/);
  });

  it('un film : le titre ET l\'année (deux films du même titre restent distincts)', () => {
    const a = memoryKeyOf('Le.Meme.Titre.1999.1080p.WEB-GRP', 'FILM');
    const b = memoryKeyOf('Le.Meme.Titre.2021.1080p.WEB-GRP', 'FILM');
    const c = memoryKeyOf('Le.Meme.Titre.1999.2160p.BluRay-AUTRE', 'FILM');
    expect(a!.key).not.toBe(b!.key);
    expect(a!.key).toBe(c!.key);
  });

  it('une scène adulte : la clé est le site (la fiche, propre à chaque scène, n\'est pas retenue)', () => {
    const a = memoryKeyOf('Brazzers.Exxtra.24.01.15.Jane.Doe.XXX.1080p.MP4-GRP', 'XXX');
    const b = memoryKeyOf('BrazzersExxtra.24.03.02.Autre.Actrice.XXX.720p.MP4-GRP', 'XXX');
    expect(a!.key).toMatch(/^S\|/);
    expect(a!.key).toBe(b!.key);
    expect(a!.withFiche).toBe(false);
  });

  it('un film adulte : titre et année, fiche retenue', () => {
    const a = memoryKeyOf('Mon.Film.Adulte.2023.XXX.1080p.WEB-GRP', 'XXX');
    expect(a!.key).toMatch(/^T\|xxx\|/);
    expect(a!.withFiche).toBe(true);
  });

  it('type inconnu : le titre, catégorie seule', () => {
    const a = memoryKeyOf('Quelque.Chose.De.Bizarre', undefined);
    expect(a!.key).toMatch(/^N\|/);
    expect(a!.withFiche).toBe(false);
  });

  it('un titre trop court ne produit jamais de clé (risque de ranger n\'importe quoi)', () => {
    expect(memoryKeyOf('X.2020.1080p.WEB-GRP', 'FILM')).toBeNull();
  });
});

describe('type « XXX »', () => {
  it('détecté par l\'étiquette XXX du nom (jamais en premier mot, jamais en minuscules mélangées)', () => {
    expect(guessType('Brazzers.Exxtra.24.01.15.Jane.Doe.XXX.1080p.MP4-GRP')).toBe('XXX');
    expect(guessType('Mon.Film.Adulte.2023.XXX.1080p.WEB-GRP')).toBe('XXX');
    expect(guessType('xXx.Return.of.Xander.Cage.2017.1080p.BluRay-GRP')).toBe('FILM'); // film ordinaire
    expect(guessType('XXX.Return.of.Xander.Cage.2017.1080p.BluRay-GRP')).toBe('FILM');
  });

  it('détecté par le libellé du flux RSS', () => {
    expect(typeFromFeedLabel('Adulte --> Films XXX')).toBe('XXX');
    expect(typeFromFeedLabel('Films --> x265')).toBe('FILM');
  });

  it('le titre s\'arrête à XXX', () => {
    expect(cleanTitle('Mon.Film.Adulte.XXX.1080p.WEB-GRP').title).toBe('Mon Film Adulte');
  });
});
