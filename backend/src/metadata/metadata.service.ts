import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { CoversService } from '../covers/covers.service';
import { PrismaService } from '../common/prisma.service';
import { TranslateService } from './translate.service';
import { cleanTitle } from '../importer/category-guess';
import { releaseDateOf } from './release-date';
import { collectStudios, parseAdultName, parseStudioId, pickPorndbMatch, PorndbHit } from './porndb-match';

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string | null;
}

export type MetadataDetail = Record<string, string>;
type EntityKind = 'PERSON' | 'COMPANY' | 'GENRE' | 'PLATFORM';

/** Une entité à rattacher au torrent (acteur, studio, genre...), avant sauvegarde en base. */
interface EntityDraft {
  type: EntityKind;
  role: string;
  name: string;
  source: string;
  externalId: string;
  imageUrl?: string | null; // URL externe : téléchargée sur Seeduction après coup
  detail?: string;
  position: number;
}

interface RichMetadata {
  source: string;
  /** Variables prêtes pour les modèles de description (titre, année, réalisateur...). */
  variables: Record<string, string>;
  /** Données d'affichage conservées sur le torrent (durée, note, bande-annonce...). */
  info: Record<string, any>;
  entities: EntityDraft[];
  coverUrl: string | null;
  backdropUrl: string | null;
  /** Titres dans plusieurs langues / régions, un par ligne (recherche). */
  searchTitles?: string;
  /** Vrai si le synopsis affiché est bien en français (traduit, ou déjà français). */
  overviewOk?: boolean;
}

const TMDB_IMG = (process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p').replace(/\/$/, ''); // modifiable pour les essais en local
const TMDB_API = (process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3').replace(/\/$/, ''); // modifiable pour les essais en local
const PORNDB_API = (process.env.THEPORNDB_BASE_URL || 'https://api.theporndb.net').replace(/\/$/, ''); // modifiable pour les essais en local
const SEARCHABLE_KINDS = ['FILM', 'SERIE', 'MUSIQUE', 'LIVRE', 'JEU', 'XXX'] as const;

/** Retire les accents : « Amélie » devient « Amelie » (pour retrouver un titre saisi sans accents). */
export const deaccent = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Clé de comparaison de deux titres : sans accents, casse, ponctuation, ligatures (œ, æ), « & » lu « and », ni article au début. */
export const titleKey = (t: string): string => {
  const tokens = deaccent(t).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length > 1 && ['the', 'le', 'la', 'les', 'l', 'un', 'une', 'a', 'an'].includes(tokens[0])) tokens.shift();
  return tokens.join('');
};

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const unique = <T,>(items: T[], key: (t: T) => string) => {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(key(i)) ? false : (seen.add(key(i)), true)));
};

const formatMinutes = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);
const genreDrafts = (names: string[]): EntityDraft[] =>
  unique(names.filter(Boolean), (n) => slugify(n)).map((name, i) => ({
    type: 'GENRE', role: 'GENRE', name, source: 'seeduction', externalId: slugify(name), position: i,
  }));

/**
 * Recherche de vraies métadonnées par catégorie, sans jamais rien inventer :
 * Film/Série -> TMDB (clé gratuite TMDB_API_KEY), Musique -> Deezer, Livre ->
 * Google Books puis Open Library, Jeu -> RAWG (clé gratuite RAWG_API_KEY). Les
 * personnes, studios, genres... trouvés sont enregistrés comme entités
 * partagées : cliquer dessus sur Seeduction liste tous les torrents concernés.
 */
@Injectable()
export class MetadataService {
  private readonly logger = new Logger(MetadataService.name);
  private tmdbKey = process.env.TMDB_API_KEY || null;
  private rawgKey = process.env.RAWG_API_KEY || null;
  private porndbKey = process.env.THEPORNDB_API_KEY || null;

  constructor(private coversService: CoversService, private prisma: PrismaService, private translate: TranslateService) {}

  get supportedKinds(): string[] {
    const kinds: string[] = ['MUSIQUE', 'LIVRE'];
    if (this.tmdbKey) kinds.push('FILM', 'SERIE');
    if (this.rawgKey) kinds.push('JEU');
    if (this.porndbKey) kinds.push('XXX');
    return kinds;
  }

  private async saveCover(externalUrl: string | null | undefined): Promise<string> {
    if (!externalUrl) return '';
    try {
      return await this.coversService.saveFromUrl(externalUrl);
    } catch {
      return '';
    }
  }

