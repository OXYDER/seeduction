import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CoversService } from '../covers/covers.service';
import { stripHtml } from '../metadata/extra-providers';
import { mergeEpisodes, missingImages, parseTmdbSeason, parseTvdbEpisodes, parseTvmazeEpisodes, type EpisodeData } from '../common/utils/episode-info';

const TMDB_API = (process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3').replace(/\/$/, '');
const TMDB_IMG = (process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p').replace(/\/$/, '');
const TVDB_API = 'https://api4.thetvdb.com/v4';
const DAY = 86_400_000;

/** La série dont on veut les épisodes : fournisseur et identifiant tels qu'enregistrés sur le torrent (« tvm:123 » = TVmaze, un nombre = TMDB), et de quoi la retrouver ailleurs. */
export interface ShowRef { source: string; externalId: string; imdbId?: string | null; title?: string | null; year?: number | null }

export interface EpisodeRow { season: number; episode: number; title: string | null; overview: string | null; image: string | null; airDate: string | null; runtime: number | null }

/**
 * Les fiches d'épisodes (image d'aperçu, titre, résumé, durée) : TMDB d'abord, puis TVmaze (sans clé) puis TheTVDB (si TVDB_API_KEY est configurée) quand TMDB n'a rien
 * ou n'a pas d'image pour un épisode. Les images sont copiées sur Seeduction (jamais de lien externe) et tout est gardé en base : un fournisseur n'est interrogé qu'une
 * fois par saison (de nouveau après 30 jours, ou 3 jours quand il manquait encore des images).
 */
@Injectable()
export class EpisodeInfoService {
  private logger = new Logger('EpisodeInfo');
  private tmdbKey = process.env.TMDB_API_KEY || null;
  private tvdbKey = process.env.TVDB_API_KEY || null;
  private tvdbToken: { token: string; at: number } | null = null;
  private inflight = new Map<string, Promise<void>>();
  private tvmazeCache = new Map<number, { at: number; eps: EpisodeData[] }>();

  constructor(private prisma: PrismaService, private covers: CoversService) {}

  /**
   * Les fiches d'épisodes des saisons demandées (clé « saison:épisode »). Ce qui manque est cherché chez les fournisseurs, mais on n'attend que `waitMs` :
   * la suite se termine en arrière-plan et sera là à la prochaine ouverture de la fiche.
   */
  async lookup(ref: ShowRef, seasons: number[], waitMs = 2500): Promise<Map<string, EpisodeRow>> {
    const wanted = [...new Set(seasons.filter((s) => Number.isInteger(s) && s >= 0))].slice(0, 8);
    if (wanted.length === 0 || !ref.source || !ref.externalId) return new Map();
    const work = Promise.allSettled(wanted.map((s) => this.ensureSeason(ref, s)));
    await Promise.race([work, new Promise((r) => setTimeout(r, waitMs))]);
    const rows = await this.prisma.episodeInfo.findMany({ where: { source: ref.source, externalId: ref.externalId, season: { in: wanted }, episode: { gt: 0 } } });
    return new Map(rows.map((r) => [`${r.season}:${r.episode}`, { season: r.season, episode: r.episode, title: r.title, overview: r.overview, image: r.image, airDate: r.airDate, runtime: r.runtime }]));
  }

  private ensureSeason(ref: ShowRef, season: number): Promise<void> {
    const key = `${ref.source}|${ref.externalId}|${season}`;
    let p = this.inflight.get(key);
    if (!p) {
      p = this.fetchSeason(ref, season).catch((e) => this.logger.warn(`Épisodes ${key} : ${e?.message ?? e}`)).finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    return p;
  }

  /** La saison est-elle déjà en base et assez récente ? */
  private async fresh(ref: ShowRef, season: number): Promise<boolean> {
    const rows = await this.prisma.episodeInfo.findMany({ where: { source: ref.source, externalId: ref.externalId, season }, select: { episode: true, image: true, updatedAt: true } });
    if (rows.length === 0) return false;
    const newest = Math.max(...rows.map((r) => r.updatedAt.getTime()));
    const real = rows.filter((r) => r.episode > 0);
    if (real.length === 0) return Date.now() - newest < 3 * DAY; // rien trouvé la dernière fois
    return Date.now() - newest < (real.every((r) => r.image) ? 30 : 3) * DAY;
  }

  private async fetchSeason(ref: ShowRef, season: number): Promise<void> {
    if (await this.fresh(ref, season)) return;
    const sources: { name: string; eps: EpisodeData[] }[] = [];
    let eps: EpisodeData[] = [];
    const add = (name: string, list: EpisodeData[]) => { const mine = list.filter((e) => e.season === season); if (mine.length) { sources.push({ name, eps: mine }); eps = mergeEpisodes(eps, mine); } };

    // 1. le fournisseur de la fiche de la série
    const own = ref.source === 'tmdb' || /^\d+$/.test(ref.externalId) ? 'tmdb' : ref.externalId.startsWith('tvm:') ? 'tvmaze' : null;
    let tvmazeShow: { id: number; thetvdb: number | null } | null = null;
    if (own === 'tmdb') add('tmdb', await this.tmdbSeason(ref.externalId, season));
    else if (own === 'tvmaze') {
      const id = Number(ref.externalId.slice(4));
      if (id > 0) { tvmazeShow = { id, thetvdb: null }; add('tvmaze', await this.tvmazeEpisodes(id)); }
    }
    // 2. TMDB n'a rien ou pas d'image : TVmaze (ou TMDB si la fiche venait de TVmaze)
    if (missingImages(eps)) {
      if (own !== 'tvmaze') {
        tvmazeShow = await this.tvmazeShowOf(ref);
        if (tvmazeShow) add('tvmaze', await this.tvmazeEpisodes(tvmazeShow.id));
      } else if (this.tmdbKey) {
        const tid = await this.tmdbShowId(ref);
        if (tid) add('tmdb', await this.tmdbSeason(String(tid), season));
      }
    }
    // 3. toujours pas : TheTVDB (clé facultative)
    if (missingImages(eps) && this.tvdbKey && tvmazeShow?.thetvdb) add('tvdb', await this.tvdbSeason(tvmazeShow.thetvdb, season));

    if (eps.length === 0) {
      await this.prisma.episodeInfo.upsert({
        where: { source_externalId_season_episode: { source: ref.source, externalId: ref.externalId, season, episode: 0 } },
        create: { source: ref.source, externalId: ref.externalId, season, episode: 0, provider: 'none' }, update: { provider: 'none' },
      });
      return;
    }
    // copie des images sur Seeduction (trois à la fois), puis enregistrement
    const providerOf = (e: EpisodeData) => sources.find((s) => s.eps.some((x) => x.episode === e.episode && x.imageUrl && x.imageUrl === e.imageUrl))?.name ?? sources[0]?.name ?? null;
    for (let i = 0; i < eps.length; i += 3) {
      const part = eps.slice(i, i + 3);
      const saved = await Promise.all(part.map(async (e) => {
        if (!e.imageUrl) return null;
        try { return await this.covers.saveFromUrl(e.imageUrl); } catch { return null; }
      }));
      await Promise.all(part.map((e, k) => {
        const data = { title: e.title, overview: e.overview, image: saved[k], airDate: e.airDate, runtime: e.runtime, provider: providerOf(e) };
        return this.prisma.episodeInfo.upsert({
          where: { source_externalId_season_episode: { source: ref.source, externalId: ref.externalId, season, episode: e.episode } },
          create: { source: ref.source, externalId: ref.externalId, season, episode: e.episode, ...data },
          update: { ...data, image: saved[k] ?? undefined },
        });
      }));
    }
    await this.prisma.episodeInfo.deleteMany({ where: { source: ref.source, externalId: ref.externalId, season, episode: 0 } });
  }

  // ------------------------------------------------------------------ fournisseurs

  private async json(url: string, headers?: Record<string, string>, body?: unknown): Promise<any | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Seeduction/1.0 (fiches de séries)', Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(headers ?? {}) }, ...(body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {}) });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }

  private async tmdbSeason(tmdbId: string, season: number): Promise<EpisodeData[]> {
    if (!this.tmdbKey || !/^\d+$/.test(tmdbId)) return [];
    return parseTmdbSeason(await this.json(`${TMDB_API}/tv/${tmdbId}/season/${season}?language=fr-FR&api_key=${this.tmdbKey}`), season, TMDB_IMG);
  }

  /** L'identifiant TMDB d'une série qui n'a qu'une fiche TVmaze : par l'IMDb, sinon par le titre. */
  private async tmdbShowId(ref: ShowRef): Promise<number | null> {
    if (!this.tmdbKey) return null;
    if (ref.imdbId) {
      const f = await this.json(`${TMDB_API}/find/${encodeURIComponent(ref.imdbId)}?external_source=imdb_id&api_key=${this.tmdbKey}`);
      const id = f?.tv_results?.[0]?.id;
      if (id) return Number(id);
    }
    if (ref.title) {
      const s = await this.json(`${TMDB_API}/search/tv?query=${encodeURIComponent(ref.title)}&language=fr-FR${ref.year ? `&first_air_date_year=${ref.year}` : ''}&api_key=${this.tmdbKey}`);
      const id = s?.results?.[0]?.id;
      if (id) return Number(id);
    }
    return null;
  }

  /** La série chez TVmaze (sans clé) : par l'IMDb, sinon par le titre (l'année doit concorder à un an près quand on la connaît). */
  private async tvmazeShowOf(ref: ShowRef): Promise<{ id: number; thetvdb: number | null } | null> {
    let show: any = null;
    if (ref.imdbId) show = await this.json(`https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(ref.imdbId)}`);
    if (!show?.id && ref.title) {
      const s = await this.json(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(ref.title)}`);
      const y = Number(String(s?.premiered ?? '').slice(0, 4));
      if (s?.id && (!ref.year || !y || Math.abs(y - ref.year) <= 1)) show = s;
    }
    return show?.id ? { id: Number(show.id), thetvdb: Number(show.externals?.thetvdb) || null } : null;
  }

  private async tvmazeEpisodes(id: number): Promise<EpisodeData[]> {
    const hit = this.tvmazeCache.get(id);
    if (hit && Date.now() - hit.at < 3_600_000) return hit.eps;
    const eps = parseTvmazeEpisodes(await this.json(`https://api.tvmaze.com/shows/${id}/episodes`), stripHtml);
    this.tvmazeCache.set(id, { at: Date.now(), eps });
    if (this.tvmazeCache.size > 200) this.tvmazeCache.delete(this.tvmazeCache.keys().next().value as number);
    return eps;
  }

  private async tvdbSeason(tvdbId: number, season: number): Promise<EpisodeData[]> {
    if (!this.tvdbKey) return [];
    if (!this.tvdbToken || Date.now() - this.tvdbToken.at > 20 * DAY) {
      const login = await this.json(`${TVDB_API}/login`, undefined, { apikey: this.tvdbKey });
      if (!login?.data?.token) return [];
      this.tvdbToken = { token: String(login.data.token), at: Date.now() };
    }
    return parseTvdbEpisodes(await this.json(`${TVDB_API}/series/${tvdbId}/episodes/default?season=${season}&page=0`, { Authorization: `Bearer ${this.tvdbToken.token}` }), season);
  }
}
