import { episodeToken, normalizeTitle, requestMatches, type MatchTorrent } from './request-match';

const film = (o: Partial<MatchTorrent> = {}): MatchTorrent => ({ id: 't1', titles: ['Mad Max : Fury Road', 'Mad Max Fury Road'], year: 2015, language: 'VFF', resolution: '1080p', episodes: [], ...o });
const ep = (s: number, e: number): MatchTorrent => ({ id: 't2', titles: ['Test Show'], year: 2020, language: 'VFQ', resolution: '720p', episodes: [{ season: s, episode: e }] });

describe('request-match', () => {
  it('normalise sans accents, année, épisode et mots de qualité', () => {
    expect(normalizeTitle('Les Évadés (1994) 1080p VFF')).toBe('les evades');
    expect(normalizeTitle('Test.Show.S01E06.MULTI.WEB')).toBe('test show');
  });
  it("lit le numéro d'épisode ou de saison", () => {
    expect(episodeToken('Test Show S01E06')).toEqual({ season: 1, episode: 6 });
    expect(episodeToken('Test Show 2x05')).toEqual({ season: 2, episode: 5 });
    expect(episodeToken('Test Show S03')).toEqual({ season: 3, episode: null });
    expect(episodeToken('Mad Max')).toBeNull();
  });
  it('comble une demande de film au même titre, avec année et qualité cohérentes', () => {
    expect(requestMatches({ title: 'Mad Max Fury Road', year: 2015, language: null, resolution: null }, film())).toBe(true);
    expect(requestMatches({ title: 'Mad Max', year: null, language: null, resolution: null }, film())).toBe(false); // pas « contient »
    expect(requestMatches({ title: 'Mad Max Fury Road', year: 2014, language: null, resolution: null }, film())).toBe(false);
    expect(requestMatches({ title: 'Mad Max Fury Road', year: 2015, language: 'VFQ', resolution: null }, film())).toBe(false);
    expect(requestMatches({ title: 'Mad Max Fury Road', year: 2015, language: null, resolution: '4K/2160p' }, film())).toBe(false);
    expect(requestMatches({ title: 'Mad Max Fury Road', year: null, language: null, resolution: '1080p' }, film())).toBe(true);
  });
  it("comble une demande d'épisode seulement avec cet épisode", () => {
    expect(requestMatches({ title: 'Test Show S01E06', year: 2020, language: null, resolution: null }, ep(1, 6))).toBe(true);
    expect(requestMatches({ title: 'Test Show S01E06', year: null, language: null, resolution: null }, ep(1, 7))).toBe(false);
    expect(requestMatches({ title: 'Test Show', year: null, language: null, resolution: null }, ep(1, 6))).toBe(false); // la série entière : pas un épisode isolé
  });
  it('une saison demandée veut au moins trois épisodes', () => {
    const pack: MatchTorrent = { ...ep(2, 1), episodes: [1, 2, 3, 4].map((e) => ({ season: 2, episode: e })) };
    expect(requestMatches({ title: 'Test Show S02', year: null, language: null, resolution: null }, pack)).toBe(true);
    expect(requestMatches({ title: 'Test Show S02', year: null, language: null, resolution: null }, ep(2, 1))).toBe(false);
  });
  it('ne reprend pas un torrent déjà refusé', () => {
    expect(requestMatches({ title: 'Mad Max Fury Road', year: 2015, language: null, resolution: null, declinedTorrentIds: ['t1'] }, film())).toBe(false);
  });
});
