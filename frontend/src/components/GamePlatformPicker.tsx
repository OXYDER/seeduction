import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

export interface GamePlatformInfo {
  id: string; label: string; group: string; category: string; facetKey?: string; facetValue?: string;
}

const GROUPS = ['PC', 'Nintendo', 'Sony', 'Microsoft', 'Mobile'];

/**
 * Jeux : choisir la plateforme (Windows, Switch, PS5, Xbox 360...) d'un clic. Elle range le jeu dans la bonne sous-catégorie et remplit
 * le filtre de console. La plateforme est devinée d'après le nom, les fichiers et le NFO, et la fiche RAWG choisie indique celles où le
 * jeu existe.
 */
export default function GamePlatformPicker({ name, files, nfo, fichePlatforms, selectedId, onPick }: {
  name: string; files: { path: string }[]; nfo: string; fichePlatforms: string; selectedId: string | null;
  onPick: (platform: GamePlatformInfo, auto: boolean) => void;
}) {
  const [platforms, setPlatforms] = useState<GamePlatformInfo[]>([]);
  const [detected, setDetected] = useState<string[]>([]);
  const [onFiche, setOnFiche] = useState<string[]>([]);
  const autoDone = useRef('');
  const [showOthers, setShowOthers] = useState(false);

  useEffect(() => {
    if (!name.trim()) return;
    const t = setTimeout(() => {
      api.post('/torrents/platforms', { name, files: files.slice(0, 400), nfo: nfo || undefined, rawg: fichePlatforms || undefined })
        .then((r) => { setPlatforms(r.data.platforms ?? []); setDetected(r.data.detected ?? []); setOnFiche(r.data.onFiche ?? []); })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [name, files, nfo, fichePlatforms]);

  // Une seule plateforme reconnue : elle est choisie toute seule (une fois par résultat de détection).
  useEffect(() => {
    if (selectedId) return;
    // Une seule plateforme reconnue, ou, à défaut, une seule plateforme sur la fiche choisie.
    const only = detected.length === 1 ? detected : detected.length === 0 && onFiche.length === 1 ? onFiche : [];
    if (only.length !== 1) return;
    const key = only.join(',');
    if (autoDone.current === key) return;
    const p = platforms.find((x) => x.id === only[0]);
    if (p) { autoDone.current = key; onPick(p, true); }
  }, [detected, onFiche, platforms, selectedId, onPick]);

  if (platforms.length === 0) return null;
  const chosen = platforms.find((p) => p.id === selectedId);
  const notOnFiche = chosen && onFiche.length > 0 && !onFiche.includes(chosen.id);

  return (
    <div className="platform-picker">
      <div className="muted" style={{ fontSize: 12 }}>
        <strong>Plateforme</strong> — choisis-la d'un clic : le jeu est rangé dans la bonne sous-catégorie et le filtre de console se remplit tout seul.
        {detected.length > 0 && <> Reconnue d'après le nom, les fichiers ou le NFO : <strong>{detected.map((id) => platforms.find((p) => p.id === id)?.label).filter(Boolean).join(', ')}</strong>.</>}
      </div>
      {(() => {
        // Quand la fiche liste ses plateformes, on ne propose d'abord que celles-là ; les autres restent à un clic (la fiche peut en oublier).
        const primary = onFiche.length > 0 ? platforms.filter((p) => onFiche.includes(p.id) || p.id === selectedId) : platforms;
        const others = onFiche.length > 0 ? platforms.filter((p) => !primary.includes(p)) : [];
        const chip = (p: GamePlatformInfo) => (
          <button
            key={p.id}
            type="button"
            className={selectedId === p.id ? '' : 'secondary'}
            style={{ padding: '3px 12px', fontSize: 13 }}
            title={onFiche.includes(p.id) ? 'Existe sur cette plateforme d’après la fiche choisie' : undefined}
            onClick={() => onPick(p, false)}
          >
            {p.label}{onFiche.includes(p.id) && <span style={{ opacity: 0.7 }}> ✓</span>}
          </button>
        );
        const rows = (list: GamePlatformInfo[]) => GROUPS.map((g) => {
          const items = list.filter((p) => p.group === g);
          if (items.length === 0) return null;
          return (
            <div key={g} className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12, minWidth: 74 }}>{g === 'PC' ? 'Ordinateur' : g}</span>
              {items.map(chip)}
            </div>
          );
        });
        return (
          <>
            {rows(primary)}
            {others.length > 0 && (
              <>
                <button type="button" className="secondary" style={{ alignSelf: 'flex-start', padding: '2px 10px', fontSize: 12 }} onClick={() => setShowOthers((v) => !v)}>
                  {showOthers ? 'Masquer les autres plateformes' : `Autres plateformes (${others.length})`}
                </button>
                {showOthers && rows(others)}
              </>
            )}
          </>
        );
      })()}
      {onFiche.length > 0 && <div className="muted" style={{ fontSize: 11 }}>✓ = plateformes de la fiche choisie.</div>}
      {notOnFiche && <div style={{ color: 'var(--warning, #fbbf24)', fontSize: 12 }}>⚠ « {chosen?.label} » ne figure pas parmi les plateformes de la fiche choisie : vérifie que c'est le bon jeu et la bonne version.</div>}
    </div>
  );
}
