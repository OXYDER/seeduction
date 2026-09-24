import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import Avatar from './Avatar';
import { CATEGORY_STYLE } from './Layout';
import { TYPE_LABEL } from '../lib/entityLabels';
import { displayRank } from '../lib/memberClass';
import { ROLE_LABEL } from './StaffUserPanel';

export type SuggestScope = 'torrents' | 'users' | 'categories' | 'entities' | 'topics';

const GROUP_LABEL: Record<SuggestScope, string> = {
  torrents: 'Torrents', users: 'Membres', categories: 'Catégories', entities: 'Acteurs, studios, artistes...', topics: 'Sujets du forum',
};

interface Entry { key: string; scope: SuggestScope; data: any }

/**
 * Champ de recherche avec pré-résultats : au fil de la frappe, propose des torrents (avec leur
 * pochette), des membres (avec leur avatar), des catégories, etc. Flèches + Entrée au clavier.
 */
export default function SearchBox({
  value, onChange, scopes = ['torrents', 'users', 'categories'], placeholder, onSubmit, onPickUser, autoFocus, inputStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  scopes?: SuggestScope[];
  placeholder?: string;
  /** Appelé sur Entrée quand aucune suggestion n'est sélectionnée, ou via la dernière ligne « Rechercher ». */
  onSubmit?: () => void;
  /** Si fourni, choisir un membre appelle cette fonction (auto-remplissage) au lieu d'ouvrir son profil. */
  onPickUser?: (user: { id: string; username: string }) => void;
  autoFocus?: boolean;
  inputStyle?: React.CSSProperties;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<Record<string, any[]>>({});
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const scopeKey = scopes.join(',');
  // Après avoir choisi une suggestion, le texte est rempli sans rouvrir la liste.
  const suppress = useRef(false);

  useEffect(() => {
    if (suppress.current) { suppress.current = false; return; }
    const q = value.trim();
    if (q.length < 2) { setData({}); setOpen(false); return; }
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      api.get('/search/suggest', { params: { q, scopes: scopeKey } })
        .then((r) => { if (id === requestId.current) { setData(r.data); setActive(-1); setOpen(true); } })
        .catch(() => { if (id === requestId.current) setData({}); });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [value, scopeKey]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const entries: Entry[] = useMemo(
    () => (scopes as SuggestScope[]).flatMap((scope) => (data[scope] ?? []).map((d: any) => ({ key: `${scope}:${d.id}`, scope, data: d }))),
    [data, scopes],
  );
  const hasSubmitRow = !!onSubmit && value.trim().length >= 2;
  const total = entries.length + (hasSubmitRow ? 1 : 0);

  function pick(entry: Entry) {
    setOpen(false);
    const d = entry.data;
    switch (entry.scope) {
      case 'torrents': navigate(`/torrents/${d.id}`); break;
      case 'users':
        if (onPickUser) { suppress.current = true; onChange(d.username); onPickUser(d); } else navigate(`/users/${d.id}`);
        break;
      case 'categories': navigate(`/browse?categoryId=${d.id}`); break;
      case 'entities': navigate(`/entities/${d.id}`); break;
      case 'topics': navigate(`/forum/topics/${d.id}`); break;
    }
  }

  function submit() {
    setOpen(false);
    onSubmit?.();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' && total > 0) { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % total); }
    else if (e.key === 'ArrowUp' && total > 0) { e.preventDefault(); setActive((a) => (a <= 0 ? total - 1 : a - 1)); }
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter') {
      if (open && active >= 0) {
        e.preventDefault();
        if (active < entries.length) pick(entries[active]); else submit();
      } else if (onSubmit) {
        e.preventDefault();
        submit();
      }
    }
  }

  const renderEntry = (entry: Entry) => {
    const d = entry.data;
    switch (entry.scope) {
      case 'torrents':
        return (
          <>
            {d.coverImage ? <img src={d.coverImage} alt="" className="sb-thumb" /> : <span className="sb-thumb sb-icon">🎬</span>}
            <span className="sb-text">
              <span className="sb-title">{d.name}</span>
              <span className="sb-sub">{[d.matchedTitle ? `aussi : ${d.matchedTitle}` : '', d.category?.name, d.year, d.resolution, `${d.seeders} S`].filter(Boolean).join(' · ')}</span>
            </span>
          </>
        );
      case 'users':
        return (
          <>
            <Avatar user={d} size={30} />
            <span className="sb-text">
              <span className="sb-title">{d.username}</span>
              <span className="sb-sub">{displayRank(d, ROLE_LABEL)}</span>
            </span>
          </>
        );
      case 'categories': {
        const style = CATEGORY_STYLE[d.slug];
        return (
          <>
            {d.imageUrl ? <img src={d.imageUrl} alt="" className="sb-thumb sb-wide" /> : <span className="sb-thumb sb-icon">{style?.icon ?? '📁'}</span>}
            <span className="sb-text">
              <span className="sb-title">{d.name}</span>
              <span className="sb-sub">{d.parent ? `Sous-catégorie de ${d.parent.name}` : 'Catégorie'}</span>
            </span>
          </>
        );
      }
      case 'entities':
        return (
          <>
            {d.imageUrl ? <img src={d.imageUrl} alt="" className="sb-thumb" /> : <span className="sb-thumb sb-icon">{d.name.slice(0, 1).toUpperCase()}</span>}
            <span className="sb-text">
              <span className="sb-title">{d.name}</span>
              <span className="sb-sub">{TYPE_LABEL[d.type] ?? d.type}</span>
            </span>
          </>
        );
      case 'topics':
        return (
          <>
            <span className="sb-thumb sb-icon">💬</span>
            <span className="sb-text">
              <span className="sb-title">{d.title}</span>
              <span className="sb-sub">dans {d.category?.name}</span>
            </span>
          </>
        );
    }
  };

  let index = -1;
  return (
    <div className="sb-wrap" ref={wrapRef}>
      <input
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        style={inputStyle}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => { if (entries.length > 0) setOpen(true); }}
      />
      {open && total > 0 && (
        <div className="sb-menu" role="listbox">
          {(scopes as SuggestScope[]).map((scope) => {
            const items = entries.filter((e) => e.scope === scope);
            if (items.length === 0) return null;
            return (
              <div key={scope}>
                <div className="sb-group">{GROUP_LABEL[scope]}</div>
                {items.map((entry) => {
                  index++;
                  const i = index;
                  return (
                    <div
                      key={entry.key}
                      role="option"
                      aria-selected={active === i}
                      className={`sb-item${active === i ? ' active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); pick(entry); }}
                      onMouseEnter={() => setActive(i)}
                    >
                      {renderEntry(entry)}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {hasSubmitRow && (
            <div
              className={`sb-item sb-submit${active === entries.length ? ' active' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); submit(); }}
              onMouseEnter={() => setActive(entries.length)}
            >
              🔍 Voir tous les résultats pour « {value.trim()} »
            </div>
          )}
        </div>
      )}
    </div>
  );
}
