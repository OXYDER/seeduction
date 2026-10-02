import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { timeAgo } from '../lib/time';
import Avatar from '../components/Avatar';
import { DEFAULT_PERMS, PERM_KEYS, PERM_LABELS, type Perms } from '../store/auth';

interface Card { id: string; name: string; username: string; accountName: string; avatarUrl: string | null; perms: Perms; isMaster: boolean; blocked: boolean; hasPin: boolean }
interface Activity {
  id: string; at: string; action: string; verb: string; detail: string | null; ip: string | null;
  profile: { id: string; name: string; avatarUrl: string | null };
  target: { type: 'torrent' | 'user'; id: string | null; label: string } | null;
}
interface ChildConv { id: string; type: string; name: string; members: string[]; lastMessageAt: string | null }
interface ChildMsg { id: string; at: string; type: string; content: string; imageUrl: string | null; fileName: string | null; durationMs: number | null; sender: { id: string; username: string }; fromChild: boolean }

const ACTIONS: [string, string][] = [
  ['', 'Toutes les actions'], ['login', 'Connexions'], ['download', 'Téléchargements'], ['play', 'Lectures'], ['view', 'Consultations'], ['search', 'Recherches'],
  ['comment', 'Commentaires'], ['forum', 'Forum'], ['favorite', 'Favoris'], ['upload', 'Envois'], ['friend', 'Demandes d\'ami'], ['report', 'Signalements'], ['pin_failed', 'PIN incorrects'],
];
const pinOk = (p: string) => /^\d{4}$/.test(p);

function PinInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input type="password" inputMode="numeric" autoComplete="off" maxLength={4} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))} style={{ width: 120 }} />;
}

/** Compte famille : activation, profils, journal d'activité et conversations des profils enfants (profil principal seulement). */
export default function Family() {
  const me = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const isMaster = !me?.profile || me.profile.isMaster;
  const [state, setState] = useState<{ enabled: boolean; max: number; profiles: Card[] } | null>(null);
  const [tab, setTab] = useState<'profiles' | 'activity' | 'chats'>('profiles');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const load = useCallback(() => {
    api.get('/family/state').then((r) => setState(r.data)).catch((err) => setError(err.response?.data?.message ?? 'Chargement impossible'));
  }, []);
  useEffect(() => { if (isMaster) load(); }, [isMaster, load]);

  const say = (t: string) => { setFlash(t); setTimeout(() => setFlash(''), 3500); };

  if (!isMaster) return <div className="panel"><p className="muted">Seul le profil principal gère le compte famille.</p></div>;
  if (!state) return <p className="muted">{error || 'Chargement…'}</p>;

  return (
    <div className="grid">
      <h1>👨‍👩‍👧 Compte famille</h1>
      {error && <div className="panel" style={{ borderColor: 'var(--danger)' }}>{error}</div>}
      {flash && <div className="mod-flash" role="status">{flash}</div>}
      {!state.enabled
        ? <EnablePanel onEnabled={async () => {
            // Le sélecteur de profil s'applique tout de suite : on repasse par l'écran de choix (et donc par le PIN).
            const { data } = await api.post('/family/exit');
            login(data.accessToken, me!, 'account');
            window.location.assign('/profiles');
          }} />
        : (
          <>
            <div className="mod-tabs" role="tablist">
              <button type="button" className={tab === 'profiles' ? 'on' : ''} onClick={() => setTab('profiles')}>Profils ({state.profiles.length}/{state.max})</button>
              <button type="button" className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>Activité</button>
              <button type="button" className={tab === 'chats' ? 'on' : ''} onClick={() => setTab('chats')}>Conversations</button>
            </div>
            {tab === 'profiles' && <ProfilesPanel state={state} reload={load} say={say} setError={setError} />}
            {tab === 'activity' && <ActivityPanel profiles={state.profiles} />}
            {tab === 'chats' && <ChatsPanel profiles={state.profiles.filter((p) => !p.isMaster)} />}
          </>
        )}
    </div>
  );
}

