import { CATALOG, CRAFT_COST, DEFAULT_CARDS, ODDS, RARITIES, SETS, SHARDS, albumComplete, cardById, cardsOf, completedSets, drawPack, normalizeCards, pickRarity } from './cards';
import { seededRandom } from './quiz';

describe('Cartes : catalogue', () => {
  it('chaque carte a un identifiant unique et appartient à une série connue', () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
    for (const c of CATALOG) expect(SETS.some((s) => s.id === c.set)).toBe(true);
  });

  it('les 32 équipes de la LNH sont toutes là, une fois', () => {
    const teams = cardsOf('hockey');
    expect(teams).toHaveLength(32);
    const abbrevs = teams.map((c) => (c.art.kind === 'team' ? c.art.abbrev : ''));
    expect(new Set(abbrevs).size).toBe(32);
    abbrevs.forEach((a) => expect(a).toMatch(/^[A-Z]{3}$/));
    expect(cardById('hockey-MTL')?.rarity).toBe('legendary');
  });

  it('chaque rareté a au moins une carte et chaque série en compte assez', () => {
    for (const r of RARITIES) expect(CATALOG.filter((c) => c.rarity === r).length).toBeGreaterThanOrEqual(3);
    for (const s of SETS) expect(cardsOf(s.id).length).toBeGreaterThanOrEqual(8);
  });

  it('les cartes en emoji ont un emoji et une teinte valides', () => {
    for (const c of CATALOG) if (c.art.kind === 'emoji') { expect(c.art.emoji.length).toBeGreaterThan(0); expect(c.art.hue).toBeGreaterThanOrEqual(0); expect(c.art.hue).toBeLessThan(360); }
  });
});

describe('Cartes : raretés et paquets', () => {
  it('les chances de chaque tirage font 1 000', () => {
    expect(Object.values(ODDS.normal).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(Object.values(ODDS.last).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('la rareté suit les chances et celles à zéro ne sortent jamais', () => {
    expect(pickRarity(ODDS.normal, 0)).toBe('common');
    expect(pickRarity(ODDS.normal, 699)).toBe('common');
    expect(pickRarity(ODDS.normal, 700)).toBe('rare');
    expect(pickRarity(ODDS.normal, 985)).toBe('legendary');
    expect(pickRarity(ODDS.normal, 999)).toBe('legendary');
    for (let r = 0; r < 1000; r++) expect(pickRarity(ODDS.last, r)).not.toBe('common');
  });

  it('un paquet contient le bon nombre de cartes et la dernière est au moins rare', () => {
    const rnd = seededRandom('pack');
    for (let i = 0; i < 2000; i++) {
      const { cards } = drawPack((n) => Math.floor(rnd() * n), DEFAULT_CARDS, 0);
      expect(cards).toHaveLength(3);
      expect(cards[2].rarity).not.toBe('common');
    }
  });

  it('la dernière carte du paquet est légendaire quand le seuil de garantie est atteint', () => {
    const rnd = seededRandom('pity');
    const { cards, pity } = drawPack((n) => Math.floor(rnd() * n), DEFAULT_CARDS, DEFAULT_CARDS.pityPacks - 1);
    expect(cards[2].rarity).toBe('legendary');
    expect(pity).toBe(0);
  });

  it('le compteur de garantie monte sans légendaire et retombe à zéro avec une légendaire', () => {
    const noLegend = (n: number) => 0; // la première carte de chaque rareté : jamais légendaire (rareté common puis rare)
    const r = drawPack(noLegend, DEFAULT_CARDS, 7);
    expect(r.cards.every((c) => c.rarity !== 'legendary')).toBe(true);
    expect(r.pity).toBe(8);
  });

  it('simulation : fréquences conformes aux chances et légendaire garantie au plus tard au 30e paquet', () => {
    const rnd = seededRandom('sim');
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
    let pity = 0, worst = 0, packs = 60_000, sinceLegend = 0;
    for (let i = 0; i < packs; i++) {
      const r = drawPack((n) => Math.floor(rnd() * n), DEFAULT_CARDS, pity);
      pity = r.pity;
      r.cards.forEach((c) => counts[c.rarity]++);
      sinceLegend = r.cards.some((c) => c.rarity === 'legendary') ? 0 : sinceLegend + 1;
      worst = Math.max(worst, sinceLegend);
    }
    const total = packs * 3;
    expect(worst).toBeLessThan(DEFAULT_CARDS.pityPacks);
    expect(counts.common / total).toBeGreaterThan(0.45);
    expect(counts.common / total).toBeLessThan(0.55);
    expect(counts.legendary / total).toBeGreaterThan(0.01);
  });

  it('un doublon rapporte moins d\'éclats que la fabrication ne coûte (il faut en cumuler plusieurs)', () => {
    for (const r of RARITIES) expect(SHARDS[r] * 3).toBeLessThan(CRAFT_COST[r] + 1);
    expect(CRAFT_COST.legendary).toBeGreaterThan(CRAFT_COST.epic);
    expect(CRAFT_COST.epic).toBeGreaterThan(CRAFT_COST.rare);
    expect(CRAFT_COST.rare).toBeGreaterThan(CRAFT_COST.common);
  });
});

describe('Cartes : séries et réglages', () => {
  it('détecte les séries complétées et l\'album entier', () => {
    const owned = new Set(cardsOf('musique').map((c) => c.id));
    expect(completedSets(owned)).toEqual(['musique']);
    expect(albumComplete(owned)).toBe(false);
    const all = new Set(CATALOG.map((c) => c.id));
    expect(completedSets(all)).toHaveLength(SETS.length);
    expect(albumComplete(all)).toBe(true);
    owned.delete(cardsOf('musique')[0].id);
    expect(completedSets(owned)).toEqual([]);
  });

  it('garde les valeurs précédentes quand une valeur est invalide', () => {
    expect(normalizeCards({ cardsPerPack: 1, dailyPacks: 99, pityPacks: 2, setRewards: { hockey: 'x' } })).toEqual(DEFAULT_CARDS);
  });

  it('règle les valeurs valides', () => {
    const c = normalizeCards({ cardsPerPack: 5, dailyPacks: 2, setRewards: { hockey: 800 }, albumReward: 2000 });
    expect(c).toMatchObject({ cardsPerPack: 5, dailyPacks: 2, albumReward: 2000 });
    expect(c.setRewards.hockey).toBe(800);
    expect(c.setRewards.cinema).toBe(DEFAULT_CARDS.setRewards.cinema);
  });
});
