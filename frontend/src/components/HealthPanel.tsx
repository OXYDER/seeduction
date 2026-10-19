import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

interface Check { id: string; label: string; level: 'ok' | 'warn' | 'error'; detail: string }
interface Health { at: string; level: 'ok' | 'warn' | 'error'; checks: Check[]; alerts: boolean; telegram?: boolean; telegramLinked?: boolean }

const ICON = { ok: '🟢', warn: '🟠', error: '🔴' } as const;
const TEXT = { ok: 'Tout va bien', warn: 'À surveiller', error: 'Problème à régler' } as const;

/** Admin > Monitoring : santé du site (base, secret, tâches planifiées, LNH...) avec les alertes envoyées aux administrateurs. */
export default function HealthPanel() {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/admin/monitoring/health').then((r) => { setH(r.data); setErr(''); }).catch((e) => setErr(e.response?.data?.message ?? 'Impossible de lire la santé du site')), []);
  useEffect(() => { void load(); const t = setInterval(() => { if (!document.hidden) void load(); }, 30_000); return () => clearInterval(t); }, [load]);
  async function toggle(enabled: boolean) {
    try { await api.put('/admin/monitoring/health/alerts', { enabled }); await load(); } catch (e: any) { setErr(e.response?.data?.message ?? 'Erreur'); }
  }
  async function toggleTelegram(enabled: boolean) {
    try { await api.put('/admin/monitoring/health/telegram', { enabled }); await load(); } catch (e: any) { setErr(e.response?.data?.message ?? 'Erreur'); }
  }
  if (err && !h) return <div className="panel" style={{ color: 'var(--danger)' }}>{err}</div>;
  if (!h) return null;
  const problems = h.checks.filter((c) => c.level !== 'ok');
  const shown = [...problems, ...h.checks.filter((c) => c.level === 'ok')];
  return (
    <div className="panel" style={{ display: 'grid', gap: 10, borderColor: h.level === 'error' ? 'var(--danger)' : h.level === 'warn' ? '#e0a030' : undefined }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{ICON[h.level]} Santé du site : {TEXT[h.level]}{problems.length > 0 ? ` (${problems.length})` : ''}</h3>
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={h.alerts} onChange={(e) => toggle(e.target.checked)} /> M'alerter par notification quand un problème apparaît
        </label>
      </div>
      <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, flexWrap: 'wrap' }}>
        <input type="checkbox" checked={h.telegram !== false} onChange={(e) => toggleTelegram(e.target.checked)} /> Envoyer aussi les problèmes graves (🔴) par Telegram
        {h.telegram !== false && !h.telegramLinked && <span style={{ color: '#ff9f2d' }}>· ton compte n'est pas relié à Telegram : <a href="/telegram">relie-le ici</a></span>}
      </label>
      <div style={{ display: 'grid', gap: 6 }}>
        {shown.map((c) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8, alignItems: 'start', opacity: c.level === 'ok' ? 0.75 : 1 }}>
            <span>{ICON[c.level]}</span>
            <div><strong style={{ fontSize: 13.5 }}>{c.label}</strong><div className="muted" style={{ fontSize: 12.5 }}>{c.detail}</div></div>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>Contrôles toutes les 5 minutes · dernier : {new Date(h.at).toLocaleTimeString('fr-CA')}. Un problème n'est signalé qu'une fois (rappel après 12 h) et un message annonce son rétablissement.</div>
    </div>
  );
}
