import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import Avatar from './Avatar';
import UserLink from './UserLink';

type Level = 'NONE' | 'WATCH' | 'SUSPECT' | 'LIKELY' | 'CRITICAL';
interface Kind { key: string; label: string; family: string; familyLabel: string; hint: string }
interface Config { enabled: boolean; observeOnly: boolean; alertLevel: string; notifyScope: string; sensitivity: number; speedWarnMBps: number; passkeyNetworks: number; surgeGb: number; pointsLaunder: number; exemptStaff: boolean }
interface Overview {
  config: Config; levels: Record<string, number>; statuses: Record<string, number>; events24h: { kind: string; label: string; count: number; points: number }[];
  top: { id: string; userId: string; username: string; avatarUrl: string | null; level: Level; score: number }[]; coverage: { trackedIps: number; flowRows: number }; kinds: Kind[];
}
interface Row {
  id: string; userId: string; score: number; level: Level; confidence: number; status: string; families: string[]; lastEventAt: string; assigneeName: string | null;
  user: { id: string; username: string; role: string; avatarUrl: string | null; ratio: number | null; uploaded: number; downloaded: number; createdAt: string; memberClass: string };
  top: { kind: string; label: string; points: number }[];
}
interface Detail {
  user: { id: string; username: string; role: string; status: string; avatarUrl: string | null; createdAt: string; lastSeenAt: string | null; uploaded: number; downloaded: number; ratio: number | null; bonusPoints: number; memberClass: string; warnings: number; bans: number };
  case: { id: string; score: number; level: Level; confidence: number; status: string; breakdown: Record<string, { points: number; events: number; lastAt: string }> | null; families: string[]; firstFlaggedAt: string; assigneeName: string | null; notes: { id: string; authorName: string; body: string; kind: string; createdAt: string }[] } | null;
  events: { id: string; kind: string; label: string; family: string; points: number; count: number; details: any; firstAt: string; lastAt: string; torrent: { id: string; name: string } | null }[];
  ips: { ip: string; firstSeenAt: string; lastSeenAt: string; announces: number; shared: number }[];
  linked: { id: string; username: string; status: string; createdAt: string; ips: string[]; lastSeenAt: string }[];
  clients: { client: string; version: string | null; userAgent: string | null; ip: string; torrent: { id: string; name: string }; isSeeder: boolean; lastAnnounceAt: string }[];
  flow: { torrent: { id: string; name: string }; up: number; down: number; got: number }[];
}

const LEVELS: Record<Level, { label: string; color: string; icon: string }> = {
  NONE: { label: 'Aucun', color: '#64748b', icon: '·' },
  WATCH: { label: 'À surveiller', color: '#7dd3fc', icon: '👁️' },
  SUSPECT: { label: 'Suspect', color: '#fbbf24', icon: '🕵️' },
  LIKELY: { label: 'Probable', color: '#fb923c', icon: '⚠️' },
  CRITICAL: { label: 'Quasi certain', color: '#f87171', icon: '🚨' },
};
const STATUS_LABEL: Record<string, string> = { OPEN: 'À traiter', REVIEWING: 'En cours', CLEARED: 'Innocenté', ACTIONED: 'Sanctionné', EXPIRED: 'Classé (estompé)' };
const FAMILY_COLOR: Record<string, string> = { ratio: '#a78bfa', client: '#38bdf8', network: '#34d399', bonus: '#f472b6' };
const errorOf = (e: any) => e?.response?.data?.message ?? 'Action impossible';
const gb = (n: number) => `${Number(n).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} Go`;
const dur = (s: number) => (s >= 3600 ? `${Math.round(s / 360) / 10} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} s`);

