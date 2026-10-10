import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

interface Config {
  enabled: boolean; inviteUrl: string; chatId: string; bridge: boolean; bridgeChannelId: string | null;
  announceNews: boolean; announceFreeleech: boolean; announceTorrents: boolean; announceChatId: string;
}
interface Overview {
  config: Config; hasToken: boolean; botUsername: string | null;
  status: { connected: boolean; lastPollAt: string | null; lastError: string | null; lastSendAt: string | null; relayedIn: number; relayedOut: number };
  seenChats: { id: string; title: string; type: string; at: string }[];
  channels: { id: string; name: string | null }[];
  links: { userId: string; username: string; tgUsername: string | null; since: string }[];
}

const errorOf = (e: any) => e?.response?.data?.message ?? 'Une erreur est survenue';

/** Admin > Telegram : jeton du robot, groupe, pont avec un canal de la messagerie et annonces automatiques. */
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
      else flash(`✓ Robot ${data.bot} connecté${data.sent ? ` — message d'essai envoyé dans « ${data.chat} »` : ' (aucun groupe choisi : pas de message d\'essai)'}`);
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
        <div className="panel-title"><span className="title-icon">✈️</span>Telegram</div>
        <p className="muted" style={{ marginTop: 0 }}>
          Un robot Telegram relie le groupe au chat du site et annonce les nouvelles, les freeleech et (en option) les nouveaux torrents.
          Le site interroge Telegram lui-même : rien à ouvrir sur le NAS, seulement l'accès sortant vers api.telegram.org.
        </p>
        <p style={{ margin: 0 }}>
          État : {s.connected ? <strong style={{ color: 'var(--success)' }}>● connecté{ov.botUsername ? ` (@${ov.botUsername})` : ''}</strong> : <strong style={{ color: 'var(--danger)' }}>● non connecté</strong>}
          {cfg.enabled ? '' : ' — désactivé'}
          {s.lastError && <span style={{ color: 'var(--danger)' }}> · {s.lastError}</span>}
        </p>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Messages recopiés depuis le dernier démarrage : {s.relayedIn} vers le site, {s.relayedOut} vers Telegram.</p>
      </div>

      <div className="panel grid" style={{ gap: 12 }}>
        <div className="panel-title"><span className="title-icon">1️⃣</span>Le robot</div>
        <details>
          <summary>Comment créer le robot et le groupe (2 minutes)</summary>
          <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
            <li>Sur Telegram, écris à <strong>@BotFather</strong>, envoie <code>/newbot</code>, choisis un nom puis un identifiant se terminant par « bot ». Copie le <strong>jeton</strong> qu'il te donne.</li>
            <li>Toujours avec @BotFather : <code>/setprivacy</code> → ton robot → <strong>Disable</strong> (ou ajoute le robot comme administrateur du groupe) pour qu'il voie tous les messages du groupe.</li>
            <li>Crée ton groupe Telegram (privé), ajoute le robot, puis nomme-le <strong>administrateur</strong> (il doit pouvoir écrire et supprimer des messages).</li>
            <li>Colle le jeton ci-dessous, enregistre, puis écris un message dans le groupe : il apparaît dans « Groupe Telegram ».</li>
            <li>Copie le lien d'invitation du groupe (Telegram → groupe → Inviter par lien) : active « Demander l'approbation des administrateurs » si tu veux valider chaque entrée.</li>
          </ol>
        </details>
        <label style={field}>Jeton du robot {ov.hasToken && <span className="muted">(enregistré, chiffré — laisse vide pour le garder)</span>}
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={ov.hasToken ? '••••••••••••••••••' : '123456789:AAH…'} />
        </label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.enabled} onChange={(e) => up('enabled', e.target.checked)} /> Telegram activé (page « Telegram » pour les membres, relais et annonces)</label>
        <label style={field}>Lien d'invitation du groupe (montré aux membres connectés seulement)
          <input value={cfg.inviteUrl} onChange={(e) => up('inviteUrl', e.target.value)} placeholder="https://t.me/+AbCdEf…" />
        </label>
      </div>

      <div className="panel grid" style={{ gap: 12 }}>
        <div className="panel-title"><span className="title-icon">2️⃣</span>Groupe et pont avec le chat</div>
        <label style={field}>Groupe Telegram
          <select value={cfg.chatId} onChange={(e) => up('chatId', e.target.value)}>
            <option value="">— choisir —</option>
            {ov.seenChats.map((c) => <option key={c.id} value={c.id}>{c.title || c.id} ({c.id})</option>)}
            {cfg.chatId && !ov.seenChats.some((c) => c.id === cfg.chatId) && <option value={cfg.chatId}>{cfg.chatId}</option>}
          </select>
          <span className="muted" style={{ fontSize: 12 }}>La liste montre les groupes où le robot a vu un message. Aucun ? Écris un message dans le groupe (le jeton doit être enregistré).</span>
        </label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.bridge} onChange={(e) => up('bridge', e.target.checked)} /> Relier le groupe à un canal de la messagerie (échange des messages dans les deux sens)</label>
        <label style={field}>Canal de la messagerie
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <select style={{ flex: 1, minWidth: 200 }} value={cfg.bridgeChannelId ?? ''} onChange={(e) => up('bridgeChannelId', e.target.value || null)}>
              <option value="">— choisir —</option>
              {ov.channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" className="secondary" onClick={createChannel} disabled={busy}>Créer le canal « Telegram »</button>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>Seuls les canaux ouverts à tous peuvent être reliés (ni Support, ni canaux réservés). Tout ce qui est écrit dans ce canal part vers Telegram : prévois-le comme canal dédié.</span>
        </label>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Seuls les membres qui ont <strong>lié leur compte</strong> (page « Telegram », code à usage unique) sont recopiés sur le site, sous leur vrai pseudo et avec leurs vrais droits (mode lent, bannissement…). Les autres peuvent lire et écrire sur Telegram, sans être transmis.
          Les torrents adultes ne sont jamais détaillés sur Telegram.
        </p>
      </div>

      <div className="panel grid" style={{ gap: 10 }}>
        <div className="panel-title"><span className="title-icon">3️⃣</span>Annonces automatiques</div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.announceNews} onChange={(e) => up('announceNews', e.target.checked)} /> Nouvelles du site</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.announceFreeleech} onChange={(e) => up('announceFreeleech', e.target.checked)} /> Début d'un freeleech global (programmé ou récompense du pot commun)</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.announceTorrents} onChange={(e) => up('announceTorrents', e.target.checked)} /> Nouveaux torrents approuvés (jamais les catégories adultes)</label>
        <label style={field}>Destination des annonces (facultatif)
          <input value={cfg.announceChatId} onChange={(e) => up('announceChatId', e.target.value)} placeholder="vide = le groupe ci-dessus ; sinon l'identifiant d'un autre groupe ou canal où le robot est administrateur" />
        </label>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>Activer une annonce ne rejoue pas l'historique : elle commence à partir de maintenant.</p>
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
                  <td>{l.username}</td>
                  <td>{l.tgUsername ? `@${l.tgUsername}` : <span className="muted">—</span>}</td>
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
