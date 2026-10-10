import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import StaffUserPanel, { ROLE_LABEL } from '../components/StaffUserPanel';
import MemberActivityPanel from '../components/MemberActivityPanel';
import TransferPoints from '../components/TransferPoints';
import ReportButton from '../components/ReportButton';
import SecurityPanel from '../components/SecurityPanel';
import ProfileEditor from '../components/ProfileEditor';
import AdultPreference from '../components/AdultPreference';
import DmPrivacyPanel from '../components/DmPrivacyPanel';
import WatchingVisibilityPanel from '../components/WatchingVisibilityPanel';
import DefaultViewPanel from '../components/DefaultViewPanel';
import TipStylePanel from '../components/TipStylePanel';
import Avatar from '../components/Avatar';
import { displayRank } from '../lib/memberClass';
import { STATUS_COLOR, STATUS_LABEL } from '../lib/presence';
import { useCrumbTitle } from '../store/crumbs';

export default function Profile() {
  const { id } = useParams();
  const me = useAuthStore((s) => s.user);
  const targetId = id ?? me?.id;
  const [profile, setProfile] = useState<any>(null);
  useCrumbTitle(id ? profile?.username : null);
  const [history, setHistory] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>([]);
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<'overview' | 'account' | 'security' | 'dev'>(() => { const t = new URLSearchParams(window.location.search).get('tab'); return t === 'dev' || t === 'account' || t === 'security' ? t : 'overview'; }); // ?tab=dev : ouvre l'onglet Développeur (clés API)
  const [showTransfer, setShowTransfer] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendError, setFriendError] = useState('');

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

  async function friendAction(fn: () => Promise<unknown>) {
    setFriendBusy(true); setFriendError('');
    try { await fn(); setReloadKey((k) => k + 1); } catch (e: any) { setFriendError(e.response?.data?.message ?? 'Action impossible'); } finally { setFriendBusy(false); }
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
        {profile.team && <Link to={`/teams/${profile.team.id}`} className="badge new" title={`Team ${profile.team.name}`}>🏴 {profile.team.tag ? `[${profile.team.tag}] ` : ''}{profile.team.name}</Link>}
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
        {id && me && id !== me.id && profile.friendStatus === 'NONE' && (
          <button type="button" className="icon-btn" disabled={friendBusy} onClick={() => friendAction(() => api.post('/friends/request', { username: profile.username }))}>➕ Ajouter en ami</button>
        )}
        {id && me && id !== me.id && profile.friendStatus === 'PENDING_OUT' && (
          <button type="button" className="icon-btn" disabled={friendBusy} title="Annuler ta demande d'ami" onClick={() => friendAction(() => api.delete(`/friends/${profile.friendshipId}`))}>⏳ Demande envoyée · Annuler</button>
        )}
        {id && me && id !== me.id && profile.friendStatus === 'PENDING_IN' && (
          <>
            <button type="button" className="icon-btn" disabled={friendBusy} onClick={() => friendAction(() => api.post(`/friends/${profile.friendshipId}/accept`))}>✅ Accepter sa demande d'ami</button>
            <button type="button" className="icon-btn" disabled={friendBusy} onClick={() => friendAction(() => api.delete(`/friends/${profile.friendshipId}`))}>Refuser</button>
          </>
        )}
        {id && me && id !== me.id && profile.friendStatus === 'FRIENDS' && (
          <button type="button" className="icon-btn" disabled={friendBusy} title="Retirer de mes amis" onClick={() => { if (window.confirm(`Retirer ${profile.username} de tes amis ?`)) void friendAction(() => api.delete(`/friends/${profile.friendshipId}`)); }}>✓ Ami · Retirer</button>
        )}
        {id && me && id !== me.id && (
          <button type="button" className="icon-btn" onClick={() => setShowTransfer((v) => !v)}>🎁 Transférer des points</button>
        )}
        {id && me && id !== me.id && <ReportButton targetType="user" targetId={id} compact />}
      </div>
      {friendError && <div style={{ color: 'var(--danger)' }}>{friendError}</div>}
      {showTransfer && id && me && id !== me.id && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>🎁 Transférer des points à {profile.username}</h3>
          <TransferPoints to={{ id: profile.id, username: profile.username }} onCancel={() => setShowTransfer(false)} />
        </div>
      )}
      {id && me && ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(me.role) && (
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
      {own && profile.freeleechUntil && (
        <div className="panel" style={{ borderColor: 'var(--gold)', color: 'var(--gold-bright)' }}>
          🎁 Freeleech personnel actif jusqu'au {new Date(profile.freeleechUntil).toLocaleDateString('fr-FR')} — tes téléchargements ne comptent pas dans ton ratio jusque-là.
        </div>
      )}
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
      {showTab('account') && <DmPrivacyPanel value={profile.dmPrivacy ?? 'EVERYONE'} />}
      {showTab('account') && <DefaultViewPanel value={profile.defaultView} />}
      {showTab('account') && <TipStylePanel />}
      {showTab('account') && <WatchingVisibilityPanel value={profile.showWatchingStatus !== false} />}
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
            Pour tes scripts et intégrations (Prowlarr, Sonarr, Radarr, Lidarr, Readarr, Jackett, flux RSS, automatisation...). Chaque clé n'a que les portées que tu lui donnes.
            <Link to="/integrations"> → Ouvre le générateur d'adresses « API & flux RSS »</Link> : il te donne les valeurs à copier pour chaque outil.<br />
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
      {/* Journal d'activité : tout en bas de la fiche, après les autres informations (équipe Seeduction seulement). */}
      {id && me && ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(me.role) && <MemberActivityPanel userId={id} />}
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
