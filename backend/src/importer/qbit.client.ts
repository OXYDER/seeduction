/** Client minimal de l'API web de qBittorrent (v4.5 ou plus récent : il faut l'export des .torrent). */
export interface QbitTorrent {
  hash: string;
  name: string;
  size: number;
  category: string;
  save_path: string;
  content_path: string;
  completion_on: number;
  added_on: number;
}

export class Qbit {
  private base: string;
  private cookie = '';

  constructor(url: string, private user?: string, private pass?: string) {
    this.base = String(url ?? '').replace(/\/$/, '');
  }

  async login() {
    if (!this.user) return; // accès sans identifiant (réseau autorisé dans qBittorrent)
    let res: Response;
    try {
      res = await fetch(this.base + '/api/v2/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', referer: this.base, origin: this.base },
        body: new URLSearchParams({ username: this.user, password: this.pass ?? '' }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error(`qBittorrent injoignable (${this.base}) : adresse, port et interface web activée ?`);
    }
    if (!/^ok/i.test((await res.text()).trim())) throw new Error("qBittorrent a refusé la connexion : identifiant ou mot de passe de l'interface web incorrect");
    this.cookie = (res.headers.get('set-cookie') ?? '').match(/SID=[^;]+/)?.[0] ?? '';
  }

  private async req(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(this.base + '/api/v2' + path, {
        ...init,
        headers: { referer: this.base, origin: this.base, ...(this.cookie ? { cookie: this.cookie } : {}), ...((init.headers as Record<string, string>) ?? {}) },
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new Error(`qBittorrent injoignable (${this.base}) : adresse, port et interface web activée ?`);
    }
    if ((res.status === 403 || res.status === 401) && retry) { await this.login(); return this.req(path, init, false); }
    return res;
  }

  async completed(filter: { category?: string; tag?: string }): Promise<QbitTorrent[]> {
    const q = new URLSearchParams({ filter: 'completed' });
    if (filter.category) q.set('category', filter.category);
    if (filter.tag) q.set('tag', filter.tag);
    const res = await this.req('/torrents/info?' + q);
    if (!res.ok) throw new Error(`qBittorrent a répondu ${res.status} à la liste des torrents`);
    return res.json() as Promise<QbitTorrent[]>;
  }

  async exportTorrent(hash: string): Promise<Buffer> {
    const res = await this.req('/torrents/export?hash=' + encodeURIComponent(hash));
    if (!res.ok) throw new Error(`export du .torrent impossible (qBittorrent ${res.status}) : il faut qBittorrent 4.5 ou plus récent`);
    return Buffer.from(await res.arrayBuffer());
  }

  async addTags(hash: string, tags: string) {
    await this.req('/torrents/addTags', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ hashes: hash, tags }) });
  }

  async add(buf: Buffer, o: { savepath: string; category?: string; tags?: string; skipChecking?: boolean }) {
    const form = new FormData();
    form.set('torrents', new Blob([new Uint8Array(buf)], { type: 'application/x-bittorrent' }), 'seeduction.torrent');
    form.set('savepath', o.savepath);
    form.set('autoTMM', 'false');
    form.set('skip_checking', o.skipChecking === false ? 'false' : 'true');
    if (o.category) form.set('category', o.category);
    if (o.tags) form.set('tags', o.tags);
    const res = await this.req('/torrents/add', { method: 'POST', body: form });
    const txt = (await res.text()).trim();
    if (!res.ok || /^fails/i.test(txt)) throw new Error(`qBittorrent a refusé l'ajout (${res.status} ${txt})`);
  }
}
