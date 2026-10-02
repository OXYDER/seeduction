import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';

interface GifItem { id: string; title: string; preview: string; url: string; width: number; height: number }

interface Props {
  busy: boolean;
  onPick: (url: string) => void;
  onUploadClick: () => void;
}

/** Onglet GIF : recherche (ou tendances) de GIF et d'autocollants animés via le serveur, plus l'envoi depuis l'ordinateur. */
export default function GifPicker({ busy, onPick, onUploadClick }: Props) {
  const [kind, setKind] = useState<'gifs' | 'stickers'>('gifs');
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [items, setItems] = useState<GifItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'off' | 'error'>('loading');
  const seq = useRef(0);

  useEffect(() => { const t = setTimeout(() => setTerm(query.trim()), 350); return () => clearTimeout(t); }, [query]);

  async function load(p: number) {
    const mine = ++seq.current;
    if (p === 1) setState('loading');
    try {
      const { data } = await api.get('/messenger/gifs', { params: { q: term || undefined, kind, page: p } });
      if (mine !== seq.current) return;
      if (!data.enabled) { setState('off'); return; }
      setItems((prev) => (p === 1 ? data.items : [...prev, ...data.items]));
      setHasNext(!!data.hasNext);
      setPage(p);
      setState('ready');
    } catch {
      if (mine === seq.current) setState('error');
    }
  }
  useEffect(() => { load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [term, kind]);

  const upload = <button type="button" className="msgr-gif-upload" disabled={busy} onClick={onUploadClick}>🎞️ Envoyer un GIF depuis mon ordinateur</button>;

  if (state === 'off') {
    return (
      <div className="msgr-gif-pane">
        {upload}
        <p className="muted">Tu peux aussi glisser-déposer ou coller un GIF directement dans la conversation (10 Mo max).</p>
      </div>
    );
  }

  return (
    <div className="msgr-gif-pane wide">
      <div className="msgr-gif-head">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={kind === 'gifs' ? 'Chercher un GIF…' : 'Chercher un autocollant…'} aria-label="Recherche" maxLength={60} />
        <div className="msgr-gif-kind">
          <button type="button" className={kind === 'gifs' ? 'on' : ''} onClick={() => setKind('gifs')}>GIF</button>
          <button type="button" className={kind === 'stickers' ? 'on' : ''} onClick={() => setKind('stickers')}>Stickers</button>
        </div>
      </div>
      <div className="msgr-gif-grid">
        {items.map((g) => (
          <button key={g.id} type="button" className={kind === 'stickers' ? 'sticker' : ''} title={g.title} disabled={busy} onClick={() => onPick(g.url)}>
            <img src={g.preview} alt={g.title} loading="lazy" width={g.width} height={g.height} />
          </button>
        ))}
      </div>
      {state === 'loading' && <p className="muted msgr-gif-note">Chargement…</p>}
      {state === 'error' && <p className="muted msgr-gif-note">Le service de GIF ne répond pas pour le moment.</p>}
      {state === 'ready' && items.length === 0 && <p className="muted msgr-gif-note">Aucun résultat.</p>}
      {state === 'ready' && hasNext && <button type="button" className="msgr-gif-more" onClick={() => load(page + 1)}>Plus de résultats</button>}
      <div className="msgr-gif-foot">
        {upload}
        <span className="muted">via Klipy</span>
      </div>
    </div>
  );
}
