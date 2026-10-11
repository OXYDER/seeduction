import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Analysis { current: string; wellFormed: boolean; suggestions: { name: string; label: string }[]; missing: string[] }

/**
 * Propose des noms de release standardisés (Titre.Année.LANGUE.1080p.WEB.H265-TEAM) d'après le nom actuel, les fichiers du torrent et le NFO / MediaInfo.
 * Un clic sur une proposition la met dans le champ du nom. Envoi : fichiers, NFO et fiche viennent du formulaire ; torrent existant : `torrentId`.
 */
export default function ReleaseNameSuggest({ name, files, nfo, title, year, torrentId, onPick }: {
  name: string; files?: { path: string; size: number }[]; nfo?: string; title?: string; year?: number; torrentId?: string; onPick: (name: string) => void;
}) {
  const [data, setData] = useState<Analysis | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (name.trim().length < 4) { setData(null); return; }
    const timer = window.setTimeout(() => {
      api.post('/torrents/release-names', { torrentId, name, files: torrentId ? undefined : files?.slice(0, 2000), nfo: torrentId ? undefined : nfo, title, year })
        .then((r) => setData(r.data)).catch(() => setData(null));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [name, torrentId, files, nfo, title, year]);

  if (!data || hidden || data.suggestions.length === 0) return null;
  return (
    <div className="rn-suggest" role="region" aria-label="Noms de release proposés">
      <div className="rn-head">
        <strong>{data.wellFormed ? '✨ Autres noms possibles' : '⚠️ Nom à standardiser'}</strong>
        <span className="muted">{data.wellFormed ? 'Le nom suit déjà le format du site.' : 'Le nom ne suit pas le format des autres torrents : choisis une proposition.'}</span>
        <button type="button" className="rn-x" onClick={() => setHidden(true)} aria-label="Masquer les propositions" title="Masquer">✕</button>
      </div>
      <div className="rn-list">
        {data.suggestions.map((s) => (
          <button key={s.name} type="button" className="rn-item" onClick={() => onPick(s.name)} title="Utiliser ce nom">
            <span className="rn-label">{s.label}</span>
            <code className="rn-name">{s.name}</code>
            <span className="rn-use">Utiliser</span>
          </button>
        ))}
      </div>
      {data.missing.length > 0 && <div className="muted rn-missing">Non trouvé dans les fichiers ni le NFO, à ajouter si tu le sais : {data.missing.join(', ')}.</div>}
    </div>
  );
}
