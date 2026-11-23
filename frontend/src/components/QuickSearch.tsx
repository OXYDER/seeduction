import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { setMode } from '../lib/theme';
import { useListPrefs } from '../lib/listMode';
import Emo from './Emo';

export interface QuickPage { to: string; icon: string; label: string; hint?: string }
type Group = 'Récents' | 'Actions' | 'Pages' | 'Torrents' | 'Membres' | 'Teams' | 'Forum' | 'Wiki';
interface Result { key: string; group: Group; icon: string; label: string; hint?: string; to?: string; run?: () => void }
interface Remote { torrents: any[]; users: any[]; topics: any[]; teams: any[]; wiki: any[] }
const NO_REMOTE: Remote = { torrents: [], users: [], topics: [], teams: [], wiki: [] };

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const RECENT_KEY = 'seeduction:quick-recent';
const readRecent = (): Result[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((r) => r && r.to && r.label).slice(0, 5) : []; } catch { return []; } };
const pushRecent = (r: Result) => {
  if (!r.to || r.group === 'Actions') return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([{ key: r.key, group: r.group, icon: r.icon, label: r.label, hint: r.hint, to: r.to }, ...readRecent().filter((x) => x.key !== r.key)].slice(0, 5))); } catch { /* stockage indisponible */ }
};

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
 * Palette de commandes (Ctrl+K, ou ⌘K) : une seule boîte pour agir et chercher. Elle propose des actions (envoyer un torrent, changer de thème, déconnexion...), les pages du site,
 * puis, au fil de la frappe, des torrents, des membres, des teams, des sujets du forum et des pages du wiki. « > » devant le texte ne montre que les actions.
 * Flèches pour choisir, Entrée pour ouvrir, Échap pour fermer ; les derniers résultats ouverts reviennent quand la boîte est vide.
 */
