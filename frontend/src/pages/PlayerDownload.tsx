import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useVodStatus } from '../lib/vodLive';
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

const FEATURES: { ic: string; t: string; d: string; hot?: boolean }[] = [
  { ic: '🚫', t: 'Zéro ratio pour toi', d: "Ce que tu regardes n'est jamais compté dans ton ratio. Ni minimum à respecter, ni « hit & run » : tu regardes, c'est tout.", hot: true },
  { ic: '⚡', t: 'Lecture instantanée', d: "Une affiche, un clic : ça démarre pendant le chargement. Un voyant te dit d'avance si le titre est rapide ou lent à démarrer.", hot: true },
  { ic: '🎬', t: 'Un vrai catalogue de cinéma', d: 'Accueil façon Netflix, Top 10, nouveautés, sagas complètes dans l\'ordre de sortie, genres, A à Z, recherche : tout le catalogue du site, rangé pour la télé.' },
  { ic: '🎞️', t: 'Un lecteur de cinéma', d: 'Langues audio, sous-titres avec décalage, vitesse, format de l\'image, luminosité et volume au glissement, avance de 10 s, reprise exacte et épisode suivant automatique.' },
  { ic: '🎭', t: 'Casting et bandes-annonces', d: 'Chaque fiche : synopsis, distribution avec photos, réalisateurs, studios, bande-annonce. Touche un acteur : tous ses films disponibles.' },
  { ic: '⭐', t: 'Les notes des membres', d: 'Donne de 1 à 5 étoiles à ce que tu vois. Les titres les mieux notés par la communauté ont leur propre rangée « Aimés par les membres ».' },
  { ic: '📺', t: 'Télé et box Android', d: 'Un mode TV pensé pour la télécommande, et une connexion sans clavier : scanne le QR code avec ton téléphone, c\'est branché.' },
  { ic: '🎛️', t: 'Télécommande sur le site', d: 'Mes appareils : vois en direct ce qui joue et sur quel appareil, mets en pause, saute dans le film, ou lance un titre à distance.' },
  { ic: '🔁', t: 'Reprise partout', d: 'Commence sur le téléphone dans l\'autobus, finis sur la télé au salon : ta progression te suit sur tous tes appareils.' },
  { ic: '👨‍👩‍👧', t: 'Profils famille', d: 'Les profils de ton compte famille et leurs réglages (contenu adulte, PIN) sont respectés dans l\'application.' },
  { ic: '📊', t: 'Tes statistiques', d: 'Heures regardées, jour par jour, genres et titres préférés, appareils les plus utilisés : un tableau de bord rien qu\'à toi.' },
  { ic: '🔒', t: 'Chez nous, pas ailleurs', d: 'Aucune pub, aucun abonnement tiers, aucun pistage : ce sont les seeders de la communauté qui font vivre le catalogue.' },
];

const FAQ: [string, string][] = [
  ['Qui peut utiliser l\'application ?', "Les donateurs (tant que leur soutien est actif), les membres fondateurs, les uploaders et l'équipe. Si un don arrive à terme, l'accès se ferme tout seul, et se rouvre dès le prochain don : tes notes et ta progression sont gardées."],
  ['Est-ce que ça touche à mon ratio ?', "Non. Ton téléchargement dans l'application n'est pas compté, ne crée aucune obligation de partage et n'apparaît pas dans « Mon activité ». Seul l'envoi (le partage) compte, et il compte en ta faveur."],
  ['Sur quels appareils ?', "Téléphones et tablettes Android, télévisions et box Android (mode TV avec télécommande). Sur une box 32 bits, il faut la version 32 bits : demande-la à l'équipe si l'installation est refusée."],
  ['Pourquoi des fichiers restent sur mon appareil ?', "L'application partage en arrière-plan ce qu'elle a téléchargé (en Wi-Fi seulement par défaut) : c'est ce qui permet aux autres membres de regarder à leur tour. Tu peux tout arrêter ou supprimer depuis Paramètres > Mes téléchargements."],
  ['Et si le film est lent à démarrer ?', "La disponibilité d'un titre, c'est son nombre de seeders : ⚡ rapide à partir de 5, correct de 2 à 4, lent avec un seul. Seeder tes propres torrents aide tout le monde, toi compris."],
  ['Puis-je utiliser VLC ou MX Player ?', "Oui : Paramètres > Lecteur externe. Le lecteur intégré reste conseillé : il garde ta progression et ton statut « en train de regarder »."],
];

function Phone({ covers }: { covers: string[] }) {
  const c = covers.length ? covers : [];
  return (
    <div className="sc-phone" aria-hidden>
      <div className="sc-screen">
        <div className="hero" style={c[0] ? { backgroundImage: `url(${c[0]})` } : undefined}>
          <div className="tt"><b>À l'affiche ce soir</b><span style={{ fontSize: 11, color: '#cfd6e4' }}>2025 · Thriller · ⭐ 4,5</span><span className="btn">▶ Lecture</span></div>
        </div>
        <div>
          <div className="lbl">TOP 10 EN CE MOMENT</div>
          <div className="rail">{c.slice(1, 5).map((u) => <img key={u} src={u} alt="" loading="lazy" />)}</div>
        </div>
        <div className="tabs"><b>Accueil</b><span>Films</span><span>Séries</span><span>Recherche</span></div>
      </div>
    </div>
  );
}

