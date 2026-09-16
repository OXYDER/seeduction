import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

function formatSize(bytes: number | string) {
  const b = Number(bytes);
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0, n = b;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(2)} ${units[i]}`;
}

export default function Browse() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.get('/torrents', { params: { search, page, pageSize: 25 } }).then((r) => {
      setItems(r.data.items);
      setTotal(r.data.total);
    });
  }, [search, page]);

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Parcourir</h1>
        <input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ width: 260 }} />
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr><th>Nom</th><th>Catégorie</th><th>Taille</th><th>S</th><th>L</th><th>Uploader</th></tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/torrents/${t.id}`}>{t.name}</Link>{' '}
                  {t.freeleech && <span className="badge freeleech">FL</span>}{' '}
                  {t.doubleUpload && <span className="badge double">2x</span>}
                </td>
                <td className="muted">{t.category?.name}</td>
                <td className="muted">{formatSize(t.size)}</td>
                <td style={{ color: 'var(--success)' }}>{t.seeders}</td>
                <td style={{ color: 'var(--danger)' }}>{t.leechers}</td>
                <td className="muted">{t.anonymousUpload ? 'Anonyme' : t.uploader?.username}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <span className="muted">{total} résultat(s)</span>
          <div className="row">
            <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Préc.</button>
            <span className="muted">Page {page}</span>
            <button className="secondary" disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>Suiv. →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