/** Phrase lisible pour un signal : ce qui a été vu, en chiffres. */
function describe(kind: string, d: any): string {
  if (!d) return '';
  switch (kind) {
    case 'SPEED_IMPOSSIBLE': return `${d.mbps} Mo/s en moyenne (${gb(d.gb)} déclarés en ${dur(d.seconds)}) — seuil réglé à ${d.thresholdMBps} Mo/s`;
    case 'LEFT_TAMPER': return `« left » = ${formatBytes(d.left)} alors que le torrent fait ${formatBytes(d.size)}`;
    case 'DOWNLOAD_UNDERREPORT': return `Le torrent a avancé de ${gb(d.acquiredGb)} mais seulement ${gb(d.reportedGb)} déclarés (${d.hiddenPercent} % masqués)`;
    case 'COUNTER_ROLLBACK': return `Upload ${formatBytes(d.uploadedBefore)} → ${formatBytes(d.uploadedNow)}, download ${formatBytes(d.downloadedBefore)} → ${formatBytes(d.downloadedNow)} avec le même peer_id`;
    case 'ANNOUNCE_FLOOD': return `Announce ${d.seconds} s après le précédent, sans événement`;
    case 'FAKE_CLIENT': return `${d.reason}${d.userAgent ? ` — User-Agent « ${d.userAgent} »` : ''}${d.peerId ? ` (peer_id ${d.peerId}…)` : ''}`;
    case 'SWARM_IMBALANCE': return `${gb(d.upGb)} envoyés déclarés ; le swarm déclare ${gb(d.swarmUpGb)} envoyés pour seulement ${gb(d.swarmReceivedGb)} reçus → ${gb(d.attributableGb)} sans destinataire`;
    case 'RATIO_SURGE': return `${gb(d.upGb2d)} envoyés en 2 jours${d.baselineGbPerDay != null ? ` (habitude : ${gb(d.baselineGbPerDay)}/jour, ×${d.factor})` : ' (aucun historique)'} — compte de ${d.accountDays} jours`;
    case 'PASSKEY_SHARING': return `${d.networks} réseaux différents en ${d.windowHours} h : ${(d.ips ?? []).join(', ')}`;
    case 'SHARED_IP': return `Adresse ${d.ip} aussi utilisée par ${(d.others ?? []).join(', ')}`;
    case 'ACCOUNT_COLLUSION': return `${d.role === 'envoyeur' ? 'A envoyé' : 'A reçu'} ${gb(d.gb)} ${d.role === 'envoyeur' ? 'à' : 'de'} ${d.partner} (même adresse) sur ${d.windowDays} j — ${d.boostedPercent} % sur freeleech / double upload`;
    case 'POINT_LAUNDERING': return `${d.role === 'envoyeur' ? `Points envoyés vers ${d.partner ?? 'un compte lié'}` : 'Points reçus'} : ${d.receivedPoints} pts en ${d.windowDays} j, dont ${d.fromLinkedAccounts} de comptes liés et ${d.fromNewAccounts} de comptes récents (${d.senders} envoyeur(s))`;
    default: return JSON.stringify(d);
  }
}

function LevelBadge({ level, big }: { level: Level; big?: boolean }) {
  const l = LEVELS[level] ?? LEVELS.NONE;
  return <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: big ? '4px 12px' : '2px 8px', borderRadius: 999, fontWeight: 800, fontSize: big ? 14 : 11.5, color: l.color, background: `${l.color}22`, border: `1px solid ${l.color}55`, whiteSpace: 'nowrap' }}>{l.icon} {l.label}</span>;
}

