import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { LANGUAGES, RESOLUTIONS, SOURCES, CODECS } from '../lib/searchParser';

type ToolId = 'prowlarr' | 'sonarr' | 'radarr' | 'lidarr' | 'readarr' | 'jackett';

const TOOLS: Record<ToolId, { label: string; icon: string; cats: string; catsHelp: string; guide: string; fields: (site: string, key: string) => [string, string, string?][]; intro: string }> = {
  prowlarr: {
    label: 'Prowlarr', icon: '🔎', cats: '', catsHelp: 'Laisse les catégories par défaut : Prowlarr les envoie ensuite tout seul à Sonarr, Radarr, Lidarr et Readarr.', guide: 'guide-prowlarr',
    intro: "Le plus simple : tu ajoutes Seeduction UNE fois dans Prowlarr, et il le partage avec toutes tes autres applications.",
    fields: (site, key) => [['Indexeur à choisir', 'Generic Torznab'], ['URL', site], ['Chemin de l\'API (API Path)', '/api', 'Laisse « /api » (valeur par défaut).'], ['Clé API', key]],
  },
  sonarr: {
    label: 'Sonarr', icon: '📺', cats: '5000,5030,5040,5045,5070', catsHelp: 'Séries : 5000 (TV), 5030 (SD), 5040 (HD), 5045 (UHD), 5070 (animes).', guide: 'guide-sonarr',
    intro: 'Pour les séries. À utiliser seulement si tu n\'utilises pas Prowlarr (sinon ajoute Seeduction dans Prowlarr).',
    fields: (site, key) => [['Type d\'indexeur', 'Torznab'], ['URL', site], ['Chemin de l\'API', '/api'], ['Clé API', key]],
  },
  radarr: {
    label: 'Radarr', icon: '🎬', cats: '2000,2030,2040,2045,2050', catsHelp: 'Films : 2000 (films), 2030 (SD), 2040 (HD), 2045 (UHD), 2050 (Blu-ray).', guide: 'guide-radarr',
    intro: 'Pour les films. À utiliser seulement si tu n\'utilises pas Prowlarr.',
    fields: (site, key) => [['Type d\'indexeur', 'Torznab'], ['URL', site], ['Chemin de l\'API', '/api'], ['Clé API', key]],
  },
  lidarr: {
    label: 'Lidarr', icon: '🎵', cats: '3000,3010,3040', catsHelp: 'Musique : 3000 (audio), 3010 (MP3), 3040 (sans perte, FLAC).', guide: 'guide-lidarr',
    intro: 'Pour la musique (albums, artistes).',
    fields: (site, key) => [['Type d\'indexeur', 'Torznab'], ['URL', site], ['Chemin de l\'API', '/api'], ['Clé API', key]],
  },
  readarr: {
    label: 'Readarr', icon: '📚', cats: '7000,7020,7030', catsHelp: 'Livres : 7000 (livres), 7020 (ebooks), 7030 (bandes dessinées).', guide: 'guide-readarr',
    intro: 'Pour les livres et les bandes dessinées.',
    fields: (site, key) => [['Type d\'indexeur', 'Torznab'], ['URL', site], ['Chemin de l\'API', '/api'], ['Clé API', key]],
  },
  jackett: {
    label: 'Jackett', icon: '🧥', cats: '', catsHelp: 'Jackett affiche toutes les catégories : rien à choisir.', guide: 'guide-jackett',
    intro: 'Jackett demande l\'adresse COMPLÈTE de l\'API (avec « /api » à la fin) dans son indexeur « Torznab générique ». Dans tes applications, tu utilises ensuite l\'adresse que Jackett te donne (« Copy Torznab Feed »).',
    fields: (site, key) => [['Indexeur à ajouter', 'Generic Torznab (indexeur personnalisé)'], ['Torznab Feed URL', `${site}/api`, 'Adresse complète, avec /api.'], ['Clé API (API key)', key]],
  },
};

