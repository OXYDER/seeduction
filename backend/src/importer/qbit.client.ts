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


/** Cause technique lisible d'un échec réseau (« ENOTFOUND » = nom inconnu, « ECONNREFUSED » = port fermé, certificat, délai dépassé...). */
function netCause(e: any): string {
  const code = e?.cause?.code ?? e?.code ?? '';
  const known: Record<string, string> = {
    ENOTFOUND: "nom d'hôte introuvable (adresse mal écrite ?)",
    ECONNREFUSED: 'connexion refusée (port fermé ou interface web désactivée ?)',
    ETIMEDOUT: 'délai dépassé (serveur injoignable depuis le site)',
    UND_ERR_CONNECT_TIMEOUT: 'délai dépassé (serveur injoignable depuis le site)',
    ECONNRESET: 'connexion coupée par le serveur',
    CERT_HAS_EXPIRED: 'certificat expiré',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'certificat auto-signé non reconnu',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'certificat non reconnu',
    ERR_TLS_CERT_ALTNAME_INVALID: "certificat qui ne correspond pas à l'adresse",
  };
  const name = e?.name === 'TimeoutError' ? 'délai dépassé (20 s sans réponse)' : known[code];
  return name ?? (code || String(e?.message ?? e));
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
    } catch (e) {
      throw new Error(`qBittorrent injoignable (${this.base}) : ${netCause(e)}`);
    }
    const body = (await res.text()).trim();
    // Succès : « Ok. » (anciennes versions) ou 204 sans corps (qBittorrent 5.x). Échec : « Fails. » ou 401 / 403.
    const accepted = res.status === 204 || (res.status === 200 && /^ok/i.test(body));
    if (!accepted) {
      if (res.status === 403) throw new Error("qBittorrent a refusé la connexion (403) : l'adresse IP du serveur est peut-être BANNIE après trop d'essais ratés (qBittorrent bannit une adresse après 5 mots de passe faux : attends ~1 heure ou redémarre l'application chez l'hébergeur), ou la protection « Host header / CSRF » bloque");
      if (res.status >= 300 && res.status < 400) throw new Error(`qBittorrent redirige vers une autre adresse (${res.status}) : vérifie l'adresse (https:// ? chemin à la fin ?)`);
      if (res.status === 404) throw new Error(`cette adresse n'est pas l'interface web de qBittorrent (404) : ${this.base}`);
      throw new Error(`qBittorrent a refusé la connexion : identifiant ou mot de passe de l'interface web incorrect (réponse ${res.status}${body ? ` « ${body.slice(0, 60)} »` : ''})`);
    }
    // Le cookie de session s'appelle « SID » (anciennes versions) ou « QBT_SID_<port> » (qBittorrent 5.x) : on garde le couple nom=valeur tel quel.
    this.cookie = (res.headers.get('set-cookie') ?? '').match(/\b\w*SID\w*=[^;\s]+/)?.[0] ?? '';
  }

  private async req(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(this.base + '/api/v2' + path, {
        ...init,
        headers: { referer: this.base, origin: this.base, ...(this.cookie ? { cookie: this.cookie } : {}), ...((init.headers as Record<string, string>) ?? {}) },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      throw new Error(`qBittorrent injoignable (${this.base}) : ${netCause(e)}`);
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

  /**
   * Articles des flux RSS de qBittorrent (titre, description, liens) : qBittorrent ne garde pas la catégorie du flux comme champ à part,
   * mais elle figure souvent dans le titre (« [Séries-Télé --> Émissions TV HD] Nom… ») ou la description.
   */
  async rssArticles(): Promise<{ title: string; description: string; torrentURL: string }[]> {
    const res = await this.req('/rss/items?withData=true');
    if (!res.ok) return [];
    const out: { title: string; description: string; torrentURL: string }[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.articles)) for (const a of node.articles) if (a?.title) out.push({ title: String(a.title), description: String(a.description ?? ''), torrentURL: String(a.torrentURL ?? '') });
      for (const v of Object.values(node)) if (v && typeof v === 'object' && !Array.isArray(v)) walk(v);
    };
    walk(await res.json());
    return out;
  }

  async exportTorrent(hash: string): Promise<Buffer> {
    const res = await this.req('/torrents/export?hash=' + encodeURIComponent(hash));
    if (!res.ok) throw new Error(`export du .torrent impossible (qBittorrent ${res.status}) : il faut qBittorrent 4.5 ou plus récent`);
    return Buffer.from(await res.arrayBuffer());
  }

  /** Change la catégorie d'un torrent (la crée si elle n'existe pas). Avec la gestion automatique de qBittorrent, les fichiers suivent la catégorie. */
  async setCategory(hash: string, category: string) {
    const post = (p: string, params: Record<string, string>) => this.req(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
    let r = await post('/torrents/setCategory', { hashes: hash, category });
    if (r.status === 409) { await post('/torrents/createCategory', { category, savePath: '' }); r = await post('/torrents/setCategory', { hashes: hash, category }); }
    if (!r.ok) throw new Error(`qBittorrent ${r.status}`);
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
