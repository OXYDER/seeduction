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
});
