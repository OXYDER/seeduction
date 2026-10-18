import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import Loading from './Loading';

interface Step { name: string; ok: boolean; ms: number; info?: string }
interface Run { id: string; trigger: string; kind: 'full' | 'predeploy'; startedAt: string; finishedAt?: string; ok?: boolean; error?: string; file?: string; bytes?: number; verified?: boolean; steps: Step[]; offsite?: { ok: boolean; info: string } | null }
interface FileRow { name: string; createdAt: string; bytes: number; encrypted: boolean; kind: 'full' | 'predeploy'; meta: { verified?: boolean; appVersion?: string | null; database?: { counts?: { users: number; torrents: number } }; git?: { commit?: string } } | null }
interface Cfg { enabled: boolean; time: string; timezone: string; keepDaily: number; keepWeekly: number; keepMonthly: number; offsiteDir: string; rcloneRemote: string; notifyFailure: boolean; hasPassphrase: boolean; passphraseConfirmedAt: string | null }
interface Status {
  config: Cfg; running: Run | null; lastRun: Run | null; lastSuccess: Run | null; lastRestoreTest: { at: string; ok: boolean; file: string; info: string; ms: number } | null;
  history: Run[]; files: FileRow[]; totalBytes: number; warnings: { level: 'error' | 'warn'; text: string }[]; serverTime: string; engine: { projectMounted: boolean };
}
const errorOf = (e: any) => e?.response?.data?.message ?? 'Action impossible';
const fmtDate = (iso: string) => new Date(iso).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' });
const dur = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

