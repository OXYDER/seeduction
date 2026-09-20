import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CoversService } from '../covers/covers.service';

export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  thumbnail: string | null;
}

export type MetadataDetail = Record<string, string>;

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const SEARCHABLE_KINDS = ['FILM', 'SERIE', 'MUSIQUE', 'LIVRE'] as const;

/**
 * Recherche de vraies métadonnées (titre, synopsis, affiche...) par catégorie,
 * pour préremplir le générateur de description sans jamais rien inventer :
 * Film/Série -> TMDB, Musique -> Deezer, Livre -> Google Books. Musique et
 * Livre ne demandent aucune clé (API publiques non authentifiées) ; Film et
 * Série ont besoin d'une clé TMDB gratuite (TMDB_API_KEY).
 */
@Injectable()
export class MetadataService {
  private tmdbKey = process.env.TMDB_API_KEY || null;

  constructor(private coversService: CoversService) {}

  /**
   * Télécharge et sauvegarde l'image sur Seeduction avant de la renvoyer —
   * jamais l'URL externe brute, pour ne pas dépendre du service source une
   * fois l'image utilisée. Échoue silencieusement (chaîne vide) plutôt que
   * de faire échouer toute la recherche si le téléchargement rate.
   */
  private async saveCover(externalUrl: string | null | undefined): Promise<string> {
    if (!externalUrl) return '';
    try {
      return await this.coversService.saveFromUrl(externalUrl);
    } catch {
      return '';
    }
  }

  get supportedKinds(): string[] {
    const kinds: string[] = ['MUSIQUE', 'LIVRE'];
    if (this.tmdbKey) kinds.push('FILM', 'SERIE');
    return kinds;
  }

  private assertSearchable(kind: string) {
    if (!(SEARCHABLE_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException(`Recherche non disponible pour la catégorie ${kind}`);
    }
    if ((kind === 'FILM' || kind === 'SERIE') && !this.tmdbKey) {
      throw new ServiceUnavailableException("La recherche Film/Série n'est pas configurée (clé TMDB manquante).");
    }
  }

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
      default:
        return [];
    }
  }

  async detail(kind: string, id: string): Promise<MetadataDetail> {
    if (!id) throw new BadRequestException('Identifiant manquant');
    this.assertSearchable(kind);
    switch (kind) {
      case 'FILM':
        return this.detailTmdb('movie', id);
      case 'SERIE':
        return this.detailTmdb('tv', id);
      case 'MUSIQUE':
        return this.detailDeezer(id);
      case 'LIVRE':
        return this.detailBooks(id);
      default:
        return {};
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
      thumbnail: r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null,
    }));
  }

  private async detailTmdb(type: 'movie' | 'tv', id: string): Promise<MetadataDetail> {
    const url = `https://api.themoviedb.org/3/${type}/${id}?language=fr-FR&api_key=${this.tmdbKey}`;
    const r = await this.fetchJson(url, 'TMDB');
    if (r.success === false) throw new NotFoundException('Fiche introuvable sur TMDB');
    const date = type === 'movie' ? r.release_date : r.first_air_date;
    return {
      titre: (type === 'movie' ? r.title : r.name) ?? '',
      année: date ? String(date).slice(0, 4) : '',
      description: r.overview ?? '',
      genre: (r.genres ?? []).map((g: any) => g.name).join(', '),
      affiche: await this.saveCover(r.poster_path ? `${TMDB_IMAGE_BASE}${r.poster_path}` : null),
    };
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

  private async detailDeezer(id: string): Promise<MetadataDetail> {
    const url = `https://api.deezer.com/album/${id}`;
    const a = await this.fetchJson(url, 'Deezer');
    if (a.error) throw new NotFoundException('Album introuvable sur Deezer');
    const fichiers = (a.tracks?.data ?? []).map((t: any) => t.title).filter(Boolean).join(', ');
    return {
      titre: a.title ?? '',
      artiste: a.artist?.name ?? '',
      année: a.release_date ? String(a.release_date).slice(0, 4) : '',
      genre: (a.genres?.data ?? []).map((g: any) => g.name).join(', '),
      affiche: await this.saveCover(a.cover_big ?? a.cover_medium ?? null),
      fichiers,
      // Deezer ne fournit pas de texte de présentation d'album — laissé vide, jamais inventé.
      description: '',
    };
  }

  private async searchBooks(query: string): Promise<SearchResult[]> {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12&langRestrict=fr`;
    const res = await this.fetchJson(url, 'Google Books');
    return (res.items ?? []).map((b: any) => ({
      id: b.id,
      title: b.volumeInfo?.title ?? 'Sans titre',
      subtitle: [b.volumeInfo?.authors?.[0], b.volumeInfo?.publishedDate?.slice(0, 4)].filter(Boolean).join(' — '),
      thumbnail: b.volumeInfo?.imageLinks?.thumbnail ?? null,
    }));
  }

  private async detailBooks(id: string): Promise<MetadataDetail> {
    const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(id)}`;
    const b = await this.fetchJson(url, 'Google Books');
    const info = b.volumeInfo ?? {};
    return {
      titre: info.title ?? '',
      auteur: (info.authors ?? []).join(', '),
      année: info.publishedDate ? String(info.publishedDate).slice(0, 4) : '',
      genre: (info.categories ?? []).join(', '),
      description: info.description ?? '',
      affiche: await this.saveCover(info.imageLinks?.thumbnail ?? null),
    };
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
