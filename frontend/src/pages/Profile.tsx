import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import StaffUserPanel, { ROLE_LABEL } from '../components/StaffUserPanel';
import ReportButton from '../components/ReportButton';
import SecurityPanel from '../components/SecurityPanel';
import ProfileEditor from '../components/ProfileEditor';
import AdultPreference from '../components/AdultPreference';
import Avatar from '../components/Avatar';
import { displayRank } from '../lib/memberClass';
import { STATUS_COLOR, STATUS_LABEL } from '../lib/presence';

export default function Profile() {
  const { id } = useParams();
  const me = useAuthStore((s) => s.user);
  const targetId = id ?? me?.id;
  const [profile, setProfile] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<'overview' | 'account' | 'security' | 'dev'>('overview');

  useEffect(() => {
    if (!targetId) return;
    api.get(id ? `/users/${id}` : '/users/me').then((r) => setProfile(r.data));
    if (!id) api.get('/users/me/ratio-history').then((r) => setHistory(r.data));
    api.get(`/badges/user/${targetId}`).then((r) => setBadges(r.data)).catch(() => {});
  }, [id, targetId, reloadKey]);

  function refreshKeys() {
    api.get('/keys').then((r) => setApiKeys(r.data)).catch(() => {});
  }
  useEffect(() => {
    if (id) return;
    refreshKeys();
    api.get('/keys/scopes').then((r) => setAvailableScopes(r.data)).catch(() => {});
  }, [id]);

  function toggleNewKeyScope(scope: string) {
    setNewKeyScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyLabel.trim() || newKeyScopes.length === 0) return;
    const { data } = await api.post('/keys', { label: newKeyLabel, scopes: newKeyScopes });
    setJustCreatedKey(data.rawKey);
    setNewKeyLabel('');
    setNewKeyScopes([]);
    refreshKeys();
  }

  async function revokeKey(keyId: string) {
    await api.delete(`/keys/${keyId}`);
    setApiKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, revoked: true } : k)));
  }

  if (!profile) return <p className="muted">Chargement...</p>;

  // Sur son propre profil, les réglages sont rangés en onglets ; sur celui d'un autre membre, on ne voit que l'aperçu.
  const own = !id;
  const showTab = (t: string) => (own ? tab === t : t === 'overview');

  const chartData = history.map((h) => ({
    date: new Date(h.takenAt).toLocaleDateString(),
    ratio: Number(h.downloaded) > 0 ? Number(h.uploaded) / Number(h.downloaded) : 0,
  }));

  return (
    <div className="grid">
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <Avatar user={profile} size={56} />
          {profile.onlineStatus && (
            <span
              title={STATUS_LABEL[profile.onlineStatus as keyof typeof STATUS_LABEL]}
              style={{ position: 'absolute', right: 0, bottom: 0, width: 15, height: 15, borderRadius: '50%', border: '3px solid var(--bg-panel)', background: STATUS_COLOR[profile.onlineStatus as keyof typeof STATUS_COLOR] }}
            />
          )}
        </span>
        <h1 style={{ margin: 0 }}>{profile.username}</h1>
        {profile.onlineStatus && <span className="muted" style={{ fontSize: 13 }}>{STATUS_LABEL[profile.onlineStatus as keyof typeof STATUS_LABEL]}</span>}
        {profile.role && <span className="badge double">{displayRank(profile, ROLE_LABEL)}</span>}
        {profile.status === 'BANNED' && <span className="badge" style={{ background: 'rgba(224,90,90,0.2)', color: 'var(--danger)' }}>Banni</span>}
        <span className="muted">
          Membre depuis le {new Date(profile.createdAt).toLocaleDateString('fr-FR')}
          {profile.lastSeenAt && ` · vu ${new Date(profile.lastSeenAt).toLocaleDateString('fr-FR')}`}
          {profile._count && ` · ${profile._count.torrentsUploaded} torrent(s) envoyé(s)`}
        </span>
        {id && (
          <Link to={`/browse?uploaderId=${profile.id}`} className="muted">Voir ses torrents →</Link>
        )}
        {id && me && id !== me.id && <Link to={`/messages?to=${encodeURIComponent(profile.username)}`} className="icon-btn">✉️ Message</Link>}
        {id && me && id !== me.id && <ReportButton targetType="user" targetId={id} compact />}
      </div>
      {id && me && ['MODERATOR', 'ADMIN', 'OWNER'].includes(me.role) && (
        <StaffUserPanel targetId={id} myRole={me.role} myId={me.id} onChanged={() => setReloadKey((k) => k + 1)} />
      )}
      {own && (
        <nav className="tabs" aria-label="Sections du profil">
          {([['overview', 'Aperçu'], ['account', 'Compte'], ['security', 'Sécurité'], ['dev', 'Développeur']] as const).map(([key, label]) => (
            <button key={key} type="button" className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>{label}</button>
          ))}
        </nav>
      )}
      {showTab('overview') && (
        <>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <Card label="Ratio" value={profile.ratio ? profile.ratio.toFixed(2) : '∞'} />
        <Card label="Upload" value={`${(Number(profile.uploaded) / 1e9).toFixed(2)} Go`} />
        <Card label="Download" value={`${(Number(profile.downloaded) / 1e9).toFixed(2)} Go`} />
        <Card label="Bonus points" value={profile.bonusPoints?.toFixed(0) ?? 0} />
      </div>
      <div className="panel">
        <h3>Badges {badges.length > 0 && `(${badges.length})`}</h3>
        {badges.length === 0 && <p className="muted">Aucun badge obtenu pour l'instant.</p>}
        <div className="row" style={{ flexWrap: 'wrap', gap: 14 }}>
          {badges.map((b) => (
            <div key={b.code} className="row" style={{ gap: 8, alignItems: 'center' }} title={b.description}>
              <span style={{ fontSize: 22 }}>{b.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{b.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>{b.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {!id && chartData.length > 0 && (
        <div className="panel">
          <h3>Évolution du ratio (30 jours)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" stroke="#8fa896" fontSize={12} />
              <YAxis stroke="#8fa896" fontSize={12} />
              <Tooltip contentStyle={{ background: '#0c1912', border: '1px solid #1f3d2a' }} />
              <Line type="monotone" dataKey="ratio" stroke="#e0b84a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
        </>
      )}
      {showTab('account') && <ProfileEditor key={profile.avatarUrl ?? 'none'} profile={profile} onSaved={() => setReloadKey((k) => k + 1)} />}
      {showTab('account') && <AdultPreference enabled={!!profile.showAdult} />}
      {showTab('security') && <SecurityPanel />}
      {showTab('dev') && (
        <div className="panel">
          <div className="muted">Ta passkey (garde-la secrète — elle est dans l'URL announce de tes .torrent) :</div>
          <code>{profile.passkey}</code>
        </div>
      )}
      {showTab('dev') && (
        <div className="panel">
          <h3>Clés API</h3>
          <p className="muted" style={{ fontSize: 12 }}>
            Pour tes scripts et intégrations (flux RSS, automatisation...). Chaque clé n'a que les portées que tu lui donnes.
            Endpoints : <code>GET /api/public/torrents</code>, <code>/torrents/:id</code>, <code>/me</code>, <code>/stats</code>,{' '}
            <code>/rss/torrents.xml</code> — clé à passer en en-tête <code>X-Api-Key</code> (ou <code>?key=</code> pour le flux RSS).
          </p>

          {justCreatedKey && (
            <div className="panel ornate" style={{ margin: '10px 0' }}>
              <div className="muted" style={{ fontSize: 12 }}>Copie cette clé maintenant — elle ne sera plus jamais affichée :</div>
              <code style={{ wordBreak: 'break-all', display: 'block', margin: '6px 0' }}>{justCreatedKey}</code>
              <button className="secondary" onClick={() => setJustCreatedKey(null)}>J'ai copié la clé</button>
            </div>
          )}

          <table>
            <thead><tr><th>Label</th><th>Clé</th><th>Portées</th><th>Dernière utilisation</th><th></th></tr></thead>
            <tbody>
              {apiKeys.map((k) => (
                <tr key={k.id} style={{ opacity: k.revoked ? 0.5 : 1 }}>
                  <td>{k.label}</td>
                  <td className="muted">{k.keyPrefix}…</td>
                  <td className="muted">{k.scopes.join(', ')}</td>
                  <td className="muted">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Jamais'}</td>
                  <td>{!k.revoked && <button className="secondary" onClick={() => revokeKey(k.id)}>Révoquer</button>}</td>
                </tr>
              ))}
              {apiKeys.length === 0 && <tr><td className="muted">Aucune clé API pour l'instant.</td></tr>}
            </tbody>
          </table>

          <form onSubmit={createKey} className="grid" style={{ marginTop: 10 }}>
            <input placeholder="Label (ex : Sonarr, script perso...)" value={newKeyLabel} onChange={(e) => setNewKeyLabel(e.target.value)} />
            <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
              {availableScopes.map((s) => (
                <label key={s} className="row muted" style={{ gap: 4 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={newKeyScopes.includes(s)} onChange={() => toggleNewKeyScope(s)} /> {s}
                </label>
              ))}
            </div>
            <button type="submit" style={{ alignSelf: 'flex-start' }}>Générer une clé</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel">
      <div className="muted">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
