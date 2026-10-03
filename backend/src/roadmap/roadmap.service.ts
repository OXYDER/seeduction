import { Injectable } from '@nestjs/common';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsService } from '../settings/settings.service';

export interface ChangeEntry { hash: string; at: string; title: string; details: string[] }

const MAJOR_MINOR = (() => {
  try { return String(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version ?? '1.0.0').split('.').slice(0, 2).join('.'); } catch { return '1.0'; }
})();

/**
 * Journal des modifications du site : rempli automatiquement à partir de l'historique des commits (changelog.txt écrit par
 * deploy.sh avant la construction de l'image ; en développement, git directement). Le numéro de version est
 * « majeur.mineur » de package.json suivi du nombre de commits : il augmente à chaque modification mise en ligne.
 */
@Injectable()
export class RoadmapService {
  private cache: { key: string; count: number; entries: ChangeEntry[] } | null = null;

  constructor(private settings: SettingsService) {}

  private raw(): { count: number; text: string } | null {
    const file = path.join(process.cwd(), 'changelog.txt');
    try {
      const stat = fs.statSync(file);
      const text = fs.readFileSync(file, 'utf8');
      return { count: Number((/^COUNT=(\d+)/.exec(text) ?? [])[1] ?? 0), text: text.replace(/^COUNT=\d+\n/, '') + `\u0000${stat.mtimeMs}` };
    } catch { /* pas de fichier : développement ou déploiement sans changelog */ }
    try {
      const count = Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { cwd: process.cwd(), encoding: 'utf8', timeout: 5000 }).trim());
      const text = execFileSync('git', ['log', '-n', '400', '--pretty=format:%H%x1f%aI%x1f%s%x1f%b%x1e'], { cwd: process.cwd(), encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024 });
      return { count, text };
    } catch { return null; }
  }

  private load() {
    const raw = this.raw();
    if (!raw) return { count: 0, entries: [] as ChangeEntry[] };
    const key = `${raw.count}:${raw.text.length}`;
    if (this.cache?.key === key) return this.cache;
    const entries: ChangeEntry[] = [];
    for (const rec of raw.text.split('\u001e')) {
      const [hash, at, title, body] = rec.replace(/^\s+/, '').split('\u001f');
      if (!hash || !at || !title) continue;
      const details = (body ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !/^co-authored-by:/i.test(l)).map((l) => l.replace(/^[-•*]\s*/, ''));
      entries.push({ hash: hash.trim().slice(0, 7), at, title: title.trim(), details });
    }
    this.cache = { key, count: raw.count || entries.length, entries };
    return this.cache;
  }

  version() {
    const { count, entries } = this.load();
    return { version: `${MAJOR_MINOR}.${count}`, build: count, updatedAt: entries[0]?.at ?? null };
  }

  async feed(limit = 120, before?: string) {
    const { entries } = this.load();
    const list = before ? entries.filter((e) => e.at < before) : entries;
    const items = list.slice(0, Math.min(300, Math.max(1, limit)));
    return { ...this.version(), items, hasMore: list.length > items.length, upcoming: (await this.settings.get<string[]>('roadmapUpcoming')) ?? [] };
  }

  async setUpcoming(items: string[]) {
    const clean = (Array.isArray(items) ? items : []).map((t) => String(t).trim().slice(0, 200)).filter(Boolean).slice(0, 40);
    await this.settings.set('roadmapUpcoming', clean);
    return clean;
  }
}
