import { looseKey, searchVariants, similarity, singularWord, withoutSubtitle } from './title-search';

describe('singulier et pluriel', () => {
  it('retire le « s » final sans casser les mots qui se terminent ainsi', () => {
    expect(singularWord('cars')).toBe('car');
    expect(singularWord('stories')).toBe('story');
    expect(singularWord('boxes')).toBe('box');
    expect(singularWord('class')).toBe('class');
    expect(singularWord('tennis')).toBe('tennis');
    expect(singularWord('bus')).toBe('bus');
    expect(singularWord('s01')).toBe('s01');
  });

  it('« Zombie Cars » et « Zombie Car » ont la même clé', () => {
    expect(looseKey('Zombie Cars')).toBe(looseKey('Zombie Car'));
    expect(looseKey('Les Zombies')).toBe(looseKey('Zombie'));
    expect(looseKey('Zombie Cars')).not.toBe(looseKey('Zombie Land'));
  });
});

describe('sous-titre', () => {
  it('coupe après « - », « : » ou un tiret long', () => {
    expect(withoutSubtitle('Zombie Cars - Sauvé de la scrap')).toBe('Zombie Cars');
    expect(withoutSubtitle('Star Trek: Discovery')).toBe('Star Trek');
    expect(withoutSubtitle('Spider-Man')).toBe('Spider-Man'); // un tiret collé n'est pas un sous-titre
  });
});

describe('ressemblance', () => {
  it('identique au pluriel près = 1, proche > 0,8, différent < 0,5', () => {
    expect(similarity('Zombie Cars', 'Zombie Car')).toBe(1);
    expect(similarity('Occupation Double', 'Occupation Doubles')).toBe(1);
    expect(similarity('Zombie Cars', 'Zombie Cars Quebec')).toBeGreaterThan(0.6);
    expect(similarity('Zombie Cars', 'Les Experts')).toBeLessThan(0.3);
  });
});

describe('variantes de recherche', () => {
  it('« Zombie Cars - Sauvé de la scrap » essaie le titre court puis son singulier', () => {
    const qs = searchVariants('Zombie Cars - Sauvé de la scrap').map((v) => v.q);
    expect(qs[0]).toBe('Zombie Cars - Sauvé de la scrap');
    expect(qs).toContain('Zombie Cars');
    expect(qs).toContain('Zombie Car');
  });

  it("garde l'année en premier puis la retire, sans doublon", () => {
    const v = searchVariants('Coeur de Motard', '2026');
    expect(v[0]).toEqual({ q: 'Coeur de Motard', y: '2026' });
    expect(v[1]).toEqual({ q: 'Coeur de Motard', y: undefined });
    expect(v.some((x) => x.q === 'Cœur de Motard')).toBe(true);
    expect(new Set(v.map((x) => `${x.q}|${x.y}`)).size).toBe(v.length);
  });

  it('retire les articles et propose des titres plus courts', () => {
    const qs = searchVariants('Les Anges de la téléréalité Miami').map((v) => v.q);
    expect(qs).toContain('Anges téléréalité Miami');
    expect(qs.some((q) => q === 'Les Anges')).toBe(true);
  });

  it('au plus 12 variantes', () => {
    expect(searchVariants('Un très long titre de série avec beaucoup de mots dedans - et un sous-titre', '2024').length).toBeLessThanOrEqual(12);
  });
});
