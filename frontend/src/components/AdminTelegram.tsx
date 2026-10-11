import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import TelegramLogo from './TelegramLogo';

interface Config {
  enabled: boolean; inviteUrl: string; chatId: string; bridge: boolean; bridgeChannelId: string | null;
  announceNews: boolean; announceFreeleech: boolean; announceTorrents: boolean; announceChatId: string;
}
interface Overview {
  bridge?: { active: boolean; issue: string | null; channelName: string | null };
  config: Config; hasToken: boolean; botUsername: string | null;
  status: { connected: boolean; lastPollAt: string | null; lastError: string | null; lastSendAt: string | null; relayedIn: number; relayedOut: number; updatesReceived: number; lastUpdateAt: string | null; recent: string[] };
  seenChats: { id: string; title: string; type: string; at: string }[];
  channels: { id: string; name: string | null }[];
  links: { userId: string; username: string; tgUsername: string | null; since: string }[];
}

const errorOf = (e: any) => e?.response?.data?.message ?? 'Une erreur est survenue';
const GUIDE = '/wiki/guide-staff-telegram';

/** Admin > Telegram (équipe) : jeton du robot, groupe, pont avec un canal de la messagerie et annonces. Les explications sont dans le guide du wiki. */
export function TelegramAdmin() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = (d: Overview) => { setOv(d); setCfg(d.config); };
  const load = useCallback(() => api.get('/telegram/admin').then((r) => apply(r.data)).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]);

  if (!ov || !cfg) return <p className="muted">{err || 'Chargement...'}</p>;
  const up = <K extends keyof Config>(k: K, v: Config[K]) => setCfg({ ...cfg, [k]: v });
  const flash = (m: string) => { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 4000); };

  async function save() {
    setBusy(true); setErr('');
    try { const { data } = await api.put('/telegram/admin', { ...cfg, ...(token.trim() ? { token: token.trim() } : {}) }); apply(data); setToken(''); flash('✓ Réglages enregistrés'); }
    catch (e) { setErr(errorOf(e)); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const { data } = await api.post('/telegram/admin/test', { ...(token.trim() ? { token: token.trim() } : {}), chatId: cfg!.chatId });
      if (data.error) setErr(`Robot ${data.bot} trouvé, mais : ${data.error}`);
      else flash(`✓ Robot ${data.bot} connecté${data.sent ? ` — message d'essai envoyé dans « ${data.chat} »` : ''}`);
      load();
    } catch (e) { setErr(errorOf(e)); }
    finally { setBusy(false); }
  }
  async function createChannel() {
    setBusy(true); setErr('');
    try { const { data } = await api.post('/telegram/admin/channel'); apply(data); flash('✓ Canal « Telegram » créé et choisi'); }
    catch (e) { setErr(errorOf(e)); }
    finally { setBusy(false); }
  }
  async function removeLink(userId: string, name: string) {
    if (!window.confirm(`Retirer le lien Telegram de ${name} ?`)) return;
    await api.delete(`/telegram/admin/links/${userId}`).catch(() => undefined);
    load();
  }

  const s = ov.status;
  const field = { display: 'grid', gap: 4 } as const;

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 860 }}>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div className="panel-title" style={{ margin: 0, padding: 0, border: 0 }}><span className="title-icon"><TelegramLogo size={18} /></span>Telegram</div>
          <Link className="secondary dd-link" to={GUIDE}>📖 Guide complet : mise en place et dépannage</Link>
        </div>
        <p style={{ margin: '10px 0 0' }}>
          État : {s.connected ? <strong style={{ color: 'var(--success)' }}>● connecté{ov.botUsername ? ` (@${ov.botUsername})` : ''}</strong> : <strong style={{ color: 'var(--danger)' }}>● non connecté</strong>}
          {cfg.enabled ? '' : ' — désactivé'}
          {s.lastError && <span style={{ color: 'var(--danger)' }}> · {s.lastError}</span>}
        </p>
        <p style={{ margin: '6px 0 0' }}>
          Pont avec le chat : {ov.bridge?.active
            ? <strong style={{ color: 'var(--success)' }}>● actif — seul le canal « {ov.bridge.channelName} » est relayé vers le groupe Telegram</strong>
            : <><strong style={{ color: 'var(--danger)' }}>○ inactif</strong>{ov.bridge?.issue && <span> — {ov.bridge.issue}</span>}</>}
        </p>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          {s.relayedIn} message{s.relayedIn > 1 ? 's' : ''} vers le site · {s.relayedOut} vers Telegram · {s.updatesReceived} événement{s.updatesReceived > 1 ? 's' : ''} reçu{s.updatesReceived > 1 ? 's' : ''} de Telegram{s.lastUpdateAt ? ` (dernier à ${new Date(s.lastUpdateAt).toLocaleTimeString('fr-FR')})` : ''}
          {s.recent.length > 0 && ` · ${s.recent.join(' ; ')}`}
        </p>
      </div>

      <div className="panel grid" style={{ gap: 12 }}>
        <div className="panel-title"><span className="title-icon">1️⃣</span>Le robot</div>
        <label style={field}>Jeton du robot {ov.hasToken && <span className="muted">(enregistré, chiffré — laisse vide pour le garder)</span>}
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={ov.hasToken ? '••••••••••••••••••' : '123456789:AAH…'} />
        </label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.enabled} onChange={(e) => up('enabled', e.target.checked)} /> Telegram activé</label>
        <label style={field}>Lien d'invitation du groupe
          <input value={cfg.inviteUrl} onChange={(e) => up('inviteUrl', e.target.value)} placeholder="https://t.me/+AbCdEf…" />
        </label>
      </div>

      <div className="panel grid" style={{ gap: 12 }}>
        <div className="panel-title"><span className="title-icon">2️⃣</span>Groupe et pont avec le chat</div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label style={{ ...field, flex: '1 1 260px' }}>Groupe détecté
            <select value={cfg.chatId} onChange={(e) => up('chatId', e.target.value)}>
              <option value="">— choisir —</option>
              {ov.seenChats.map((c) => <option key={c.id} value={c.id}>{c.title || c.id} ({c.id})</option>)}
              {cfg.chatId && !ov.seenChats.some((c) => c.id === cfg.chatId) && <option value={cfg.chatId}>{cfg.chatId}</option>}
            </select>
          </label>
          <label style={{ ...field, flex: '1 1 220px' }}>ou identifiant <span className="muted">(<code>/id</code> dans le groupe)</span>
            <input value={cfg.chatId} onChange={(e) => up('chatId', e.target.value.trim())} placeholder="-1001234567890" />
          </label>
        </div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.bridge} onChange={(e) => up('bridge', e.target.checked)} /> Relier le groupe à un canal de la messagerie (messages dans les deux sens)</label>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select style={{ flex: 1, minWidth: 200 }} value={cfg.bridgeChannelId ?? ''} onChange={(e) => up('bridgeChannelId', e.target.value || null)}>
            <option value="">— canal de la messagerie —</option>
            {ov.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" className="secondary" onClick={createChannel} disabled={busy}>Créer le canal « Telegram »</button>
        </div>
      </div>

      <div className="panel grid" style={{ gap: 10 }}>
        <div className="panel-title"><span className="title-icon">3️⃣</span>Annonces automatiques</div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.announceNews} onChange={(e) => up('announceNews', e.target.checked)} /> Nouvelles du site</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.announceFreeleech} onChange={(e) => up('announceFreeleech', e.target.checked)} /> Début d'un freeleech global</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.announceTorrents} onChange={(e) => up('announceTorrents', e.target.checked)} /> Nouveaux torrents approuvés (jamais l'adulte)</label>
        <label style={field}>Destination des annonces <span className="muted">(facultatif : vide = le groupe)</span>
          <input value={cfg.announceChatId} onChange={(e) => up('announceChatId', e.target.value)} placeholder="identifiant d'un autre groupe ou canal" />
        </label>
      </div>

      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={busy}>Enregistrer</button>
        <button type="button" className="secondary" onClick={test} disabled={busy}>Tester la connexion</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>

      <div className="panel">
        <div className="panel-title"><span className="title-icon">🔗</span>Comptes liés ({ov.links.length})</div>
        {ov.links.length === 0 ? <p className="muted">Aucun membre n'a encore lié son compte.</p> : (
          <table>
            <thead><tr><th>Membre</th><th>Telegram</th><th>Depuis</th><th /></tr></thead>
            <tbody>
              {ov.links.map((l) => (
                <tr key={l.userId}>
                  <td><Link to={`/users/${l.userId}`}>{l.username}</Link></td>
                  <td>{l.tgUsername ? <a href={`https://t.me/${l.tgUsername}`} target="_blank" rel="noopener noreferrer">@{l.tgUsername}</a> : <span className="muted">—</span>}</td>
                  <td className="muted">{new Date(l.since).toLocaleDateString('fr-FR')}</td>
                  <td><button type="button" className="secondary" onClick={() => removeLink(l.userId, l.username)}>Retirer</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