/** « L'application Seeduction » : la page de présentation (et de promotion), l'installation et la connexion. */
export default function PlayerDownload() {
  const [rel, setRel] = useState<{ android?: Release }>({});
  const st = useVodStatus();
  useEffect(() => { api.get('/downloads/players').then((r) => setRel(r.data)).catch(() => undefined); }, []);
  const andUrl = rel.android?.url ?? ANDROID_URL;
  const promo = st?.promo ?? null;
  const covers = promo?.covers ?? [];
  const eligible = !!st?.eligible;
  const titles = promo ? promo.movies + promo.series : 0;
  const rows = [covers.filter((_, i) => i % 3 === 0), covers.filter((_, i) => i % 3 === 1), covers.filter((_, i) => i % 3 === 2)].filter((r) => r.length > 0);
  const n = (v: number) => v.toLocaleString('fr-CA');
  return (
    <div className="showcase page-narrow">
      <header className="sc-hero">
        <div className="sc-wall" aria-hidden>{rows.map((r, i) => <div className="row" key={i}>{[...r, ...r, ...r, ...r].map((u, j) => <img key={`${u}-${j}`} src={u} alt="" loading="lazy" decoding="async" />)}</div>)}</div>
        <div className="sc-hero-in">
          <div className="sc-kicker">Application Seeduction · Android, télé et box</div>
          <h1>Ton cinéma privé. <em>Sans ratio.</em> Sur toutes tes télés.</h1>
          <p>Les films et les séries de Seeduction, rangés comme sur les grandes plateformes : une affiche, un clic, ça se lit. Pas de client BitTorrent à régler, pas de ratio à surveiller, pas de pub.</p>
          <div className="sc-cta">
            {eligible
              ? <a href="#installer" className="download-btn big">⬇ Installer l'application</a>
              : <Link to="/soutenir" className="download-btn big">❤️ Débloquer l'application</Link>}
            <a href="#comment" className="ghost">Voir comment ça marche</a>
          </div>
          {promo && titles > 0 && (
            <div className="sc-stats">
              <div><b>{n(promo.movies)}</b><span>films</span></div>
              <div><b>{n(promo.series)}</b><span>séries</span></div>
              {promo.fresh > 0 && <div><b>+{n(promo.fresh)}</b><span>cette semaine</span></div>}
              {promo.hoursWeek > 0 && <div><b>{n(promo.hoursWeek)} h</b><span>regardées cette semaine</span></div>}
              {promo.watchingNow > 0 && <div><b>{promo.watchingNow}</b><span>en lecture à l'instant</span></div>}
            </div>
          )}
        </div>
      </header>

      <section className="sc-sec">
        <h2>Tout ce que les grandes plateformes ont. Plus ce qu'elles n'ont pas.</h2>
        <p>Une application pensée de A à Z pour regarder : rapide, belle, simple à la télécommande, et libérée de la contrainte du ratio.</p>
        <div className="sc-feats">{FEATURES.map((f) => <article key={f.t} className={`sc-feat${f.hot ? ' hot' : ''}`}><span className="ic" aria-hidden>{f.ic}</span><h3>{f.t}</h3><p>{f.d}</p></article>)}</div>
      </section>

      <section className="sc-sec sc-split">
        <div>
          <h2>Regarder doit être simple.</h2>
          <p style={{ color: 'var(--text-dim)', margin: '0 0 16px', lineHeight: 1.55 }}>Tu ouvres l'application, tu es sur ton accueil. Pas de menus de configuration, pas de fichier à choisir : l'application s'occupe du reste.</p>
          <ul className="sc-checks">
            <li><span><strong>Connexion en 10 secondes</strong> : identifiant et mot de passe, ou un QR code à scanner avec ton téléphone pour la télé.</span></li>
            <li><span><strong>Affiches qui défilent, Top 10, nouveautés</strong>, rangées par genres et sagas : il y a toujours quelque chose à lancer.</span></li>
            <li><span><strong>La reprise là où tu t'es arrêté</strong>, sur n'importe quel appareil, et l'épisode suivant qui démarre tout seul.</span></li>
            <li><span><strong>Télécommande complète sur la télé</strong> : flèches, OK, touches multimédia, un anneau doré montre toujours où tu es.</span></li>
          </ul>
        </div>
        <Phone covers={covers} />
      </section>

      <section className="sc-sec" id="comment">
        <h2>Comment ça marche</h2>
        <p>Quatre étapes, cinq minutes.</p>
        <div className="sc-steps">
          <div className="sc-step"><h3>Soutiens Seeduction</h3><p>Un don (même modeste) ouvre l'application tant que ton soutien est actif. Les fondateurs et les uploaders y ont droit d'office.</p></div>
          <div className="sc-step"><h3>Installe l'application</h3><p>Un seul fichier pour téléphone, tablette, télé et box Android. Tu l'installes une fois, les mises à jour se proposent toutes seules.</p></div>
          <div className="sc-step"><h3>Connecte-toi</h3><p>Identifiant et mot de passe, ou le QR code de la télé scanné avec ton téléphone. Double authentification et profils famille compris.</p></div>
          <div className="sc-step"><h3>Regarde</h3><p>Choisis une affiche. Pendant que tu regardes, l'application partage : c'est ce qui fait vivre le catalogue pour tout le monde.</p></div>
        </div>
      </section>

      <section className="sc-sec sc-split">
        <Phone covers={covers.slice(5)} />
        <div>
          <h2>Pourquoi sans ratio ?</h2>
          <p style={{ color: 'var(--text-dim)', margin: '0 0 16px', lineHeight: 1.55 }}>Sur Seeduction, la vraie richesse, ce sont ceux qui seedent. L'application renverse la logique : le spectateur n'a rien à gérer, et ceux qui partagent restent récompensés comme d'habitude.</p>
          <ul className="sc-checks">
            <li><span>Ton téléchargement dans l'application <strong>n'est pas compté</strong>, ne crée pas d'obligation de partage et reste invisible sur le site.</span></li>
            <li><span>Le partage de l'application <strong>compte normalement en ta faveur</strong> (envoi, points, classements).</span></li>
            <li><span>La disponibilité d'un titre, c'est son nombre de seeders : plus on seede, mieux ça démarre pour tout le monde.</span></li>
          </ul>
        </div>
      </section>

      {eligible ? (
        <section className="sc-sec" id="installer" style={{ display: 'grid', gap: 18 }}>
          <h2>Installer l'application</h2>
          <div className="panel ornate" style={{ textAlign: 'center', ...(isAndroid ? { order: -1 } : {}) }}>
            <img loading="lazy" decoding="async" src="/logo-icon.png" alt="" width={72} height={72} style={{ marginBottom: 10 }} />
            <h3 style={{ margin: '0 0 4px' }}>Seeduction pour Android</h3>
            <p className="muted" style={{ margin: '0 0 16px' }}>Un seul fichier pour téléphone, tablette, télé et box Android (le lecteur est intégré : tous les formats, langues audio, sous-titres, reprise, épisode suivant).</p>
            <Meta r={rel.android} />
            <a href={andUrl} className="download-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>⬇ Télécharger l'application (.apk)</a>
            <div className="muted" style={{ fontSize: 13, marginTop: 12, textAlign: 'left', lineHeight: 1.7 }}>
              <strong>Installer (une seule fois) :</strong><br />
              1. Télécharge le fichier, puis ouvre-le depuis les notifications ou le dossier Téléchargements.<br />
              2. Android demande d'autoriser l'installation depuis ce navigateur (« Sources inconnues ») : accepte, l'application n'est pas sur le Play Store.<br />
              3. Si Play Protect avertit, choisis « Installer quand même ».<br />
              4. Ouvre Seeduction et connecte-toi avec ton identifiant (ou courriel) et ton mot de passe.<br />
              <strong>Sur une télé ou une box :</strong> ouvre l'application, scanne le QR code avec ton téléphone (ou va sur <Link to="/tv">seeduction.org/tv</Link> et saisis le code affiché) : rien à taper à la télécommande.
              Si la box refuse l'installation, c'est souvent qu'elle est en 32 bits : demande la version 32 bits à l'équipe.
            </div>
          </div>
          <VodPanel />
          <p className="muted" style={{ margin: 0 }}>Une fois connecté : <Link to="/appareils">🎛️ Mon application</Link> montre tes appareils, ce qui joue en direct, tes statistiques et tes notes.</p>
        </section>
      ) : (
        <section className="sc-donate">
          <div className="sc-kicker">Débloque tout ça</div>
          <h2>Un don. Tout le catalogue, dans ta poche et sur ta télé.</h2>
          <p style={{ margin: 0, color: 'var(--text-dim)', maxWidth: '62ch', lineHeight: 1.55 }}>
            Soutenir Seeduction, c'est faire vivre le site, les serveurs et la communauté… et ouvrir l'application : {titles > 0 ? `${n(titles)} titres` : 'tous les films et séries'} à lancer en un clic, sans jamais penser à ton ratio. Ton accès s'active dès que ton don est confirmé.
          </p>
          <div className="sc-cta">
            <Link to="/soutenir" className="download-btn big">❤️ Soutenir et débloquer l'application</Link>
            <span className="muted" style={{ fontSize: 13 }}>{st?.rule}</span>
          </div>
        </section>
      )}

      <section className="sc-sec sc-faq">
        <h2>Questions fréquentes</h2>
        <div style={{ marginTop: 14 }}>{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </section>

      {!eligible && (
        <div className="sc-cta" style={{ justifyContent: 'center' }}>
          <Link to="/soutenir" className="download-btn big">❤️ Je veux l'application</Link>
        </div>
      )}
    </div>
  );
}