function ScoreBar({ score, level }: { score: number; level: Level }) {
  return (
    <div title={`Score ${score}`} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, (score / 200) * 100)}%`, height: '100%', background: LEVELS[level]?.color }} /></div>
      <strong style={{ fontSize: 12.5, minWidth: 34, textAlign: 'right' }}>{Math.round(score)}</strong>
    </div>
  );
}

/** Anti-triche : dossiers de membres suspects, preuves détaillées, traitement par l'équipe et réglages. */
export default function AdminAntiCheat() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN' || role === 'OWNER';
  const [params, setParams] = useSearchParams();
  const [ov, setOv] = useState<Overview | null>(null);
  const [rows, setRows] = useState<{ total: number; items: Row[]; page: number; pageSize: number } | null>(null);
  const [filter, setFilter] = useState({ status: 'ACTIVE', level: 'ALL', search: '' });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [lookup, setLookup] = useState('');
  const [note, setNote] = useState('');
  const [sanction, setSanction] = useState<'warn' | 'ban' | null>(null);
  const [reason, setReason] = useState('');
  const [cfg, setCfg] = useState<Config | null>(null);
  const [showCfg, setShowCfg] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(() => api.get('/anticheat/overview').then((r) => { setOv(r.data); setCfg((c) => c ?? r.data.config); }).catch((e) => setErr(errorOf(e))), []);
  const loadList = useCallback(() => api.get('/anticheat/cases', { params: { ...filter, page } }).then((r) => setRows(r.data)).catch((e) => setErr(errorOf(e))), [filter, page]);
  const openCase = useCallback(async (id: string) => {
    setErr(''); setMsg('');
    try { setDetail((await api.get(`/anticheat/cases/${encodeURIComponent(id)}`)).data); } catch (e) { setErr(errorOf(e)); }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { const c = params.get('case'); if (c) openCase(c); }, [params, openCase]);

  const refresh = () => { loadOverview(); loadList(); };
  const kinds = new Map((ov?.kinds ?? []).map((k) => [k.key, k]));

  async function setStatus(status: string) {
    if (!detail?.case) return;
    setBusy(true); setErr('');
    try { setDetail((await api.post(`/anticheat/cases/${detail.case.id}/status`, { status, note: note.trim() || undefined })).data); setNote(''); refresh(); }
    catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  async function addNote() {
    if (!detail?.case || !note.trim()) return;
    setBusy(true);
    try { setDetail((await api.post(`/anticheat/cases/${detail.case.id}/notes`, { body: note })).data); setNote(''); } catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  async function applySanction() {
    if (!detail || !sanction || !reason.trim()) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/admin/users/${detail.user.id}/${sanction}`, { reason: reason.trim() });
      if (detail.case) await api.post(`/anticheat/cases/${detail.case.id}/status`, { status: 'ACTIONED', note: `${sanction === 'ban' ? 'Banni' : 'Averti'} : ${reason.trim()}` }).then((r) => setDetail(r.data));
      setMsg(sanction === 'ban' ? '✓ Membre banni.' : '✓ Avertissement envoyé.'); setSanction(null); setReason(''); refresh();
    } catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  async function saveCfg() {
    if (!cfg) return;
    setBusy(true); setErr('');
    try { setCfg((await api.put('/anticheat/config', cfg)).data); setMsg('✓ Réglages enregistrés.'); loadOverview(); } catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  async function runNow() {
    setBusy(true); setErr('');
    try { const r = (await api.post('/anticheat/run')).data; setMsg(`✓ Analyses terminées : ${r.signals} signal(aux) enregistré(s) en ${r.ms} ms.`); setTimeout(refresh, 5500); } catch (e) { setErr(errorOf(e)); } finally { setBusy(false); }
  }
  const close = () => { setDetail(null); setSanction(null); setNote(''); if (params.get('case')) { params.delete('case'); setParams(params, { replace: true }); } };

  if (!ov) return <p className="muted">{err || 'Chargement…'}</p>;
  const num = (k: keyof Config, label: string, hint: string, min = 0, max = 100000) => cfg && (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={min} max={max} value={cfg[k] as number} onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) || 0 })} />
      <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>
    </label>
  );

  return (
    <div className="grid" style={{ gap: 14 }}>
      {msg && <div className="panel" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>{msg}</div>}
      {err && <div className="panel" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{err}</div>}

      {!ov.config.enabled && <div className="panel" style={{ borderColor: '#fbbf24' }}>⏸️ L'anti-triche est <strong>désactivé</strong> : plus rien n'est analysé tant qu'il ne sera pas réactivé dans les réglages.</div>}
      {ov.config.enabled && ov.config.observeOnly && <div className="panel" style={{ borderColor: '#7dd3fc' }}>👁️ <strong>Mode observation</strong> : les signaux sont enregistrés et les dossiers se remplissent, mais l'équipe n'est pas alertée. Parfait pour calibrer quelques jours avant d'activer les alertes.</div>}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {(['CRITICAL', 'LIKELY', 'SUSPECT', 'WATCH'] as Level[]).map((l) => (
          <button key={l} type="button" className="panel" onClick={() => { setFilter({ ...filter, status: 'ACTIVE', level: l }); setPage(1); }} style={{ textAlign: 'left', cursor: 'pointer', borderColor: filter.level === l ? LEVELS[l].color : undefined, font: 'inherit', color: 'inherit' }}>
            <div style={{ color: LEVELS[l].color, fontWeight: 800, fontSize: 12.5 }}>{LEVELS[l].icon} {LEVELS[l].label}</div>
            <strong style={{ fontSize: 26 }}>{ov.levels[l] ?? 0}</strong>
            <div className="muted" style={{ fontSize: 11.5 }}>dossier(s) actif(s)</div>
          </button>
        ))}
        <div className="panel"><div className="muted" style={{ fontSize: 12.5 }}>Signaux (24 h)</div><strong style={{ fontSize: 26 }}>{ov.events24h.reduce((n, e) => n + e.count, 0)}</strong>
          <div className="muted" style={{ fontSize: 11.5 }}>{ov.coverage.flowRows.toLocaleString('fr-CA')} flux · {ov.coverage.trackedIps.toLocaleString('fr-CA')} IP suivies</div></div>
      </div>

      {ov.events24h.length > 0 && (
        <div className="panel" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>Dernières 24 h :</span>
          {ov.events24h.map((e) => <span key={e.kind} title={kinds.get(e.kind)?.hint} style={{ fontSize: 12, padding: '2px 8px', borderRadius: 6, background: `${FAMILY_COLOR[kinds.get(e.kind)?.family ?? 'client']}22` }}>{e.label} ×{e.count}</span>)}
        </div>
      )}

      <div className="panel" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filter.status} onChange={(e) => { setFilter({ ...filter, status: e.target.value }); setPage(1); }} aria-label="Statut">
          <option value="ACTIVE">À traiter et en cours</option><option value="OPEN">À traiter</option><option value="REVIEWING">En cours</option><option value="CLEARED">Innocentés</option><option value="ACTIONED">Sanctionnés</option><option value="EXPIRED">Classés (estompés)</option><option value="ALL">Tous</option>
        </select>
        <select value={filter.level} onChange={(e) => { setFilter({ ...filter, level: e.target.value }); setPage(1); }} aria-label="Niveau">
          <option value="ALL">Tous les niveaux</option><option value="SUSPECT+">Suspect et plus</option>{(['WATCH', 'SUSPECT', 'LIKELY', 'CRITICAL'] as Level[]).map((l) => <option key={l} value={l}>{LEVELS[l].label}</option>)}
        </select>
        <input placeholder="Filtrer par pseudo…" value={filter.search} onChange={(e) => { setFilter({ ...filter, search: e.target.value }); setPage(1); }} style={{ maxWidth: 200 }} />
        <span style={{ flex: 1 }} />
        <form onSubmit={(e) => { e.preventDefault(); if (lookup.trim()) openCase(lookup.trim()); }} style={{ display: 'flex', gap: 6 }}>
          <input placeholder="Analyser un membre (pseudo)…" value={lookup} onChange={(e) => setLookup(e.target.value)} style={{ width: 210 }} />
          <button type="submit" className="secondary">🔎 Analyser</button>
        </form>
        {isAdmin && <button type="button" className="secondary" onClick={() => setShowCfg((v) => !v)}>⚙️ Réglages</button>}
      </div>

      {showCfg && cfg && isAdmin && (
        <div className="panel" style={{ display: 'grid', gap: 12 }}>
          <strong>Réglages de l'anti-triche</strong>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Activé</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.observeOnly} onChange={(e) => setCfg({ ...cfg, observeOnly: e.target.checked })} /> Mode observation (aucune alerte envoyée)</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.exemptStaff} onChange={(e) => setCfg({ ...cfg, exemptStaff: e.target.checked })} /> Exempter l'équipe</label>
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Alerter à partir du niveau
              <select value={cfg.alertLevel} onChange={(e) => setCfg({ ...cfg, alertLevel: e.target.value })}><option value="SUSPECT">Suspect</option><option value="LIKELY">Probable</option><option value="CRITICAL">Quasi certain</option></select>
              <span className="muted" style={{ fontSize: 11.5 }}>Une alerte part quand le niveau MONTE au-dessus du dernier signalé.</span></label>
            <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>Qui est alerté
              <select value={cfg.notifyScope} onChange={(e) => setCfg({ ...cfg, notifyScope: e.target.value })}><option value="STAFF">Toute l'équipe (modérateurs et plus)</option><option value="ADMINS">Administrateurs seulement</option></select></label>
            {num('sensitivity', 'Sensibilité (%)', '100 = normal ; plus haut = alerte plus tôt ; plus bas = plus tolérant.', 40, 250)}
            {num('speedWarnMBps', 'Vitesse d\'upload suspecte (Mo/s)', 'Au-delà, chaque announce laisse un signal qui grossit avec la vitesse (2×, 5×, 10× le seuil).', 10, 5000)}
            {num('passkeyNetworks', 'Réseaux pour « passkey partagée »', 'Réseaux distincts vus en 6 h (maison + mobile + seedbox = 3).', 2, 20)}
            {num('surgeGb', 'Envolée d\'upload (Go sur 2 jours)', 'Volume à partir duquel on compare l\'upload à l\'habitude du compte.', 5, 100000)}
            {num('pointsLaunder', 'Points déplacés entre comptes liés', 'Sur 7 jours, avant de lever un signal.', 10, 1000000)}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={saveCfg} disabled={busy}>Enregistrer</button>
            <button type="button" className="secondary" onClick={runNow} disabled={busy} title="Lance tout de suite les analyses croisées (normalement une fois par heure)">▶ Lancer les analyses maintenant</button>
          </div>
          <details>
            <summary style={{ cursor: 'pointer' }}>Ce que l'anti-triche surveille</summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {ov.kinds.map((k) => <div key={k.key} style={{ fontSize: 13 }}><span style={{ color: FAMILY_COLOR[k.family], fontWeight: 800 }}>[{k.familyLabel}]</span> <strong>{k.label}</strong> — <span className="muted">{k.hint}</span></div>)}
            </div>
          </details>
        </div>
      )}

      <div className="panel" style={{ padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead><tr className="muted" style={{ textAlign: 'left', fontSize: 12 }}><th style={{ padding: 10 }}>Membre</th><th>Niveau</th><th style={{ minWidth: 120 }}>Score</th><th>Principaux signaux</th><th>Ratio</th><th>Dernier signal</th><th>Statut</th></tr></thead>
          <tbody>
            {rows?.items.map((r) => (
              <tr key={r.id} onClick={() => openCase(r.id)} style={{ cursor: 'pointer', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <td style={{ padding: 10 }}><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Avatar user={r.user} size={28} /><strong>{r.user.username}</strong></span></td>
                <td><LevelBadge level={r.level} /></td>
                <td><ScoreBar score={r.score} level={r.level} /><div className="muted" style={{ fontSize: 11 }}>confiance {r.confidence} %</div></td>
                <td style={{ maxWidth: 320 }}><span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{r.top.map((t) => <span key={t.kind} style={{ fontSize: 11.5, padding: '1px 7px', borderRadius: 5, background: `${FAMILY_COLOR[kinds.get(t.kind)?.family ?? 'client']}22` }}>{t.label}</span>)}</span></td>
                <td>{r.user.ratio ?? '∞'}</td>
                <td className="muted">{timeAgo(r.lastEventAt)}</td>
                <td><span className="muted">{STATUS_LABEL[r.status] ?? r.status}</span>{r.assigneeName && r.status === 'REVIEWING' ? <div className="muted" style={{ fontSize: 11 }}>par {r.assigneeName}</div> : null}</td>
              </tr>
            ))}
            {rows && rows.items.length === 0 && <tr><td colSpan={7} className="muted" style={{ padding: 22, textAlign: 'center' }}>Aucun dossier ne correspond. {filter.status === 'ACTIVE' && filter.level === 'ALL' && !filter.search ? '🎉 Personne de suspect pour le moment.' : ''}</td></tr>}
          </tbody>
        </table>
      </div>
      {rows && rows.total > rows.pageSize && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
          <span className="muted">Page {page} / {Math.ceil(rows.total / rows.pageSize)}</span>
          <button type="button" className="secondary" disabled={page >= Math.ceil(rows.total / rows.pageSize)} onClick={() => setPage(page + 1)}>→</button>
        </div>
      )}

      {detail && (
        <div role="dialog" aria-label={`Dossier de ${detail.user.username}`} onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '4vh 12px' }}>
          <div className="panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(980px, 100%)', display: 'grid', gap: 16, background: '#0d1224' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Avatar user={detail.user} size={48} />
              <div style={{ flex: 1, minWidth: 180 }}>
                <h3 style={{ margin: 0 }}><UserLink user={detail.user} /> <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{detail.user.role}{detail.user.status === 'BANNED' ? ' · banni' : ''}</span></h3>
                <div className="muted" style={{ fontSize: 12.5 }}>Inscrit {timeAgo(detail.user.createdAt)} · vu {detail.user.lastSeenAt ? timeAgo(detail.user.lastSeenAt) : 'jamais'} · ↑ {formatBytes(detail.user.uploaded)} · ↓ {formatBytes(detail.user.downloaded)} · ratio {detail.user.ratio ?? '∞'} · {detail.user.bonusPoints} pts · {detail.user.warnings} avert. · {detail.user.bans} ban(s)</div>
              </div>
              {detail.case ? <div style={{ textAlign: 'right' }}><LevelBadge level={detail.case.level} big /><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>score {Math.round(detail.case.score)} · confiance {detail.case.confidence} % · {STATUS_LABEL[detail.case.status]}</div></div> : <span className="muted">Aucun dossier : rien de suspect enregistré.</span>}
              <button type="button" className="secondary" onClick={close} aria-label="Fermer">✕</button>
            </div>

            {detail.case?.breakdown && Object.keys(detail.case.breakdown).length > 0 && (
              <div>
                <strong>Pourquoi ce score</strong>
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {Object.entries(detail.case.breakdown).sort((a, b) => b[1].points - a[1].points).map(([k, v]) => {
                    const info = kinds.get(k); const max = Math.max(...Object.values(detail.case!.breakdown!).map((x) => x.points));
                    return (
                      <div key={k} title={info?.hint} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) 1fr 70px', gap: 8, alignItems: 'center', fontSize: 13 }}>
                        <span><span style={{ color: FAMILY_COLOR[info?.family ?? 'client'], fontWeight: 800 }}>●</span> {info?.label ?? k}</span>
                        <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}><div style={{ width: `${(v.points / max) * 100}%`, height: '100%', borderRadius: 4, background: FAMILY_COLOR[info?.family ?? 'client'] }} /></div>
                        <span className="muted" style={{ textAlign: 'right' }}>{v.points} pts · ×{v.events}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Les points s'estompent de moitié tous les 14 jours ; un même signal plafonne par jour ; plusieurs familles de signaux concordantes ({detail.case.families.join(', ') || '—'}) augmentent la confiance.</div>
              </div>
            )}

            {detail.case && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {detail.case.status !== 'REVIEWING' && <button type="button" className="secondary" disabled={busy} onClick={() => setStatus('REVIEWING')}>🙋 Prendre en charge</button>}
                  {detail.case.status !== 'CLEARED' && <button type="button" className="secondary" disabled={busy} onClick={() => setStatus('CLEARED')}>✅ Innocenter (30 j)</button>}
                  {detail.case.status !== 'OPEN' && <button type="button" className="secondary" disabled={busy} onClick={() => setStatus('OPEN')}>↺ Rouvrir</button>}
                  <button type="button" className="secondary" disabled={busy} onClick={() => setSanction(sanction === 'warn' ? null : 'warn')}>⚠️ Avertir</button>
                  <button type="button" className="danger" disabled={busy} onClick={() => setSanction(sanction === 'ban' ? null : 'ban')}>⛔ Bannir</button>
                  <Link to={`/u/${detail.user.username}`} className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>Voir le profil →</Link>
                </div>
                {sanction && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={{ flex: 1 }} placeholder={sanction === 'ban' ? 'Motif du bannissement (visible par le membre)' : 'Motif de l\'avertissement'} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <button type="button" disabled={busy || !reason.trim()} onClick={applySanction}>Confirmer</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input style={{ flex: 1 }} placeholder="Ajouter une note pour l'équipe (jamais visible par le membre)…" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }} />
                  <button type="button" className="secondary" disabled={busy || !note.trim()} onClick={addNote}>Ajouter</button>
                </div>
                {detail.case.notes.length > 0 && (
                  <div style={{ display: 'grid', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                    {detail.case.notes.map((n) => <div key={n.id} style={{ fontSize: 12.5, padding: '4px 8px', borderRadius: 6, background: n.kind === 'NOTE' ? 'rgba(255,255,255,0.07)' : 'rgba(125,211,252,0.08)' }}><strong>{n.authorName}</strong> <span className="muted">· {timeAgo(n.createdAt)}</span><br />{n.body}</div>)}
                  </div>
                )}
              </div>
            )}

            {detail.events.length > 0 && (
              <div>
                <strong>Signaux détectés ({detail.events.length})</strong>
                <div style={{ display: 'grid', gap: 6, marginTop: 8, maxHeight: 360, overflowY: 'auto' }}>
                  {detail.events.map((e) => (
                    <div key={e.id} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', borderLeft: `3px solid ${FAMILY_COLOR[e.family] ?? '#888'}` }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <strong>{e.label}{e.count > 1 ? ` ×${e.count}` : ''}</strong>
                        <span className="muted" style={{ fontSize: 12 }}>+{e.points} pts · {timeAgo(e.lastAt)}</span>
                      </div>
                      <div className="muted">{describe(e.kind, e.details)}</div>
                      {e.torrent && <Link to={`/torrents/${e.torrent.id}`} style={{ fontSize: 12 }}>🎬 {e.torrent.name}</Link>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
              <div>
                <strong>Adresses IP</strong>
                <div style={{ display: 'grid', gap: 3, marginTop: 6, fontSize: 12.5 }}>
                  {detail.ips.length === 0 && <span className="muted">Aucune enregistrée pour l'instant.</span>}
                  {detail.ips.map((i) => <div key={i.ip}><code>{i.ip}</code> <span className="muted">· vue {timeAgo(i.lastSeenAt)} · {i.announces} announce(s){i.shared > 0 ? ` · ⚠️ partagée avec ${i.shared} compte(s)` : ''}</span></div>)}
                </div>
                {detail.linked.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <strong>Comptes liés (même adresse)</strong>
                    <div style={{ display: 'grid', gap: 3, marginTop: 6, fontSize: 12.5 }}>
                      {detail.linked.map((l) => <div key={l.id}><button type="button" className="secondary" style={{ padding: '1px 8px', fontSize: 12 }} onClick={() => openCase(l.id)}>{l.username}</button> <span className="muted">· {l.ips.length} adresse(s) en commun{l.status === 'BANNED' ? ' · banni' : ''} · inscrit {timeAgo(l.createdAt)}</span></div>)}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <strong>Clients en ce moment</strong>
                <div style={{ display: 'grid', gap: 3, marginTop: 6, fontSize: 12.5 }}>
                  {detail.clients.length === 0 && <span className="muted">Aucun peer actif.</span>}
                  {detail.clients.slice(0, 8).map((c, i) => <div key={i}><strong>{c.client}{c.version ? ` ${c.version}` : ''}</strong> <span className="muted">· {c.userAgent ?? 'pas de User-Agent'} · {c.ip} · {c.isSeeder ? 'seed' : 'télécharge'} · {c.torrent.name.slice(0, 40)}</span></div>)}
                </div>
              </div>
            </div>

            {detail.flow.length > 0 && (
              <div>
                <strong>Flux déclaré ces 7 derniers jours (top torrents)</strong>
                <div style={{ display: 'grid', gap: 3, marginTop: 6, fontSize: 12.5 }}>
                  {detail.flow.map((f) => <div key={f.torrent.id}><Link to={`/torrents/${f.torrent.id}`}>{f.torrent.name.slice(0, 70)}</Link> <span className="muted">· ↑ {formatBytes(f.up)} · ↓ {formatBytes(f.down)} · avancée réelle {formatBytes(f.got)}</span></div>)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
