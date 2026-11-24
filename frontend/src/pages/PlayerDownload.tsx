import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import QrCode from '../components/QrCode';

// Même principe pour Android : l'APK (environ 57 Mo) est ajouté à la release GitHub, sous ce nom (voir android-player/README.md).
const ANDROID_URL = 'https://github.com/OXYDER/seeduction/releases/download/android-player-v0.1.0/Seeduction.Player.apk';
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

interface Release { version: string; size: number; publishedAt: string; notes: string | null; url: string }

/** Version, taille et date d'un installateur publié, avec les nouveautés si l'équipe en a indiqué. */
function Meta({ r }: { r: Release | undefined }) {
  if (!r) return <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>Version publiée sur GitHub (le site n'héberge pas encore cet installateur).</p>;
  return (
    <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
      Version <strong>{r.version}</strong> · {formatBytes(r.size)} · publiée le {new Date(r.publishedAt).toLocaleDateString('fr-CA')}
      {r.notes ? <><br />{r.notes}</> : null}
    </p>
  );
}

interface VodStatus { eligible: boolean; label: string | null; rule: string }

/** « Seeduction Cinéma » : catalogue vidéo de l'application Android, réservé aux donateurs, fondateurs et uploaders. Le code (ou le lien) associe l'application sans jamais lui donner le mot de passe. */
function VodPanel() {
  const [st, setSt] = useState<VodStatus | null>(null);
  const [pair, setPair] = useState<{ code: string; link: string; until: number } | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [tvCode, setTvCode] = useState('');
  const [tvMsg, setTvMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { api.get('/vod/status').then((r) => setSt(r.data)).catch(() => setSt(null)); }, []);
  useEffect(() => {
    if (!pair) return;
    const t = setInterval(() => { const s = Math.max(0, Math.round((pair.until - Date.now()) / 1000)); setLeft(s); if (s === 0) setPair(null); }, 1000);
    return () => clearInterval(t);
  }, [pair]);
  if (!st) return null;
  const generate = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.post('/vod/pair');
      setPair({ code: r.data.code, link: r.data.link, until: Date.now() + (r.data.expiresInSeconds ?? 300) * 1000 });
      setLeft(r.data.expiresInSeconds ?? 300);
    } catch (e: any) { setErr(e?.response?.data?.message ?? 'Impossible de générer le code.'); }
    finally { setBusy(false); }
  };
  const connectTv = async (e: React.FormEvent) => {
    e.preventDefault();
    setTvMsg(null);
    try {
      await api.post('/vod/device/approve', { code: tvCode });
      setTvMsg({ ok: true, text: 'Télé connectée : elle ouvre le catalogue dans quelques secondes.' });
      setTvCode('');
    } catch (err: any) { setTvMsg({ ok: false, text: err?.response?.data?.message ?? 'Code refusé.' }); }
  };
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <div className="panel ornate" style={{ textAlign: 'center' }}>
      <h3 style={{ margin: '0 0 4px' }}>🔑 Se connecter à l'application</h3>
      <p className="muted" style={{ margin: '0 0 14px' }}>
        Dans l'application, connecte-toi avec ton <strong>identifiant (ou courriel) et ton mot de passe</strong>. Tu peux aussi utiliser un code : touche « Connecter l'application » ci-dessous. Ce que tu regardes n'est <strong>pas compté dans ton ratio</strong> : seuls ceux qui seedent comptent.
      </p>
      {!st.eligible ? (
        <p className="muted" style={{ margin: 0 }}>🔒 {st.rule} Pour y accéder, <a href="/soutenir">soutiens le site</a> ou deviens uploader.</p>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13 }}>✅ Accès ouvert ({st.label}).</p>
          {!pair ? (
            <button type="button" className="download-btn" disabled={busy} onClick={generate}>{busy ? '…' : "Connecter l'application"}</button>
          ) : (
            <div className="grid" style={{ gap: 10, justifyItems: 'center' }}>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '0.18em', fontFamily: 'ui-monospace, monospace' }}>{pair.code}</div>
              <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="secondary" onClick={() => { navigator.clipboard?.writeText(pair.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => undefined); }}>{copied ? 'Copié ✓' : 'Copier le code'}</button>
                <a className="download-btn" href={pair.link} style={{ textDecoration: 'none', display: 'inline-block' }}>Ouvrir dans l'application</a>
              </div>
              <QrCode value={pair.link} size={150} label="QR code d'association de l'application" />
              <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
                Sur ton téléphone, ouvre l'application et saisis ce code (ou touche « Ouvrir dans l'application », ou scanne le QR code). Valable encore <strong>{mm}</strong>, une seule fois.
              </p>
            </div>
          )}
          {err && <p style={{ color: 'var(--danger, #f87171)', margin: '10px 0 0', fontSize: 13 }}>{err}</p>}
          <form onSubmit={connectTv} style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--line, rgba(255,255,255,.1))', display: 'grid', gap: 8, justifyItems: 'center' }}>
            <strong>Connecter une télé ou une box</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>Ouvre l'application sur la télé : un code s'affiche. Saisis-le ici, rien à taper à la télécommande.</span>
            <div className="row" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <input id="tv-code" value={tvCode} onChange={(e) => setTvCode(e.target.value.toUpperCase())} maxLength={9} placeholder="Code de la télé" aria-label="Code affiché sur la télé" autoComplete="off" style={{ width: 170, textAlign: 'center', letterSpacing: '0.12em', fontFamily: 'ui-monospace, monospace' }} />
              <button type="submit" className="secondary" disabled={tvCode.replace(/[^A-Z0-9]/g, '').length < 8}>Connecter</button>
            </div>
            {tvMsg && <span style={{ fontSize: 13, color: tvMsg.ok ? 'var(--ok, #34d399)' : 'var(--danger, #f87171)' }}>{tvMsg.text}</span>}
          </form>
        </>
      )}
    </div>
  );
}

