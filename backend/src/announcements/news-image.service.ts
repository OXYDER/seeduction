import { BadGatewayException, BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CoversService } from '../covers/covers.service';

export interface NewsImageInput {
  title: string;
  summary?: string;
  content?: string;
  kind?: string;
  /** Mots-clés ajoutés à la main par le staff. */
  hint?: string;
}

/** Ambiance visuelle selon le type de nouvelle (couleurs et motifs), pour que chaque annonce ait sa propre identité. */
const KIND_STYLE: Record<string, string> = {
  NEWS: 'welcoming and exciting; warm gold and rich violet highlights; floating media icons (film reel, music notes, game controller, documents) drifting in soft light',
  UPDATE: 'technological and fresh; cool electric blue and cyan accents; thin circuit lines, glowing upward arrows and layered interface panels (no readable text)',
  EVENT: 'festive and energetic; vivid magenta, gold and violet; confetti, light beams and sparkles, a celebration atmosphere',
  MAINTENANCE: 'industrial and reassuring; amber and dark steel tones; gears, wrench and subtle caution stripes, a workshop feel',
  IMPORTANT: 'serious and urgent but elegant; deep red and gold accents; strong contrast, a warning-triangle motif, dramatic lighting',
};

const plain = (t: string) => t.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Bannière de nouvelle générée par Gemini : le logo officiel de Seeduction est envoyé à chaque génération comme image de
 * référence, avec le titre, le résumé et les mots-clés de la nouvelle. La clé reste côté serveur (GEMINI_API_KEY).
 */
@Injectable()
export class NewsImageService {
  private readonly log = new Logger(NewsImageService.name);
  private readonly usage = new Map<string, number[]>();
  /** Images générées par heure et par membre du staff (chaque image coûte quelques centimes). */
  private readonly hourlyLimit = Math.max(1, Number(process.env.NEWS_IMAGE_HOURLY_LIMIT ?? 12) || 12);

  constructor(private covers: CoversService) {}

  private get logoPath() {
    return process.env.NEWS_LOGO_PATH ?? path.join(process.cwd(), 'assets', 'seeduction-logo.png');
  }