export default function QuickSearch({ open, onClose, pages }: { open: boolean; onClose: () => void; pages: QuickPage[] }) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [, setListPrefs] = useListPrefs();
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<Remote>(NO_REMOTE);
  const [recent, setRecent] = useState<Result[]>([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  useEffect(() => { if (open) { setQ(''); setRemote(NO_REMOTE); setSel(0); setRecent(readRecent()); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  const commandMode = q.trimStart().startsWith('>');
  const term = (commandMode ? q.trimStart().slice(1) : q).trim();

  useEffect(() => {
    if (!open || commandMode || term.length < 2) { setRemote(NO_REMOTE); return; }
    const id = ++reqId.current;
    const t = window.setTimeout(() => {
      const ok = (p: Promise<any>, pick: (d: any) => any[]) => p.then((r) => pick(r.data)).catch(() => []);
      Promise.all([
        api.get('/search/suggest', { params: { q: term, scopes: 'torrents,users,topics' } }).then((r) => r.data).catch(() => ({})),
        ok(api.get('/teams', { params: { q: term } }), (d) => d?.teams ?? []),
        ok(api.get('/wiki/search', { params: { q: term } }), (d) => (Array.isArray(d) ? d : [])),
      ]).then(([s, teams, wiki]) => {
        if (id === reqId.current) setRemote({ torrents: s.torrents ?? [], users: s.users ?? [], topics: s.topics ?? [], teams: teams.slice(0, 3), wiki: wiki.slice(0, 4) });
      });
    }, 220);
    return () => window.clearTimeout(t);
  }, [term, open, commandMode]);

  const actions = useMemo<(Result & { words: string })[]>(() => [
    { key: 'a:upload', group: 'Actions', icon: '⬆️', label: 'Envoyer un torrent', to: '/upload', words: 'upload uploader partager ajouter' },
    { key: 'a:request', group: 'Actions', icon: '💬', label: 'Faire une demande', to: '/requests', words: 'demande requete request' },
    { key: 'a:invite', group: 'Actions', icon: '🎟️', label: 'Inviter un ami', to: '/referrals', words: 'invitation parrainage code' },
    { key: 'a:week', group: 'Actions', icon: '📅', label: 'Ma semaine (résumé à partager)', to: '/recap?semaine=', words: 'recap semaine resume statistiques partager' },
    { key: 'a:notifs', group: 'Actions', icon: '🔔', label: 'Voir mes notifications', to: '/notifications', words: 'alertes cloche' },
    { key: 'a:light', group: 'Actions', icon: '☀', label: 'Passer en thème clair', run: () => setMode('light'), words: 'theme clair blanc jour apparence' },
    { key: 'a:dark', group: 'Actions', icon: '🌙', label: 'Passer en thème sombre', run: () => setMode('dark'), words: 'theme sombre noir nuit apparence' },
    { key: 'a:auto', group: 'Actions', icon: '🎨', label: 'Thème automatique (suit l\'appareil)', run: () => setMode('auto'), words: 'theme auto systeme apparence' },
    { key: 'a:scroll', group: 'Actions', icon: '∞', label: 'Listes : défilement continu', run: () => setListPrefs({ infinite: true }), words: 'liste infini scroll catalogue' },
    { key: 'a:pages', group: 'Actions', icon: '①', label: 'Listes : pages numérotées', run: () => setListPrefs({ infinite: false }), words: 'liste pagination pages catalogue' },
    { key: 'a:logout', group: 'Actions', icon: '🚪', label: 'Se déconnecter', run: () => { logout(); navigate('/login'); }, words: 'deconnexion quitter logout sortir' },
  ], [logout, navigate, setListPrefs]);

  const results = useMemo<Result[]>(() => {
    const t = strip(term);
    const act = actions.filter((a) => !t || strip(a.label).includes(t) || strip(a.words).includes(t)).slice(0, commandMode || t ? 8 : 4);
    if (commandMode) return act;
    const all = [...pages, ...EXTRA_PAGES.filter((e) => !pages.some((p) => p.to === e.to))];
    const pg = all.filter((p) => !t || strip(p.label).includes(t) || strip(p.hint ?? '').includes(t)).slice(0, t ? 7 : 6)
      .map((p): Result => ({ key: `p:${p.to}`, group: 'Pages', icon: p.icon, label: p.label, hint: p.hint, to: p.to }));
    const tr = remote.torrents.slice(0, 5).map((x): Result => ({ key: `t:${x.id}`, group: 'Torrents', icon: '🎬', label: x.name, hint: [x.year, x.resolution, x.category?.name].filter(Boolean).join(' · '), to: `/torrents/${x.id}` }));
    const us = remote.users.slice(0, 4).map((x): Result => ({ key: `u:${x.id}`, group: 'Membres', icon: '👤', label: x.username, to: `/users/${x.id}` }));
    const tm = remote.teams.map((x: any): Result => ({ key: `tm:${x.id}`, group: 'Teams', icon: '🏴', label: x.name, hint: x.tag ? `[${x.tag}]` : undefined, to: `/teams/${x.id}` }));
    const fo = remote.topics.slice(0, 3).map((x: any): Result => ({ key: `f:${x.id}`, group: 'Forum', icon: '💬', label: x.title ?? x.name ?? 'Sujet', to: `/forum/topics/${x.id}` }));
    const wk = remote.wiki.map((x: any): Result => ({ key: `w:${x.slug}`, group: 'Wiki', icon: '📖', label: x.title, hint: x.category?.name, to: `/wiki/${x.slug}` }));
    if (!t) return [...recent.map((r): Result => ({ ...r, group: 'Récents' })), ...act, ...pg];
    return [...act.slice(0, 3), ...pg, ...tr, ...us, ...tm, ...fo, ...wk];
  }, [term, commandMode, actions, pages, remote, recent]);

  useEffect(() => { setSel(0); }, [q]);
  if (!open) return null;

  const go = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    if (r.run) { r.run(); return; }
    if (r.to) { pushRecent(r); navigate(r.to); }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results.length) go(results[sel]); else if (term) { onClose(); navigate(`/browse?search=${encodeURIComponent(term)}`); } }
  };

  let last = '';
  return (
    <div className="qs-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="qs-box" role="dialog" aria-label="Palette de commandes" onKeyDown={onKey}>
        <input ref={inputRef} className="qs-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher ou agir : torrent, membre, team, wiki, « thème clair »…" autoComplete="off" aria-label="Palette de commandes" />
        <div className="qs-list" role="listbox">
          {results.length === 0 && <div className="qs-empty">Aucun résultat. Entrée lance la recherche dans tout le catalogue.</div>}
          {results.map((r, i) => {
            const head = r.group !== last ? <h4 key={`h${r.group}`}>{r.group}</h4> : null;
            last = r.group;
            return (
              <div key={r.key}>
                {head}
                <button type="button" role="option" aria-selected={i === sel} className={`qs-item${i === sel ? ' sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
                  <span className="qs-ico" aria-hidden="true"><Emo e={r.icon} size={16} /></span><span className="qs-label">{r.label}</span>{r.hint && <small>{r.hint}</small>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="qs-foot"><span>↑↓ choisir</span><span>↵ ouvrir</span><span>&gt; actions</span><span>Échap fermer</span></div>
      </div>
    </div>
  );
}
