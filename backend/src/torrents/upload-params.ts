import { BadRequestException } from '@nestjs/common';
import { normalizeOrigin } from '../common/utils/facets';
import type { TorrentsService } from './torrents.service';

type UploadParams = Parameters<TorrentsService['upload']>[0];

/** Un NFO ou MediaInfo d'au moins 20 caractères (hors espaces superflus) est obligatoire : il décrit la release et remplit les filtres. */
export const NFO_REQUIRED_MESSAGE = 'Le NFO ou le MediaInfo de la release est obligatoire : ajoute le fichier .nfo ou colle le texte du MediaInfo.';
export const hasEnoughNfo = (nfo?: string | null) => !!nfo && nfo.replace(/\s+/g, ' ').trim().length >= 20;

const list = (v?: string) => (v ? v.split(',').map((t) => t.trim()).filter(Boolean) : []);

/**
 * Champs d'un envoi (formulaire du site ou API publique) → paramètres de `TorrentsService.upload`. Un seul endroit : le formulaire et l'API envoient exactement la même chose.
 * `categoryId` doit déjà être résolu (l'API accepte aussi un nom ou un identifiant court, voir PublicApiService).
 */
export function uploadParamsFromBody(userId: string, fileBuffer: Buffer, body: Record<string, string | undefined>, categoryId: string): UploadParams {
  if (!hasEnoughNfo(body.nfo)) throw new BadRequestException(NFO_REQUIRED_MESSAGE);
  return {
    userId,
    fileBuffer,
    name: body.name as string,
    description: body.description,
    categoryId,
    tags: body.tags ? body.tags.split(',').map((t) => t.trim()) : [],
    anonymous: body.anonymous === 'true',
    coverImage: body.coverImage || undefined,
    metaKind: body.metaKind || undefined,
    metaId: body.metaId || undefined,
    year: body.year ? Number(body.year) : undefined,
    language: body.language || undefined,
    origin: normalizeOrigin(body.origin),
    resolution: body.resolution || undefined,
    codec: body.codec || undefined,
    hdr: body.hdr === 'true',
    audio: body.audio || undefined,
    source: body.source || undefined,
    containerFormat: body.containerFormat || undefined,
    fps: body.fps ? Number(body.fps) : undefined,
    durationMinutes: body.durationMinutes ? Number(body.durationMinutes) : undefined,
    season: body.season || undefined,
    episode: body.episode || undefined,
    genres: list(body.genres).slice(0, 8),
    videoType: body.videoType || undefined,
    nfo: body.nfo && body.nfo.trim() ? body.nfo.slice(0, 200_000) : undefined,
    attrs: (() => { try { return body.attrs ? JSON.parse(body.attrs) : undefined; } catch { return undefined; } })(),
  };
}
