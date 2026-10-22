import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';

interface Release { version: string; size: number; sha256: string; notes: string | null; publishedAt: string }
interface Overview { windows: Release | null; android: Release | null; code: { windows: string | null; android: string | null }; key: { set: boolean; createdAt: string | null } }
type Platform = 'windows' | 'android';

const CHUNK = 8 * 1024 * 1024;
const META: Record<Platform, { title: string; icon: string; accept: string; hint: string }> = {
  windows: { title: 'Lecteur Windows', icon: '🖥️', accept: '.exe', hint: 'Le fichier « Seeduction Player Setup X.Y.Z.exe » compilé dans desktop-player/dist.' },
  android: { title: 'Lecteur Android', icon: '📱', accept: '.apk', hint: 'Le fichier « Seeduction.Player.apk » compilé dans android-player.' },
};

/** Une version trouvée dans le nom du fichier (« Seeduction Player Setup 0.2.0.exe » → 0.2.0), pour pré-remplir le formulaire. */
const cmpVersions = (a: string, b: string) => { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; };
const versionOf = (name: string) => /(\d{1,4}(?:\.\d{1,4}){1,3})(?=\D*$)/.exec(name.replace(/\.(exe|apk)$/i, ''))?.[1] ?? '';

function Uploader({ platform, current, onDone }: { platform: Platform; current: Release | null; onDone: () => void }) {
  const m = META[platform];
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  function pick(f: File | null) {
    setFile(f); setMsg(''); setErr('');
    if (f && !version) setVersion(versionOf(f.name));
  }

  async function publish() {
    if (!file) return;
    setMsg(''); setErr(''); setProgress(0);
    try {
      const { upload } = (await api.post(`/admin/players/${platform}/start`)).data;
      const total = Math.ceil(file.size / CHUNK);
      for (let i = 0; i < total; i++) {
        const blob = file.slice(i * CHUNK, (i + 1) * CHUNK);
        // Une coupure passagère ne doit pas faire recommencer 150 Mo : trois essais par morceau.
        for (let attempt = 1; ; attempt++) {
          try { await api.post(`/admin/players/chunk?upload=${upload}&index=${i}`, blob, { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 120_000 }); break; }
          catch (e: any) { if (attempt >= 3 || e.response?.status === 409) throw e; await new Promise((r) => setTimeout(r, 1500 * attempt)); }
        }
        setProgress(Math.round(((i + 1) / total) * 100));
      }
      const r = (await api.post('/admin/players/finish', { upload, version, notes: notes || undefined })).data;
      setMsg(`✓ Version ${r.version} publiée (${formatBytes(r.size)}).`);
      setFile(null); setVersion(''); setNotes('');
      onDone();
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Envoi impossible : vérifie ta connexion et recommence.');
    } finally { setProgress(null); }
  }

  const busy = progress !== null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <input type="file" accept={m.accept} disabled={busy} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
      <div className="muted" style={{ fontSize: 12 }}>{m.hint}</div>
      {file && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Version
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="ex. 1.2.0" style={{ width: 110 }} disabled={busy} />
          </label>
          <label style={{ display: 'grid', gap: 3, fontSize: 13, flex: 1, minWidth: 220 }}>Nouveautés (facultatif, montrées aux membres)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} disabled={busy} />
          </label>
          <button type="button" disabled={busy || !version} onClick={publish}>{busy ? `Envoi… ${progress} %` : `Publier ${formatBytes(file.size)}`}</button>
        </div>
      )}
      {current && file && version && version === current.version && <div className="muted" style={{ fontSize: 12.5, color: 'var(--danger)' }}>Cette version est déjà publiée : change le numéro, sinon les lecteurs ne verront pas de mise à jour.</div>}
      {busy && <div style={{ height: 8, borderRadius: 6, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}><div style={{ width: `${progress}%`, height: '100%', background: 'var(--gold)' }} /></div>}
      {msg && <div style={{ color: 'var(--success)' }}>{msg}</div>}
      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
    </div>
  );
}

