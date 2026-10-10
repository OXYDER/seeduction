import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import { LANGUAGE_GROUPS, LANGUAGE_LABELS } from '../lib/languageTag';

interface Job { kind: 'test' | 'scan' | 'publish' | 'seed'; status: 'running' | 'done' | 'error'; done: number; total: number; message: string; error?: string; result?: any }
type ClientKind = 'qbittorrent' | 'transmission' | 'rutorrent';
const CLIENTS: Record<ClientKind, { label: string; beta: boolean; address: string; placeholder: string; tagLabel: string }> = {
  qbittorrent: { label: 'qBittorrent', beta: false, address: "Adresse de l'interface web de qBittorrent", placeholder: 'https://qbittorrent.exemple.com', tagLabel: 'Étiquette à analyser (facultatif)' },
  transmission: { label: 'Transmission', beta: true, address: 'Adresse de Transmission (interface web)', placeholder: 'https://transmission.exemple.com:9091', tagLabel: 'Étiquette à analyser (facultatif, une seule suffit)' },
  rutorrent: { label: 'ruTorrent', beta: true, address: 'Adresse de ruTorrent', placeholder: 'https://rutorrent.exemple.com/rutorrent', tagLabel: 'Étiquette à analyser (facultatif, une seule suffit)' },
};
interface Box {
  client: ClientKind;
  qbit: { url: string; username: string; category: string; tag: string };
  ftp: { host: string; port: number; username: string; secure: boolean; rejectUnauthorized: boolean } | null;
  hasQbitPassword: boolean; hasFtpPassword: boolean; lastScanAt: string | null; lastError: string | null;
}
interface Status { box: Box | null; job: Job | null; counts: Record<string, number> }
interface Item {
  id: string; name: string; status: 'PROPOSED' | 'DUPE' | 'QUEUED' | 'UPLOADED' | 'REJECTED' | 'IGNORED'; why: string | null; detail: any;
  torrentId: string | null; torrentStatus: string | null; seeded: string | null; updatedAt: string;
}
interface Options { categories: { id: string; name: string }[]; kinds: string[] }
interface Hit { id: string; title: string; subtitle: string; thumbnail: string | null }

const MAX_BATCH = 30;
const KIND_LABEL: Record<string, string> = { FILM: 'Film (TMDB)', SERIE: 'Série (TMDB)', MUSIQUE: 'Musique (Deezer)', LIVRE: 'Livre', JEU: 'Jeu (RAWG)', XXX: 'XXX (ThePornDB)' };
const PROBLEM: Record<string, string> = { category: 'Choisis la catégorie', fiche: 'Choisis la fiche (ou « sans fiche »)', nfo: 'Colle le NFO ou le MediaInfo' };
const errText = (e: any, d = 'Action impossible') => e?.response?.data?.message ?? d;