  private assertSearchable(kind: string) {
    if (!(SEARCHABLE_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(`Recherche non disponible pour la catégorie ${kind}`);
    }
    if ((kind === 'FILM' || kind === 'SERIE') && !this.tmdbKey) {
      throw new ServiceUnavailableException("La recherche Film/Série n'est pas configurée (clé TMDB manquante).");
    }
    if (kind === 'XXX' && !this.porndbKey) {
      throw new ServiceUnavailableException("La recherche XXX n'est pas configurée (clé ThePornDB manquante).");
    }
    if (kind === 'JEU' && !this.rawgKey) {
      throw new ServiceUnavailableException("La recherche de jeux n'est pas configurée (clé RAWG manquante).");
    }
  }

  // ------------------------------------------------------------------ recherche

  async search(kind: string, query: string, year?: string): Promise<SearchResult[]> {
    if (!query?.trim()) throw new BadRequestException('Requête de recherche vide');
    this.assertSearchable(kind);
    switch (kind) {
      case 'FILM':
        return this.searchTmdb('movie', query, year);
      case 'SERIE':
        return this.searchTmdb('tv', query, year);
      case 'MUSIQUE':
        return this.searchDeezer(query);
      case 'LIVRE':
        return this.searchBooks(query);
      case 'JEU':
        return this.searchRawg(query);
      case 'XXX':
        return this.searchPorndb(query);
      default:
        return [];
    }
  }

  /** Une requête TMDB dans trois langues en parallèle (fr-CA, fr-FR, en-US), fusionnée par fiche : un titre québécois, français, anglais ou original sort dans tous les cas. */
  private async tmdbPool(type: 'movie' | 'tv', query: string, year?: string): Promise<{ id: string; r: any; titles: string[] }[]> {
    const yearParam = year && /^\d{4}$/.test(year) ? `&${type === 'movie' ? 'year' : 'first_air_date_year'}=${year}` : '';
    const responses = await Promise.allSettled(
      ['fr-CA', 'fr-FR', 'en-US'].map((language) =>
        this.fetchJson(`${TMDB_API}/search/${type}?query=${encodeURIComponent(query)}&language=${language}${yearParam}&api_key=${this.tmdbKey}`, 'TMDB'),
      ),
    );
    if (responses.every((r) => r.status === 'rejected')) throw (responses[0] as PromiseRejectedResult).reason;
    const titleOf = (r: any): string => ((type === 'movie' ? r.title : r.name) ?? '').trim();
    const originalOf = (r: any): string => ((type === 'movie' ? r.original_title : r.original_name) ?? '').trim();
    const merged = new Map<string, { id: string; r: any; titles: string[] }>();
    for (const res of responses) {
      if (res.status !== 'fulfilled') continue;
      for (const r of res.value.results ?? []) {
        const id = String(r.id);
        const cur = merged.get(id) ?? { id, r, titles: [] }; // l'ordre de pertinence est celui de la première langue qui trouve la fiche
        for (const t of [titleOf(r), originalOf(r)]) if (t && !cur.titles.includes(t)) cur.titles.push(t);
        merged.set(id, cur);
      }
    }
    return [...merged.values()];
  }

  /**
   * Recherche de fiche TMDB tolérante. Un nom de release collé tel quel (« Coeur.de.Motard.2026.DOC.FRENCH... ») est réduit à son titre et son année ;
   * si la recherche exacte ne donne rien, on réessaie sans l'année (sorties de fin d'année), avec la ligature (« Coeur » -> « Cœur »), sans le sous-titre,
   * puis en raccourcissant le titre. Les résultats sont classés : titre identique d'abord, puis année la plus proche, puis pertinence TMDB.
   */
  private async searchTmdb(type: 'movie' | 'tv', query: string, year?: string): Promise<SearchResult[]> {
    let q = query.trim();
    let y = year && /^\d{4}$/.test(year) ? year : undefined;
    if (/[._]/.test(q) && !/\s/.test(q)) { const parsed = cleanTitle(q); if (parsed.title) { q = parsed.title; if (!y && parsed.year) y = String(parsed.year); } }

    const variants: { q: string; y?: string }[] = [{ q, y }];
    if (y) variants.push({ q });
    if (/oe/i.test(q)) variants.push({ q: q.replace(/oe/gi, 'œ'), y });
    const noSub = q.split(/\s*[:\u2013\u2014]\s*|\s+-\s+/)[0].trim();
    if (noSub && noSub !== q) variants.push({ q: noSub });
    const words = q.split(/\s+/);
    if (words.length > 2) variants.push({ q: words.slice(0, -1).join(' ') });

    const pool = new Map<string, { id: string; r: any; titles: string[] }>();
    for (const v of variants) {
      for (const hit of await this.tmdbPool(type, v.q, v.y)) if (!pool.has(hit.id)) pool.set(hit.id, hit);
      if (pool.size >= 5) break; // assez de candidats : inutile d'élargir davantage
    }

    const wanted = titleKey(q);
    const dateOf = (r: any): string => String((type === 'movie' ? r.release_date : r.first_air_date) ?? '');
    const score = (h: { r: any; titles: string[] }, order: number) => {
      const exact = h.titles.some((t) => titleKey(t) === wanted) ? 1000 : 0;
      const gap = y && dateOf(h.r) ? Math.abs(Number(dateOf(h.r).slice(0, 4)) - Number(y)) : 9;
      return exact + (gap === 0 ? 100 : gap === 1 ? 50 : 0) - order; // le rang d'origine départage
    };
    const ranked = [...pool.values()].map((h, i) => ({ h, sc: score(h, i) })).sort((a, b) => b.sc - a.sc).map((x) => x.h);

    return ranked.slice(0, 14).map(({ id, r, titles }) => {
      const main = ((type === 'movie' ? r.title : r.name) ?? '').trim() || titles[0] || 'Sans titre';
      const others = titles.filter((t) => t !== main).slice(0, 3);
      return {
        id,
        title: main,
        subtitle: [dateOf(r).slice(0, 4), others.length ? `aussi : ${others.join(' / ')}` : ''].filter(Boolean).join(' · '),
        thumbnail: r.poster_path ? `${TMDB_IMG}/w342${r.poster_path}` : null,
      };
    });
  }

  private async searchDeezer(query: string): Promise<SearchResult[]> {
    const url = `https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=12`;
    const res = await this.fetchJson(url, 'Deezer');
    return (res.data ?? []).map((a: any) => ({
      id: String(a.id),
      title: a.title ?? 'Sans titre',
      subtitle: a.artist?.name ?? '',
      thumbnail: a.cover_medium ?? a.cover ?? null,
    }));
  }

  /**
   * Google Books d'abord (meilleur en français) ; sa recherche anonyme est
   * limitée par un quota partagé qui renvoie souvent 429, donc en cas d'échec
   * on bascule sur Open Library (gratuit, sans clé). Une clé gratuite
   * GOOGLE_BOOKS_API_KEY supprime pratiquement le problème côté Google.
   */
  private async searchBooks(query: string): Promise<SearchResult[]> {
    try {
      const keyParam = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : '';
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12&langRestrict=fr${keyParam}`;
      const res = await this.fetchJson(url, 'Google Books');
      const results: SearchResult[] = (res.items ?? []).map((b: any) => ({
        id: b.id,
        title: b.volumeInfo?.title ?? 'Sans titre',
        subtitle: [b.volumeInfo?.authors?.[0], b.volumeInfo?.publishedDate?.slice(0, 4)].filter(Boolean).join(' — '),
        thumbnail: b.volumeInfo?.imageLinks?.thumbnail ?? null,
      }));
      if (results.length > 0) return results;
    } catch {
      // Quota/erreur Google : on tente Open Library ci-dessous.
    }
    return this.searchOpenLibrary(query);
  }

  private async searchOpenLibrary(query: string): Promise<SearchResult[]> {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=12&fields=key,title,author_name,first_publish_year,cover_i`;
    const res = await this.fetchJson(url, 'Open Library');
    return (res.docs ?? []).map((d: any) => ({
      id: `ol:${String(d.key).replace('/works/', '')}`,
      title: d.title ?? 'Sans titre',
      subtitle: [d.author_name?.[0], d.first_publish_year].filter(Boolean).join(' — '),
      thumbnail: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
    }));
  }

  private async searchRawg(query: string): Promise<SearchResult[]> {
    const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&page_size=12&key=${this.rawgKey}`;
    const res = await this.fetchJson(url, 'RAWG');
    return (res.results ?? []).map((g: any) => ({
      id: String(g.id),
      title: g.name ?? 'Sans titre',
      subtitle: [g.released?.slice(0, 4), unique<string>((g.platforms ?? []).map((p: any) => p.platform?.name).filter(Boolean), (n) => slugify(n)).join(', ')].filter(Boolean).join(' — '),
      thumbnail: g.background_image ?? null,
    }));
  }

  // --------------------------------------------------------------------- fiches

  /** Variables pour le générateur de description + pochette sauvegardée sur Seeduction. */
  async detail(kind: string, id: string): Promise<MetadataDetail> {
    if (!id) throw new BadRequestException('Identifiant manquant');
    this.assertSearchable(kind);
    const rich = await this.rich(kind, id);
    return { ...rich.variables, affiche: await this.saveCover(rich.coverUrl) };
  }

  /** Fiche complète, avec le synopsis traduit en français s'il ne l'est pas déjà. */
  private async rich(kind: string, id: string): Promise<RichMetadata> {
    const rich = await this.richRaw(kind, id);
    let ok = true;

    // Synopsis de la présentation générée.
    const description = rich.variables?.description;
    if (typeof description === 'string' && description) {
      const d = await this.toFrenchSafe(description);
      rich.variables.description = d.text;
      ok = ok && d.ok;
    }
    // Synopsis et slogan affichés dans l'entête de la fiche (souvent le même texte : la traduction est mise en cache).
    if (typeof rich.info?.overview === 'string' && rich.info.overview) {
      const o = await this.toFrenchSafe(rich.info.overview);
      rich.info.overview = o.text;
      ok = ok && o.ok;
    }
    if (typeof rich.info?.tagline === 'string' && rich.info.tagline) {
      rich.info.tagline = (await this.toFrenchSafe(rich.info.tagline)).text;
    }
    rich.overviewOk = ok;
    return rich;
  }

  /** Traduit en français un texte qui ne l'est pas ; `ok` est faux si la traduction a échoué (on réessaiera plus tard). */
  private async toFrenchSafe(text: string): Promise<{ text: string; ok: boolean }> {
    if (!text || text.trim().length < 40) return { text, ok: true };
    if (this.translate.detect(text) === 'fr') return { text, ok: true };
    const translated = await this.translate.toFrench(text);
    return translated ? { text: translated.text, ok: true } : { text, ok: false };
  }

  /**
   * Torrents envoyés avant la traduction du synopsis : on les traduit petit à petit (quelques-uns toutes
   * les 10 minutes, pour rester dans les limites du service de traduction gratuit).
   */
  @Cron('*/10 * * * *')
  async backfillOverviews() {
    const torrents = await this.prisma.torrent.findMany({
      where: { metaSource: { not: null }, overviewTranslatedAt: null },
      select: { id: true, metadata: true },
      take: 5,
    });
    for (const t of torrents) {
      const info = ((t.metadata as any) ?? {}) as Record<string, any>;
      try {
        let ok = true;
        if (typeof info.overview === 'string' && info.overview) {
          const o = await this.toFrenchSafe(info.overview);
          info.overview = o.text;
          ok = o.ok;
        }
        if (typeof info.tagline === 'string' && info.tagline) info.tagline = (await this.toFrenchSafe(info.tagline)).text;
        if (ok) await this.prisma.torrent.update({ where: { id: t.id }, data: { metadata: info as any, overviewTranslatedAt: new Date() } });
      } catch (err: any) {
        this.logger.warn(`Traduction du synopsis : ${err?.message ?? err}`);
      }
    }
  }

  private richRaw(kind: string, id: string): Promise<RichMetadata> {
    switch (kind) {
      case 'FILM':
        return this.richTmdb('movie', id);
      case 'SERIE':
        return this.richTmdb('tv', id);
      case 'MUSIQUE':
        return this.richDeezer(id);
      case 'LIVRE':
        return id.startsWith('ol:') ? this.richOpenLibrary(id.slice(3)) : this.richBooks(id);
      case 'JEU':
        return this.richRawg(id);
      case 'XXX':
        return this.richPorndb(id);
      default:
        throw new BadRequestException(`Recherche non disponible pour la catégorie ${kind}`);
    }
  }

  private async richTmdb(type: 'movie' | 'tv', id: string): Promise<RichMetadata> {
    const url =
      `${TMDB_API}/${type}/${encodeURIComponent(id)}?language=fr-FR` +
      `&append_to_response=credits,videos,external_ids,alternative_titles,translations&include_video_language=fr,en,null&api_key=${this.tmdbKey}`;
    const r = await this.fetchJson(url, 'TMDB');
    if (r.success === false) throw new NotFoundException('Fiche introuvable sur TMDB');

    const isMovie = type === 'movie';
    const title = (isMovie ? r.title : r.name) ?? '';
    const original = (isMovie ? r.original_title : r.original_name) ?? '';
    const date: string = (isMovie ? r.release_date : r.first_air_date) ?? '';
    const runtime: number | null = isMovie ? r.runtime || null : r.episode_run_time?.[0] || null;
    const img = (path: string | null | undefined, size = 'w185') => (path ? `${TMDB_IMG}/${size}${path}` : null);

    const cast: any[] = (r.credits?.cast ?? []).slice(0, 12);
    const crew: any[] = r.credits?.crew ?? [];
    const pickCrew = (jobs: string[], max: number) =>
      unique(crew.filter((c) => jobs.includes(c.job)).sort((a, b) => jobs.indexOf(a.job) - jobs.indexOf(b.job)), (c) => String(c.id)).slice(0, max);
    const directors = pickCrew(['Director'], 3);
    const producers = pickCrew(['Producer', 'Executive Producer'], 4);
    const writers = pickCrew(['Screenplay', 'Writer', 'Story', 'Author'], 3);
    const creators: any[] = (r.created_by ?? []).slice(0, 3);
    const companies: any[] = (r.production_companies ?? []).slice(0, 4);
    const networks: any[] = (r.networks ?? []).slice(0, 3);
    const genres: string[] = (r.genres ?? []).map((g: any) => g.name);

    // Saga (suites/préquelles) : liste des films de la collection TMDB.
    let collection: { id: number; name: string; parts: { tmdbId: number; title: string; releaseDate: string | null; year: string | null }[] } | null = null;
    if (isMovie && r.belongs_to_collection?.id) {
      try {
        const c = await this.fetchJson(`${TMDB_API}/collection/${r.belongs_to_collection.id}?language=fr-FR&api_key=${this.tmdbKey}`, 'TMDB');
        collection = {
          id: c.id,
          name: c.name,
          parts: (c.parts ?? [])
            .map((p: any) => ({ tmdbId: p.id, title: p.title, releaseDate: p.release_date || null, year: p.release_date ? String(p.release_date).slice(0, 4) : null }))
            .sort((a: any, b: any) => String(a.releaseDate ?? '9999').localeCompare(String(b.releaseDate ?? '9999'))),
        };
      } catch {
        collection = { id: r.belongs_to_collection.id, name: r.belongs_to_collection.name, parts: [] };
      }
    }
    const seasonList = isMovie
      ? null
      : (r.seasons ?? [])
          .filter((s: any) => s.season_number > 0)
          .map((s: any) => ({ number: s.season_number, name: s.name, episodeCount: s.episode_count ?? null, airDate: s.air_date ?? null }));

    const yt: any[] = (r.videos?.results ?? []).filter((v: any) => v.site === 'YouTube');
    const trailer = yt.find((v) => v.type === 'Trailer' && v.official) ?? yt.find((v) => v.type === 'Trailer') ?? yt.find((v) => v.type === 'Teaser') ?? null;

    const person = (p: any, role: string, position: number, detail?: string): EntityDraft => ({
      type: 'PERSON', role, name: p.name, source: 'tmdb', externalId: String(p.id), imageUrl: img(p.profile_path), detail, position,
    });
    const company = (c: any, role: string, position: number): EntityDraft => ({
      type: 'COMPANY', role, name: c.name, source: 'tmdb', externalId: String(c.id), imageUrl: img(c.logo_path), position,
    });

    const entities: EntityDraft[] = [
      ...cast.map((c, i) => person(c, 'ACTOR', i, c.character || undefined)),
      ...directors.map((c, i) => person(c, 'DIRECTOR', i)),
      ...producers.map((c, i) => person(c, 'PRODUCER', i)),
      ...writers.map((c, i) => person(c, 'WRITER', i)),
      ...creators.map((c, i) => person(c, 'CREATOR', i)),
      ...companies.map((c, i) => company(c, 'STUDIO', i)),
      ...networks.map((c, i) => company(c, 'NETWORK', i)),
      ...genreDrafts(genres),
    ];

    // Tous les titres connus (traductions + titres alternatifs par région) : sert à retrouver le torrent quel que soit le titre cherché.
    const titleEntries: { title: string; lang: string }[] = [];
    const pushTitle = (t: unknown, lang: string) => {
      const v = typeof t === 'string' ? t.trim() : '';
      if (v) titleEntries.push({ title: v, lang });
    };
    pushTitle(title, 'fr');
    pushTitle(original, 'original');
    for (const tr of r.translations?.translations ?? []) {
      pushTitle(isMovie ? tr.data?.title : tr.data?.name, `${tr.iso_639_1 ?? ''}${tr.iso_3166_1 ? `-${tr.iso_3166_1}` : ''}`);
    }
    for (const alt of (isMovie ? r.alternative_titles?.titles : r.alternative_titles?.results) ?? []) pushTitle(alt.title, alt.iso_3166_1 ?? '');
    const knownTitles = unique(titleEntries, (e) => e.title.toLowerCase()).slice(0, 60);
    const searchTitles = this.buildSearchTitles(knownTitles.map((t) => t.title));

    const rating = typeof r.vote_average === 'number' && r.vote_count > 0 ? r.vote_average : null;
    const names = (list: any[]) => list.map((p) => p.name).join(', ');

    return {
      source: 'tmdb',
      variables: {
        titre: title,
        titre_original: original && original !== title ? original : '',
        année: date.slice(0, 4),
        description: r.overview ?? '',
        genre: genres.join(', '),
        durée: runtime ? formatMinutes(runtime) : '',
        note: rating !== null ? `${rating.toFixed(1).replace('.', ',')} / 10` : '',
        réalisateur: names(directors.length ? directors : creators),
        acteurs: names(cast.slice(0, 6)),
        studio: names(companies.slice(0, 3)),
      },
      info: {
        kind: type,
        originalTitle: original || null,
        tagline: r.tagline || null,
        releaseDate: date || null,
        runtime,
        rating,
        votes: r.vote_count ?? null,
        status: r.status ?? null,
        countries: (r.production_countries ?? []).map((c: any) => c.name),
        languages: (r.spoken_languages ?? []).map((l: any) => l.name || l.english_name),
        imdbId: r.imdb_id || r.external_ids?.imdb_id || null,
        tmdbId: r.id,
        website: r.homepage || null,
        seasons: r.number_of_seasons ?? null,
        episodes: r.number_of_episodes ?? null,
        overview: r.overview || null,
        collection,
        seasonList,
        titles: knownTitles.slice(0, 40),
        trailer: trailer ? { site: 'YouTube', key: trailer.key, name: trailer.name } : null,
      },
      entities,
      coverUrl: img(r.poster_path, 'w500'),
      backdropUrl: img(r.backdrop_path, 'w1280'),
      searchTitles,
    };
  }

  /** Une ligne par titre, plus une variante sans accents (« Amélie » et « Amelie »), pour la recherche. */
  private buildSearchTitles(titles: string[]): string {
    const lines = unique(titles.flatMap((t) => [t, deaccent(t)]), (t) => t.toLowerCase());
    return lines.join('\n').slice(0, 6000);
  }

  private async richDeezer(id: string): Promise<RichMetadata> {
    const a = await this.fetchJson(`https://api.deezer.com/album/${encodeURIComponent(id)}`, 'Deezer');
    if (a.error) throw new NotFoundException('Album introuvable sur Deezer');

    const tracks: any[] = a.tracks?.data ?? [];
    const genres: string[] = (a.genres?.data ?? []).map((g: any) => g.name);
    const artists = unique([a.artist, ...(a.contributors ?? [])].filter(Boolean), (x: any) => String(x.id)).slice(0, 6);

    const entities: EntityDraft[] = [
      ...artists.map((x: any, i: number): EntityDraft => ({
        type: 'PERSON', role: 'ARTIST', name: x.name, source: 'deezer', externalId: String(x.id), imageUrl: x.picture_big ?? x.picture_medium ?? null, position: i,
      })),
      ...(a.label ? [{ type: 'COMPANY', role: 'LABEL', name: a.label, source: 'seeduction', externalId: slugify(a.label), position: 0 } as EntityDraft] : []),
      ...genreDrafts(genres),
    ];

    return {
      source: 'deezer',
      variables: {
        titre: a.title ?? '',
        artiste: a.artist?.name ?? '',
        année: a.release_date ? String(a.release_date).slice(0, 4) : '',
        genre: genres.join(', '),
        label: a.label ?? '',
        durée: a.duration ? formatMinutes(Math.round(a.duration / 60)) : '',
        fichiers: tracks.map((t) => t.title).filter(Boolean).join(', '),
        // Deezer ne fournit pas de texte de présentation d'album — laissé vide, jamais inventé.
        description: '',
      },
      info: {
        releaseDate: a.release_date ?? null,
        label: a.label ?? null,
        nbTracks: a.nb_tracks ?? null,
        duration: a.duration ?? null,
        recordType: a.record_type ?? null,
        deezerId: a.id,
        tracks: tracks.slice(0, 80).map((t) => ({ title: t.title, duration: t.duration })),
      },
      entities,
      coverUrl: a.cover_big ?? a.cover_medium ?? null,
      backdropUrl: null,
    };
  }

  private bookEntities(authors: string[], publisher: string | undefined, categories: string[]): EntityDraft[] {
    return [
      ...unique(authors.filter(Boolean), (n) => slugify(n)).map((name, i): EntityDraft => ({
        type: 'PERSON', role: 'AUTHOR', name, source: 'seeduction', externalId: slugify(name), position: i,
      })),
      ...(publisher ? [{ type: 'COMPANY', role: 'PUBLISHER', name: publisher, source: 'seeduction', externalId: slugify(publisher), position: 0 } as EntityDraft] : []),
      ...genreDrafts(categories),
    ];
  }

  private async richBooks(id: string): Promise<RichMetadata> {
    const keyParam = process.env.GOOGLE_BOOKS_API_KEY ? `?key=${process.env.GOOGLE_BOOKS_API_KEY}` : '';
    const b = await this.fetchJson(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}${keyParam}`, 'Google Books');
    const info = b.volumeInfo ?? {};
    const categories: string[] = unique(
      (info.categories ?? []).flatMap((c: string) => c.split('/')).map((c: string) => c.trim()).filter(Boolean),
      (c: string) => slugify(c),
    ).slice(0, 4);
    const isbn = (info.industryIdentifiers ?? []).find((x: any) => x.type === 'ISBN_13')?.identifier ?? null;

    return {
      source: 'google-books',
      variables: {
        titre: info.title ?? '',
        auteur: (info.authors ?? []).join(', '),
        année: info.publishedDate ? String(info.publishedDate).slice(0, 4) : '',
        genre: categories.join(', '),
        éditeur: info.publisher ?? '',
        pages: info.pageCount ? String(info.pageCount) : '',
        description: info.description ?? '',
      },
      info: {
        publishedDate: info.publishedDate ?? null,
        publisher: info.publisher ?? null,
        pageCount: info.pageCount ?? null,
        language: info.language ?? null,
        isbn,
        rating: info.averageRating ?? null,
      },
      entities: this.bookEntities(info.authors ?? [], info.publisher, categories),
      coverUrl: info.imageLinks?.thumbnail ?? null,
      backdropUrl: null,
    };
  }

  private async richOpenLibrary(workId: string): Promise<RichMetadata> {
    const work = await this.fetchJson(`https://openlibrary.org/works/${encodeURIComponent(workId)}.json`, 'Open Library');
    const authorKeys: string[] = (work.authors ?? []).map((a: any) => a.author?.key).filter(Boolean).slice(0, 3);
    const authors = (
      await Promise.all(authorKeys.map((k) => this.fetchJson(`https://openlibrary.org${k}.json`, 'Open Library').then((a) => a.name as string).catch(() => '')))
    ).filter(Boolean);
    const description = typeof work.description === 'string' ? work.description : (work.description?.value ?? '');
    const year = String(work.first_publish_date ?? '').match(/\d{4}/)?.[0] ?? '';
    const subjects: string[] = (work.subjects ?? []).filter((s: string) => s.length < 40).slice(0, 4);

    return {
      source: 'openlibrary',
      variables: { titre: work.title ?? '', auteur: authors.join(', '), année: year, genre: subjects.join(', '), description },
      info: { publishedDate: work.first_publish_date ?? null },
      entities: this.bookEntities(authors, undefined, subjects),
      coverUrl: work.covers?.[0] ? `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg` : null,
      backdropUrl: null,
    };
  }

  private async richRawg(id: string): Promise<RichMetadata> {
    const g = await this.fetchJson(`https://api.rawg.io/api/games/${encodeURIComponent(id)}?key=${this.rawgKey}`, 'RAWG');
    const genres: string[] = (g.genres ?? []).map((x: any) => x.name);
    const platforms: string[] = unique<string>((g.platforms ?? []).map((p: any) => p.platform?.name).filter(Boolean), (n) => slugify(n));
    const studio = (x: any, role: string, i: number): EntityDraft => ({
      type: 'COMPANY', role, name: x.name, source: 'rawg', externalId: String(x.id), imageUrl: x.image_background ?? null, position: i,
    });
    const developers: any[] = (g.developers ?? []).slice(0, 3);
    const publishers: any[] = (g.publishers ?? []).slice(0, 3);

    return {
      source: 'rawg',
      variables: {
        titre: g.name ?? '',
        année: g.released ? String(g.released).slice(0, 4) : '',
        genre: genres.join(', '),
        développeur: developers.map((d) => d.name).join(', '),
        éditeur: publishers.map((d) => d.name).join(', '),
        plateformes: platforms.join(', '),
        note: g.metacritic ? `${g.metacritic} / 100 (Metacritic)` : '',
        description: g.description_raw ?? '',
      },
      info: {
        released: g.released ?? null,
        metacritic: g.metacritic ?? null,
        rating: g.rating ?? null,
        playtime: g.playtime ?? null,
        website: g.website || null,
        esrb: g.esrb_rating?.name ?? null,
        rawgId: g.id,
      },
      entities: [
        ...developers.map((d, i) => studio(d, 'DEVELOPER', i)),
        ...publishers.map((d, i) => studio(d, 'PUBLISHER', i)),
        ...genreDrafts(genres),
        ...platforms.map((name, i): EntityDraft => ({ type: 'PLATFORM', role: 'PLATFORM', name, source: 'seeduction', externalId: slugify(name), position: i })),
      ],
      coverUrl: g.background_image ?? null,
      backdropUrl: g.background_image_additional ?? null,
    };
  }

  // ------------------------------------------------------------ ThePornDB (XXX)

  private porndbHeaders() {
    return { Authorization: `Bearer ${this.porndbKey}`, Accept: 'application/json' };
  }

  /** Studios d'abord (pour un pack : on rattache la release au studio plutôt qu'à l'un de ses films), puis films et scènes. Les ids sont préfixés "studio:" / "scene:" / "movie:". */
  private async searchPorndb(query: string): Promise<SearchResult[]> {
    const q = encodeURIComponent(query);
    const call = (type: 'scenes' | 'movies' | 'sites') =>
      this.fetchJson(`${PORNDB_API}/${type}?q=${q}&per_page=10`, 'ThePornDB', this.porndbHeaders()).then((r) => (r.data ?? []) as any[]);
    const [scenes, movies, sites] = await Promise.allSettled([call('scenes'), call('movies'), call('sites')]);
    if (scenes.status === 'rejected' && movies.status === 'rejected') throw scenes.reason;
    const studios = collectStudios(sites.status === 'fulfilled' ? sites.value : [], [...(movies.status === 'fulfilled' ? movies.value : []), ...(scenes.status === 'fulfilled' ? scenes.value : [])])
      .map((s): SearchResult => ({ id: s.id, title: s.name, subtitle: s.count > 0 ? `🏢 Studio · ${s.count} résultat${s.count > 1 ? 's' : ''} ci-dessous` : '🏢 Studio', thumbnail: s.logo }));

    const toResult = (type: 'scene' | 'movie') => (r: any): SearchResult => ({
      id: `${type}:${r.id}`,
      title: r.title ?? '',
      subtitle: [type === 'movie' ? 'Film' : 'Scène', r.site?.name, r.date ? String(r.date).slice(0, 4) : ''].filter(Boolean).join(' · '),
      thumbnail: r.poster || r.image || r.posters?.small || null,
    });
    return [
      ...studios,
      ...(movies.status === 'fulfilled' ? movies.value.slice(0, 6).map(toResult('movie')) : []),
      ...(scenes.status === 'fulfilled' ? scenes.value.slice(0, 8).map(toResult('scene')) : []),
    ];
  }

  /**
   * Fiche ThePornDB qui correspond SANS AMBIGUÏTÉ à un nom de release adulte (scène : site + date + interprètes ; film : titre exact + année), pour le
   * rattachement automatique à l'import. Null sans clé, sans correspondance claire ou en cas d'erreur : le cas douteux est proposé à la vérification manuelle.
   */
  async porndbMatch(name: string): Promise<{ id: string; title: string; year?: string } | null> {
    if (!this.porndbKey) return null;
    const p = parseAdultName(name);
    const queries = p.kind === 'scene' ? [`${p.site} ${p.rest}`.trim(), p.rest, p.site].filter((q, i, a) => q.length >= 3 && a.indexOf(q) === i) : [p.title];
    const type = p.kind === 'scene' ? 'scenes' : 'movies';
    try {
      for (const q of queries) {
        const res = await this.fetchJson(`${PORNDB_API}/${type}?q=${encodeURIComponent(q)}&per_page=25`, 'ThePornDB', this.porndbHeaders());
        const hits: PorndbHit[] = ((res.data ?? []) as any[]).map((r) => ({
          id: `${p.kind}:${r.id}`, kind: p.kind, title: String(r.title ?? ''), date: r.date ? String(r.date).slice(0, 10) : undefined, site: r.site?.name ?? r.studio?.name ?? undefined,
          performers: (r.performers ?? []).map((x: any) => (x.parent ?? x)?.name).filter(Boolean),
        }));
        const hit = pickPorndbMatch(name, hits);
        if (hit) return { id: hit.id, title: hit.title, year: hit.date?.slice(0, 4) };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Fiche d'un STUDIO (pack de plusieurs films ou scènes du même studio) : son nom, son logo et sa description ; le studio est rattaché au torrent comme entité « studio ». */
  private async richPorndbStudio(id: string): Promise<RichMetadata> {
    const p = parseStudioId(id);
    if (!p) throw new BadRequestException('Identifiant de studio invalide');
    let g: any = null;
    try { const res = await this.fetchJson(`${PORNDB_API}/sites/${encodeURIComponent(p.uuid)}`, 'ThePornDB', this.porndbHeaders()); g = res.data ?? res; } catch { g = null; } // le nom contenu dans l'identifiant suffit si le détail est indisponible
    const name: string = String(g?.name ?? p.name ?? '').trim();
    if (!name) throw new ServiceUnavailableException('Studio introuvable sur ThePornDB.');
    const logo: string | null = g?.logo || g?.poster || null;
    return {
      source: 'theporndb',
      variables: { titre: name, année: '', description: g?.description ?? '', genre: '', durée: '', acteurs: '', studio: name },
      info: { kind: 'studio', overview: g?.description || null, website: g?.url || null, porndbId: p.uuid },
      entities: [{ type: 'COMPANY', role: 'STUDIO', name, source: 'theporndb', externalId: String(p.uuid), imageUrl: logo, position: 0 }],
      coverUrl: logo,
      backdropUrl: null,
    };
  }

  private async richPorndb(id: string): Promise<RichMetadata> {
    if (id.startsWith('studio:')) return this.richPorndbStudio(id);
    const [type, rawId] = id.includes(':') ? (id.split(':') as [string, string]) : ['scene', id];
    const path = type === 'movie' ? 'movies' : 'scenes';
    const res = await this.fetchJson(`${PORNDB_API}/${path}/${encodeURIComponent(rawId)}`, 'ThePornDB', this.porndbHeaders());
    const g = res.data ?? res;

    const performers: any[] = (g.performers ?? []).map((p: any) => p.parent ?? p).filter((p: any) => p?.name).slice(0, 12);
    const tags: string[] = (g.tags ?? []).map((t: any) => t.name).filter(Boolean);
    const site = g.site ?? g.studio ?? null;
    const seconds = Number(g.duration) || 0;
    const date: string = g.date ? String(g.date) : '';

    const entities: EntityDraft[] = [
      ...performers.map((p, i): EntityDraft => ({
        type: 'PERSON', role: 'ACTOR', name: p.name, source: 'theporndb', externalId: String(p.id), imageUrl: p.image || p.face || null, position: i,
      })),
      ...(site?.name
        ? [{ type: 'COMPANY', role: 'STUDIO', name: site.name, source: 'theporndb', externalId: String(site.uuid ?? site.id ?? slugify(site.name)), imageUrl: site.logo || null, position: 0 } as EntityDraft]
        : []),
      ...genreDrafts(tags),
    ];

    return {
      source: 'theporndb',
      variables: {
        titre: g.title ?? '',
        année: date.slice(0, 4),
        description: g.description ?? '',
        genre: tags.slice(0, 10).join(', '),
        durée: seconds ? formatMinutes(Math.round(seconds / 60)) : '',
        acteurs: performers.slice(0, 8).map((p) => p.name).join(', '),
        studio: site?.name ?? '',
      },
      info: {
        kind: type === 'movie' ? 'movie' : 'scene',
        releaseDate: date || null,
        runtime: seconds ? Math.round(seconds / 60) : null,
        overview: g.description || null,
        website: g.url || null,
        porndbId: g.id ?? rawId,
      },
      entities,
      coverUrl: g.poster || g.image || g.posters?.large || null,
      backdropUrl: g.background?.large || g.background?.full || null,
    };
  }

  /** Épisodes d'une saison (titre, date) — pour lister lesquels sont disponibles sur Seeduction. */
  async seasonEpisodes(tmdbId: string, season: number) {
    if (!this.tmdbKey) throw new ServiceUnavailableException("La recherche Film/Série n'est pas configurée (clé TMDB manquante).");
    if (!/^\d+$/.test(tmdbId) || !Number.isInteger(season) || season < 0) throw new BadRequestException('Paramètres invalides');
    const r = await this.fetchJson(`${TMDB_API}/tv/${tmdbId}/season/${season}?language=fr-FR&api_key=${this.tmdbKey}`, 'TMDB');
    return (r.episodes ?? []).map((e: any) => ({
      number: e.episode_number,
      name: e.name || `Épisode ${e.episode_number}`,
      airDate: e.air_date || null,
      runtime: e.runtime || null,
    }));
  }

  // ------------------------------------------------------- rattachement au torrent

  /**
   * Enregistre la fiche complète d'un torrent (voir Torrent.metadata) et relie
   * les entités trouvées (acteurs, studios, genres...) : elles sont partagées
   * entre tous les torrents, donc navigables. Les photos sont ensuite
   * téléchargées sur Seeduction en arrière-plan.
   */
  async attach(torrentId: string, kind: string, id: string, opts: { replaceCover?: boolean } = {}) {
    this.assertSearchable(kind);
    const rich = await this.rich(kind, id);

    await this.prisma.torrent.update({
      where: { id: torrentId },
      data: {
        metaSource: rich.source, metaExternalId: id, metadata: rich.info as any,
        overviewTranslatedAt: rich.overviewOk ? new Date() : null,
        ...(rich.searchTitles !== undefined ? { searchTitles: rich.searchTitles } : {}),
      },
    });
    await this.storeReleaseDate(torrentId, id, rich.info).catch((e) => this.logger.warn(`Date de sortie : ${e?.message ?? e}`));

    const pendingImages: { entityId: string; url: string }[] = [];
    for (const e of rich.entities) {
      const entity = await this.prisma.entity.upsert({
        where: { type_source_externalId: { type: e.type, source: e.source, externalId: e.externalId } },
        update: {},
        create: { type: e.type, name: e.name, source: e.source, externalId: e.externalId },
      });
      await this.prisma.torrentEntity.upsert({
        where: { torrentId_entityId_role: { torrentId, entityId: entity.id, role: e.role } },
        update: { detail: e.detail ?? null, position: e.position },
        create: { torrentId, entityId: entity.id, role: e.role, detail: e.detail ?? null, position: e.position },
      });
      if (e.imageUrl && !entity.imageUrl) pendingImages.push({ entityId: entity.id, url: e.imageUrl });
    }

    void this.downloadImages(torrentId, pendingImages, rich.backdropUrl, rich.coverUrl, !!opts.replaceCover).catch((err) =>
      this.logger.warn(`Téléchargement des images de la fiche échoué : ${err?.message ?? err}`),
    );
  }

  /**
   * Les torrents envoyés avant l'arrivée des titres multilingues n'ont pas de liste de titres : on les
   * complète petit à petit (quelques-uns toutes les 10 minutes, sans dépasser les limites de TMDB).
   */
  @Cron('*/10 * * * *')
  async backfillSearchTitles() {
    if (!this.tmdbKey) return;
    const torrents = await this.prisma.torrent.findMany({
      where: { metaSource: 'tmdb', metaExternalId: { not: null }, searchTitles: null },
      select: { id: true, metaExternalId: true, metadata: true },
      take: 10,
    });
    for (const t of torrents) {
      try {
        const kind = (t.metadata as any)?.kind === 'tv' ? 'tv' : 'movie';
        const rich = await this.richTmdb(kind, t.metaExternalId!);
        await this.prisma.torrent.update({
          where: { id: t.id },
          data: { searchTitles: rich.searchTitles ?? '', metadata: { ...((t.metadata as object) ?? {}), titles: rich.info.titles ?? [] } as any },
        });
      } catch (err: any) {
        // Fiche disparue de TMDB ou service indisponible : on marque « fait » si la fiche n'existe plus, sinon on réessaiera.
        if (err instanceof NotFoundException) await this.prisma.torrent.update({ where: { id: t.id }, data: { searchTitles: '' } });
        else this.logger.warn(`Titres multilingues : ${err?.message ?? err}`);
      }
    }
  }

  /**
   * Remplace la fiche d'un torrent déjà sur le site (modération) : les anciens liens (acteurs, studios, genres...) sont retirés, la nouvelle fiche est
   * rattachée comme à l'envoi. `replaceCover` : l'affiche de la nouvelle fiche devient aussi la pochette du torrent.
   */
  async replaceFiche(torrentId: string, kind: string, id: string, replaceCover: boolean) {
    const t = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true } });
    if (!t) throw new NotFoundException('Torrent introuvable');
    if (!id || !/^[\w:.-]{1,120}$/.test(id)) throw new BadRequestException('Identifiant de fiche invalide');
    this.assertSearchable(kind);
    const rich = await this.rich(kind, id); // la fiche doit exister avant de toucher à l'ancienne
    if (!rich) throw new NotFoundException('Fiche introuvable');
    await this.prisma.torrentEntity.deleteMany({ where: { torrentId } });
    await this.attach(torrentId, kind, id, { replaceCover });
    return { replaced: true };
  }

  /** Retire la fiche d'un torrent (mauvaise fiche) : métadonnées et liens supprimés, la pochette est gardée. */
  async clearFiche(torrentId: string) {
    const t = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { id: true } });
    if (!t) throw new NotFoundException('Torrent introuvable');
    await this.prisma.torrentEntity.deleteMany({ where: { torrentId } });
    await this.prisma.torrent.update({ where: { id: torrentId }, data: { metaSource: null, metaExternalId: null, metadata: Prisma.DbNull, searchTitles: null, overviewTranslatedAt: null, releaseDate: null } });
    return { cleared: true };
  }