/** Publication automatique : la clé que le script « publier-lecteurs » utilise pour compiler et publier sans mot de passe (Windows et Android d'un coup). */
function AutoPublish({ info, onChange }: { info: Overview['key']; onChange: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const block = key ? JSON.stringify({ site: window.location.origin, key }, null, 2) : '';
  async function create() {
    if (info.set && !window.confirm("Remplacer la clé ? L'ancienne cessera de fonctionner immédiatement.")) return;
    setErr(''); setCopied(false);
    try { setKey((await api.post('/admin/players/key')).data.key); onChange(); } catch (e: any) { setErr(e.response?.data?.message ?? 'Erreur'); }
  }
  async function revoke() {
    if (!window.confirm("Révoquer la clé ? Le script de publication ne fonctionnera plus tant qu'une nouvelle clé n'est pas créée.")) return;
    try { await api.delete('/admin/players/key'); setKey(null); onChange(); } catch (e: any) { setErr(e.response?.data?.message ?? 'Erreur'); }
  }
  return (
    <div className="panel" style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0 }}>⚙️ Publication automatique</h3>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Le script <code>tools/publier-lecteurs.bat</code> (sur ton PC) fait tout seul : numéro de version suivant, compilation du lecteur Windows et de l'application Android, envoi au site, vérification.
        Il lui faut une clé de publication, qui ne permet <strong>que</strong> de publier les lecteurs (pas d'accéder à ton compte).
        {info.set ? <> Une clé est active (créée le {info.createdAt ? new Date(info.createdAt).toLocaleString('fr-CA') : '?'}).</> : <> Aucune clé n'est créée.</>}
      </p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={create}>{info.set ? 'Remplacer la clé' : 'Créer la clé de publication'}</button>
        {info.set && <button type="button" className="secondary" onClick={revoke}>Révoquer la clé</button>}
      </div>
      {key && (
        <div style={{ display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 13 }}>Colle ce bloc dans <code>tools/publier-lecteurs.config.json</code> (il ne sera plus jamais affiché) :</strong>
          <pre style={{ margin: 0, padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.35)', overflowX: 'auto', fontSize: 12.5 }}>{block}</pre>
          <div><button type="button" className="secondary" onClick={() => { navigator.clipboard?.writeText(block).then(() => setCopied(true)).catch(() => undefined); }}>{copied ? '✓ Copié' : 'Copier'}</button></div>
          <span className="muted" style={{ fontSize: 12 }}>Ce fichier n'est pas versionné (ignoré par git). Ensuite, double-clique sur <code>tools/publier-lecteurs.bat</code>.</span>
        </div>
      )}
      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
    </div>
  );
}

/** Admin > Lecteurs : ce qui est publié sur le site, ce que contient le code, publication manuelle ou automatique. */
export default function AdminPlayers() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/admin/players').then((r) => setData(r.data)).catch(() => setErr('Chargement impossible')), []);
  useEffect(() => { void load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);
  if (!data) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : <p className="muted">Chargement…</p>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel" style={{ display: 'grid', gap: 6 }}>
        <h2 style={{ margin: 0 }}>⬇️ Lecteurs Seeduction</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Les installateurs sont hébergés ici, plus besoin de GitHub. Ci-dessous : ce qui est publié sur le site en ce moment (c'est ce que voit la <a href="/player">page de téléchargement</a>, et ce que les lecteurs comparent à leur version pour proposer une mise à jour),
          puis la publication <strong>manuelle</strong> d'un fichier ; plus bas, la publication <strong>automatique</strong>.
        </p>
      </div>
      {(Object.keys(META) as Platform[]).map((p) => {
        const cur = data[p];
        const code = data.code?.[p] ?? null;
        const newer = !!code && (!cur || cmpVersions(code, cur.version) > 0);
        return (
          <div key={p} className="panel" style={{ display: 'grid', gap: 10 }}>
            <h3 style={{ margin: 0 }}>{META[p].icon} {META[p].title}</h3>
            <div style={{ fontSize: 13.5, display: 'grid', gap: 4, padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
              <strong style={{ fontSize: 12.5 }} className="muted">Actuellement sur le site</strong>
              {cur ? (
                <>
                  <div><strong>Version {cur.version}</strong> · {formatBytes(cur.size)} · publiée le {new Date(cur.publishedAt).toLocaleString('fr-CA')}</div>
                  {cur.notes && <div className="muted">Nouveautés : {cur.notes}</div>}
                  <div className="muted" style={{ fontSize: 11.5 }}>SHA-256 : <code>{cur.sha256.slice(0, 16)}…</code></div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <a href={`/api/downloads/players/${p}`}>⬇ Télécharger tel que les membres le reçoivent</a>
                    <button type="button" className="secondary" onClick={() => window.confirm(`Retirer l'installateur ${META[p].title} du site ?`) && api.delete(`/admin/players/${p}`).then(load)}>Retirer</button>
                  </div>
                </>
              ) : <div className="muted">Rien n'est publié : la page de téléchargement affiche les liens GitHub de secours.</div>}
              <div style={{ fontSize: 12.5, color: newer ? 'var(--gold-bright, #e0b84a)' : undefined }} className={newer ? undefined : 'muted'}>
                {code ? (newer ? `⚠ Le projet est en version ${code}${cur ? ` (plus récente que ${cur.version})` : ''} : compile et publie-la.` : `✓ À jour avec le projet (version ${code}).`) : 'Version du projet : non lisible depuis le serveur.'}
              </div>
            </div>
            <strong style={{ fontSize: 13 }}>Publier un fichier à la main</strong>
            <Uploader platform={p} current={cur} onDone={load} />
          </div>
        );
      })}
      <AutoPublish info={data.key} onChange={load} />
    </div>
  );
}
