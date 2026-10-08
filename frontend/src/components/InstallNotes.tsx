import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Section { title: string; lines: string[] }

const ICON: Record<string, string> = { 'Configuration requise': '🖥️', Installation: '📦', Activation: '🔑', Utilisation: '▶️', Notes: '📝' };

/**
 * Logiciels et jeux : « comment l'installer et l'utiliser », tiré des rubriques du NFO de la release (INSTALL NOTES, HOW TO, USAGE...).
 * Rien n'est affiché si le NFO n'en contient pas ; le NFO complet reste dans son onglet.
 */
export default function InstallNotes({ torrentId, onOpenNfo }: { torrentId: string; onOpenNfo?: () => void }) {
  const [sections, setSections] = useState<Section[] | null>(null);
  useEffect(() => {
    let off = false;
    setSections(null);
    api.get(`/torrents/${torrentId}/install-notes`).then((r) => { if (!off) setSections(r.data.sections ?? []); }).catch(() => { if (!off) setSections([]); });
    return () => { off = true; };
  }, [torrentId]);
  if (!sections || sections.length === 0) return null;
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>🛠️ Installation et utilisation</h3>
      <div className="grid" style={{ gap: 12 }}>
        {sections.map((s) => (
          <div key={s.title}>
            <strong>{ICON[s.title] ?? '•'} {s.title}</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {s.lines.map((l, i) => <li key={i} style={{ margin: '2px 0' }}>{l.replace(/^\d+[.)]\s*/, '')}</li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
        Extrait automatiquement du NFO de la release.{onOpenNfo && <> <button type="button" className="secondary" style={{ padding: '0 8px', fontSize: 11 }} onClick={onOpenNfo}>Voir le NFO complet</button></>}
      </p>
    </div>
  );
}
