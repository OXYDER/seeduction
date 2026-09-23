import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';

/** Avertit, avant l'envoi, que le même film / album / jeu (ou le même nom) existe déjà sur le tracker. */
export default function DuplicateWarning({ name, metaId }: { name: string; metaId?: string }) {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!metaId && name.trim().length < 4) { setItems([]); return; }
    const timer = window.setTimeout(() => {
      api.get('/torrents/duplicates', { params: { name: name.trim() || undefined, metaId } })
        .then((r) => setItems(r.data))
        .catch(() => setItems([]));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [name, metaId]);

  if (items.length === 0) return null;

  return (
    <div className="panel" style={{ borderColor: 'var(--gold)', background: 'rgba(224,184,74,0.07)' }}>
      <strong>⚠️ Ce contenu existe peut-être déjà sur Seeduction</strong>
      <p className="muted" style={{ margin: '4px 0 8px' }}>
        Vérifie ces torrents avant d'envoyer : un doublon sera refusé, sauf s'il apporte une meilleure qualité (résolution, source, langue...).
      </p>
      {items.map((t) => (
        <div key={t.id} className="row" style={{ padding: '4px 0', gap: 10 }}>
          {t.coverImage && <img src={t.coverImage} alt="" style={{ width: 28, height: 40, objectFit: 'cover', borderRadius: 3 }} />}
          <div style={{ minWidth: 0 }}>
            <Link to={`/torrents/${t.id}`} target="_blank">{t.name}</Link>
            <div className="muted" style={{ fontSize: 12 }}>
              {[t.year, t.resolution, t.language, formatBytes(t.size)].filter(Boolean).join(' · ')} — {t.seeders} seeder(s){t.status === 'PENDING' ? ' · en attente de validation' : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