export default function PlayerDownload() {
  const [rel, setRel] = useState<{ android?: Release }>({});
  useEffect(() => { api.get('/downloads/players').then((r) => setRel(r.data)).catch(() => undefined); }, []);
  const andUrl = rel.android?.url ?? ANDROID_URL;
  return (
    <div className="grid page-narrow" style={{ gap: 18 }}>
      <div>
        <h1 style={{ marginBottom: 4 }}>📺 L'application Seeduction</h1>
        <p className="muted" style={{ margin: 0 }}>
          Tous les films et séries de Seeduction, façon Netflix : une affiche, un clic, ça se lit. Sur téléphone, tablette ou télé et box Android, sans client BitTorrent à configurer.
          Réservée aux donateurs, aux membres fondateurs et aux uploaders.
        </p>
      </div>

      <div className="panel ornate" style={{ textAlign: 'center', ...(isAndroid ? { order: -1 } : {}) }}>
        <img loading="lazy" decoding="async" src="/logo-icon.png" alt="" width={72} height={72} style={{ marginBottom: 10 }} />
        <h3 style={{ margin: '0 0 4px' }}>Seeduction pour Android</h3>
        <p className="muted" style={{ margin: '0 0 16px' }}>
          Un seul fichier pour téléphone, tablette, télé et box Android (le lecteur est intégré : tous les formats, langues audio, sous-titres, reprise, épisode suivant).
        </p>
        <Meta r={rel.android} />
        <a href={andUrl} className="download-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
          ⬇ Télécharger l'application (.apk)
        </a>
        <div className="muted" style={{ fontSize: 13, marginTop: 12, textAlign: 'left', lineHeight: 1.7 }}>
          <strong>Installer (une seule fois) :</strong><br />
          1. Télécharge le fichier, puis ouvre-le depuis les notifications ou le dossier Téléchargements.<br />
          2. Android demande d'autoriser l'installation depuis ce navigateur (« Sources inconnues ») : accepte, l'application n'est pas sur le Play Store.<br />
          3. Si Play Protect avertit, choisis « Installer quand même ».<br />
          4. Ouvre Seeduction et connecte-toi avec ton identifiant (ou courriel) et ton mot de passe.<br />
          <strong>Sur une télé ou une box :</strong> ouvre l'application, scanne le QR code avec ton téléphone (ou va sur <a href="/tv">seeduction.org/tv</a> et saisis le code affiché) : rien à taper à la télécommande.
          Si la box refuse l'installation, c'est souvent qu'elle est en 32 bits : demande la version 32 bits à l'équipe.
        </div>
      </div>

      <VodPanel />
    </div>
  );
}
