import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes as formatSize } from '../lib/format';
import { CATEGORY_STYLE } from '../components/Layout';

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const uploaderId = params.get('uploaderId') ?? '';
  const page = parseInt(params.get('page') ?? '1', 10);

  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.get('/torrents', { params: { search, categoryId, uploaderId, page, pageSize: 25 } }).then((r) => {
      setItems(r.data.items);
      setTotal(r.data.total);
    });
  }, [search, categoryId, uploaderId, page]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.delete('page');
    setParams(next);
  }

  function goToPage(p: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
  }

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{uploaderId ? 'Mes uploads' : 'Parcourir'}</h1>
        <input
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => updateParam('search', e.target.value)}
          style={{ width: 260 }}
        />
      </div>
      {uploaderId && (
        <button className="secondary" style={{ alignSelf: 'flex-start' }} onClick={() => updateParam('uploaderId', '')}>
          ← Voir tous les torrents
        </button>
      )}
      <div className="panel">
        <table>
          <thead>
            <tr><th>Nom</th><th>Catégorie</th><th>Taille</th><th>S</th><th>L</th><th>Uploader</th></tr>
          </thead>
          <tbody>
            {items.map((t) => {
              const catStyle = t.category?.slug ? CATEGORY_STYLE[t.category.slug] : undefined;
              return (
              <tr key={t.id}>
                <td>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="category-swatch" style={{ background: `${(catStyle?.color ?? '#e0b84a')}26` }}>
                      {catStyle?.icon ?? '📦'}
                    </span>
                    <span>
                      <Link to={`/torrents/${t.id}`}>{t.name}</Link>{' '}
                      {t.freeleech && <span className="badge freeleech">FL</span>}{' '}
                      {t.doubleUpload && <span className="badge double">2x</span>}
                    </span>
                  </div>
                </td>
                <td className="muted">{t.category?.name}</td>
                <td className="muted">{formatSize(t.size)}</td>
                <td style={{ color: 'var(--success)' }}>{t.seeders}</td>
                <td style={{ color: 'var(--danger)' }}>{t.leechers}</td>
                <td className="muted">{t.anonymousUpload ? 'Anonyme' : t.uploader?.username}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <span className="muted">{total} résultat(s)</span>
          <div className="row">
            <button className="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>← Préc.</button>
            <span className="muted">Page {page}</span>
            <button className="secondary" disabled={page * 25 >= total} onClick={() => goToPage(page + 1)}>Suiv. →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