function EnablePanel({ onEnabled }: { onEnabled: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!pinOk(pin)) { setError('Le PIN doit contenir exactement 4 chiffres'); return; }
    if (pin !== pin2) { setError('Les deux PIN ne sont pas identiques'); return; }
    setBusy(true);
    try { await api.post('/family/enable', { password, pin }); await onEnabled(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Activation impossible'); setBusy(false); }
  }

  return (
    <form className="panel" onSubmit={submit} style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
      <h3 style={{ margin: 0 }}>Un seul compte, un profil par membre de la famille</h3>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li>Jusqu'à <strong>4 profils</strong> (le tien compris), chacun avec son nom, son avatar, ses favoris, ses collections, sa messagerie et ses amis.</li>
        <li>Chaque profil a un <strong>PIN à 4 chiffres</strong>, demandé à <strong>chaque connexion</strong> et à chaque changement de profil.</li>
        <li>Le ratio, l'upload, le seed, la passkey, les points et la sécurité du compte restent communs. Seul toi (profil principal) peux y toucher.</li>
        <li>Tu as le <strong>contrôle complet</strong> : tu choisis ce que chaque profil peut faire (contenu adulte, envoi de torrents, dépenses de points, messagerie...), tu vois son <strong>activité</strong> (téléchargements, lectures, commentaires, recherches...), tu peux le <strong>bloquer</strong> et <strong>lire ses conversations</strong>. Prévins les membres de ta famille.</li>
        <li>Les profils s'affichent sur le site sous la forme « Nom·{'{ton pseudo}'} » : on voit toujours à quel compte ils appartiennent.</li>
      </ul>
      <label style={{ display: 'grid', gap: 4 }}><span className="muted">Ton mot de passe (pour confirmer)</span><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ maxWidth: 320 }} /></label>
      <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'grid', gap: 4 }}><span className="muted">Ton PIN (4 chiffres)</span><PinInput value={pin} onChange={setPin} placeholder="••••" /></label>
        <label style={{ display: 'grid', gap: 4 }}><span className="muted">Confirme ton PIN</span><PinInput value={pin2} onChange={setPin2} placeholder="••••" /></label>
      </div>
      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      <div><button type="submit" disabled={busy || !password}>{busy ? 'Activation…' : 'Activer le compte famille'}</button></div>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>Après l'activation, tu repasseras par l'écran « Qui est-ce ? » pour entrer ton PIN.</p>
    </form>
  );
}

