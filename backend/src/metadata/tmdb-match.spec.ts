import { MetadataService } from './metadata.service';

const reply = (results: any[]) => ({ ok: true, json: async () => ({ results }) });

describe('correspondance TMDB (import automatique)', () => {
  const realFetch = global.fetch;
  afterEach(() => { (global as any).fetch = realFetch; });

  const service = () => {
    process.env.TMDB_API_KEY = 'cle-de-test';
    return new MetadataService({} as any, {} as any, {} as any);
  };

  it("serie : l'annee du nom est celle de l'episode (Family Guy 2026), la serie date de 1999", async () => {
    (global as any).fetch = jest.fn(async (url: string) => (url.includes('first_air_date_year=') ? reply([]) : reply([{ id: 1434, name: 'Family Guy', original_name: 'Family Guy', first_air_date: '1999-01-31', genre_ids: [16] }])));
    expect(await service().tmdbMatch('tv', 'Family Guy', 2026)).toMatchObject({ id: '1434', title: 'Family Guy' });
  });

  it("film : l'annee doit coincider (a un an pres), jamais un homonyme d'une autre epoque", async () => {
    (global as any).fetch = jest.fn(async () => reply([{ id: 7, title: 'Fall', original_title: 'Fall', release_date: '1999-05-01', genre_ids: [] }]));
    expect(await service().tmdbMatch('movie', 'Fall', 2022)).toBeNull();
    (global as any).fetch = jest.fn(async () => reply([{ id: 8, title: 'Fall', original_title: 'Fall', release_date: '2022-09-02', genre_ids: [] }]));
    expect(await service().tmdbMatch('movie', 'Fall', 2022)).toMatchObject({ id: '8' });
  });

  it('film sorti fin 2025 pour une release 2026 : accepte, ligature « Cœur » = « Coeur »', async () => {
    (global as any).fetch = jest.fn(async () => reply([{ id: 1757277, title: 'Cœur de motard', original_title: 'Cœur de motard', release_date: '2025-12-31', genre_ids: [99] }]));
    expect(await service().tmdbMatch('movie', 'Coeur de Motard', 2026)).toMatchObject({ id: '1757277' });
  });

  it('titre different : aucune fiche (jamais au hasard)', async () => {
    (global as any).fetch = jest.fn(async () => reply([{ id: 9, name: 'Occupation Double', original_name: 'Occupation Double', first_air_date: '2003-01-01', genre_ids: [] }]));
    expect(await service().tmdbMatch('tv', 'Occupation Double Panama', 2026)).toBeNull();
  });

  // Un faux TMDB : ne répond que si la requête contient exactement le texte voulu
  const tmdbWith = (query: string, results: any[]) => jest.fn(async (url: string) => (decodeURIComponent(url).includes(`query=${query}&`) ? reply(results) : reply([])));
  const zombie = { id: 55, name: 'Zombie Car', original_name: 'Zombie Car', first_air_date: '2023-05-01', genre_ids: [10764], poster_path: null };

  it('import : « Zombie Cars - Sauvé de la scrap » retrouve « Zombie Car » (sous-titre retiré, pluriel toléré)', async () => {
    (global as any).fetch = tmdbWith('Zombie Car', [zombie]);
    expect(await service().tmdbMatch('tv', 'Zombie Cars - Sauvé de la scrap', 2024)).toMatchObject({ id: '55', title: 'Zombie Car' });
  });

  it('import : pluriel ou singulier seul suffit, mais pas un autre titre qui commence pareil', async () => {
    (global as any).fetch = tmdbWith('Zombie Cars', [zombie]);
    expect(await service().tmdbMatch('tv', 'Zombie Cars')).toMatchObject({ id: '55' });
    (global as any).fetch = jest.fn(async () => reply([{ id: 3, name: 'Zombie Land', original_name: 'Zombie Land', first_air_date: '2023-01-01', genre_ids: [] }]));
    expect(await service().tmdbMatch('tv', 'Zombie Cars - Sauvé de la scrap')).toBeNull();
  });

  it('import film : le sous-titre retiré ne rattache jamais un film d’une autre année', async () => {
    (global as any).fetch = jest.fn(async () => reply([{ id: 1, title: 'Alien', original_title: 'Alien', release_date: '1979-05-25', genre_ids: [] }]));
    expect(await service().tmdbMatch('movie', 'Alien - Covenant', 2017)).toBeNull();
  });

  it('recherche manuelle : le titre le plus ressemblant passe en premier, même avec un sous-titre en trop', async () => {
    (global as any).fetch = jest.fn(async (url: string) => {
      const q = decodeURIComponent(url).match(/query=([^&]*)&/)?.[1] ?? '';
      if (q === 'Zombie Car') return reply([{ id: 55, name: 'Zombie Car', original_name: 'Zombie Car', first_air_date: '2023-05-01' }]);
      if (q === 'Zombie Cars') return reply([{ id: 70, name: 'Zombies Everywhere', original_name: 'Zombies Everywhere', first_air_date: '2010-01-01' }]);
      return reply([]);
    });
    const res = await (service() as any).search('SERIE', 'Zombie Cars - Sauvé de la scrap');
    expect(res.length).toBeGreaterThan(0);
    expect(res[0]).toMatchObject({ id: '55', title: 'Zombie Car' });
  });
});
