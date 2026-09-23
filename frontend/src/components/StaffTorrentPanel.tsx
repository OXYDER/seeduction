import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import WysiwygEditor from './WysiwygEditor';

const STATUSES = [
  { value: 'APPROVED', label: 'Approuvé' },
  { value: 'PENDING', label: 'En attente' },
  { value: 'REJECTED', label: 'Rejeté' },
  { value: 'DEAD', label: 'Mort' },
];

/** Modifier ou supprimer un torrent directement depuis sa fiche (modérateurs, admins, propriétaire). */
export default function StaffTorrentPanel({ torrent, startOpen, onSaved }: { torrent: any; startOpen?: boolean; onSaved: (patch: any) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(!!startOpen);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState(torrent.name);
  const [categoryId, setCategoryId] = useState(torrent.categoryId ?? torrent.category?.id ?? '');
  const [status, setStatus] = useState(torrent.status ?? 'APPROVED');
  const [freeleech, setFreeleech] = useState(!!torrent.freeleech);
  const [doubleUpload, setDoubleUpload] = useState(!!torrent.doubleUpload);
  const [description, setDescription] = useState(torrent.description ?? '');
  const [coverImage, setCoverImage] = useState(torrent.coverImage ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || categories.length > 0) return;
    api.get('/categories').then((r) => {
      setCategories(r.data.flatMap((c: any) => [
        { id: c.id, name: c.name },
        ...(c.children ?? []).map((sub: any) => ({ id: sub.id, name: `${c.name} › ${sub.name}` })),
      ]));
    }).catch(() => {});
  }, [open, categories.length]);

  async function uploadCover(file: File | undefined) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await api.post('/covers/upload', form);
      setCoverImage(data.url);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Échec du téléversement');
    }
  }

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    const patch = { name, categoryId, status, freeleech, doubleUpload, description, coverImage: coverImage || null };
    try {
      await api.patch(`/admin/torrents/${torrent.id}`, patch);
      const category = categories.find((c) => c.id === categoryId);
      onSaved({ ...patch, category: category ? { id: category.id, name: category.name.split(' › ').pop() } : torrent.category });
      setMessage('✓ Modifications enregistrées');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Erreur lors de la modification');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer définitivement « ${torrent.name} » ? Cette action est irréversible.`)) return;
    setBusy(true);
    try {
      await api.delete(`/admin/torrents/${torrent.id}`);
      navigate('/browse');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Suppression impossible');
      setBusy(false);
    }
  }

  return (
    <div className="panel ornate">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="panel-title" style={{ margin: 0, padding: 0, border: 0 }}><span className="title-icon">🛡️</span>Modération</div>
        <div className="row">
          <button type="button" className="secondary" onClick={() => setOpen((v) => !v)}>{open ? 'Fermer' : '✏️ Modifier ce torrent'}</button>
          <button type="button" className="danger" onClick={remove} disabled={busy}>🗑️ Supprimer</button>
        </div>
      </div>

      {open && (
        <div className="grid" style={{ marginTop: 14, gap: 12 }}>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Nom</div>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div className="filter-grid">
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Catégorie</div>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ width: '100%' }}>
                {categories.length === 0 && <option value={categoryId}>{torrent.category?.name}</option>}
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Statut</div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: '100%' }}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <label className="row muted" style={{ gap: 6 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={freeleech} onChange={(e) => setFreeleech(e.target.checked)} /> Freeleech
            </label>
            <label className="row muted" style={{ gap: 6 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={doubleUpload} onChange={(e) => setDoubleUpload(e.target.checked)} /> Double upload
            </label>
          </div>
          <div className="row" style={{ gap: 10 }}>
            {coverImage && <img src={coverImage} alt="" style={{ width: 50, height: 70, objectFit: 'cover', borderRadius: 4 }} />}
            <label className="secondary" style={{ cursor: 'pointer', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}>
              🖼️ {coverImage ? 'Changer la pochette' : 'Ajouter une pochette'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadCover(e.target.files?.[0])} />
            </label>
            {coverImage && <button type="button" className="secondary" onClick={() => setCoverImage('')}>Retirer</button>}
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 4 }}>Description</div>
            <WysiwygEditor value={description} onChange={setDescription} minHeight={260} />
          </div>
          {error && <div className="muted" style={{ color: 'var(--danger)' }}>{error}</div>}
          {message && <div className="muted" style={{ color: 'var(--success)' }}>{message}</div>}
          <div className="row">
            <button type="button" onClick={save} disabled={busy || !name.trim()}>{busy ? 'Enregistrement...' : 'Enregistrer'}</button>
          </div>
        </div>
      )}
      {!open && error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
