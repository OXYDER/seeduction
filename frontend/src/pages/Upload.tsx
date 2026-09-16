import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function Upload() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Sélectionne un fichier .torrent'); return; }
    if (!categoryId) { setError('Choisis une catégorie'); return; }
    const form = new FormData();
    form.append('torrentFile', file);
    form.append('name', name);
    form.append('description', description);
    form.append('categoryId', categoryId);
    form.append('tags', tags);
    form.append('anonymous', String(anonymous));
    try {
      const { data } = await api.post('/torrents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      navigate(`/torrents/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Erreur d'upload");
    }
  }

  return (
    <div style={{ maxWidth: 520 }} className="panel">
      <h2>Uploader un torrent</h2>
      <form onSubmit={submit} className="grid">
        <input type="file" accept=".torrent" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} required />
        <textarea placeholder="Description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          <option value="">— Choisir une catégorie —</option>
          {categories.map((c) => (
            <optgroup key={c.id} label={c.name}>
              <option value={c.id}>{c.name}</option>
              {c.children?.map((sub: any) => (
                <option key={sub.id} value={sub.id}>↳ {sub.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <input placeholder="Tags (séparés par virgule)" value={tags} onChange={(e) => setTags(e.target.value)} />
        <label className="row"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} style={{ width: 'auto' }} /> Upload anonyme</label>
        {error && <div style={{ color: 'var(--danger)' }} className="muted">{error}</div>}
        <button type="submit">Uploader</button>
      </form>
    </div>
  );
}
