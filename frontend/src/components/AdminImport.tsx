import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { formatBytes, formatNumber } from '../lib/format';

interface Source {
  id: string; name: string; enabled: boolean; config: any; hasQbitPassword: boolean; hasFtpPassword: boolean;
  lastRunAt: string | null; lastError: string | null; counts: Record<string, number>;
}
interface ImportItem { id: string; name: string; status: 'UPLOADED' | 'DUPE' | 'REJECTED' | 'SKIPPED'; why: string | null; seeded: string | null; updatedAt: string }
interface ImportEvent { id: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string; createdAt: string }

const EMPTY_CONFIG = {
  qbit: { url: '', username: '', category: 'a-publier', tag: '' },
  ftp: { host: '', port: 21, username: '', secure: true, headMB: 16 },
  mediainfo: true,
  defaultCategory: '', autoCategory: true, readFeedCategory: true, attachMetadata: true, categoryRules: [] as { match: string; category: string }[],
  include: [] as string[], exclude: [] as string[], description: '',
  autoApprove: true, seedOnSeeduction: true, seedCategory: 'seeduction', skipChecking: true,
  intervalMinutes: 10, maxPerRun: 5, delaySeconds: 30,
};
const STATUS_LABEL: Record<ImportItem['status'], string> = { UPLOADED: 'Envoyé', DUPE: 'Déjà sur le site', REJECTED: 'Refusé', SKIPPED: 'Mis de côté' };
const LEVEL_COLOR = { INFO: 'inherit', WARN: 'var(--gold-bright, #f5c542)', ERROR: 'var(--danger)' } as const;
const Go = (n: number) => `${(n / 1e9).toFixed(2)} Go`;

