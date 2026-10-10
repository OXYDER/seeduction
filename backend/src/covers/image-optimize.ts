/**
 * Compression automatique des images enregistrées sur Seeduction (pochettes, affiches, fonds, avatars, images du chat) :
 *  - redimensionnées pour tenir dans 2000 × 2000 px (jamais agrandies) ;
 *  - converties en WebP (qualité 82) : nettement plus léger à qualité visuelle égale, transparence conservée ;
 *  - l'orientation EXIF est appliquée puis les métadonnées (position GPS, appareil...) sont retirées ;
 *  - jamais de version plus lourde que l'original : une image déjà petite et optimisée est gardée telle quelle ;
 *  - les GIF et les images animées sont laissées intactes.
 * Si la bibliothèque (sharp) n'est pas disponible sur le serveur, l'image est enregistrée telle quelle (rien ne casse).
 * COVERS_NO_COMPRESS=1 désactive la compression.
 */
export const MAX_IMAGE_SIDE = 2000;
export const WEBP_QUALITY = 82;

export interface OptimizedImage { buffer: Buffer; ext: string; compressed: boolean }

let sharpModule: any | null | undefined;
async function loadSharp(): Promise<any | null> {
  if (sharpModule !== undefined) return sharpModule;
  try { const m: any = await import('sharp'); sharpModule = m.default ?? m; } catch { sharpModule = null; }
  return sharpModule;
}

export async function optimizeImage(buffer: Buffer, ext: string): Promise<OptimizedImage> {
  const same: OptimizedImage = { buffer, ext, compressed: false };
  if (process.env.COVERS_NO_COMPRESS === '1' || ext === 'gif') return same;
  const sharp = await loadSharp();
  if (!sharp) return same;
  try {
    const meta = await sharp(buffer, { failOn: 'none', limitInputPixels: 100_000_000 }).metadata();
    if ((meta.pages ?? 1) > 1) return same; // image animée (WebP / PNG animés)
    const tooBig = (meta.width ?? 0) > MAX_IMAGE_SIDE || (meta.height ?? 0) > MAX_IMAGE_SIDE;
    const out: Buffer = await sharp(buffer, { failOn: 'none', limitInputPixels: 100_000_000 })
      .rotate()
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();
    if (!tooBig && out.length >= buffer.length) return same; // déjà léger : on ne la dégrade pas pour rien
    return { buffer: out, ext: 'webp', compressed: true };
  } catch {
    return same; // image illisible par la bibliothèque : conservée telle quelle (les contrôles de taille s'appliquent)
  }
}