/** Administration des sauvegardes : état, sauvegarde immédiate, téléchargement du ZIP de restauration, test de restauration, réglages et phrase de récupération. */
export default function AdminBackup() {
  const [st, setSt] = useState<Status | null>(null);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [phrase, setPhrase] = useState<{ open: boolean; password: string; totp: string; value: string | null; saved: boolean; error: string }>({ open: false, password: '', totp: '', value: null, saved: false, error: '' });
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const r = (await api.get('/backup/status')).data as Status;
      setSt(r); setCfg((c) => c ?? r.config);
      return r;
    } catch (e) { setErr(errorOf(e)); return null; }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Suivi : toutes les 2 s pendant une sauvegarde, sinon toutes les 30 s.
  useEffect(() => {
    const tick = async () => { const r = await load(); timer.current = window.setTimeout(tick, r?.running ? 2000 : 30000); };
    timer.current = window.setTimeout(tick, 2000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [load]);

  async function runNow() {
    setBusy(true); setErr(''); setMsg('');
    try { await api.post('/backup/run'); setMsg('Sauvegarde lancée…'); await load(); } catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  async function download(name: string, format: 'zip' | 'raw') {
    setErr('');
    try { const url = (await api.post(`/backup/files/${encodeURIComponent(name)}/link`, { format })).data.url as string; window.location.href = url; }
    catch (e) { setErr(errorOf(e)); }
  }
  async function remove(name: string) {
    if (!window.confirm(`Supprimer définitivement « ${name} » ?`)) return;
    try { await api.post(`/backup/files/${encodeURIComponent(name)}/delete`); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  async function restoreTest() {
    setBusy(true); setErr(''); setMsg('Test en cours : le dernier paquet est déchiffré et rechargé dans une base jetable…');
    try { const r = (await api.post('/backup/restore-test')).data; setMsg(r.ok ? `✓ ${r.info}` : ''); if (!r.ok) setErr(`Test de restauration échoué : ${r.info}`); await load(); }
    catch (e) { setErr(errorOf(e)); setMsg(''); } finally { setBusy(false); }
  }
  async function saveCfg() {
    if (!cfg) return;
    setBusy(true); setErr('');
    try { setCfg((await api.put('/backup/config', cfg)).data); setMsg('✓ Réglages enregistrés.'); await load(); } catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  async function reveal() {
    setPhrase((p) => ({ ...p, error: '' }));
    try { const r = (await api.post('/backup/passphrase/reveal', { password: phrase.password, totpToken: phrase.totp || undefined })).data; setPhrase((p) => ({ ...p, value: r.passphrase, password: '', totp: '' })); }
    catch (e) { setPhrase((p) => ({ ...p, error: errorOf(e) })); }
  }
  async function confirmSaved() {
    try { await api.post('/backup/passphrase/confirm'); setPhrase({ open: false, password: '', totp: '', value: null, saved: false, error: '' }); setMsg('✓ Merci : la phrase de récupération est marquée comme notée.'); await load(); }
    catch (e) { setPhrase((p) => ({ ...p, error: errorOf(e) })); }
  }

  if (!st || !cfg) return <Loading error={err} />;
  const last = st.lastSuccess;
  const run = st.running;
  const field = (label: string, el: React.ReactNode, hint?: string) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}{el}{hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}</label>
  );

  return (
    <div className="grid" style={{ gap: 14 }}>
      {msg && <div className="panel" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>{msg}</div>}
      {err && <div className="panel" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{err}</div>}

      <div className="panel" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', borderColor: last && !st.warnings.some((w) => w.level === 'error') ? 'var(--success)' : '#fbbf24' }}>
        <div style={{ fontSize: 34 }}>{run ? '⏳' : last && !st.warnings.some((w) => w.level === 'error') ? '🛡️' : '⚠️'}</div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong style={{ fontSize: 16 }}>
            {run ? 'Sauvegarde en cours…' : last ? `Dernière sauvegarde complète : ${timeAgo(last.finishedAt!)}` : "Aucune sauvegarde complète pour l'instant"}
          </strong>
          <div className="muted" style={{ fontSize: 13 }}>
            {last && <>{fmtDate(last.finishedAt!)} · {formatBytes(last.bytes ?? 0)} · {last.verified ? '✓ relue et vérifiée' : 'non vérifiée'}{st.lastRestoreTest ? <> · test de restauration {st.lastRestoreTest.ok ? '✓ réussi' : '✗ échoué'} {timeAgo(st.lastRestoreTest.at)}</> : null}</>}
            {!last && "Lance une première sauvegarde : elle contient la base, les fichiers, la configuration (.env) et le code."}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>Chaque jour à {st.config.time} ({st.config.timezone}) · {st.files.length} paquet(s) gardés · {formatBytes(st.totalBytes)} au total</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={runNow} disabled={busy || !!run}>💾 Sauvegarder maintenant</button>
          <button type="button" className="secondary" onClick={restoreTest} disabled={busy || !!run || st.files.length === 0} title="Déchiffre le dernier paquet et le recharge dans une base jetable pour prouver qu'il est restaurable">🧪 Tester la restauration</button>
          <button type="button" className="secondary" onClick={() => setPhrase((p) => ({ ...p, open: true }))}>🔑 Phrase de récupération</button>
          <button type="button" className="secondary" onClick={() => setShowCfg((v) => !v)}>⚙️ Réglages</button>
        </div>
      </div>

      {st.warnings.length > 0 && (
        <div className="panel" style={{ display: 'grid', gap: 6 }}>
          {st.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 13.5, color: w.level === 'error' ? '#fca5a5' : '#fde68a' }}>{w.level === 'error' ? '⛔' : '⚠️'} {w.text}</div>
          ))}
        </div>
      )}

      {run && (
        <div className="panel" style={{ display: 'grid', gap: 4 }}>
          <strong>En cours : {run.kind === 'full' ? 'sauvegarde complète' : 'instantané de la base'}</strong>
          {run.steps.map((s, i) => <div key={i} style={{ fontSize: 13 }}>{s.ok ? '✓' : '✗'} {s.name} <span className="muted">· {dur(s.ms)}{s.info ? ` · ${s.info}` : ''}</span></div>)}
          <div className="muted" style={{ fontSize: 12.5 }}>… étape suivante en cours</div>
        </div>
      )}

      {showCfg && (
        <div className="panel" style={{ display: 'grid', gap: 12 }}>
          <strong>Réglages</strong>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Sauvegardes automatiques (une par jour)</label>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            {field('Heure de la sauvegarde', <input type="time" value={cfg.time} onChange={(e) => setCfg({ ...cfg, time: e.target.value })} />, 'Choisis une heure creuse. Si le serveur est éteint à ce moment, elle part dès son retour.')}
            {field('Fuseau horaire', <input value={cfg.timezone} onChange={(e) => setCfg({ ...cfg, timezone: e.target.value })} />, 'Ex. America/Toronto, Europe/Paris.')}
            {field('Garder (jours)', <input type="number" min={1} max={60} value={cfg.keepDaily} onChange={(e) => setCfg({ ...cfg, keepDaily: Number(e.target.value) })} />, 'Une sauvegarde par jour pour les N derniers jours.')}
            {field('Garder (semaines)', <input type="number" min={0} max={52} value={cfg.keepWeekly} onChange={(e) => setCfg({ ...cfg, keepWeekly: Number(e.target.value) })} />, 'Puis une par semaine.')}
            {field('Garder (mois)', <input type="number" min={0} max={60} value={cfg.keepMonthly} onChange={(e) => setCfg({ ...cfg, keepMonthly: Number(e.target.value) })} />, 'Puis une par mois.')}
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {field('Copie externe : dossier', <input placeholder="/offsite (disque USB, partage réseau…)" value={cfg.offsiteDir} onChange={(e) => setCfg({ ...cfg, offsiteDir: e.target.value })} />, "Chemin DANS le conteneur : monte d'abord ton disque dans docker-compose.yml (exemple en commentaire sous « backend »). Chaque paquet y est copié.")}
            {field('Copie externe : nuage ou serveur (rclone)', <input placeholder="monnuage:seeduction-sauvegardes" value={cfg.rcloneRemote} onChange={(e) => setCfg({ ...cfg, rcloneRemote: e.target.value })} />, 'Google Drive, OneDrive, Backblaze, S3, SFTP… Dépose le fichier rclone.conf dans le dossier backups/ du serveur (commande « rclone config » sur n\'importe quelle machine).')}
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.notifyFailure} onChange={(e) => setCfg({ ...cfg, notifyFailure: e.target.checked })} /> Prévenir les administrateurs si une sauvegarde échoue ou prend du retard</label>
          <div><button type="button" onClick={saveCfg} disabled={busy}>Enregistrer</button></div>
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead><tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}><th style={{ padding: 10 }}>Date</th><th>Type</th><th>Contenu</th><th>Taille</th><th>État</th><th style={{ textAlign: 'right', paddingRight: 10 }}>Télécharger</th></tr></thead>
          <tbody>
            {st.files.map((f, i) => (
              <tr key={f.name} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <td style={{ padding: 10 }}><strong>{fmtDate(f.createdAt)}</strong>{i === 0 && f.kind === 'full' && <span className="badge new" style={{ marginLeft: 6 }}>dernière</span>}<div className="muted" style={{ fontSize: 11.5 }}>{f.name}</div></td>
                <td>{f.kind === 'full' ? 'Complète' : 'Avant mise à jour'}</td>
                <td className="muted" style={{ fontSize: 12.5 }}>{f.meta?.database?.counts ? `${f.meta.database.counts.users} membres · ${f.meta.database.counts.torrents} torrents` : '—'}{f.meta?.appVersion ? ` · v${f.meta.appVersion}` : ''}</td>
                <td>{formatBytes(f.bytes)}</td>
                <td>{f.meta?.verified ? '✓ vérifiée' : '—'} {f.encrypted ? '🔒' : ''}</td>
                <td style={{ textAlign: 'right', paddingRight: 10, whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => download(f.name, 'zip')} title="ZIP prêt à restaurer : le paquet chiffré, le script restaurer.sh et un mode d'emploi pas à pas">⬇️ ZIP de restauration</button>{' '}
                  <button type="button" className="secondary" onClick={() => download(f.name, 'raw')} title="Le paquet chiffré seul (.tar.enc)" style={{ fontSize: 12 }}>paquet seul</button>{' '}
                  <button type="button" className="secondary" onClick={() => remove(f.name)} aria-label="Supprimer" title="Supprimer ce paquet">🗑️</button>
                </td>
              </tr>
            ))}
            {st.files.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 22, textAlign: 'center' }}>Aucune sauvegarde pour l'instant.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <button type="button" className="secondary" onClick={() => setShowGuide((v) => !v)}>{showGuide ? '▾' : '▸'} Comment remettre le site en ligne sur une nouvelle machine ?</button>
        {showGuide && (
          <ol style={{ margin: '12px 0 0', paddingLeft: 20, display: 'grid', gap: 6, fontSize: 13.5 }}>
            <li>Télécharge le <strong>ZIP de restauration</strong> du paquet voulu (bouton ci-dessus) et mets-le à l'abri <em>hors du serveur</em> (disque externe, nuage).</li>
            <li>Ayez aussi la <strong>phrase de récupération</strong> (bouton 🔑), notée ailleurs que sur le serveur : elle n'est jamais dans le ZIP. Sans elle, rien ne se rouvre.</li>
            <li>Sur la nouvelle machine (serveur Linux, NAS, hébergeur, PC) : copie le ZIP, décompresse-le et lance <code>bash restaurer.sh --installer-docker</code>.</li>
            <li>Le script demande la phrase, vérifie le paquet, puis remet tout en place : code, configuration et secrets (.env), base de données, fichiers, démarrage.</li>
            <li>Termine en pointant ton proxy et ton DNS vers la nouvelle machine. Un mode d'emploi détaillé (Linux, Synology, Windows, Mac, dépannage) est dans le ZIP, fichier <code>1-LISEZ-MOI-D-ABORD.txt</code>.</li>
          </ol>
        )}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Chaque paquet contient : la base de données · les fichiers .torrent, pochettes et pièces jointes du chat · le coffre de l'« Alerte générale » · les fichiers <code>.env</code> (clés et mots de passe) · le code du site. Il est chiffré (AES-256) avec ta phrase de récupération.
        </div>
      </div>

      <div className="panel">
        <button type="button" className="secondary" onClick={() => setShowHistory((v) => !v)}>{showHistory ? '▾' : '▸'} Historique des sauvegardes ({st.history.length})</button>
        {showHistory && (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {st.history.map((h) => (
              <details key={h.id} style={{ fontSize: 13 }}>
                <summary style={{ cursor: 'pointer' }}>{h.ok === undefined ? '⏳' : h.ok ? '✅' : '❌'} {fmtDate(h.startedAt)} · {h.kind === 'full' ? 'complète' : 'avant mise à jour'} · {h.trigger === 'schedule' ? 'automatique' : h.trigger === 'manual' ? 'manuelle' : 'déploiement'}{h.bytes ? ` · ${formatBytes(h.bytes)}` : ''}{h.error ? ` · ${h.error}` : ''}</summary>
                <div style={{ paddingLeft: 18, display: 'grid', gap: 2 }}>
                  {h.steps.map((s, i) => <div key={i}>{s.ok ? '✓' : '✗'} {s.name} <span className="muted">· {dur(s.ms)}{s.info ? ` · ${s.info}` : ''}</span></div>)}
                  {h.offsite && <div>{h.offsite.ok ? '✓' : '✗'} Copie externe <span className="muted">· {h.offsite.info}</span></div>}
                </div>
              </details>
            ))}
            {st.history.length === 0 && <span className="muted">Rien pour l'instant.</span>}
          </div>
        )}
      </div>

      {phrase.open && (
        <div role="dialog" aria-label="Phrase de récupération" onClick={() => setPhrase({ open: false, password: '', totp: '', value: null, saved: false, error: '' })} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 100%)', display: 'grid', gap: 12, background: '#0d1224' }}>
            <h3 style={{ margin: 0 }}>🔑 Phrase de récupération</h3>
            {!phrase.value ? (
              <>
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Elle chiffre toutes tes sauvegardes. Pour l'afficher, confirme ton mot de passe.</p>
                <input type="password" placeholder="Ton mot de passe" value={phrase.password} onChange={(e) => setPhrase({ ...phrase, password: e.target.value })} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') reveal(); }} />
                <input placeholder="Code à 6 chiffres (si ta 2FA est activée)" value={phrase.totp} onChange={(e) => setPhrase({ ...phrase, totp: e.target.value })} inputMode="numeric" />
                {phrase.error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{phrase.error}</div>}
                <div style={{ display: 'flex', gap: 8 }}><button type="button" onClick={reveal} disabled={!phrase.password}>Afficher</button><button type="button" className="secondary" onClick={() => setPhrase({ open: false, password: '', totp: '', value: null, saved: false, error: '' })}>Fermer</button></div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 22, letterSpacing: 1, textAlign: 'center', padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.07)', userSelect: 'all' }}>{phrase.value}</div>
                <p style={{ margin: 0, fontSize: 13.5 }}>⚠️ <strong>Note-la maintenant, ailleurs que sur ce serveur</strong> (gestionnaire de mots de passe, papier dans un coffre). Si le serveur est perdu, c'est la seule façon de rouvrir tes sauvegardes — et il n'existe aucun moyen de la retrouver.</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(phrase.value!)}>Copier</button>
                  <button type="button" className="secondary" onClick={() => window.print()}>Imprimer</button>
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}><input type="checkbox" checked={phrase.saved} onChange={(e) => setPhrase({ ...phrase, saved: e.target.checked })} /> Je l'ai notée en lieu sûr, hors de ce serveur.</label>
                {phrase.error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{phrase.error}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={confirmSaved} disabled={!phrase.saved}>Confirmer</button>
                  <button type="button" className="secondary" onClick={() => setPhrase({ open: false, password: '', totp: '', value: null, saved: false, error: '' })}>Fermer</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
