import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';

interface Release { version: string; size: number; sha256: string; notes: string | null; publishedAt: string }
type Platform = 'windows' | 'android';

const CHUNK = 8 * 1024 * 1024;
const META: Record<Platform, { title: string; icon: string; accept: string; hint: string }> = {
  windows: { title: 'Lecteur Windows', icon: '🖥️', accept: '.exe', hint: 'Le fichier « Seeduction Player Setup X.Y.Z.exe » compilé dans desktop-player/dist.' },
  android: { title: 'Lecteur Android', icon: '📱', accept: '.apk', hint: 'Le fichier « Seeduction.Player.apk » compilé dans android-player.' },
};

/** Une version trouvée dans le nom du fichier (« Seeduction Player Setup 0.2.0.exe » → 0.2.0), pour pré-remplir le formulaire. */
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

/** Admin > Lecteurs : les installateurs du lecteur Windows et de l'application Android sont hébergés par le site. Publier une nouvelle version la propose aux lecteurs, qui préviennent leurs utilisateurs. */
export default function AdminPlayers() {
  const [data, setData] = useState<Record<Platform, Release | null> | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/admin/players').then((r) => setData(r.data)).catch(() => setErr('Chargement impossible')), []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : <p className="muted">Chargement…</p>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="panel" style={{ display: 'grid', gap: 6 }}>
        <h2 style={{ margin: 0 }}>⬇️ Lecteurs Seeduction</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Les installateurs sont hébergés ici, plus besoin de GitHub. Après chaque compilation, choisis le fichier, vérifie le numéro de version (il doit être plus grand que le précédent) et publie :
          la <a href="/player">page de téléchargement</a> affiche la nouvelle version, et les lecteurs déjà installés proposent à leur utilisateur de la télécharger.
        </p>
      </div>
      {(Object.keys(META) as Platform[]).map((p) => {
        const cur = data[p];
        return (
          <div key={p} className="panel" style={{ display: 'grid', gap: 10 }}>
            <h3 style={{ margin: 0 }}>{META[p].icon} {META[p].title}</h3>
            {cur ? (
              <div style={{ fontSize: 13.5, display: 'grid', gap: 3 }}>
                <div><strong>Version {cur.version}</strong> · {formatBytes(cur.size)} · publiée le {new Date(cur.publishedAt).toLocaleString('fr-CA')}</div>
                {cur.notes && <div className="muted">{cur.notes}</div>}
                <div className="muted" style={{ fontSize: 11.5 }}>SHA-256 : <code>{cur.sha256.slice(0, 16)}…</code></div>
                <div><button type="button" className="secondary" onClick={() => window.confirm(`Retirer l'installateur ${META[p].title} du site ?`) && api.delete(`/admin/players/${p}`).then(load)}>Retirer</button></div>
              </div>
            ) : <div className="muted">Aucun installateur publié : la page de téléchargement affichera « bientôt disponible ».</div>}
            <Uploader platform={p} current={cur} onDone={load} />
          </div>
        );
      })}
    </div>
  );
}
