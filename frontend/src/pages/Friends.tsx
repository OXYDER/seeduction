import { useEffect, useState } from 'react';
import { api } from '../api/client';
import Avatar from '../components/Avatar';
import { Link } from 'react-router-dom';
import { useDmStore } from '../store/dm';

type Tab = 'friends' | 'incoming' | 'outgoing';

export default function Friends() {
  const [data, setData] = useState<{ friends: any[]; incoming: any[]; outgoing: any[] }>({ friends: [], incoming: [], outgoing: [] });
  const [tab, setTab] = useState<Tab>('friends');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const openChat = useDmStore((s) => s.openChat);
  const onlineIds = useDmStore((s) => s.onlineIds);
  const bump = useDmStore((s) => s.friendRequestBump);

  function refresh() {
    api.get('/friends').then((r) => setData(r.data)).catch(() => {});
  }
  useEffect(refresh, [bump]);

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setError(''); setNotice('');
    try {
      await api.post('/friends/request', { username: username.trim() });
      setNotice(`✓ Demande envoyée à ${username.trim()}.`);
      setUsername('');
      refresh();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Envoi impossible');
    }
  }

  async function accept(id: string) {
    await api.post(`/friends/${id}/accept`);
    refresh();
  }
  async function remove(id: string) {
    await api.delete(`/friends/${id}`);
    refresh();
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'friends', label: 'Amis', count: data.friends.length },
    { key: 'incoming', label: 'Demandes reçues', count: data.incoming.length },
    { key: 'outgoing', label: 'Demandes envoyées', count: data.outgoing.length },
  ];

  return (
    <div className="grid" style={{ gap: 18 }}>
      <h1>Amis</h1>

      <div className="panel ornate">
        <div className="panel-title"><span className="title-icon">➕</span>Ajouter un ami</div>
        <form className="row" onSubmit={sendRequest} style={{ gap: 10 }}>
          <input placeholder="Nom d'utilisateur" value={username} onChange={(e) => setUsername(e.target.value)} style={{ flex: 1, maxWidth: 320 }} />
          <button type="submit">Envoyer la demande</button>
        </form>
        {notice && <p style={{ color: 'var(--success)', margin: '8px 0 0' }}>{notice}</p>}
        {error && <p style={{ color: 'var(--danger)', margin: '8px 0 0' }}>{error}</p>}
      </div>

      <div className="panel">
        <div className="row" style={{ gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button key={t.key} type="button" className={tab === t.key ? '' : 'secondary'} onClick={() => setTab(t.key)}>
              {t.label}{t.count > 0 ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>

        {tab === 'friends' && (
          <div className="grid" style={{ gap: 8 }}>
            {data.friends.map((f) => (
              <div key={f.friendshipId} className="row" style={{ justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                <Link to={`/users/${f.id}`} className="row" style={{ gap: 10, alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <Avatar user={f} size={40} />
                    <span style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--bg-panel)', background: onlineIds.has(f.id) ? 'var(--success)' : '#6b7280' }} />
                  </span>
                  <div>
                    <strong>{f.username}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{onlineIds.has(f.id) ? 'Actif maintenant' : 'Hors ligne'}</div>
                  </div>
                </Link>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" onClick={() => openChat({ id: f.id, username: f.username, avatarUrl: f.avatarUrl })}>💬 Message</button>
                  <button type="button" className="danger" onClick={() => window.confirm(`Retirer ${f.username} de tes amis ?`) && remove(f.friendshipId)}>Retirer</button>
                </div>
              </div>
            ))}
            {data.friends.length === 0 && <p className="muted">Tu n'as pas encore d'amis. Cherche un membre par son nom ci-dessus, ou depuis son profil.</p>}
          </div>
        )}

        {tab === 'incoming' && (
          <div className="grid" style={{ gap: 8 }}>
            {data.incoming.map((f) => (
              <div key={f.friendshipId} className="row" style={{ justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                <Link to={`/users/${f.id}`} className="row" style={{ gap: 10, alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
                  <Avatar user={f} size={40} /><strong>{f.username}</strong>
                </Link>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" onClick={() => accept(f.friendshipId)}>✔️ Accepter</button>
                  <button type="button" className="secondary" onClick={() => remove(f.friendshipId)}>Refuser</button>
                </div>
              </div>
            ))}
            {data.incoming.length === 0 && <p className="muted">Aucune demande reçue.</p>}
          </div>
        )}

        {tab === 'outgoing' && (
          <div className="grid" style={{ gap: 8 }}>
            {data.outgoing.map((f) => (
              <div key={f.friendshipId} className="row" style={{ justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                <Link to={`/users/${f.id}`} className="row" style={{ gap: 10, alignItems: 'center', color: 'inherit', textDecoration: 'none' }}>
                  <Avatar user={f} size={40} /><strong>{f.username}</strong>
                </Link>
                <button type="button" className="secondary" onClick={() => remove(f.friendshipId)}>Annuler la demande</button>
              </div>
            ))}
            {data.outgoing.length === 0 && <p className="muted">Aucune demande en attente.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
