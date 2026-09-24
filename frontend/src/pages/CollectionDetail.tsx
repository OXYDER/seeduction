import { useEffect, useState } from 'react';
import UserLink from '../components/UserLink';
import SearchBox from '../components/SearchBox';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes } from '../lib/format';

const VISIBILITY_LABEL: Record<string, string> = {
  PRIVATE: '🔒 Privée',
  PUBLIC: '🌐 Publique',
  COLLABORATIVE: '🤝 Collaborative',
};

export default function CollectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [collection, setCollection] = useState<any>(null);
  const [error, setError] = useState('');
  const [editForm, setEditForm] = useState({ name: '', description: '', visibility: 'PRIVATE' });
  const [collaboratorName, setCollaboratorName] = useState('');

  function refresh() {
    api.get(`/collections/${id}`)
      .then((r) => {
        setCollection(r.data);
        setEditForm({ name: r.data.name, description: r.data.description ?? '', visibility: r.data.visibility });
      })
      .catch((e) => setError(e.response?.data?.message ?? 'Collection introuvable ou privée'));
  }
  useEffect(() => { refresh(); }, [id]);

  if (error) return <p className="muted">{error}</p>;
  if (!collection) return <p className="muted">Chargement...</p>;

  const isOwner = user?.id === collection.owner.id;
  const isCollaborator = collection.collaborators.some((c: any) => c.user.id === user?.id);
  const canEditItems = isOwner || (collection.visibility === 'COLLABORATIVE' && isCollaborator);

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    await api.patch(`/collections/${id}`, editForm);
    refresh();
  }

  async function removeCollection() {
    if (!confirm('Supprimer définitivement cette collection ?')) return;
    await api.delete(`/collections/${id}`);
    navigate('/collections');
  }

  async function removeItem(torrentId: string) {
    await api.delete(`/collections/${id}/items/${torrentId}`);
    refresh();
  }

  async function addCollaborator(e: React.FormEvent) {
    e.preventDefault();
    if (!collaboratorName.trim()) return;
    await api.post(`/collections/${id}/collaborators`, { username: collaboratorName.trim() });
    setCollaboratorName('');
    refresh();
  }

  async function removeCollaborator(userId: string) {
    await api.delete(`/collections/${id}/collaborators/${userId}`);
    refresh();
  }

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>{collection.name}</h1>
        <span className="badge new">{VISIBILITY_LABEL[collection.visibility]}</span>
      </div>
      {collection.description && <p className="muted">{collection.description}</p>}
      <div className="muted">Par <UserLink user={collection.owner} /></div>

      <div className="split-2">
        <div className="panel">
          <h3>Torrents ({collection.items.length})</h3>
          <table>
            <thead><tr><th>Nom</th><th>Taille</th><th>Seeders</th><th>Ajouté par</th>{canEditItems && <th></th>}</tr></thead>
            <tbody>
              {collection.items.map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <Link to={`/torrents/${item.torrent.id}`}>{item.torrent.name}</Link>
                    {item.note && <div className="muted" style={{ fontSize: 12 }}>{item.note}</div>}
                  </td>
                  <td className="muted">{formatBytes(item.torrent.size)}</td>
                  <td className="muted">{item.torrent.seeders}</td>
                  <td className="muted"><UserLink user={item.addedBy} /></td>
                  {canEditItems && (
                    <td><button className="secondary" onClick={() => removeItem(item.torrent.id)}>Retirer</button></td>
                  )}
                </tr>
              ))}
              {collection.items.length === 0 && <tr><td className="muted">Aucun torrent dans cette collection.</td></tr>}
            </tbody>
          </table>
          {canEditItems && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Ajoute des torrents depuis leur page de détail via « Ajouter à une collection ».
            </p>
          )}
        </div>

        {isOwner && (
          <div className="grid" style={{ gap: 16 }}>
            <div className="panel ornate">
              <div className="panel-title"><span className="title-icon">⚙️</span>Modifier</div>
              <form onSubmit={saveInfo} className="grid">
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
                <textarea rows={3} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                <select value={editForm.visibility} onChange={(e) => setEditForm({ ...editForm, visibility: e.target.value })}>
                  <option value="PRIVATE">🔒 Privée</option>
                  <option value="PUBLIC">🌐 Publique</option>
                  <option value="COLLABORATIVE">🤝 Collaborative</option>
                </select>
                <button type="submit">Enregistrer</button>
              </form>
              <button className="danger" onClick={removeCollection} style={{ marginTop: 10 }}>Supprimer la collection</button>
            </div>

            {collection.visibility === 'COLLABORATIVE' && (
              <div className="panel">
                <h3>Collaborateurs</h3>
                <div className="grid" style={{ gap: 6 }}>
                  {collection.collaborators.map((c: any) => (
                    <div key={c.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <span><UserLink user={c.user} /></span>
                      <button className="secondary" onClick={() => removeCollaborator(c.user.id)}>Retirer</button>
                    </div>
                  ))}
                  {collection.collaborators.length === 0 && <p className="muted">Aucun collaborateur.</p>}
                </div>
                <form onSubmit={addCollaborator} className="row" style={{ marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <SearchBox placeholder="Nom d'utilisateur" value={collaboratorName} onChange={setCollaboratorName} scopes={['users']} onPickUser={() => undefined} inputStyle={{ width: '100%' }} />
                  </div>
                  <button type="submit">Ajouter</button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