function ProfilesPanel({ state, reload, say, setError }: { state: { profiles: Card[]; max: number }; reload: () => void; say: (t: string) => void; setError: (e: string) => void }) {
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<Perms>({ ...DEFAULT_PERMS });
  const [rightsFor, setRightsFor] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [masterPinOpen, setMasterPinOpen] = useState(false);
  const [mpPassword, setMpPassword] = useState('');
  const [mpPin, setMpPin] = useState('');

  async function run(fn: () => Promise<any>, ok: string) {
    setError(''); setBusy(true);
    try { await fn(); say(ok); reload(); } catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); } finally { setBusy(false); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!pinOk(pin)) { setError('Le PIN doit contenir exactement 4 chiffres'); return; }
    if (pin !== pin2) { setError('Les deux PIN ne sont pas identiques'); return; }
    await run(async () => { await api.post('/family/profiles', { name: name.trim(), pin, perms }); setName(''); setPin(''); setPin2(''); }, '✓ Profil créé');
  }

  async function uploadAvatar(p: Card, file: File | undefined) {
    if (!file) return;
    await run(async () => {
      const form = new FormData(); form.append('file', file);
      const { data } = await api.post('/covers/upload', form);
      await api.patch(`/family/profiles/${p.id}`, { avatarUrl: data.url });
    }, '✓ Avatar mis à jour');
  }

  const full = state.profiles.length >= state.max;

  return (
    <div className="grid">
      <div className="fam-list">
        {state.profiles.map((p) => (
          <div key={p.id} className={`fam-row${p.blocked ? ' blocked' : ''}`}>
            <Avatar user={{ username: p.name, avatarUrl: p.avatarUrl }} size={56} />
            <div className="fam-main">
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <strong>{p.name}</strong>
                <span className="muted">· {p.username}</span>
                {p.isMaster ? <span className="fam-type MASTER">Principal</span> : <span className="muted" style={{ fontSize: 12 }}>{PERM_KEYS.filter((k) => !p.perms[k]).length ? `${PERM_KEYS.filter((k) => !p.perms[k]).length} restriction(s)` : 'Tous les droits'}</span>}
                {p.blocked && <span className="inv-status disabled">Bloqué</span>}
              </div>
              {rightsFor === p.id && !p.isMaster && (
                <div className="fam-rights">
                  {PERM_KEYS.map((k) => (
                    <label key={k} className="inv-check" style={{ margin: 0 }}>
                      <input type="checkbox" checked={p.perms[k]} disabled={busy} onChange={(e) => run(() => api.patch(`/family/profiles/${p.id}`, { perms: { [k]: e.target.checked } }), '✓ Droits mis à jour')} />
                      {PERM_LABELS[k]}
                    </label>
                  ))}
                </div>
              )}
              {pinFor === p.id && (
                <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <PinInput value={newPin} onChange={setNewPin} placeholder="Nouveau PIN" />
                  <button type="button" disabled={!pinOk(newPin) || busy} onClick={() => run(async () => { await api.post(`/family/profiles/${p.id}/pin`, { pin: newPin }); setPinFor(null); setNewPin(''); }, '✓ PIN modifié')}>Enregistrer</button>
                  <button type="button" className="secondary" onClick={() => { setPinFor(null); setNewPin(''); }}>Annuler</button>
                </div>
              )}
              {p.isMaster && masterPinOpen && (
                <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <input type="password" placeholder="Ton mot de passe" value={mpPassword} onChange={(e) => setMpPassword(e.target.value)} style={{ width: 180 }} />
                  <PinInput value={mpPin} onChange={setMpPin} placeholder="Nouveau PIN" />
                  <button type="button" disabled={!pinOk(mpPin) || !mpPassword || busy} onClick={() => run(async () => { await api.post('/family/master-pin', { password: mpPassword, pin: mpPin }); setMasterPinOpen(false); setMpPassword(''); setMpPin(''); }, '✓ PIN modifié')}>Enregistrer</button>
                  <button type="button" className="secondary" onClick={() => setMasterPinOpen(false)}>Annuler</button>
                </div>
              )}
            </div>
            <div className="fam-actions">
              {!p.isMaster && (
                <>
                  <label className="secondary fam-file">📷 Avatar<input type="file" accept="image/*" hidden onChange={(e) => { uploadAvatar(p, e.target.files?.[0]); e.target.value = ''; }} /></label>
                  <button type="button" className={`secondary${rightsFor === p.id ? ' on' : ''}`} onClick={() => setRightsFor(rightsFor === p.id ? null : p.id)}>🔑 Droits</button>
                  <button type="button" className="secondary" onClick={() => { const n = window.prompt('Nouveau nom du profil (2 à 16 caractères, sans espace) :', p.name); if (n && n.trim() !== p.name) run(() => api.patch(`/family/profiles/${p.id}`, { name: n.trim() }), '✓ Profil renommé'); }}>Renommer</button>
                  <button type="button" className="secondary" onClick={() => { setPinFor(pinFor === p.id ? null : p.id); setNewPin(''); }}>Changer le PIN</button>
                  <button type="button" className={p.blocked ? '' : 'danger'} disabled={busy} onClick={() => run(() => api.post(`/family/profiles/${p.id}/block`, { blocked: !p.blocked }), p.blocked ? '✓ Profil débloqué' : '✓ Profil bloqué')}>{p.blocked ? 'Débloquer' : 'Bloquer'}</button>
                </>
              )}
              {p.isMaster && <button type="button" className="secondary" onClick={() => setMasterPinOpen((v) => !v)}>Changer mon PIN</button>}
            </div>
          </div>
        ))}
      </div>

      {!full && (
        <form className="panel" onSubmit={create} style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Ajouter un profil</h3>
          <div className="inv-grid">
            <label><span className="muted">Nom du profil (2 à 16 caractères, sans espace)</span><input value={name} onChange={(e) => setName(e.target.value.replace(/[^\p{L}\p{N}_-]/gu, ''))} maxLength={16} required /></label>
          </div>
          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Ce que ce profil a le droit de faire (modifiable à tout moment)</div>
            <div className="fam-rights">
              {PERM_KEYS.map((k) => (
                <label key={k} className="inv-check" style={{ margin: 0 }}><input type="checkbox" checked={perms[k]} onChange={(e) => setPerms({ ...perms, [k]: e.target.checked })} />{PERM_LABELS[k]}</label>
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'grid', gap: 4 }}><span className="muted">PIN (4 chiffres)</span><PinInput value={pin} onChange={setPin} placeholder="••••" /></label>
            <label style={{ display: 'grid', gap: 4 }}><span className="muted">Confirme le PIN</span><PinInput value={pin2} onChange={setPin2} placeholder="••••" /></label>
          </div>
          <div><button type="submit" disabled={busy || name.length < 2}>Créer le profil</button></div>
        </form>
      )}
    </div>
  );
}