  private episodeDates = new Map<string, Map<number, string | null>>();

  /** Date de diffusion d'un épisode de série (TMDB), mémorisée par saison. Null si inconnue ou si TMDB n'est pas joignable. */
  private async episodeAirDate(tmdbId: string, season: string | null | undefined, episode: string | null | undefined): Promise<string | null> {
    if (!this.tmdbKey || !season || !episode || !/^\d+$/.test(season) || !/^\d+$/.test(episode)) return null;
    const key = `${tmdbId}:${season}`;
    let eps = this.episodeDates.get(key);
    if (!eps) {
      try { eps = new Map((await this.seasonEpisodes(tmdbId, Number(season))).map((e: any) => [Number(e.number), e.airDate as string | null])); }
      catch { return null; }
      this.episodeDates.set(key, eps);
    }
    return eps.get(Number(episode)) ?? null;
  }

  /** Calcule et enregistre la date de sortie d'un torrent (voir release-date.ts) d'après sa fiche, sa saison et son épisode. */
  private async storeReleaseDate(torrentId: string, tmdbId: string, info: any) {
    const t = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { season: true, episode: true } });
    const airDate = info?.kind === 'tv' ? await this.episodeAirDate(tmdbId, t?.season, t?.episode) : null;
    const date = releaseDateOf(info, t?.season, airDate);
    await this.prisma.$executeRaw`UPDATE "Torrent" SET "releaseDate" = ${date} WHERE id = ${torrentId}`; // sans toucher à la date de modification
  }

  private releaseCursor: Date | null = null;
  private releaseDone = false;

  /**
   * Rattrapage : les torrents qui ont une fiche mais pas de date de sortie (envoyés avant cette fonction) la reçoivent petit à petit
   * (200 par passe toutes les 10 minutes ; les épisodes de série interrogent TMDB, 8 appels au plus par passe).
   */
  @Cron('*/10 * * * *')
  async backfillReleaseDates() {
    if (this.releaseDone) return;
    const rows = await this.prisma.torrent.findMany({
      where: { metaSource: { not: null }, releaseDate: null, ...(this.releaseCursor ? { createdAt: { gt: this.releaseCursor } } : {}) },
      orderBy: { createdAt: 'asc' }, take: 200,
      select: { id: true, createdAt: true, metaExternalId: true, metadata: true, season: true, episode: true },
    });
    let calls = 0;
    for (const r of rows) {
      const info: any = r.metadata;
      if (!info) continue;
      const needsNetwork = info.kind === 'tv' && /^\d+$/.test(r.season ?? '') && /^\d+$/.test(r.episode ?? '');
      if (needsNetwork && calls >= 8 && !this.episodeDates.has(`${r.metaExternalId}:${r.season}`)) continue; // la suite à la prochaine passe
      if (needsNetwork && !this.episodeDates.has(`${r.metaExternalId}:${r.season}`)) calls++;
      const airDate = needsNetwork ? await this.episodeAirDate(r.metaExternalId!, r.season, r.episode) : null;
      const date = releaseDateOf(info, r.season, airDate);
      if (date) await this.prisma.$executeRaw`UPDATE "Torrent" SET "releaseDate" = ${date} WHERE id = ${r.id} AND "releaseDate" IS NULL`;
    }
    if (rows.length < 200) this.releaseDone = true;
    else this.releaseCursor = rows[rows.length - 1].createdAt;
  }

  /**
   * Torrents importés automatiquement dont la fiche TMDB est rattachée mais qui n'ont pas de pochette (l'import ne passe pas par le formulaire d'envoi,
   * qui enregistre l'affiche) : on la télécharge petit à petit (quelques-unes toutes les 10 minutes). Un torrent dont la fiche n'a pas d'affiche n'est pas réessayé.
   */
  @Cron('*/10 * * * *')
  async backfillImportedCovers() {
    if (!this.tmdbKey) return;
    const imported = await this.prisma.importItem.findMany({ where: { torrentId: { not: null } }, select: { torrentId: true } });
    if (imported.length === 0) return;
    const torrents = await this.prisma.torrent.findMany({
      where: { id: { in: imported.map((i) => i.torrentId!) }, metaSource: 'tmdb', metaExternalId: { not: null }, coverImage: null },
      select: { id: true, metaExternalId: true, metadata: true },
      take: 40,
    });
    for (const t of torrents.filter((x) => !(x.metadata as any)?.coverTried).slice(0, 5)) {
      try {
        const kind = (t.metadata as any)?.kind === 'tv' ? 'tv' : 'movie';
        const rich = await this.richTmdb(kind, t.metaExternalId!);
        const local = await this.saveCover(rich.coverUrl);
        await this.prisma.torrent.update({ where: { id: t.id }, data: local ? { coverImage: local } : { metadata: { ...((t.metadata as object) ?? {}), coverTried: true } as any } });
      } catch (err: any) {
        if (err instanceof NotFoundException) await this.prisma.torrent.update({ where: { id: t.id }, data: { metadata: { ...((t.metadata as object) ?? {}), coverTried: true } as any } });
        else this.logger.warn(`Pochette des torrents importés : ${err?.message ?? err}`);
      }
    }
  }

  private async downloadImages(torrentId: string, images: { entityId: string; url: string }[], backdropUrl: string | null, coverUrl: string | null = null, forceCover = false) {
    await Promise.all(
      images.map(async ({ entityId, url }) => {
        const local = await this.saveCover(url);
        if (local) await this.prisma.entity.update({ where: { id: entityId }, data: { imageUrl: local } });
      }),
    );
    if (backdropUrl) {
      const local = await this.saveCover(backdropUrl);
      if (local) {
        const t = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { metadata: true } });
        await this.prisma.torrent.update({ where: { id: torrentId }, data: { metadata: { ...((t?.metadata as object) ?? {}), backdrop: local } } });
      }
    }
    // Pochette : seulement si le torrent n'en a pas déjà une (celle du formulaire d'envoi, ou choisie par le membre, reste prioritaire).
    if (coverUrl) {
      const t = await this.prisma.torrent.findUnique({ where: { id: torrentId }, select: { coverImage: true } });
      if (t && (forceCover || !t.coverImage)) {
        const local = await this.saveCover(coverUrl);
        if (local) await this.prisma.torrent.update({ where: { id: torrentId }, data: { coverImage: local } });
      }
    }
  }

  /**
   * Fiche TMDB qui correspond EXACTEMENT à un titre (et à l'année, à un an près) : son identifiant (pour la rattacher au torrent)
   * et ses genres (pour classer la release : film / série / animation / émission / documentaire). Renvoie null sans clé TMDB, sans
   * correspondance sûre ou en cas d'erreur : on ne rattache jamais une fiche au hasard (les cas douteux sont proposés à la vérification manuelle).
   * La comparaison ignore les accents, la casse, la ponctuation, les ligatures (« Cœur » = « Coeur »), « & » = « and » et l'article du début (« The », « Le »...).
   */
  async tmdbMatch(type: 'movie' | 'tv', title: string, year?: number): Promise<{ id: string; genreIds: number[]; title: string; year?: string } | null> {
    if (!this.tmdbKey || !title.trim()) return null;
    const wanted = titleKey(title);
    if (!wanted) return null;
    const dateOf = (r: any): string => String((type === 'movie' ? r.release_date : r.first_air_date) ?? '');
    // Film : l'année doit coïncider (à un an près). Série : l'année du nom est souvent celle de l'ÉPISODE (« Family.Guy.2026.S00E64 »), pas celle de la série :
    // sans résultat avec l'année, on accepte alors le même titre exact, quelle que soit l'année de la série.
    const yearOk = (r: any, relaxed: boolean) => relaxed || !year || !dateOf(r) || Math.abs(Number(dateOf(r).slice(0, 4)) - year) <= 1;
    const sameTitle = (r: any) => [r.title, r.name, r.original_title, r.original_name].filter(Boolean).some((t: string) => titleKey(t) === wanted);
    const yearParam = year ? `&${type === 'movie' ? 'year' : 'first_air_date_year'}=${year}` : '';
    const tries = [yearParam, ...(year ? [''] : [])]; // sans l'année en second recours : une année décalée d'un an (sortie de fin d'année) reste acceptée
    try {
      for (const extra of tries) {
        // Trois langues : un film québécois, français ou anglais est retrouvé sous n'importe lequel de ses titres.
        for (const [language, query] of [...(['fr-CA', 'fr-FR', 'en-US'] as const).map((l) => [l, title] as const), ...(/oe/i.test(title) ? [['fr-CA', title.replace(/oe/gi, 'œ')] as const] : [])]) {
          const res = await this.fetchJson(`${TMDB_API}/search/${type}?query=${encodeURIComponent(query)}&language=${language}${extra}&api_key=${this.tmdbKey}`, 'TMDB');
          const hit = (res.results ?? []).find((r: any) => sameTitle(r) && yearOk(r, type === 'tv' && !!year && extra === ''));
          if (hit) return { id: String(hit.id), genreIds: Array.isArray(hit.genre_ids) ? hit.genre_ids : [], title: String(hit.title ?? hit.name ?? title), year: dateOf(hit).slice(0, 4) || undefined };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fetchJson(url: string, sourceName: string, headers?: Record<string, string>): Promise<any> {
    let res: Response;
    try {
      res = await fetch(url, headers ? { headers } : undefined);
    } catch {
      throw new ServiceUnavailableException(`Impossible de joindre ${sourceName}.`);
    }
    if (!res.ok) throw new ServiceUnavailableException(`Erreur ${sourceName} (${res.status}).`);
    return res.json();
  }
}