  async status() {
    const logo = await fs.access(this.logoPath).then(() => true, () => false);
    return { configured: !!process.env.GEMINI_API_KEY, logo, model: process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image', hourlyLimit: this.hourlyLimit };
  }

  /** Texte envoyé à Gemini avec le logo. */
  buildPrompt(input: NewsImageInput): string {
    const title = input.title.trim().slice(0, 200);
    const summary = plain(input.summary ?? '').slice(0, 400);
    const body = plain(input.content ?? '').slice(0, 500);
    const hint = (input.hint ?? '').trim().slice(0, 200);
    const style = KIND_STYLE[input.kind ?? 'NEWS'] ?? KIND_STYLE.NEWS;
    return [
      'Create a wide cinematic banner illustration, 16:9, for a news post on "Seeduction", a private community website for sharing movies, series, music, games and software.',
      'The attached image is the official Seeduction logo (golden fleur-de-lis with the "Seeduction" lettering). Reproduce this logo EXACTLY as provided — same shapes, same gold colours, same lettering — and place it prominently and cleanly in the composition (large, centered or on one side, with enough breathing room). Never redraw, restyle, translate, crop or distort the logo.',
      `News title: "${title}"`,
      summary ? `Summary: ${summary}` : '',
      body ? `Key points of the news: ${body}` : '',
      hint ? `Extra keywords from the editor: ${hint}` : '',
      `Mood and palette: ${style}.`,
      'Let the subject of the news inspire the background elements and the scene, so this banner is clearly different from other announcements.',
      'Art direction: modern, premium, rich depth, subtle glow, dark-friendly background that suits a dark website theme.',
      'Strict rules: no other text, no captions, no title, no watermark, no user-interface mockup, no real people or recognizable brands. The logo is the only text allowed.',
    ].filter(Boolean).join('\n');
  }

  private checkRate(userId: string, count: number) {
    const now = Date.now();
    const recent = (this.usage.get(userId) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length + count > this.hourlyLimit) {
      throw new HttpException(`Limite atteinte : ${this.hourlyLimit} images par heure. Réessaie plus tard.`, 429);
    }
    for (let i = 0; i < count; i++) recent.push(now);
    this.usage.set(userId, recent);
  }

  /** Une image : appel à Gemini avec le logo, puis sauvegarde sur le disque de Seeduction. */
  private async one(prompt: string, logoB64: string): Promise<string> {
    const base = (process.env.GEMINI_API_BASE ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
    const model = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    let res: Response;
    try {
      res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY as string },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: logoB64 } }] }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } },
        }),
        signal: ctrl.signal,
      });
    } catch (err: any) {
      throw new BadGatewayException(err?.name === 'AbortError' ? 'Gemini met trop de temps à répondre' : 'Gemini est injoignable');
    } finally {
      clearTimeout(timer);
    }
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      this.log.warn(`Gemini ${res.status} : ${json?.error?.message ?? 'erreur'}`);
      if (res.status === 429) {
        const detail = String(json?.error?.message ?? '');
        // Une clé gratuite n'a pas de quota pour la génération d'images (« limit: 0 ») : il faut activer la facturation du projet Google.
        const freeTier = /limit:\s*0|free[_ ]?tier|billing|RESOURCE_EXHAUSTED/i.test(`${detail} ${json?.error?.status ?? ''}`) && /limit:\s*0|free[_ ]?tier/i.test(detail);
        throw new HttpException(
          freeTier
            ? 'Gemini refuse : ta clé est sur l’offre gratuite, qui n’inclut pas la génération d’images. Active la facturation du projet Google associé à la clé (Google AI Studio > Facturation), puis réessaie.'
            : `Quota Gemini atteint (${detail.slice(0, 140) || 'trop de demandes'}). Réessaie dans quelques minutes.`,
          429,
        );
      }
      if (res.status === 400 && /API key/i.test(json?.error?.message ?? '')) throw new BadGatewayException('La clé Gemini est refusée : vérifie GEMINI_API_KEY.');
      throw new BadGatewayException(`Gemini a refusé la demande (${res.status}) : ${String(json?.error?.message ?? 'erreur inconnue').slice(0, 160)}`);
    }
    const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
    const img = parts.map((p) => p.inlineData ?? p.inline_data).find((d) => d?.data);
    if (!img) {
      const why = json?.promptFeedback?.blockReason ?? json?.candidates?.[0]?.finishReason ?? 'aucune image';
      throw new BadGatewayException(`Gemini n'a pas renvoyé d'image (${why}). Essaie d'autres mots-clés.`);
    }
    return this.covers.saveGenerated(Buffer.from(img.data, 'base64'));
  }

  /** Génère `count` propositions (1 à 3) pour une nouvelle. */
  async generate(userId: string, input: NewsImageInput, count = 2) {
    if (!process.env.GEMINI_API_KEY) throw new BadRequestException('La génération d’images n’est pas configurée : ajoute GEMINI_API_KEY dans backend/.env sur le serveur.');
    if (!input.title?.trim()) throw new BadRequestException('Écris d’abord le titre de la nouvelle.');
    let logo: Buffer;
    try {
      logo = await fs.readFile(this.logoPath);
    } catch {
      throw new BadRequestException('Le logo de référence est introuvable (backend/assets/seeduction-logo.png).');
    }
    const n = Math.min(3, Math.max(1, Math.floor(count) || 2));
    this.checkRate(userId, n);
    const prompt = this.buildPrompt(input);
    const results = await Promise.allSettled(Array.from({ length: n }, () => this.one(prompt, logo.toString('base64'))));
    const images = results.filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled').map((r) => ({ url: r.value }));
    if (images.length === 0) {
      const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      throw first.reason;
    }
    return { images, failed: n - images.length };
  }
}
