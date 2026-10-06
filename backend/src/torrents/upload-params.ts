import { BadRequestException } from '@nestjs/common';
import { normalizeOrigin } from '../common/utils/facets';

/**
 * Validation et mise en forme d'un envoi de torrent (formulaire du site ET API publique par clé) : un seul endroit, donc les mêmes
 * règles partout — le fichier .torrent et le NFO (ou MediaInfo) sont obligatoires.
 */
export function uploadParamsOf(file: { buffer: Buffer } | undefined, body: Record<string, string>, userId: string) {
  // Le NFO ou le MediaInfo est obligatoire : il décrit la release (qualité, audio, langues...) et remplit les filtres.
  if (!file) throw new BadRequestException('Fichier .torrent manquant');
  if (!body.nfo || body.nfo.replace(/\s+/g, ' ').trim().length < 20) {
    throw new BadRequestException('Le NFO ou le MediaInfo de la release est obligatoire : ajoute le fichier .nfo ou colle le texte du MediaInfo.');
  }
  return {
    userId,
    fileBuffer: file.buffer,
    name: body.name,
    description: body.description,
    categoryId: body.categoryId,
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
    genres: body.genres ? body.genres.split(',').map((g) => g.trim()).filter(Boolean).slice(0, 8) : [],
    videoType: body.videoType || undefined,
    nfo: body.nfo && body.nfo.trim() ? body.nfo.slice(0, 200_000) : undefined,
    attrs: (() => { try { return body.attrs ? JSON.parse(body.attrs) : undefined; } catch { return undefined; } })(),
  };
}