const FEED_CATS: [string, string][] = [['2000', '🎬 Films'], ['5000', '📺 Séries et émissions'], ['3000', '🎵 Musique'], ['7000', '📚 Livres et BD'], ['4000', '💻 Jeux PC et logiciels'], ['1000', '🎮 Consoles'], ['6000', '🔞 Adulte (si activé dans ton compte)']];
const DEFAULT_KEY = 'VOTRE_CLE_API';

function CopyField({ label, value, hint, mono = true }: { label: string; value: string; hint?: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { window.prompt('Copie cette valeur :', value); }
  }
  return (
    <div className="grid" style={{ gap: 2 }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <code style={{ flex: 1, wordBreak: 'break-all', fontFamily: mono ? undefined : 'inherit', padding: '6px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>{value}</code>
        <button type="button" className="secondary" onClick={copy} style={{ whiteSpace: 'nowrap' }}>{done ? '✓ Copié' : 'Copier'}</button>
      </div>
      {hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
    </div>
  );
}

/** Générateur d'adresses : Prowlarr, Sonarr, Radarr, Lidarr, Readarr, Jackett (Torznab) et flux RSS pour les clients torrent. */
export default function Integrations() {
  const site = typeof window !== 'undefined' ? window.location.origin : '';
  const [key, setKey] = useState('');
  const [created, setCreated] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tool, setTool] = useState<ToolId>('prowlarr');
  const [rules, setRules] = useState<{ hnrSeedHours: number; hnrRatio: number } | null>(null);

  // Flux RSS
  const [rssCats, setRssCats] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [language, setLanguage] = useState('');
  const [resolution, setResolution] = useState('');
  const [source, setSource] = useState('');
  const [codec, setCodec] = useState('');
  const [freeleech, setFreeleech] = useState(false);
  const [minSeeders, setMinSeeders] = useState('');
  const [sort, setSort] = useState<'date' | 'seeders' | 'size'>('date');
  const [limit, setLimit] = useState('50');
  const [preview, setPreview] = useState<{ titles: string[]; total: string; error?: string } | null>(null);

  useEffect(() => { api.get('/bonus/hnr').then((r) => setRules(r.data?.rules ?? null)).catch(() => undefined); }, []);

  const k = key.trim() || DEFAULT_KEY;
  const noKey = !key.trim();

  async function createKey() {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/keys', { label: `Outils (${new Date().toLocaleDateString()})`, scopes: ['torrents:read', 'torrents:download'] });
      setCreated(data.rawKey); setKey(data.rawKey);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Création de la clé impossible'); }
    finally { setBusy(false); }
  }

  const feedUrl = useMemo(() => {
    const p = new URLSearchParams({ t: 'search', apikey: k });
    if (rssCats.length) p.set('cat', rssCats.join(','));
    if (q.trim()) p.set('q', q.trim());
    if (language) p.set('language', language);
    if (resolution) p.set('resolution', resolution);
    if (source) p.set('source', source);
    if (codec) p.set('codec', codec);
    if (freeleech) p.set('freeleech', '1');
    if (Number(minSeeders) > 0) p.set('minseeders', String(Math.floor(Number(minSeeders))));
    if (sort !== 'date') p.set('sort', sort);
    p.set('limit', String(Math.min(100, Math.max(1, Math.floor(Number(limit)) || 50))));
    return `${site}/api?${p.toString()}`;
  }, [site, k, rssCats, q, language, resolution, source, codec, freeleech, minSeeders, sort, limit]);

  async function runPreview() {
    setPreview(null);
    if (noKey) { setPreview({ titles: [], total: '', error: 'Colle ta clé API (ou crée-en une) pour tester le flux.' }); return; }
    try {
      const r = await fetch(feedUrl);
      const text = await r.text();
      const err = text.match(/<error code="(\d+)" description="([^"]*)"/);
      if (err) { setPreview({ titles: [], total: '', error: err[2] }); return; }
      const titles = [...text.matchAll(/<item>[\s\S]*?<title>([^<]*)<\/title>/g)].map((m) => m[1].replace(/&amp;/g, '&')).slice(0, 8);
      setPreview({ titles, total: (text.match(/total="(\d+)"/) || [])[1] ?? '' });
    } catch { setPreview({ titles: [], total: '', error: 'Le flux ne répond pas.' }); }
  }

  const T = TOOLS[tool];
  const toggleCat = (c: string) => setRssCats((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel ornate">
        <h1 style={{ margin: 0 }}>🔌 API & flux RSS</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Branche Seeduction à <strong>Prowlarr, Sonarr, Radarr, Lidarr, Readarr, Jackett</strong> ou à ton <strong>client torrent</strong> (flux RSS). Choisis ton outil, copie les valeurs affichées : elles sont déjà remplies avec l'adresse du site et ta clé.
          Des <Link to="/wiki/guides">guides pas à pas</Link> expliquent chaque outil.
        </p>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>1. Ta clé API</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          La clé est ton mot de passe pour les outils : elle leur permet de chercher des torrents et de les télécharger <strong>en ton nom</strong> (le ratio et le hit & run s'appliquent normalement). Pour la sécurité, le site ne la garde pas en clair : elle n'est montrée qu'à sa création.
        </p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Colle ici ta clé API (sd_…)" style={{ flex: '1 1 320px' }} autoComplete="off" spellCheck={false} />
          <button type="button" disabled={busy} onClick={createKey}>🔑 Créer une clé pour mes outils</button>
          <Link to="/profile?tab=dev" className="secondary dd-link">Gérer mes clés</Link>
        </div>
        {created && <div style={{ marginTop: 8, color: 'var(--gold-bright, #f5c542)', fontSize: 13 }}>⚠ Clé créée : copie-la <strong>maintenant</strong> (valeurs ci-dessous déjà remplies). Elle ne sera plus jamais affichée ; si tu la perds, crée-en une autre et révoque l'ancienne.</div>}
        {error && <div style={{ marginTop: 8, color: 'var(--danger)' }}>{error}</div>}
        {noKey && <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>Sans clé, les adresses ci-dessous affichent « {DEFAULT_KEY} » à remplacer.</div>}
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>2. Adresses pour tes outils</h3>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {(Object.keys(TOOLS) as ToolId[]).map((id) => <button key={id} type="button" className={tool === id ? 'on' : 'secondary'} onClick={() => setTool(id)}>{TOOLS[id].icon} {TOOLS[id].label}</button>)}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{T.intro}</p>
        <div className="grid" style={{ gap: 10 }}>
          {T.fields(site, k).map(([label, value, hint]) => <CopyField key={label} label={label} value={value} hint={hint} />)}
          {T.cats && <CopyField label="Catégories à cocher / à écrire" value={T.cats} hint={T.catsHelp} />}
          {!T.cats && <div className="muted" style={{ fontSize: 12 }}>{T.catsHelp}</div>}
          {rules && ['sonarr', 'radarr', 'lidarr', 'readarr', 'prowlarr'].includes(tool) && (
            <div className="muted" style={{ fontSize: 12 }}>
              <strong>Objectifs de seed :</strong> Seeduction demande de seeder chaque torrent téléchargé <strong>{rules.hnrSeedHours} h</strong> ou jusqu'à un ratio de <strong>{rules.hnrRatio}</strong> sur ce torrent (sinon : hit & run).
              Dans l'indexeur, mets <strong>Seed Ratio = {rules.hnrRatio}</strong> et <strong>Seed Time = {rules.hnrSeedHours * 60}</strong> (minutes, soit {rules.hnrSeedHours} h) pour que tes outils ne suppriment jamais un torrent trop tôt.
            </div>
          )}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
          <a className="secondary dd-link" href={`${site}/api?t=caps`} target="_blank" rel="noopener noreferrer">🧪 Tester : capacités du site</a>
          {!noKey && <a className="secondary dd-link" href={`${site}/api?t=search&apikey=${encodeURIComponent(k)}&limit=3`} target="_blank" rel="noopener noreferrer">🧪 Tester : 3 derniers torrents</a>}
          <Link className="secondary dd-link" to={`/wiki/${T.guide}`}>📖 Guide {T.label} pas à pas</Link>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>3. Générateur de flux RSS (qBittorrent, ruTorrent, Deluge…)</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Un flux RSS est une adresse que ton client torrent relit toutes les quelques minutes pour récupérer automatiquement les nouveaux torrents qui t'intéressent. Choisis tes filtres : l'adresse se construit toute seule.
        </p>
        <div className="grid" style={{ gap: 10 }}>
          <div>
            <span className="muted" style={{ fontSize: 12 }}>Catégories (aucune = toutes)</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {FEED_CATS.map(([c, label]) => <button key={c} type="button" className={rssCats.includes(c) ? 'on' : 'secondary'} onClick={() => toggleCat(c)}>{label}</button>)}
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <label className="grid" style={{ gap: 2 }}><span className="muted" style={{ fontSize: 12 }}>Mots du titre</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex : mon show" /></label>
            <label className="grid" style={{ gap: 2 }}><span className="muted" style={{ fontSize: 12 }}>Langue</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}><option value="">Toutes</option>{LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
            <label className="grid" style={{ gap: 2 }}><span className="muted" style={{ fontSize: 12 }}>Résolution</span>
              <select value={resolution} onChange={(e) => setResolution(e.target.value)}><option value="">Toutes</option>{RESOLUTIONS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
            <label className="grid" style={{ gap: 2 }}><span className="muted" style={{ fontSize: 12 }}>Source</span>
              <select value={source} onChange={(e) => setSource(e.target.value)}><option value="">Toutes</option>{SOURCES.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
            <label className="grid" style={{ gap: 2 }}><span className="muted" style={{ fontSize: 12 }}>Codec</span>
              <select value={codec} onChange={(e) => setCodec(e.target.value)}><option value="">Tous</option>{CODECS.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
            <label className="grid" style={{ gap: 2 }}><span className="muted" style={{ fontSize: 12 }}>Seeders minimum</span><input type="number" min={0} value={minSeeders} onChange={(e) => setMinSeeders(e.target.value)} placeholder="0" /></label>
            <label className="grid" style={{ gap: 2 }}><span className="muted" style={{ fontSize: 12 }}>Trier par</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as any)}><option value="date">Les plus récents</option><option value="seeders">Les mieux seedés</option><option value="size">Les plus gros</option></select></label>
            <label className="grid" style={{ gap: 2 }}><span className="muted" style={{ fontSize: 12 }}>Nombre d'éléments (1 à 100)</span><input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
          </div>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={freeleech} onChange={(e) => setFreeleech(e.target.checked)} /> Seulement les torrents freeleech (téléchargement gratuit)</label>
          <CopyField label="Adresse du flux RSS à ajouter dans ton client" value={feedUrl} hint="Cette adresse contient ta clé API : ne la partage pas." />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="secondary" onClick={runPreview}>👁 Aperçu du flux</button>
            <Link className="secondary dd-link" to="/wiki/guide-rss-clients">📖 Comment l'ajouter dans mon client</Link>
          </div>
          {preview && (
            <div className="panel" style={{ background: 'rgba(255,255,255,0.03)' }}>
              {preview.error ? <span style={{ color: 'var(--danger)' }}>✗ {preview.error}</span> : (
                <>
                  <div className="muted" style={{ fontSize: 12 }}>{preview.total ? `${preview.total} résultat(s) au total — les premiers :` : 'Aperçu :'}</div>
                  {preview.titles.length === 0 ? <div className="muted">Aucun torrent ne correspond à ces filtres.</div> : <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{preview.titles.map((t, i) => <li key={i} style={{ wordBreak: 'break-all' }}>{t}</li>)}</ul>}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