function ActivityPanel({ profiles }: { profiles: Card[] }) {
  const [profileId, setProfileId] = useState('');
  const [action, setAction] = useState('');
  const [items, setItems] = useState<Activity[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(async (before?: string) => {
    setLoading(true);
    try {
      const { data } = await api.get('/family/activity', { params: { profileId: profileId || undefined, action: action || undefined, before, limit: 50 } });
      setItems((prev) => (before && prev ? [...prev, ...data.items] : data.items));
      setNext(data.next);
    } finally { setLoading(false); }
  }, [profileId, action]);
  useEffect(() => { void fetchPage(); }, [fetchPage]);

  return (
    <div className="panel">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="Profil">
          <option value="">Tous les profils</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action">
          {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" className="secondary" onClick={() => void fetchPage()}>↻ Actualiser</button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Ce journal montre ce qui est fait depuis le site avec chaque profil. Le seed fait par ton client BitTorrent reste au niveau du compte.</p>
      {items === null ? <p className="muted">Chargement…</p> : items.length === 0 ? <p className="muted">Aucune activité pour ces filtres.</p> : (
        <div className="fam-feed">
          {items.map((a) => (
            <div key={a.id} className="fam-event">
              <Avatar user={{ username: a.profile.name, avatarUrl: a.profile.avatarUrl }} size={32} />
              <div className="fam-event-text">
                <div><strong>{a.profile.name}</strong> · {a.verb}{a.target && <> « {a.target.type === 'torrent' && a.target.id ? <a href={`/torrents/${a.target.id}`}>{a.target.label}</a> : a.target.label} »</>}{a.detail && <span className="muted"> — {a.detail}</span>}</div>
                <div className="muted" style={{ fontSize: 12 }}>{timeAgo(a.at)} · {new Date(a.at).toLocaleString('fr-CA')}{a.ip ? ` · IP ${a.ip}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {next && <div style={{ marginTop: 12 }}><button type="button" className="secondary" disabled={loading} onClick={() => void fetchPage(next)}>Plus ancien</button></div>}
    </div>
  );
}

function ChatsPanel({ profiles }: { profiles: Card[] }) {
  const [childId, setChildId] = useState(profiles[0]?.id ?? '');
  const [convs, setConvs] = useState<ChildConv[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChildMsg[] | null>(null);

  useEffect(() => {
    setConvs(null); setOpenId(null); setMsgs(null);
    if (childId) api.get(`/family/profiles/${childId}/conversations`).then((r) => setConvs(r.data)).catch(() => setConvs([]));
  }, [childId]);

  function open(id: string) {
    setOpenId(id); setMsgs(null);
    api.get(`/family/profiles/${childId}/conversations/${id}/messages`).then((r) => setMsgs(r.data)).catch(() => setMsgs([]));
  }

  if (profiles.length === 0) return <div className="panel"><p className="muted">Aucun autre profil pour le moment.</p></div>;

  return (
    <div className="panel">
      <div className="row" style={{ gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={childId} onChange={(e) => setChildId(e.target.value)} aria-label="Profil">
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>Lecture seule — les messages ne sont pas marqués comme lus.</span>
      </div>
      <div className="fam-chats">
        <div className="fam-chat-list">
          {convs === null ? <p className="muted">Chargement…</p> : convs.length === 0 ? <p className="muted">Aucune conversation.</p> : convs.map((c) => (
            <button key={c.id} type="button" className={`secondary${openId === c.id ? ' on' : ''}`} onClick={() => open(c.id)}>
              <strong>{c.type === 'GROUP' ? '👥 ' : ''}{c.name}</strong>
              <small className="muted">{c.lastMessageAt ? timeAgo(c.lastMessageAt) : ''}</small>
            </button>
          ))}
        </div>
        <div className="fam-chat-view">
          {!openId ? <p className="muted">Choisis une conversation.</p> : msgs === null ? <p className="muted">Chargement…</p> : msgs.length === 0 ? <p className="muted">Aucun message.</p> : msgs.map((m) => (
            <div key={m.id} className={`fam-msg${m.fromChild ? ' child' : ''}`}>
              <div className="fam-msg-head"><strong>{m.sender.username}</strong> <span className="muted">{new Date(m.at).toLocaleString('fr-CA')}</span></div>
              <div>
                {m.type === 'SYSTEM' ? <em>{m.content}</em> : m.type === 'VOICE' ? '🎤 Message vocal' : m.type === 'FILE' ? `📎 ${m.fileName ?? 'Fichier'}` : null}
                {m.imageUrl && <img src={m.imageUrl} alt="" style={{ maxWidth: 220, borderRadius: 8, display: 'block' }} />}
                {m.content && m.type !== 'SYSTEM' ? m.content : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