/** Admin > Import : releases terminées d'un qBittorrent -> Seeduction, automatiquement (NFO par FTP, approbation, seed). */
export function ImportAdmin() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [running, setRunning] = useState<{ sourceId: string; dryRun: boolean } | null>(null);
  const [events, setEvents] = useState<ImportEvent[]>([]);
  const [robot, setRobot] = useState<any>(null);
  const [leafCats, setLeafCats] = useState<string[]>([]);
  const [editing, setEditing] = useState<Source | 'new' | null>(null);
  const [openItems, setOpenItems] = useState<string | null>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [inspect, setInspect] = useState<{ id: string; busy: boolean; result?: any; error?: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadSources = useCallback(() => api.get('/importer/sources').then((r) => setSources(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible')), []);
  const loadEvents = useCallback(() => api.get('/importer/events', { params: { limit: 80 } }).then((r) => setEvents(r.data)).catch(() => undefined), []);
  const loadRobot = useCallback(() => api.get('/importer/bot').then((r) => setRobot(r.data)).catch(() => undefined), []);
  const loadStatus = useCallback(() => api.get('/importer/status').then((r) => setRunning(r.data.running)).catch(() => undefined), []);

  useEffect(() => {
    loadSources(); loadEvents(); loadStatus(); loadRobot();
    api.get('/categories').then((r) => setLeafCats((r.data as any[]).flatMap((c) => (c.children?.length ? c.children : [c]).map((x: any) => x.name)))).catch(() => undefined);
  }, [loadSources, loadEvents, loadStatus]);
  // Suivi en direct : plus rapide quand un import tourne.
  useEffect(() => {
    const t = setInterval(() => { loadEvents(); loadStatus(); loadRobot(); if (running) loadSources(); }, running ? 2500 : 15000);
    return () => clearInterval(t);
  }, [running, loadEvents, loadStatus, loadSources, loadRobot]);

  const fail = (e: any) => { setMessage(''); setError(e.response?.data?.message ?? 'Erreur'); };
  const ok = (m: string) => { setError(''); setMessage(m); };

  async function toggle(s: Source) {
    try { await api.patch(`/importer/sources/${s.id}`, { enabled: !s.enabled }); ok(s.enabled ? 'Import désactivé' : 'Import activé : la prochaine passe aura lieu dans la minute'); loadSources(); } catch (e) { fail(e); }
  }
  async function runNow(s: Source, dryRun: boolean) {
    try { await api.post(`/importer/sources/${s.id}/run`, { dryRun }); ok(dryRun ? 'Essai lancé : voir le journal ci-dessous' : 'Import lancé : voir le journal ci-dessous'); loadStatus(); setTimeout(loadEvents, 800); } catch (e) { fail(e); }
  }
  async function remove(s: Source) {
    if (!window.confirm(`Supprimer la source « ${s.name} » et sa mémoire ? Les torrents déjà envoyés restent sur le site.`)) return;
    try { await api.delete(`/importer/sources/${s.id}`); ok('Source supprimée'); loadSources(); } catch (e) { fail(e); }
  }
  async function test(s: Source) {
    setInspect({ id: s.id, busy: true });
    // Le test tourne en arrière-plan sur le serveur (un serveur web devant le site coupe les réponses trop longues) : on l'interroge jusqu'au résultat.
    try {
      await api.post(`/importer/sources/${s.id}/inspect`);
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = (await api.get(`/importer/sources/${s.id}/inspect`)).data;
        if (r.status === 'done') return setInspect({ id: s.id, busy: false, result: r.result });
        if (r.status === 'error') return setInspect({ id: s.id, busy: false, error: r.error });
      }
      setInspect({ id: s.id, busy: false, error: 'Le test prend trop de temps : réessaie dans un instant.' });
    } catch (e: any) { setInspect({ id: s.id, busy: false, error: e.response?.data?.message ?? e.message }); }
  }
  async function showItems(s: Source) {
    if (openItems === s.id) { setOpenItems(null); return; }
    setOpenItems(s.id);
    api.get(`/importer/sources/${s.id}/items`).then((r) => setItems(r.data)).catch(fail);
  }
  async function retry(it: ImportItem, s: Source) {
    try { await api.post(`/importer/items/${it.id}/retry`); ok('Élément remis en file : il sera repris à la prochaine passe'); api.get(`/importer/sources/${s.id}/items`).then((r) => setItems(r.data)); loadSources(); } catch (e) { fail(e); }
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel">
        <h3>📥 Import automatique depuis qBittorrent</h3>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          Les releases <strong>terminées</strong> de ton qBittorrent (dans la catégorie choisie) sont envoyées sur Seeduction : NFO lu ou MediaInfo calculé par FTP, <strong>approuvées automatiquement</strong>,
          puis le torrent de Seeduction est ajouté dans qBittorrent sur les mêmes fichiers pour seeder. Une passe toutes les 10 minutes ; chaque torrent n'est traité qu'une fois.
          Les torrents sont publiés (et seedés) par le <strong>robot « {robot?.username ?? 'Seeduction'} »</strong>, jamais par ton compte. Ne publie que des contenus que tu as le droit de partager.
        </p>
        {error && <div style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
        {message && <div style={{ color: 'var(--success)', marginTop: 8 }}>{message}</div>}
      </div>

      {robot && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>🤖 Compte du robot « {robot.username} »</h3>
            <span className="muted" style={{ fontSize: 12 }}>Compte interne : aucune statistique publique, il n'apparaît dans aucun classement · passkey {robot.passkeyHint ?? '—'}</span>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
            {[
              ['Envoyé', formatBytes(robot.uploaded)],
              ['Reçu', formatBytes(robot.downloaded)],
              ['Ratio', robot.ratio === null ? '∞' : robot.ratio.toFixed(2)],
              ['Torrents publiés', formatNumber(robot.torrents.live)],
              ['Taille publiée', formatBytes(robot.torrents.totalSize)],
              ['En seed maintenant', formatNumber(robot.peers.seeding)],
              ['Téléchargés par les membres', formatNumber(robot.torrents.completedByOthers)],
              ['Seeders sur ses torrents', formatNumber(robot.torrents.seedersOnThem)],
              ['Leechers sur ses torrents', formatNumber(robot.torrents.leechersOnThem)],
              ['Points bonus', formatNumber(Math.round(robot.bonusPoints))],
              ['Dernier announce', robot.peers.lastAnnounceAt ? timeAgo(robot.peers.lastAnnounceAt) : 'jamais'],
              ['En attente / refusés', `${robot.torrents.byStatus.PENDING ?? 0} / ${robot.torrents.byStatus.REJECTED ?? 0}`],
            ].map(([label, value]) => (
              <div key={label} className="panel ornate" style={{ padding: '8px 10px' }}>
                <div className="muted" style={{ fontSize: 11 }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{value}</div>
              </div>
            ))}
          </div>
          {robot.recent.length > 0 && (
            <table style={{ marginTop: 10 }}>
              <tbody>
                {robot.recent.map((t: any) => (
                  <tr key={t.id}>
                    <td style={{ wordBreak: 'break-all' }}><a href={`/torrents/${t.id}`}>{t.name}</a></td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatBytes(t.size)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>🌱 {t.seeders} · ⬇ {t.completedCount}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {sources === null && <p className="muted">Chargement…</p>}
      {sources?.length === 0 && !editing && <div className="panel"><p className="muted">Aucune source pour l'instant.</p></div>}

      {sources?.map((s) => (
        <div key={s.id} className="panel">
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
            <div>
              <strong style={{ fontSize: 16 }}>{s.name}</strong>{' '}
              {s.enabled ? <span className="badge freeleech">Actif</span> : <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>Désactivé</span>}
              {running?.sourceId === s.id && <span className="badge" style={{ marginLeft: 6, background: 'rgba(245,197,66,0.2)' }}>{running.dryRun ? 'Essai en cours…' : 'Import en cours…'}</span>}
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {s.config.qbit.url} · catégorie qBittorrent « {s.config.qbit.category || 'toutes'} » · {s.config.ftp ? `FTP ${s.config.ftp.host}` : 'sans FTP (NFO impossible)'}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Dernière passe : {s.lastRunAt ? timeAgo(s.lastRunAt) : 'jamais'} · {Object.entries(s.counts).map(([k, n]) => `${n} ${STATUS_LABEL[k as ImportItem['status']]?.toLowerCase() ?? k}`).join(' · ') || 'rien de traité'}
              </div>
              {s.lastError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 2 }}>Dernière erreur : {s.lastError}</div>}
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => toggle(s)}>{s.enabled ? 'Désactiver' : '▶ Activer'}</button>
              <button type="button" className="secondary" onClick={() => test(s)}>🔎 Tester</button>
              <button type="button" className="secondary" disabled={!!running} onClick={() => runNow(s, true)}>Essai</button>
              <button type="button" className="secondary" disabled={!!running} onClick={() => runNow(s, false)}>Lancer maintenant</button>
              <button type="button" className="secondary" onClick={() => showItems(s)}>Historique</button>
              <button type="button" className="secondary" onClick={() => setEditing(s)}>✏️ Modifier</button>
              <button type="button" className="secondary" onClick={() => remove(s)}>🗑️</button>
            </div>
          </div>

          {inspect?.id === s.id && (
            <div className="panel ornate" style={{ marginTop: 10 }}>
              {inspect.busy && <div className="muted">Connexion à qBittorrent et au FTP…</div>}
              {inspect.error && <div style={{ color: 'var(--danger)' }}>✗ {inspect.error}</div>}
              {inspect.result && (
                <>
                  <div className="muted">{inspect.result.total} release(s) terminée(s) dans cette catégorie (les 6 premières sont analysées) :</div>
                  {inspect.result.ftp && (inspect.result.ftp.ok ? <div style={{ fontSize: 12, color: 'var(--success)' }}>✓ FTP : connexion réussie</div> : <div style={{ fontSize: 12, color: 'var(--danger)' }}>✗ FTP : {inspect.result.ftp.message}</div>)}
                  <table>
                    <tbody>
                      {inspect.result.shown.map((r: any) => (
                        <tr key={r.name}>
                          <td style={{ wordBreak: 'break-all' }}>{r.name}<div className="muted" style={{ fontSize: 11 }}>{Go(r.size)} · {r.savePath}</div></td>
                          <td style={{ whiteSpace: 'nowrap' }}>{r.nfo === 'FOUND' ? <span style={{ color: 'var(--success)' }}>NFO ✓</span> : r.nfo === 'MEDIAINFO' ? <span style={{ color: 'var(--success)' }} title={r.note}>MediaInfo ✓</span> : <span style={{ color: 'var(--danger)' }} title={r.note}>NFO absent</span>}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {r.language ? <span className="badge" style={{ background: /VFQ|VF2/.test(r.language) ? 'rgba(80,200,120,0.25)' : 'rgba(255,255,255,0.1)', fontWeight: 700 }} title="Langue détectée">{r.language}</span> : <span className="muted" style={{ fontSize: 12 }} title="Aucune langue repérable dans le nom ni le MediaInfo">langue ?</span>}
                            {r.resolution && <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>{r.resolution}</span>}
                            <div className="muted" style={{ fontSize: 11 }}>→ {r.category ?? 'catégorie ?'}{r.categoryHow ? ` (${r.categoryHow})` : ''}</div>
                            {r.feedLabel && <div className="muted" style={{ fontSize: 11 }}>flux : {r.feedLabel}</div>}
                            {r.fiche ? <div style={{ fontSize: 11, color: 'var(--success)' }}>fiche TMDB : {r.fiche}</div> : <div className="muted" style={{ fontSize: 11 }}>fiche : aucune correspondance sûre</div>}
                          </td>
                          <td className="muted" style={{ fontSize: 12 }}>{r.alreadyDone ? `déjà traité (${STATUS_LABEL[r.alreadyDone as ImportItem['status']] ?? r.alreadyDone})` : r.note}</td>
                        </tr>
                      ))}
                      {inspect.result.shown.length === 0 && <tr><td className="muted">Aucune release terminée dans cette catégorie pour l'instant.</td></tr>}
                    </tbody>
                  </table>
                </>
              )}
              <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={() => setInspect(null)}>Fermer</button>
            </div>
          )}

          {openItems === s.id && (
            <div style={{ marginTop: 10 }}>
              <table>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td style={{ wordBreak: 'break-all' }}>{it.name}{it.why && <div className="muted" style={{ fontSize: 11 }}>{it.why}</div>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{STATUS_LABEL[it.status]}{it.status === 'UPLOADED' && (it.seeded === 'OK' ? ' · 🌱 seed' : it.seeded === 'UNAVAILABLE' ? ' · seed abandonné' : ' · seed à venir')}</td>
                      <td className="muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(it.updatedAt)}</td>
                      <td>{(it.status === 'SKIPPED' || it.status === 'REJECTED') && <button type="button" className="secondary" style={{ padding: '0 8px', fontSize: 12 }} onClick={() => retry(it, s)}>Retenter</button>}</td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td className="muted">Rien encore.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {editing ? (
        <SourceForm
          source={editing === 'new' ? null : editing}
          cats={leafCats}
          onCancel={() => setEditing(null)}
          onSaved={(m) => { setEditing(null); ok(m); loadSources(); }}
          onError={fail}
        />
      ) : (
        <div><button type="button" onClick={() => setEditing('new')}>➕ Ajouter une source</button></div>
      )}

      <div className="panel">
        <strong>Journal</strong>
        <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 6, maxHeight: 280, overflowY: 'auto' }}>
          {events.map((e) => <div key={e.id} style={{ color: LEVEL_COLOR[e.level] }}><span className="muted">{new Date(e.createdAt).toLocaleTimeString('fr-CA')}</span> {e.message}</div>)}
          {events.length === 0 && <span className="muted">Rien pour l'instant.</span>}
        </div>
      </div>
    </div>
  );
}

function SourceForm({ source, cats, onCancel, onSaved, onError }: { source: Source | null; cats: string[]; onCancel: () => void; onSaved: (m: string) => void; onError: (e: any) => void }) {
  const start = source?.config ?? EMPTY_CONFIG;
  const [name, setName] = useState(source?.name ?? 'Mon qBittorrent');
  const [cfg, setCfg] = useState<any>({ ...EMPTY_CONFIG, ...start, qbit: { ...EMPTY_CONFIG.qbit, ...start.qbit }, ftp: { ...EMPTY_CONFIG.ftp, ...(start.ftp ?? {}) } });
  const [useFtp, setUseFtp] = useState(source ? !!source.config.ftp : true);
  const [qbitPassword, setQbitPassword] = useState('');
  const [ftpPassword, setFtpPassword] = useState('');
  const [include, setInclude] = useState((start.include ?? []).join('\n'));
  const [exclude, setExclude] = useState((start.exclude ?? []).join('\n'));
  const [busy, setBusy] = useState(false);

  const set = (path: string[], value: any) => setCfg((c: any) => {
    const next = { ...c }; let o = next;
    path.slice(0, -1).forEach((k) => { o[k] = { ...o[k] }; o = o[k]; });
    o[path[path.length - 1]] = value; return next;
  });
  const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const config = { ...cfg, ftp: useFtp ? cfg.ftp : undefined, include: lines(include), exclude: lines(exclude) };
    const secrets = { qbitPassword, ftpPassword };
    try {
      if (source) await api.patch(`/importer/sources/${source.id}`, { name, config, secrets });
      else await api.post('/importer/sources', { name, config, secrets });
      onSaved(source ? 'Source enregistrée' : 'Source créée : clique sur « Tester », puis « Activer »');
    } catch (err) { onError(err); } finally { setBusy(false); }
  }

  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <label className="grid" style={{ gap: 3 }}><span style={{ fontSize: 12, opacity: 0.8 }}>{label}</span>{el}{hint && <span className="muted" style={{ fontSize: 11 }}>{hint}</span>}</label>
  );

  return (
    <form onSubmit={save} className="panel ornate grid" style={{ gap: 14 }}>
      <strong>{source ? `Modifier « ${source.name} »` : 'Nouvelle source'}</strong>
      {field('Nom', <input value={name} onChange={(e) => setName(e.target.value)} required />)}

      <div className="grid" style={{ gap: 8 }}>
        <strong style={{ fontSize: 13 }}>qBittorrent</strong>
        {field("Adresse de l'interface web", <input type="url" placeholder="https://qbittorrent.moncompte.appboxes.co" value={cfg.qbit.url} onChange={(e) => set(['qbit', 'url'], e.target.value)} required />)}
        <div className="row" style={{ gap: 8 }}>
          {field('Identifiant', <input value={cfg.qbit.username} autoComplete="off" onChange={(e) => set(['qbit', 'username'], e.target.value)} />)}
          {field('Mot de passe', <input type="password" autoComplete="new-password" placeholder={source?.hasQbitPassword ? '•••••• (inchangé)' : ''} value={qbitPassword} onChange={(e) => setQbitPassword(e.target.value)} />)}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {field('Catégorie(s) à publier', <input value={cfg.qbit.category} onChange={(e) => set(['qbit', 'category'], e.target.value)} />, 'Plusieurs : sépare-les par des virgules. Vide = TOUT ce qui se termine (à éviter si tu télécharges autre chose)')}
          {field('ou étiquette', <input value={cfg.qbit.tag} onChange={(e) => set(['qbit', 'tag'], e.target.value)} />)}
        </div>
      </div>

      <div className="grid" style={{ gap: 8 }}>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={useFtp} onChange={(e) => setUseFtp(e.target.checked)} /><strong style={{ fontSize: 13 }}>FTP de la seedbox (pour lire le NFO)</strong></label>
        {useFtp && (
          <>
            <div className="row" style={{ gap: 8 }}>
              {field('Hôte', <input placeholder="ftp.moncompte.appboxes.co" value={cfg.ftp.host} onChange={(e) => set(['ftp', 'host'], e.target.value)} required />)}
              {field('Port', <input type="number" value={cfg.ftp.port} onChange={(e) => set(['ftp', 'port'], Number(e.target.value))} style={{ width: 90 }} />)}
            </div>
            <div className="row" style={{ gap: 8 }}>
              {field('Identifiant FTP', <input value={cfg.ftp.username} autoComplete="off" onChange={(e) => set(['ftp', 'username'], e.target.value)} required />)}
              {field('Mot de passe FTP', <input type="password" autoComplete="new-password" placeholder={source?.hasFtpPassword ? '•••••• (inchangé)' : ''} value={ftpPassword} onChange={(e) => setFtpPassword(e.target.value)} />)}
            </div>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={cfg.ftp.secure} onChange={(e) => set(['ftp', 'secure'], e.target.checked)} /> FTP sur TLS (chiffré — décoche si la connexion échoue)</label>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={cfg.mediainfo} onChange={(e) => set(['mediainfo'], e.target.checked)} /> Sans .nfo : calculer le MediaInfo sur le début de la vidéo ({cfg.ftp.headMB} Mo lus, jamais le fichier entier)</label>
          </>
        )}
      </div>

      <div className="grid" style={{ gap: 8 }}>
        <strong style={{ fontSize: 13 }}>Sur Seeduction</strong>
        <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={cfg.autoCategory} onChange={(e) => set(['autoCategory'], e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <strong>Détecter la catégorie automatiquement</strong> — d'après le nom de la release : série (S01E02, saison, intégrale), film (année + qualité), sport (UFC, NHL…), musique (FLAC, MP3, discographie).
            Si la clé TMDB est configurée sur le serveur, la fiche TMDB précise : animation, émission (téléréalité, talk-show), documentaire.
            <span className="muted" style={{ display: 'block', fontSize: 11 }}>Tes règles ci-dessous passent d'abord. Une release dont le type n'est pas clair n'est jamais rangée au hasard.</span>
          </span>
        </label>
        <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={cfg.readFeedCategory} onChange={(e) => set(['readFeedCategory'], e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <strong>Lire la catégorie du flux RSS</strong> — quand la release vient d'un flux RSS de qBittorrent, la catégorie du flux (par exemple « [Séries-Télé --&gt; Émissions TV HD] » au début du titre de l'article) sert à la ranger :
            émission, série, série animée, film, sport…
            <span className="muted" style={{ display: 'block', fontSize: 11 }}>Passe après tes règles et avant la détection par le nom. Le bouton « Tester » montre la catégorie du flux trouvée pour chaque release.</span>
          </span>
        </label>
        <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={cfg.attachMetadata} onChange={(e) => set(['attachMetadata'], e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <strong>Relier chaque release à sa fiche</strong> — films et séries : fiche TMDB (affiche, synopsis, distribution, genres…), cherchée avec le titre et l'année de la release.
            La fiche n'est rattachée que si le titre correspond <em>exactement</em> : jamais une fiche au hasard. Elle sert aussi à classer (animation, émission, documentaire).
            <span className="muted" style={{ display: 'block', fontSize: 11 }}>Demande la clé TMDB (TMDB_API_KEY dans backend/.env sur le serveur). Sans clé, les torrents sont publiés sans fiche et rangés d'après le nom et le flux RSS.</span>
          </span>
        </label>
        {field('Catégorie par défaut (facultative)', (
          <select value={cfg.defaultCategory} onChange={(e) => set(['defaultCategory'], e.target.value)}>
            <option value="">— aucune : mettre de côté ce qui n'est pas reconnu —</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ), "Sert seulement quand ni une règle ni la détection automatique ne trouvent. Laisse vide si ton catalogue est varié : mieux vaut mettre de côté que ranger au mauvais endroit.")}
        <div className="grid" style={{ gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.8 }}>Règles de catégorie (si le nom de la release correspond à l'expression, cette catégorie est utilisée ; la première qui correspond gagne)</span>
          {cfg.categoryRules.map((r: any, i: number) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <input placeholder="Expression, ex. S\d{2}E\d{2}" value={r.match} onChange={(e) => set(['categoryRules'], cfg.categoryRules.map((x: any, j: number) => (j === i ? { ...x, match: e.target.value } : x)))} style={{ flex: 1 }} />
              <select value={r.category} onChange={(e) => set(['categoryRules'], cfg.categoryRules.map((x: any, j: number) => (j === i ? { ...x, category: e.target.value } : x)))}>
                <option value="">— catégorie —</option>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" className="secondary" onClick={() => set(['categoryRules'], cfg.categoryRules.filter((_: any, j: number) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => set(['categoryRules'], [...cfg.categoryRules, { match: '', category: '' }])}>+ Ajouter une règle</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          Langue : lue uniquement dans les <strong>étiquettes</strong> — celles du nom de la release (VFQ, MULTI.VFF, MULTI.VF2, VOSTFR…) et les pistes audio / sous-titres du MediaInfo (une piste « French (CA) » est du VFQ). Rien n'est déduit du nom d'un groupe.
        </div>
        <div className="row" style={{ gap: 8 }}>
          {field('Inclure seulement (une expression par ligne)', <textarea rows={2} value={include} onChange={(e) => setInclude(e.target.value)} />)}
          {field('Exclure (une expression par ligne)', <textarea rows={2} value={exclude} onChange={(e) => setExclude(e.target.value)} />)}
        </div>
        {field('Texte ajouté à la description (facultatif)', <input value={cfg.description} onChange={(e) => set(['description'], e.target.value)} />)}
      </div>

      <div className="grid" style={{ gap: 8 }}>
        <strong style={{ fontSize: 13 }}>Seed et rythme</strong>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={cfg.autoApprove} onChange={(e) => set(['autoApprove'], e.target.checked)} /> Approuver directement les torrents importés (sinon ils attendent la validation du staff)</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={cfg.seedOnSeeduction} onChange={(e) => set(['seedOnSeeduction'], e.target.checked)} /> Une fois approuvé, ajouter le torrent de Seeduction dans qBittorrent (mêmes fichiers, sans revérification) pour seeder</label>
        <div className="row" style={{ gap: 8 }}>
          {field('Catégorie qBittorrent du seed', <input value={cfg.seedCategory} onChange={(e) => set(['seedCategory'], e.target.value)} />)}
          {field('Passe toutes les (min)', <input type="number" min={1} value={cfg.intervalMinutes} onChange={(e) => set(['intervalMinutes'], Number(e.target.value))} style={{ width: 90 }} />)}
          {field('Envois max par passe', <input type="number" min={1} max={50} value={cfg.maxPerRun} onChange={(e) => set(['maxPerRun'], Number(e.target.value))} style={{ width: 90 }} />)}
          {field('Pause entre deux (s)', <input type="number" min={0} max={120} value={cfg.delaySeconds} onChange={(e) => set(['delaySeconds'], Number(e.target.value))} style={{ width: 90 }} />)}
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <button type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}
