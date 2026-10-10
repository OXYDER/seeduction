import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

interface Info {
  enabled: boolean;
  inviteUrl?: string | null;
  botUsername?: string | null;
  bridge?: boolean;
  channel?: { id: string; name: string | null } | null;
  announce?: { news: boolean; freeleech: boolean; torrents: boolean };
  linked?: { username: string | null; since: string } | null;
}
interface LinkCode { code: string; expiresAt: string; botUsername: string | null }

const errorOf = (e: any) => e?.response?.data?.message ?? 'Une erreur est survenue';

/** Page « Telegram » du compte : rejoindre le groupe, relier son compte (code à usage unique) et savoir ce qui est relayé. */
export default function Telegram() {
  const [info, setInfo] = useState<Info | null>(null);
  const [code, setCode] = useState<LinkCode | null>(null);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<LinkCode | null>(null);
  codeRef.current = code;

  const load = useCallback(() => api.get('/telegram/info').then((r) => setInfo(r.data)).catch(() => setInfo({ enabled: false })), []);
  useEffect(() => { load(); }, [load]);

  // Tant qu'un code est affiché : on vérifie toutes les 3 s si le robot l'a reçu, et on décompte sa validité.
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => {
      setLeft(Math.max(0, Math.round((new Date(code.expiresAt).getTime() - Date.now()) / 1000)));
      if (Date.now() % 3000 < 1000) load();
    }, 1000);
    return () => clearInterval(t);
  }, [code, load]);
  useEffect(() => { if (info?.linked) setCode(null); }, [info?.linked]);

  async function makeCode() {
    setErr(''); setBusy(true);
    try { const { data } = await api.post('/telegram/link-code'); setCode(data); setLeft(900); }
    catch (e) { setErr(errorOf(e)); }
    finally { setBusy(false); }
  }
  async function unlink() {
    if (!window.confirm('Retirer le lien avec ton compte Telegram ? Tes messages du groupe ne seront plus transmis à Seeduction.')) return;
    await api.delete('/telegram/link').catch(() => undefined);
    await load();
  }

  if (!info) return <p className="muted">Chargement...</p>;
  if (!info.enabled) {
    return (
      <div className="panel">
        <div className="panel-title"><span className="title-icon">✈️</span>Telegram</div>
        <p className="muted">Le groupe Telegram de Seeduction n'est pas ouvert pour l'instant.</p>
      </div>
    );
  }

  const bot = info.botUsername;
  const deep = code && bot ? `https://t.me/${bot}?start=${code.code}` : null;

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 820 }}>
      <h1>✈️ Telegram</h1>
      <p className="muted" style={{ margin: 0 }}>
        Discute avec les autres membres sur Telegram. Tu peux aussi relier ton compte : tes messages du groupe apparaissent alors dans le canal « {info.channel?.name ?? 'Telegram'} » de la messagerie, sous ton pseudo Seeduction.
      </p>

      <div className="panel">
        <div className="panel-title"><span className="title-icon">1️⃣</span>Rejoindre le groupe</div>
        {info.inviteUrl
          ? <><p className="muted">Le groupe est privé : le lien ci-dessous est réservé aux membres de Seeduction. Ne le partage pas.</p>
              <a className="tg-btn" href={info.inviteUrl} target="_blank" rel="noopener noreferrer">✈️ Rejoindre sur Telegram</a></>
          : <p className="muted">Le lien d'invitation n'a pas encore été publié par l'équipe.</p>}
      </div>

      {info.bridge && (
        <div className="panel">
          <div className="panel-title"><span className="title-icon">2️⃣</span>Relier mon compte (facultatif)</div>
          {info.linked ? (
            <div className="grid" style={{ gap: 8 }}>
              <p style={{ margin: 0 }}>✅ Compte lié{info.linked.username ? <> à <strong>@{info.linked.username}</strong></> : null}. Tes messages écrits dans le groupe arrivent dans la messagerie du site, et inversement.</p>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {info.channel && <Link className="secondary dd-link" to={`/chat?c=${info.channel.id}`}>💬 Ouvrir le canal « {info.channel.name} »</Link>}
                <button type="button" className="secondary" onClick={unlink}>Retirer le lien</button>
              </div>
            </div>
          ) : (
            <div className="grid" style={{ gap: 10 }}>
              <p className="muted" style={{ margin: 0 }}>
                Sans lien, tu peux lire et écrire sur Telegram, mais tes messages ne sont pas transmis à Seeduction (et le robot ne te connaît pas). Avec le lien, ton pseudo Seeduction est montré sur Telegram quand tu écris dans le canal du site.
              </p>
              {!code && <div><button type="button" onClick={makeCode} disabled={busy}>Générer mon code</button></div>}
              {code && (
                <div className="grid" style={{ gap: 8 }}>
                  <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <code style={{ fontSize: 22, letterSpacing: 3, padding: '6px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: 6 }}>{code.code}</code>
                    <span className="muted">{left > 0 ? `valable encore ${Math.floor(left / 60)} min ${String(left % 60).padStart(2, '0')} s` : 'expiré : génère-en un nouveau'}</span>
                  </div>
                  {deep && left > 0 && <div><a className="tg-btn" href={deep} target="_blank" rel="noopener noreferrer">✈️ Ouvrir Telegram et lier</a></div>}
                  <p className="muted" style={{ margin: 0 }}>
                    Ou envoie-le toi-même en message privé au robot{bot ? <> <strong>@{bot}</strong></> : null} : <code>/lier {code.code}</code>
                  </p>
                  <div><button type="button" className="secondary" onClick={makeCode} disabled={busy}>Nouveau code</button></div>
                </div>
              )}
            </div>
          )}
          {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        </div>
      )}

      <div className="panel">
        <div className="panel-title"><span className="title-icon">ℹ️</span>Ce qui est relayé</div>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          {info.bridge && <li>Le canal « {info.channel?.name} » de la messagerie et le groupe Telegram échangent leurs messages (texte, images, réponses, modifications, suppressions). Les fichiers et vocaux ne sont pas copiés.</li>}
          {info.announce?.news && <li>Les nouvelles du site sont annoncées dans le groupe.</li>}
          {info.announce?.freeleech && <li>Chaque freeleech global est annoncé au moment où il commence.</li>}
          {info.announce?.torrents && <li>Les nouveaux torrents sont annoncés (jamais le contenu adulte).</li>}
          <li>Le contenu adulte n'est jamais détaillé sur Telegram.</li>
        </ul>
        <p style={{ margin: '10px 0 0' }}><Link to="/wiki/guide-telegram">📖 Guide Telegram pas à pas</Link></p>
      </div>
    </div>
  );
}
