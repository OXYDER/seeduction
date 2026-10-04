import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { TIP_STYLES, applyTipStyle, useTipStyle, type TipStyle } from '../lib/tipStyle';
import { TorrentPreview } from './TorrentLink';

const SAMPLE = {
  name: 'Titre.Du.Film.2024.MULTi.1080p.BluRay.x264-GROUPE',
  coverImage: null,
  backdrop: null,
  year: 2024,
  rating: 7.4,
  runtime: 112,
  genres: ['Action', 'Drame'],
  synopsis: 'Voici à quoi ressemble le résumé du film dans l\'info-bulle : quelques lignes pour savoir de quoi ça parle avant même d\'ouvrir la fiche du torrent.',
  director: 'Nom Réalisateur',
  cast: ['Acteur Un', 'Actrice Deux', 'Acteur Trois'],
  seeders: 42,
  leechers: 3,
  resolution: '1080p',
  size: 8_500_000_000,
  createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  category: { name: 'Films' },
};

const NATURAL_WIDTH: Record<string, number> = { poster: 340, cinema: 440, classic: 380, minimal: 320 };

/** Aperçu d'un style, réduit pour tenir dans la largeur de sa carte. */
function Sample({ style }: { style: Exclude<TipStyle, 'off'> }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.55);
  useEffect(() => {
    const fit = () => { if (box.current) setScale(Math.min(1, box.current.clientWidth / NATURAL_WIDTH[style])); };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [style]);
  return (
    <div ref={box} className="tip-choice-preview" aria-hidden="true">
      <div className={`torrent-tip tip-${style} static`} style={{ width: NATURAL_WIDTH[style], transform: `scale(${scale})` }}><TorrentPreview t={SAMPLE} style={style} /></div>
    </div>
  );
}

/** Choix du style des info-bulles de torrents (au survol d'un titre ou d'une affiche), avec un aperçu de chaque style. */
export default function TipStylePanel() {
  const current = useTipStyle();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function choose(style: TipStyle) {
    if (style === current) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.patch('/users/me/tip-style', { style });
      applyTipStyle(style);
      setMessage(style === 'off' ? '✓ Info-bulles désactivées' : '✓ Enregistré — passe la souris sur un torrent pour essayer');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Modification impossible');
    } finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <h3>💬 Info-bulles des torrents</h3>
      <p className="muted">
        La fenêtre qui apparaît quand tu passes la souris sur un titre ou une affiche. Choisis le style qui te convient
        (ils affichent les mêmes informations, présentées différemment).
      </p>
      <div className="tip-choices">
        {TIP_STYLES.map((s) => (
          <button key={s.id} type="button" disabled={busy} className={`tip-choice${current === s.id ? ' on' : ''}`} onClick={() => choose(s.id)} aria-pressed={current === s.id}>
            <Sample style={s.id} />
            <strong>{s.icon} {s.label}</strong>
            <span className="muted">{s.hint}</span>
          </button>
        ))}
      </div>
      <label className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={current === 'off'} disabled={busy} onChange={(e) => choose(e.target.checked ? 'off' : 'poster')} />
        <span>Ne pas afficher d'info-bulles</span>
      </label>
      {message && <div className="muted" style={{ color: 'var(--success)', marginTop: 8 }}>{message}</div>}
      {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
