import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export interface QuickPage { to: string; icon: string; label: string; hint?: string }
interface Result { key: string; group: 'Pages' | 'Torrents' | 'Membres'; icon: string; label: string; hint?: string; to: string }

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pages utiles qui ne sont pas dans le menu (elles s'ouvrent depuis le compte, un lien ou une icône). */
export const EXTRA_PAGES: QuickPage[] = [
  { to: '/hit-and-run', icon: '⚠️', label: 'Hit & run', hint: 'Mes cas à régler' },
  { to: '/pot', icon: '🍯', label: 'Pot commun', hint: 'Donner et suivre la jauge' },
  { to: '/freeleech', icon: '🗓️', label: 'Calendrier freeleech' },
  { to: '/members', icon: '👥', label: 'Membres' },
  { to: '/leaderboard', icon: '🏆', label: 'Classement des uploaders' },
  { to: '/messages', icon: '✉️', label: 'Messages privés' },
  { to: '/news', icon: '📰', label: 'Toutes les nouvelles' },
];

/**
 * Recherche rapide (Ctrl+K, ou ⌘K) : une seule boîte qui trouve une page du site, un torrent ou un membre. Flèches pour choisir, Entrée pour ouvrir, Échap pour fermer.
 * Les pages se filtrent tout de suite ; les torrents et les membres viennent de la même recherche que la barre du haut.
 */
export default function QuickSearch({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: QuickPage[] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<{ torrents: any[]; users: any[] }>({ torrents: [], users: [] });
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  useEffect(() => { if (open) { setQ(''); setRemote({ torrents: [], users: [] }); setSel(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) { setRemote({ torrents: [], users: [] }); return; }
    const id = ++reqId.current;
    const t = window.setTimeout(() => {
      api.get('/search/suggest', { params: { q: term, scopes: 'torrents,users' } })
        .then((r) => { if (id === reqId.current) setRemote({ torrents: r.data.torrents ?? [], users: r.data.users ?? [] }); })
        .catch(() => { if (id === reqId.current) setRemote({ torrents: [], users: [] }); });
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const results = useMemo<Result[]>(() => {
    const t = strip(q.trim());
    const all = [...pages, ...EXTRA_PAGES.filter((e) => !pages.some((p) => p.to === e.to))];
    const pg = all.filter((p) => !t || strip(p.label).includes(t) || strip(p.hint ?? '').includes(t)).slice(0, t ? 8 : 9)
      .map((p): Result => ({ key: `p:${p.to}`, group: 'Pages', icon: p.icon, label: p.label, hint: p.hint, to: p.to }));
    const tr = remote.torrents.slice(0, 5).map((x): Result => ({ key: `t:${x.id}`, group: 'Torrents', icon: '🎬', label: x.name, hint: [x.year, x.resolution, x.category?.name].filter(Boolean).join(' · '), to: `/torrents/${x.id}` }));
    const us = remote.users.slice(0, 4).map((x): Result => ({ key: `u:${x.id}`, group: 'Membres', icon: '👤', label: x.username, to: `/users/${x.id}` }));
    return [...pg, ...tr, ...us];
  }, [q, pages, remote]);

  useEffect(() => { setSel(0); }, [q]);
  if (!open) return null;

  const go = (r: Result | undefined) => { if (!r) return; onClose(); navigate(r.to); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results.length) go(results[sel]); else if (q.trim()) { onClose(); navigate(`/browse?search=${encodeURIComponent(q.trim())}`); } }
  };

  let last = '';
  return (
    <div className="qs-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qs-box" role="dialog" aria-label="Recherche rapide" onKeyDown={onKey}>
        <input ref={inputRef} className="qs-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher une page, un torrent, un membre…" autoComplete="off" aria-label="Recherche rapide" />
        <div className="qs-list" role="listbox">
          {results.length === 0 && <div className="qs-empty">Aucun résultat. Entrée lance la recherche dans tout le catalogue.</div>}
          {results.map((r, i) => {
            const head = r.group !== last ? <h4 key={`h${r.group}`}>{r.group}</h4> : null;
            last = r.group;
            return (
              <div key={r.key}>
                {head}
                <button type="button" role="option" aria-selected={i === sel} className={`qs-item${i === sel ? ' sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
                  <span aria-hidden="true">{r.icon}</span><span className="qs-label">{r.label}</span>{r.hint && <small>{r.hint}</small>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="qs-foot"><span>↑↓ choisir</span><span>↵ ouvrir</span><span>Échap fermer</span></div>
      </div>
    </div>
  );
}