/** Page « Envoyer » > « Plusieurs torrents » : le membre connecte son client torrent (qBittorrent, Transmission ou ruTorrent), le site propose ses releases, il corrige et confirme. */
export default function MemberImport() {
  const [status, setStatus] = useState<Status | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [options, setOptions] = useState<Options>({ categories: [], kinds: [] });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editConn, setEditConn] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<'todo' | 'sent' | 'dupe' | 'off'>('todo');
  const seen = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const s = (await api.get('/member-import')).data as Status;
      setStatus(s);
      if (s.box) {
        const list = (await api.get('/member-import/items')).data as Item[];
        setItems(list);
        // Les lignes vertes sont cochées d'office (le membre décoche ce qu'il ne veut pas envoyer), dans la limite d'un lot.
        // Calculé hors de la fonction de mise à jour : React peut l'exécuter deux fois (mode strict) et la mémoire `seen` ne doit pas être consommée à la première.
        const fresh = list.filter((i) => !seen.current.has(i.id));
        fresh.forEach((i) => seen.current.add(i.id));
        setSel((cur) => {
          const next = new Set([...cur].filter((id) => list.some((i) => i.id === id && i.status === 'PROPOSED')));
          for (const i of fresh) if (i.status === 'PROPOSED' && i.detail?.verdict === 'GREEN' && next.size < MAX_BATCH) next.add(i.id);
          return next;
        });
      }
    } catch (e) { setMsg({ ok: false, text: errText(e, 'Page indisponible') }); }
  }, []);
  useEffect(() => { load(); api.get('/member-import/options').then((r) => setOptions(r.data)).catch(() => undefined); }, [load]);
  useEffect(() => { if (status && !status.box) setEditConn(true); }, [status?.box === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const running = status?.job?.status === 'running';
  const waiting = items.some((i) => i.status === 'QUEUED' || (i.status === 'UPLOADED' && i.seeded === null));
  useEffect(() => {
    if (!running && !waiting) return;
    const t = setInterval(load, running ? 1500 : 15000); // l'envoi tourne en arrière-plan; la modération peut approuver à tout moment
    return () => clearInterval(t);
  }, [running, waiting, load]);

  async function act(path: string, ok?: string, body?: any) {
    setMsg(null);
    try { await api.post(`/member-import/${path}`, body); if (ok) setMsg({ ok: true, text: ok }); await load(); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }

  if (!status) return <p className="muted">Chargement…</p>;
  const box = status.box;
  const job = status.job;
  const proposed = items.filter((i) => i.status === 'PROPOSED');
  const green = proposed.filter((i) => i.detail?.verdict === 'GREEN');
  const orange = proposed.filter((i) => i.detail?.verdict !== 'GREEN');
  const sent = items.filter((i) => i.status === 'QUEUED' || i.status === 'UPLOADED');
  const dupes = items.filter((i) => i.status === 'DUPE');
  const off = items.filter((i) => i.status === 'IGNORED' || i.status === 'REJECTED');
  const picked = proposed.filter((i) => sel.has(i.id) && i.detail?.verdict === 'GREEN');

  const toggle = (id: string) => setSel((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const publish = () => act('publish', undefined, { ids: picked.map((i) => i.id) }).then(() => setTab('sent'));
  async function publishAll() {
    if (!window.confirm(`Envoyer TOUTES les ${green.length} releases reconnues (vertes) ?

Elles partent par lots, dans la limite de 100 par jour, puis passent par la modération. Les cases cochées ne comptent pas : toutes les lignes vertes sont envoyées.`)) return;
    setMsg(null);
    try {
      const r = (await api.post('/member-import/publish', { all: true })).data;
      setMsg({ ok: true, text: `${r.queued} torrent${r.queued > 1 ? 's' : ''} en cours d'envoi${r.notSent ? ` · ${r.notSent} resteront pour demain (limite de 100 par jour)` : ''}.` });
      setTab('sent');
      await load();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }
  const replace = (u: { id: string; why: string | null; detail: any }) => {
    // Une ligne qui vient de passer au vert est cochée (comme les lignes reconnues d'emblée).
    if (u.detail?.verdict === 'GREEN' && items.find((i) => i.id === u.id)?.detail?.verdict !== 'GREEN') setSel((cur) => (cur.size < MAX_BATCH ? new Set(cur).add(u.id) : cur));
    setItems((cur) => cur.map((i) => (i.id === u.id ? { ...i, why: u.why, detail: u.detail } : i)));
  };

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="panel ornate">
        <h3 style={{ marginTop: 0 }}>📦 Envoyer plusieurs torrents depuis ton client</h3>
        <p className="muted" style={{ margin: '4px 0' }}>
          Connecte ton <strong>client torrent</strong> (qBittorrent, Transmission ou ruTorrent) et ton <strong>accès FTP</strong> (obligatoires : le FTP sert à lire le NFO de chaque release) : le site repère tes releases terminées, reconnaît la catégorie, la fiche et la langue,
          et te montre en <span style={{ color: 'var(--success)' }}>vert</span> ce qui est sûr et en <span style={{ color: 'var(--gold-bright, #f5c542)' }}>orange</span> ce que tu dois corriger.
          Tu confirmes, puis chaque torrent approuvé est remis en seed <strong>dans ton client, sur les mêmes fichiers</strong>, dans une catégorie « Seeduction » (une étiquette pour Transmission et ruTorrent) : aucun dossier à choisir.
        </p>
        <ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
          <li>Rien n'est modifié dans ton client avant ta première publication, et tes torrents d'origine ne sont jamais touchés.</li>
          <li>Tes mots de passe sont chiffrés sur le serveur, ne sont jamais réaffichés, et tu peux tout supprimer quand tu veux. Ton client doit être joignable depuis Internet (seedbox, adresse publique) : les adresses internes sont refusées.</li>
          <li>Les torrents passent par la modération habituelle. Limite : {MAX_BATCH} torrents par envoi, 100 par jour.</li>
        </ul>
      </div>

      {msg && <div className="panel" style={{ borderColor: msg.ok ? 'var(--success)' : 'var(--danger)', color: msg.ok ? 'var(--success)' : 'var(--danger)' }}>{msg.text}</div>}

      <Connection box={box} open={editConn} setOpen={setEditConn} running={!!running} onSaved={async () => { setEditConn(false); await load(); }} act={act} setMsg={setMsg} onRemoved={async () => { seen.current.clear(); setItems([]); setSel(new Set()); await load(); setEditConn(true); }} />

      {box && (
        <div className="panel">
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" disabled={running} onClick={() => act('scan')}>🔍 {box.lastScanAt ? 'Analyser les nouveaux torrents' : 'Analyser mon client'}</button>
            <button type="button" className="secondary" disabled={running} onClick={() => act('test')}>Tester la connexion</button>
            {items.some((i) => i.status === 'UPLOADED' && i.seeded === null) && <button type="button" className="secondary" disabled={running} onClick={() => act('seed')}>🌱 Remettre en seed ce qui est approuvé</button>}
            {box.lastScanAt && <span className="muted" style={{ fontSize: 12 }}>Dernière analyse {timeAgo(box.lastScanAt)}</span>}
          </div>
          {job && (
            <div style={{ marginTop: 10 }}>
              {job.status === 'running' && job.total > 0 && <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, (job.done / job.total) * 100)}%`, height: '100%', background: 'var(--success)', transition: 'width .3s' }} /></div>}
              <div style={{ fontSize: 13, marginTop: 4, color: job.status === 'error' ? 'var(--danger)' : 'inherit' }}>
                {job.status === 'running' ? '⏳ ' : job.status === 'error' ? '✗ ' : '✓ '}{job.status === 'error' ? job.error : job.message || 'En cours…'}
                {job.status === 'running' && job.total > 0 && <span className="muted"> ({job.done}/{job.total})</span>}
              </div>
            </div>
          )}
          {!job && box.lastError && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--danger)' }}>✗ {box.lastError}</div>}
        </div>
      )}

      {box && items.length > 0 && (
        <>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {([['todo', `À envoyer (${proposed.length})`], ['sent', `Envoyés (${sent.length})`], ['dupe', `Déjà sur Seeduction (${dupes.length})`], ['off', `Écartés (${off.length})`]] as const).map(([k, label]) => (
              <button key={k} type="button" className={tab === k ? 'on' : 'secondary'} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>

          {tab === 'todo' && (
            <>
              {proposed.length === 0 && <div className="panel muted">Rien à envoyer pour le moment. Lance une analyse pour chercher de nouveaux torrents.</div>}
              {green.length > 0 && (
                <div className="panel" style={{ borderColor: 'rgba(76,175,80,.5)' }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--success)' }}>✓ Reconnus ({green.length})</strong>
                    <span className="muted" style={{ fontSize: 12 }}>Catégorie, fiche et NFO trouvés. Décoche ce que tu ne veux pas envoyer.</span>
                    <span style={{ flex: 1 }} />
                    <button type="button" className="secondary" onClick={() => setSel(new Set(green.slice(0, MAX_BATCH).map((i) => i.id)))}>Tout cocher ({Math.min(green.length, MAX_BATCH)})</button>
                    <button type="button" className="secondary" onClick={() => setSel(new Set())}>Tout décocher</button>
                  </div>
                  <div className="grid" style={{ gap: 6, marginTop: 8 }}>
                    {green.map((i) => <ItemCard key={i.id} item={i} options={options} checked={sel.has(i.id)} onCheck={() => toggle(i.id)} onUpdated={replace} reload={load} setMsg={setMsg} />)}
                  </div>
                  <div className="row" style={{ gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" disabled={picked.length === 0 || picked.length > MAX_BATCH || !!running} onClick={publish}>
                      🚀 Envoyer {picked.length} torrent{picked.length > 1 ? 's' : ''} sur Seeduction
                    </button>
                    <button type="button" className="secondary" disabled={!!running} onClick={publishAll} title="Envoie toutes les lignes vertes, par lots enchaînés automatiquement">🚀 Tous les reconnus ({green.length})</button>
                    {picked.length > MAX_BATCH && <span style={{ color: 'var(--danger)', fontSize: 12 }}>{MAX_BATCH} maximum à la fois pour la sélection : décoche-en quelques-uns, ou utilise « Tous les reconnus ».</span>}
                  </div>
                </div>
              )}
              {orange.length > 0 && (
                <div className="panel" style={{ borderColor: 'rgba(245,197,66,.5)' }}>
                  <strong style={{ color: 'var(--gold-bright, #f5c542)' }}>⚠ À corriger ({orange.length})</strong>
                  <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Corrige ce qui est indiqué : la ligne passe en vert, puis tu l'envoies avec les autres.</span>
                  <div className="grid" style={{ gap: 10, marginTop: 8 }}>
                    {orange.map((i) => <ItemCard key={i.id} item={i} options={options} onUpdated={replace} reload={load} setMsg={setMsg} />)}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'sent' && <SentList items={sent} />}
          {tab === 'dupe' && (
            <div className="panel">
              <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>Ces releases existent déjà sur Seeduction : elles ne sont pas envoyées.</p>
              <div className="grid" style={{ gap: 6 }}>
                {dupes.map((i) => (
                  <div key={i.id} className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ wordBreak: 'break-all' }}>{i.name}</span>
                    {i.detail?.existingId && <Link to={`/torrents/${i.detail.existingId}`} target="_blank">voir sur Seeduction ↗</Link>}
                    <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => act(`items/${i.id}/reanalyze`)}>Ré-analyser</button>
                  </div>
                ))}
                {dupes.length === 0 && <span className="muted">Aucun.</span>}
              </div>
            </div>
          )}
          {tab === 'off' && (
            <div className="panel">
              <div className="grid" style={{ gap: 6 }}>
                {off.map((i) => (
                  <div key={i.id} className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ wordBreak: 'break-all' }}>{i.name}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{i.status === 'REJECTED' ? `refusé : ${i.why ?? ''}` : 'écarté par toi'}</span>
                    {i.status === 'IGNORED' && <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => act(`items/${i.id}/ignore`, undefined, { undo: true })}>Remettre dans la liste</button>}
                    <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => act(`items/${i.id}/reanalyze`)}>Ré-analyser</button>
                  </div>
                ))}
                {off.length === 0 && <span className="muted">Aucun.</span>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Formulaire de connexion au client (qBittorrent, Transmission ou ruTorrent, + FTP). Les mots de passe ne sont jamais renvoyés : champ vide = inchangé. */
function Connection({ box, open, setOpen, running, onSaved, act, setMsg, onRemoved }: {
  box: Box | null; open: boolean; setOpen: (v: boolean) => void; running: boolean; onSaved: () => Promise<void>; act: (p: string, ok?: string) => Promise<void>;
  setMsg: (m: { ok: boolean; text: string } | null) => void; onRemoved: () => Promise<void>;
}) {
  const [f, setF] = useState({ client: 'qbittorrent' as ClientKind, url: '', username: '', password: '', category: '', tag: '', host: '', port: 21, ftpUser: '', ftpPassword: '', secure: true, acceptCert: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({ client: box?.client ?? 'qbittorrent', url: box?.qbit.url ?? '', username: box?.qbit.username ?? '', password: '', category: box?.qbit.category ?? '', tag: box?.qbit.tag ?? '', host: box?.ftp?.host ?? '', port: box?.ftp?.port ?? 21, ftpUser: box?.ftp?.username ?? '', ftpPassword: '', secure: box?.ftp?.secure ?? true, acceptCert: box?.ftp ? !box.ftp.rejectUnauthorized : false });
  }, [open, box]);
  const set = (k: string, v: any) => setF((cur) => ({ ...cur, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await api.put('/member-import/connection', {
        client: f.client,
        qbit: { url: f.url, username: f.username, category: f.category, tag: f.tag },
        ftp: { host: f.host, port: Number(f.port) || 21, username: f.ftpUser, secure: f.secure, rejectUnauthorized: !f.acceptCert },
        secrets: { qbitPassword: f.password || undefined, ftpPassword: f.ftpPassword || undefined },
      });
      await onSaved();
      await act('test', 'Connexion enregistrée : test en cours…');
    } catch (err) { setMsg({ ok: false, text: errText(err, 'Enregistrement impossible') }); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('Supprimer ta connexion, tes mots de passe et toute la liste d\'analyse ? Les torrents déjà publiés restent sur Seeduction.')) return;
    try { await api.delete('/member-import/connection'); setMsg({ ok: true, text: 'Tes accès ont été supprimés.' }); await onRemoved(); } catch (err) { setMsg({ ok: false, text: errText(err) }); }
  }

  if (box && !open) {
    return (
      <div className="panel row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span>🔗 {CLIENTS[box.client ?? 'qbittorrent'].label} <strong>{box.qbit.url}</strong>{box.ftp ? <span className="muted"> · FTP {box.ftp.host}</span> : <span style={{ color: 'var(--danger)' }}> · FTP manquant : clique sur « Modifier »</span>}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="secondary" disabled={running} onClick={() => setOpen(true)}>Modifier</button>
        <button type="button" className="secondary" disabled={running} onClick={remove}>Supprimer mes accès</button>
      </div>
    );
  }
  return (
    <form className="panel grid" style={{ gap: 10 }} onSubmit={save}>
      <strong>🔗 Connexion à ton client</strong>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        <label className="grid" style={{ gap: 2 }}><span className="muted">Client torrent *</span>
          <select value={f.client} onChange={(e) => set('client', e.target.value)}>
            {(Object.keys(CLIENTS) as ClientKind[]).map((k) => <option key={k} value={k}>{CLIENTS[k].label}{CLIENTS[k].beta ? ' (bêta)' : ''}</option>)}
          </select>
        </label>
        <label className="grid" style={{ gap: 2 }}><span className="muted">{CLIENTS[f.client].address} *</span><input required value={f.url} onChange={(e) => set('url', e.target.value)} placeholder={CLIENTS[f.client].placeholder} /></label>
        <label className="grid" style={{ gap: 2 }}><span className="muted">Identifiant</span><input value={f.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" /></label>
        <label className="grid" style={{ gap: 2 }}><span className="muted">Mot de passe</span><input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} placeholder={box?.hasQbitPassword ? '•••••• (inchangé)' : ''} autoComplete="new-password" /></label>
        <label className="grid" style={{ gap: 2 }}><span className="muted">{f.client === 'qbittorrent' ? 'Catégorie(s) à analyser (facultatif)' : 'Étiquette(s) à analyser (facultatif)'}</span><input value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="toutes les releases terminées" /></label>
        <label className="grid" style={{ gap: 2 }}><span className="muted">Étiquette à analyser (facultatif)</span><input value={f.tag} onChange={(e) => set('tag', e.target.value)} /></label>
      </div>
      <div className="muted" style={{ fontSize: 12 }}><strong>Accès FTP à tes fichiers (obligatoire)</strong> : le site y lit le .nfo de chaque release, ou calcule le MediaInfo sur le début de la vidéo, sans rien télécharger d'autre.</div>
      {(
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          <label className="grid" style={{ gap: 2 }}><span className="muted">Hôte FTP *</span><input required value={f.host} onChange={(e) => set('host', e.target.value)} placeholder="ftp.exemple.com" /></label>
          <label className="grid" style={{ gap: 2 }}><span className="muted">Port</span><input type="number" min={1} max={65535} value={f.port} onChange={(e) => set('port', e.target.value)} /></label>
          <label className="grid" style={{ gap: 2 }}><span className="muted">Identifiant FTP *</span><input required value={f.ftpUser} onChange={(e) => set('ftpUser', e.target.value)} autoComplete="off" /></label>
          <label className="grid" style={{ gap: 2 }}><span className="muted">Mot de passe FTP *</span><input type="password" required={!box?.hasFtpPassword} value={f.ftpPassword} onChange={(e) => set('ftpPassword', e.target.value)} placeholder={box?.hasFtpPassword ? '•••••• (inchangé)' : ''} autoComplete="new-password" /></label>
          <label className="row" style={{ gap: 6, alignSelf: 'end' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.secure} onChange={(e) => set('secure', e.target.checked)} /> FTP sur TLS</label>
          <label className="row" style={{ gap: 6, alignSelf: 'end' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.acceptCert} onChange={(e) => set('acceptCert', e.target.checked)} /> Accepter un certificat non reconnu</label>
        </div>
      )}
      {CLIENTS[f.client].beta && (
        <div className="panel" style={{ margin: 0, padding: 8, fontSize: 12, borderColor: 'rgba(245,197,66,.5)' }}>
          ⚠ <strong>{CLIENTS[f.client].label} : version bêta</strong> (pas encore éprouvée sur de vrais clients). {CLIENTS[f.client].label} ne donne pas le fichier .torrent d'un torrent existant : le site le lit sur ton <strong>FTP</strong>, dans {f.client === 'transmission' ? 'le dossier « torrents » de la configuration de Transmission' : 'le dossier de session de rTorrent'} — ce dossier doit donc être accessible avec ton compte FTP.
          Les fichiers sont aussi re-vérifiés à l'ajout dans ton client (plus long sur une grosse bibliothèque). Si quelque chose ne marche pas, le message d'erreur s'affiche ici : dis-le au staff.
        </div>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Astuce : crée si possible un compte FTP limité à la lecture. {f.client === 'qbittorrent' ? 'Il faut qBittorrent 4.5 ou plus récent (export des .torrent).' : ''} Si le NFO d'une release reste introuvable, tu pourras le coller à la main pour cette release.</p>
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer et tester'}</button>
        {box && <button type="button" className="secondary" onClick={() => setOpen(false)}>Annuler</button>}
      </div>
    </form>
  );
}

/** Une release : ligne compacte si tout est reconnu, carte de correction sinon (fiche, catégorie, langue, NFO). Chaque choix est enregistré aussitôt. */
function ItemCard({ item, options, checked, onCheck, onUpdated, reload, setMsg }: {
  item: Item; options: Options; checked?: boolean; onCheck?: () => void; onUpdated: (u: { id: string; why: string | null; detail: any }) => void; reload: () => Promise<void>;
  setMsg: (m: { ok: boolean; text: string } | null) => void;
}) {
  const d = item.detail ?? {};
  const o = d.override ?? {};
  const green = d.verdict === 'GREEN';
  const [open, setOpen] = useState(!green);
  const [kind, setKind] = useState<string>(d.kind ?? 'FILM');
  const [q, setQ] = useState<string>(d.title ?? '');
  const [year, setYear] = useState<string>(d.year ? String(d.year) : '');
  const [results, setResults] = useState<Hit[]>(d.suggestions ?? []);
  const [searched, setSearched] = useState(false);
  const [showFiche, setShowFiche] = useState(false);
  const [link, setLink] = useState('');
  const [nfo, setNfo] = useState('');
  const [busy, setBusy] = useState(false);
  const categoryId: string = o.categoryId ?? d.category?.id ?? '';
  const language: string = o.language ?? d.language ?? '';
  const ficheTitle: string | null = o.noMeta ? null : o.metaTitle ?? d.meta?.title ?? null;
  const problems: string[] = d.problems ?? [];

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    try { const r = await api.post(`/member-import/items/${item.id}`, patch); onUpdated(r.data); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); } finally { setBusy(false); }
  }
  async function search() {
    if (!q.trim()) return;
    setBusy(true);
    try { const r = await api.get('/member-import/search', { params: { kind, q: q.trim(), year: year || undefined } }); setResults(r.data); setSearched(true); }
    catch (e) { setMsg({ ok: false, text: errText(e, 'Recherche impossible') }); } finally { setBusy(false); }
  }
  function pasteLink(v: string) {
    setLink(v);
    const m = v.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
    if (m) save({ metaKind: m[1].toLowerCase() === 'tv' ? 'SERIE' : 'FILM', metaId: m[2], metaTitle: `TMDB n° ${m[2]}` });
  }
  async function act(path: string, body?: any) {
    try { await api.post(`/member-import/items/${item.id}/${path}`, body); await reload(); } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }

  const chips = (
    <span className="muted" style={{ fontSize: 12 }}>
      {d.size ? `${formatBytes(d.size)} · ` : ''}
      {(d.category || o.categoryName) ? <span className="dd-chip">{o.categoryName ?? d.category?.name}</span> : null}{' '}
      {ficheTitle && <span className="dd-chip good">fiche : {ficheTitle}</span>}{' '}
      {o.noMeta && <span className="dd-chip">sans fiche</span>}{' '}
      {language ? <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>{language}</span> : 'langue ?'}
      {d.resolution ? ` · ${d.resolution}` : ''}
    </span>
  );

  if (green && !open) {
    return (
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={!!checked} onChange={onCheck} />
        <span style={{ wordBreak: 'break-all', flex: '1 1 260px' }}>{item.name}</span>
        {chips}
        <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setOpen(true)}>Modifier</button>
        <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => act('ignore')}>Écarter</button>
      </div>
    );
  }
  return (
    <div className="panel" style={{ padding: 10, background: 'rgba(255,255,255,0.03)' }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        {green && <input type="checkbox" style={{ width: 'auto' }} checked={!!checked} onChange={onCheck} />}
        <span style={{ wordBreak: 'break-all', fontWeight: 600, flex: 1 }}>{item.name}</span>
        {green && <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setOpen(false)}>Réduire</button>}
      </div>
      <div style={{ marginTop: 2 }}>{chips}</div>
      {problems.length > 0 && <div style={{ fontSize: 12, color: 'var(--gold-bright, #f5c542)', marginTop: 4 }}>⚠ {problems.map((p) => PROBLEM[p]).join(' · ')}{d.nfoError ? ` (${d.nfoError})` : ''}</div>}
      {problems.length > 0 && d.suggestion && (
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6, fontSize: 12 }}>
          <span>💡 Suggestion : <strong>{d.suggestion.categoryName}</strong>{d.suggestion.metaId ? <> · fiche <strong>{d.suggestion.metaTitle ?? d.suggestion.metaId}</strong></> : d.suggestion.noMeta ? ' · sans fiche' : ''}
            <span className="muted"> — choix accepté pour {d.suggestion.weight} release{d.suggestion.weight > 1 ? 's' : ''} qui lui ressemble{d.suggestion.weight > 1 ? 'nt' : ''}</span></span>
          <button type="button" disabled={busy} style={{ padding: '2px 10px', fontSize: 12 }}
            onClick={() => save({ categoryId: d.suggestion.categoryId, ...(d.suggestion.metaId ? { metaKind: d.suggestion.metaKind, metaId: d.suggestion.metaId, metaTitle: d.suggestion.metaTitle } : d.suggestion.noMeta ? { noMeta: true } : {}) })}>Utiliser</button>
        </div>
      )}

      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        <select value={categoryId} disabled={busy} onChange={(e) => {
          // Catégorie adulte : la fiche se cherche sur ThePornDB (si le site la propose).
          const c = options.categories.find((x) => x.id === e.target.value);
          if (c && /xxx|adult|porn|[ée]rot/i.test(c.name) && options.kinds.includes('XXX')) { setKind('XXX'); setShowFiche(true); }
          save({ categoryId: e.target.value });
        }} style={{ width: 'auto', outline: problems.includes('category') ? '1px solid var(--gold-bright, #f5c542)' : undefined }}>
          <option value="">— catégorie de Seeduction —</option>
          {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={language} disabled={busy} onChange={(e) => save({ language: e.target.value })} style={{ width: 'auto' }} title="Langue : seulement si le nom ou le NFO ne la donne pas">
          <option value="">Langue ? (non précisée)</option>
          {LANGUAGE_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.values.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l] ?? l}</option>)}</optgroup>)}
        </select>
      </div>

      {!(d.wantsFiche || problems.includes('fiche') || showFiche || o.metaId) && (
        <button type="button" className="secondary" style={{ marginTop: 8, padding: '2px 8px', fontSize: 12 }} onClick={() => setShowFiche(true)}>🔎 Ajouter une fiche (facultatif)</button>
      )}
      {(d.wantsFiche || problems.includes('fiche') || showFiche || o.metaId) && (
        <div style={{ marginTop: 8, outline: problems.includes('fiche') ? '1px solid var(--gold-bright, #f5c542)' : undefined, outlineOffset: 4, borderRadius: 4 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 'auto' }}>
              {(options.kinds.length ? options.kinds : ['FILM', 'SERIE']).map((k) => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} placeholder="Titre à chercher" style={{ flex: '1 1 200px' }} />
            <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="Année" style={{ width: 80 }} />
            <button type="button" className="secondary" disabled={busy || !q.trim()} onClick={search}>🔎 Chercher</button>
            <button type="button" className={o.noMeta ? 'on' : 'secondary'} disabled={busy} onClick={() => save({ noMeta: true })}>Sans fiche</button>
          </div>
          <input value={link} onChange={(e) => pasteLink(e.target.value)} placeholder="…ou colle l'adresse de la fiche TMDB (https://www.themoviedb.org/movie/…)" style={{ marginTop: 6 }} />
          {results.length === 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{searched ? 'Aucun résultat : essaie un autre titre (titre original, sans l\'année).' : 'Aucune fiche proposée : cherche avec un autre titre.'}</div>}
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 6, marginTop: 6 }}>
            {results.map((r) => {
              const on = (o.metaId ?? d.meta?.id) === r.id && !o.noMeta;
              return (
                <button key={r.id} type="button" className="secondary" disabled={busy} onClick={() => save({ metaKind: kind, metaId: r.id, metaTitle: r.title })}
                  style={{ display: 'flex', gap: 8, textAlign: 'left', alignItems: 'center', padding: 6, outline: on ? '2px solid var(--success)' : undefined }}>
                  {r.thumbnail ? <img src={r.thumbnail} alt="" loading="lazy" style={{ width: 40, height: 58, objectFit: 'cover', borderRadius: 3 }} /> : <div style={{ width: 40, height: 58 }} />}
                  <span style={{ fontSize: 12 }}><strong>{r.title}</strong><span className="muted" style={{ display: 'block' }}>{r.subtitle}</span></span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(problems.includes('nfo') || nfo) && (
        <div style={{ marginTop: 8 }}>
          <textarea rows={5} value={nfo} onChange={(e) => setNfo(e.target.value)} placeholder="Colle ici le contenu du .nfo ou le rapport MediaInfo de cette release (20 caractères minimum)" style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
          <button type="button" className="secondary" disabled={busy || nfo.trim().length < 20} onClick={() => save({ nfo }).then(() => setNfo(''))}>Enregistrer le NFO</button>
        </div>
      )}

      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        {!problems.includes('nfo') && !nfo && <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setNfo(' ')}>Remplacer le NFO</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} title="Efface cette ligne (et tes corrections) puis analyse le torrent de nouveau tout de suite : utile si le NFO est maintenant lisible ou si le serveur FTP était en panne" onClick={() => { if (window.confirm('Ré-analyser cette release ? Tes corrections sur cette ligne seront effacées.')) act('reanalyze'); }}>🔄 Ré-analyser</button>
        <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => act('ignore')}>Écarter cette release</button>
      </div>
    </div>
  );
}

/** Torrents envoyés : où ils en sont (modération, remise en seed dans le client). */
function SentList({ items }: { items: Item[] }) {
  if (items.length === 0) return <div className="panel muted">Aucun torrent envoyé pour le moment.</div>;
  const state = (i: Item) => {
    if (i.status === 'QUEUED') return { icon: '⏳', text: 'Envoi en cours…', color: 'inherit' };
    if (i.seeded === 'OK') return { icon: '🌱', text: 'En seed dans ton client (catégorie « Seeduction »)', color: 'var(--success)' };
    if (i.seeded === 'UNAVAILABLE') return { icon: '✗', text: i.why ?? 'Seed non démarré', color: 'var(--danger)' };
    if (i.torrentStatus === 'PENDING') return { icon: '🕓', text: 'En attente de validation par la modération', color: 'var(--gold-bright, #f5c542)' };
    if (i.torrentStatus === 'APPROVED' || i.torrentStatus === 'DEAD') return { icon: '✓', text: i.why ? `Approuvé — ${i.why}` : 'Approuvé — remise en seed dans ton client en cours', color: 'var(--success)' };
    return { icon: '✗', text: i.torrentStatus === 'REJECTED' ? 'Refusé par la modération' : 'Torrent supprimé', color: 'var(--danger)' };
  };
  return (
    <div className="panel">
      <table>
        <tbody>
          {items.map((i) => {
            const s = state(i);
            return (
              <tr key={i.id}>
                <td style={{ wordBreak: 'break-all' }}>{i.torrentId ? <Link to={`/torrents/${i.torrentId}`}>{i.name}</Link> : i.name}</td>
                <td style={{ color: s.color }}>{s.icon} {s.text}</td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(i.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
