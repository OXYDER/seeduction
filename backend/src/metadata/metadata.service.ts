import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CoversService } from '../covers/covers.service';
import { PrismaService } from '../common/prisma.service';
import { TranslateService } from './translate.service';

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
}

const TMDB_IMG = 'https://image.tmdb.org/t/p';
const SEARCHABLE_KINDS = ['FILM', 'SERIE', 'MUSIQUE', 'LIVRE', 'JEU'] as const;

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

  constructor(private coversService: CoversService, private prisma: PrismaService, private translate: TranslateService) {}

  get supportedKinds(): string[] {
    const kinds: string[] = ['MUSIQUE', 'LIVRE'];
    if (this.tmdbKey) kinds.push('FILM', 'SERIE');
    if (this.rawgKey) kinds.push('JEU');
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
      default:
        return [];
    }
  }

  private async searchTmdb(type: 'movie' | 'tv', query: string, year?: string): Promise<SearchResult[]> {
    const yearParam = year && /^\d{4}$/.test(year) ? `&${type === 'movie' ? 'year' : 'first_air_date_year'}=${year}` : '';
    const url = `https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(query)}&language=fr-FR${yearParam}&api_key=${this.tmdbKey}`;
    const res = await this.fetchJson(url, 'TMDB');
    return (res.results ?? []).slice(0, 12).map((r: any) => ({
      id: String(r.id),
      title: (type === 'movie' ? r.title : r.name) || 'Sans titre',
      subtitle: (type === 'movie' ? r.release_date : r.first_air_date)?.slice(0, 4) || '',
      thumbnail: r.poster_path ? `${TMDB_IMG}/w342${r.poster_path}` : null,
    }));
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
      subtitle: [g.released?.slice(0, 4), (g.platforms ?? []).slice(0, 2).map((p: any) => p.platform?.name).filter(Boolean).join(', ')].filter(Boolean).join(' — '),
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
    const description = rich.variables?.description;
    if (typeof description === 'string' && description) {
      const translated = await this.translate.toFrench(description);
      if (translated) rich.variables.description = translated.text;
    }
    return rich;
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
      default:
        throw new BadRequestException(`Recherche non disponible pour la catégorie ${kind}`);
    }
  }

  private async richTmdb(type: 'movie' | 'tv', id: string): Promise<RichMetadata> {
    const url =
      `https://api.themoviedb.org/3/${type}/${encodeURIComponent(id)}?language=fr-FR` +
      `&append_to_response=credits,videos,external_ids&include_video_language=fr,en,null&api_key=${this.tmdbKey}`;
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
        const c = await this.fetchJson(`https://api.themoviedb.org/3/collection/${r.belongs_to_collection.id}?language=fr-FR&api_key=${this.tmdbKey}`, 'TMDB');
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
        trailer: trailer ? { site: 'YouTube', key: trailer.key, name: trailer.name } : null,
      },
      entities,
      coverUrl: img(r.poster_path, 'w500'),
      backdropUrl: img(r.backdrop_path, 'w1280'),
    };
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

  /** Épisodes d'une saison (titre, date) — pour lister lesquels sont disponibles sur Seeduction. */
  async seasonEpisodes(tmdbId: string, season: number) {
    if (!this.tmdbKey) throw new ServiceUnavailableException("La recherche Film/Série n'est pas configurée (clé TMDB manquante).");
    if (!/^\d+$/.test(tmdbId) || !Number.isInteger(season) || season < 0) throw new BadRequestException('Paramètres invalides');
    const r = await this.fetchJson(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}?language=fr-FR&api_key=${this.tmdbKey}`, 'TMDB');
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
  async attach(torrentId: string, kind: string, id: string) {
    this.assertSearchable(kind);
    const rich = await this.rich(kind, id);

    await this.prisma.torrent.update({
      where: { id: torrentId },
      data: { metaSource: rich.source, metaExternalId: id, metadata: rich.info as any },
    });

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

    void this.downloadImages(torrentId, pendingImages, rich.backdropUrl).catch((err) =>
      this.logger.warn(`Téléchargement des images de la fiche échoué : ${err?.message ?? err}`),
    );
  }

  private async downloadImages(torrentId: string, images: { entityId: string; url: string }[], backdropUrl: string | null) {
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
  }

  private async fetchJson(url: string, sourceName: string): Promise<any> {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new ServiceUnavailableException(`Impossible de joindre ${sourceName}.`);
    }
    if (!res.ok) throw new ServiceUnavailableException(`Erreur ${sourceName} (${res.status}).`);
    return res.json();
  }
}
