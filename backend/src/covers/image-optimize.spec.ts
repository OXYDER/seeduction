import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';

const STORAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'seeduction-covers-'));
process.env.COVER_STORAGE_DIR = STORAGE; // lu au chargement du service
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { optimizeImage, MAX_IMAGE_SIDE } = require('./image-optimize');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CoversService } = require('./covers.service');

/** Image « bruitée » (donc lourde, comme une affiche photographique) de la taille demandée. */
const noisy = (w: number, h: number, fmt: 'jpeg' | 'png' = 'jpeg', alpha = false): Promise<Buffer> => {
  const raw = randomBytes(w * h * (alpha ? 4 : 3)); // bruit aléatoire : incompressible, donc lourd
  const img = sharp(raw, { raw: { width: w, height: h, channels: alpha ? 4 : 3 } });
  return fmt === 'jpeg' ? img.jpeg({ quality: 95 }).toBuffer() : img.png().toBuffer();
};

afterAll(() => fs.rmSync(STORAGE, { recursive: true, force: true }));

describe('compression automatique des images', () => {
  it('redimensionne une grande image (2000 px au plus) et la convertit en WebP plus léger', async () => {
    const input = await noisy(2600, 1950);
    const r = await optimizeImage(input, 'jpg');
    const meta = await sharp(r.buffer).metadata();
    expect(r.compressed).toBe(true);
    expect(r.ext).toBe('webp');
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(MAX_IMAGE_SIDE);
    expect(meta.width / meta.height).toBeCloseTo(2600 / 1950, 1); // proportions conservées
    expect(r.buffer.length).toBeLessThan(input.length);
  });

  it('ne dégrade pas une petite image déjà légère', async () => {
    const input = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } }).png().toBuffer();
    const r = await optimizeImage(input, 'png');
    expect(r.buffer.length).toBeLessThanOrEqual(input.length);
    expect(r.compressed ? r.ext : 'png').toMatch(/webp|png/);
  });

  it('garde la transparence', async () => {
    const input = await noisy(300, 300, 'png', true);
    const r = await optimizeImage(input, 'png');
    const meta = await sharp(r.buffer).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it('n\'agrandit jamais une image', async () => {
    const input = await noisy(500, 400);
    const r = await optimizeImage(input, 'jpg');
    const meta = await sharp(r.buffer).metadata();
    expect(meta.width).toBeLessThanOrEqual(500);
  });

  it('laisse les GIF intacts', async () => {
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const r = await optimizeImage(gif, 'gif');
    expect(r.buffer).toBe(gif);
    expect(r.compressed).toBe(false);
  });

  it('une image illisible est rendue telle quelle, sans erreur', async () => {
    const junk = Buffer.from('ceci n\'est pas une image');
    const r = await optimizeImage(junk, 'png');
    expect(r.buffer).toBe(junk);
    expect(r.compressed).toBe(false);
  });

  it('COVERS_NO_COMPRESS=1 désactive la compression', async () => {
    process.env.COVERS_NO_COMPRESS = '1';
    try {
      const input = await noisy(2400, 1800);
      const r = await optimizeImage(input, 'jpg');
      expect(r.buffer).toBe(input);
    } finally { delete process.env.COVERS_NO_COMPRESS; }
  });
});

describe('enregistrement des images (CoversService)', () => {
  it('une affiche de plus de 8 Mo est maintenant acceptée : elle est compressée avant d\'être enregistrée', async () => {
    const big = await noisy(2400, 1800, 'png'); // > 8 Mo (et < 25 Mo)
    expect(big.length).toBeGreaterThan(8 * 1024 * 1024);
    const svc = new CoversService();
    const url: string = await svc.saveUpload({ mimetype: 'image/png', size: big.length, buffer: big });
    expect(url).toMatch(/^\/api\/covers\/[a-f0-9-]+\.webp$/);
    const saved = fs.readFileSync(path.join(STORAGE, url.split('/').pop()!));
    expect(saved.length).toBeLessThan(8 * 1024 * 1024);
    const meta = await sharp(saved).metadata();
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(MAX_IMAGE_SIDE);
  }, 60_000);

  it('au-delà de 25 Mo reçus, l\'image est refusée', async () => {
    const svc = new CoversService();
    await expect(svc.saveUpload({ mimetype: 'image/png', size: 26 * 1024 * 1024, buffer: Buffer.alloc(10) })).rejects.toThrow(/25 Mo/);
  });

  it('un GIF animé du chat est enregistré tel quel', async () => {
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const svc = new CoversService();
    const url: string = await svc.saveChatImage({ mimetype: 'image/gif', size: gif.length, buffer: gif });
    expect(url).toMatch(/\.gif$/);
    expect(fs.readFileSync(path.join(STORAGE, url.split('/').pop()!)).equals(gif)).toBe(true);
  });
});
