import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export interface Playing { torrentId: string; fileIndex: number; title: string; subtitle: string | null; cover: string | null; position: number; duration: number; paused: boolean; ageSeconds: number }
export interface Device { id: string; name: string; kind: 'phone' | 'tablet' | 'tv' | string; appVersion: string | null; online: boolean; lastSeenAt: string; playing: Playing | null }
export interface VodPromo { movies: number; series: number; fresh: number; hoursWeek: number; covers: string[]; watchingNow: number }
export interface VodStatus { eligible: boolean; reason: string | null; label: string | null; rule: string; promo: VodPromo | null }

export const KIND_ICON: Record<string, string> = { phone: '📱', tablet: '📲', tv: '📺' };

/** 1:23:45 ou 23:45. */
export function clock(total: number): string {
  const s = Math.max(0, Math.floor(total || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Durée lisible : « 12 h 05 », « 48 min ». */
export function hoursText(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export function useVodStatus() {
  const [st, setSt] = useState<VodStatus | null>(null);
  useEffect(() => { api.get('/vod/status').then((r) => setSt(r.data)).catch(() => setSt(null)); }, []);
  return st;
}

/** Les appareils du compte et ce qui joue, rafraîchis toutes les quelques secondes tant que la page est visible. */
export function useDevices(enabled: boolean, everyMs = 4000) {
  const [items, setItems] = useState<Device[] | null>(null);
  const timer = useRef<number>();
  const load = useCallback(() => api.get('/vod/devices').then((r) => setItems(r.data.items)).catch(() => setItems((cur) => cur ?? [])), []);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const tick = () => { if (document.visibilityState === 'visible') void load(); };
    timer.current = window.setInterval(tick, everyMs);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer.current); document.removeEventListener('visibilitychange', tick); };
  }, [enabled, everyMs, load]);
  return { items, reload: load };
}

/** Position estimée d'une lecture (l'application écrit toutes les 3 s : entre deux messages, on fait avancer la barre). */
export function useTicking(p: Playing | null): number {
  const [, force] = useState(0);
  const at = useRef(Date.now());
  const base = useRef(0);
  useEffect(() => { at.current = Date.now(); base.current = p ? p.position + p.ageSeconds : 0; force((n) => n + 1); }, [p?.position, p?.ageSeconds, p?.torrentId, p?.paused]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p || p.paused) return;
    const t = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [p?.paused, p?.torrentId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return 0;
  const now = p.paused ? base.current : base.current + (Date.now() - at.current) / 1000;
  return p.duration > 0 ? Math.min(now, p.duration) : now;
}
