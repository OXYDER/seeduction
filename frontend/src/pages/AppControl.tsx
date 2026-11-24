import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { AppPromoBanner, sendCommand } from '../components/AppHome';
import { KIND_ICON, clock, hoursText, useDevices, useTicking, useVodStatus, type Device } from '../lib/vodLive';

type Tab = 'devices' | 'stats' | 'ratings';

/** « Mon application » : mes appareils et ce qui joue (avec télécommande), mes statistiques de visionnage et mes notes. */
export default function AppControl() {
  const st = useVodStatus();
  const [tab, setTab] = useState<Tab>('devices');
  if (!st) return <div className="panel"><p className="muted">Chargement…</p></div>;
  if (!st.eligible) {
    return (
      <div className="grid page-narrow" style={{ gap: 16 }}>
        <h1>🎛️ Mon espace Seeduction TV</h1>
        <AppPromoBanner promo={st.promo} />
        <p className="muted">{st.rule}</p>
      </div>
    );
  }
  return (
    <div className="grid page-narrow" style={{ gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 4 }}>🎛️ Mon espace Seeduction TV</h1>
        <p className="muted" style={{ margin: 0 }}>Tes appareils, ce qui joue en direct (tu peux le piloter d'ici), tes statistiques et tes notes. <Link to="/application">Installer l'application →</Link></p>
      </div>
      <div className="ctl-tabs" role="tablist">
        {([['devices', '📺 Appareils'], ['stats', '📊 Statistiques'], ['ratings', '⭐ Mes notes']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'devices' && <Devices />}
      {tab === 'stats' && <Stats />}
      {tab === 'ratings' && <Ratings />}
    </div>
  );
}

// ------------------------------------------------------------------ appareils

function Devices() {
  const { items, reload } = useDevices(true, 3000);
  const [toast, setToast] = useState('');
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast(''), 2600); };
  if (items === null) return <p className="muted">Chargement…</p>;
  if (items.length === 0) {
    return (
      <div className="panel" style={{ textAlign: 'center', display: 'grid', gap: 8, justifyItems: 'center' }}>
        <div style={{ fontSize: 40 }}>📱</div>
        <h3 style={{ margin: 0 }}>Aucun appareil pour l'instant</h3>
        <p className="muted" style={{ margin: 0, maxWidth: 520 }}>Installe Seeduction TV sur ton téléphone, ta tablette ou ta télé et connecte-toi : l'appareil apparaît ici dès son ouverture. Tu verras alors ce qui joue et tu pourras le piloter.</p>
        <Link to="/application" className="download-btn" style={{ textDecoration: 'none' }}>Installer l'application</Link>
      </div>
    );
  }
  return (
    <>
      <div className="ctl-devs">{items.map((d) => <DeviceCard key={d.id} d={d} reload={reload} say={say} />)}</div>
      <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Un appareil est « en ligne » tant que l'application est ouverte dessus. Les commandes sont exécutées en moins de 4 secondes pendant une lecture. Le téléchargement des films par l'application n'apparaît nulle part sur le site.</p>
      {toast && <div className="toast-mini" role="status">{toast}</div>}
    </>
  );
}

function DeviceCard({ d, reload, say }: { d: Device; reload: () => void; say: (t: string) => void }) {
  const p = d.playing;
  const pos = useTicking(p);
  const [name, setName] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const act = async (body: Record<string, unknown>, ok: string) => { const m = await sendCommand(d.id, body); say(m ?? ok); if (!m) window.setTimeout(reload, 1800); };
  const saveName = async () => {
    const n = (name ?? '').trim();
    setName(null);
    if (!n || n === d.name) return;
    try { await api.patch(`/vod/devices/${d.id}`, { name: n }); reload(); } catch { say('Renommage impossible.'); }
  };
  const forget = async () => {
    if (!window.confirm(`Retirer « ${d.name} » de la liste ? Il reviendra à sa prochaine ouverture de l'application.`)) return;
    try { await api.delete(`/vod/devices/${d.id}`); reload(); } catch { say('Suppression impossible.'); }
  };
  const shown = drag ?? pos;
  return (
    <div className={`ctl-dev${p ? ' live' : ''}`}>
      <div className="ctl-dev-head">
        <div className="ctl-dev-ico">{KIND_ICON[d.kind] ?? '📱'}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ctl-dev-name">
            {name === null ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
              : <input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') void saveName(); if (e.key === 'Escape') setName(null); }} style={{ padding: '3px 8px' }} aria-label="Nom de l'appareil" />}
            <span className={`live-dot${d.online ? '' : ' off'}`} title={d.online ? 'En ligne' : 'Hors ligne'} />
          </div>
          <div className="ctl-dev-meta">{d.online ? (p ? 'En lecture' : 'Connecté, rien en lecture') : `Hors ligne · vu ${new Date(d.lastSeenAt).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}`}{d.appVersion ? ` · v${d.appVersion}` : ''}</div>
        </div>
        <button type="button" className="secondary" title="Renommer" onClick={() => setName(d.name)} style={{ padding: '4px 9px' }}>✏️</button>
        <button type="button" className="secondary" title="Retirer de la liste" onClick={forget} style={{ padding: '4px 9px' }}>🗑</button>
      </div>
      <div className="ctl-dev-body">
        {p ? (
          <div className="ctl-np">
            {p.cover && <div className="ctl-np-bg" style={{ backgroundImage: `url(${p.cover})` }} />}
            {p.cover ? <img src={p.cover} alt="" /> : <div style={{ display: 'grid', placeItems: 'center', fontSize: 40 }}>🎬</div>}
            <div style={{ minWidth: 0 }}>
              <div className="appnow-sub" style={{ color: '#d6dcea' }}>{p.paused ? '⏸ En pause' : '▶ En lecture sur cet appareil'}</div>
              <h4>{p.title}</h4>
              {p.subtitle && <div className="appnow-sub" style={{ color: '#d6dcea' }}>{p.subtitle}</div>}
              <input className="ctl-scrub" type="range" min={0} max={Math.max(1, p.duration)} value={Math.min(shown, Math.max(1, p.duration))} aria-label="Position de lecture"
                onChange={(e) => setDrag(Number(e.target.value))}
                onPointerUp={() => { if (drag !== null) { const v = drag; setDrag(null); void act({ type: 'seek', value: v }, `Saut à ${clock(v)}`); } }}
                onKeyUp={() => { if (drag !== null) { const v = drag; setDrag(null); void act({ type: 'seek', value: v }, `Saut à ${clock(v)}`); } }} />
              <div className="ctl-times"><span>{clock(shown)}</span><span>{p.duration ? clock(p.duration) : ''}</span></div>
              <div className="ctl-btns">
                <button type="button" className="secondary" title="Reculer de 30 s" onClick={() => act({ type: 'seekBy', value: -30 }, '−30 s')}>−30</button>
                <button type="button" className="secondary" title="Reculer de 10 s" onClick={() => act({ type: 'seekBy', value: -10 }, '−10 s')}>⏪</button>
                <button type="button" className="main" title={p.paused ? 'Reprendre' : 'Pause'} onClick={() => act({ type: p.paused ? 'play' : 'pause' }, p.paused ? 'Lecture' : 'Pause')}>{p.paused ? '▶' : '⏸'}</button>
                <button type="button" className="secondary" title="Avancer de 10 s" onClick={() => act({ type: 'seekBy', value: 10 }, '+10 s')}>⏩</button>
                <button type="button" className="secondary" title="Avancer de 30 s" onClick={() => act({ type: 'seekBy', value: 30 }, '+30 s')}>+30</button>
                <button type="button" className="secondary" title="Arrêter la lecture" onClick={() => act({ type: 'stop' }, 'Lecture arrêtée')}>⏹</button>
              </div>
            </div>
          </div>
        ) : d.online ? <div className="ctl-idle">Rien en lecture. Choisis un titre ci-dessous : il démarre sur cet appareil.</div>
          : <div className="ctl-idle">Cet appareil est hors ligne. Ouvre Seeduction TV dessus pour le piloter d'ici.</div>}
        {d.online && (
          <div>
            <button type="button" className={picker ? 'secondary' : 'download-btn'} style={{ padding: '8px 16px', fontSize: 14 }} onClick={() => setPicker((v) => !v)}>{picker ? 'Fermer le catalogue' : '🎬 Lancer un titre sur cet appareil'}</button>
          </div>
        )}
        {picker && d.online && <Picker deviceId={d.id} onSent={(t) => { say(t); setPicker(false); window.setTimeout(reload, 2500); }} onError={say} />}
      </div>
    </div>
  );
}

interface Card { id: string; title: string; year?: number | null; cover: string | null; kind?: string }
interface Detail { id: string; title: string; kind: string; versions: { id: string; label: string; seeders: number; health: string; size: number; fileIndex: number; percent: number | null }[]; episodes?: { season: number | null; episode: number | null; label: string; torrentId: string; fileIndex: number; seeders: number; health: string; percent: number | null }[] }
const HEALTH: Record<string, string> = { instant: '⚡ rapide', ok: '● correct', slow: '● lent' };

/** Le catalogue de l'application depuis le site : on cherche, on choisit une version ou un épisode, et l'appareil le lance. */
function Picker({ deviceId, onSent, onError }: { deviceId: string; onSent: (t: string) => void; onError: (t: string) => void }) {
  const [q, setQ] = useState('');
  const [cards, setCards] = useState<Card[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = window.setTimeout(() => {
      const url = q.trim().length >= 2 ? `/vod/search?q=${encodeURIComponent(q.trim())}` : '/vod/browse?sort=seeders&size=30';
      api.get(url).then((r) => { if (n === seq.current) setCards(r.data.items); }).catch(() => { if (n === seq.current) setCards([]); });
    }, q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [q]);
  const open = (c: Card) => { setDetail(null); api.get(`/vod/title/${c.id}`).then((r) => { setDetail(r.data); setSeason(r.data.episodes?.[0]?.season ?? null); }).catch(() => onError('Titre indisponible.')); };
  const start = async (torrentId: string, fileIndex: number, title: string) => {
    const m = await sendCommand(deviceId, { type: 'start', torrentId, fileIndex, title });
    if (m) onError(m); else onSent(`Lancement de « ${title} » sur l'appareil…`);
  };
  const seasons = [...new Set((detail?.episodes ?? []).map((e) => e.season).filter((s): s is number => s != null))];
  return (
    <div className="ctl-picker">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un film ou une série…" aria-label="Chercher dans le catalogue" />
      {cards === null ? <p className="muted" style={{ margin: 0 }}>Chargement…</p> : cards.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun résultat.</p> : (
        <div className="ctl-results">
          {cards.map((c) => (
            <button key={c.id} type="button" className={`ctl-res${detail?.id === c.id ? ' on' : ''}`} onClick={() => open(c)} title={c.title}>
              {c.cover ? <img src={c.cover} alt="" loading="lazy" /> : <div style={{ aspectRatio: '2/3', display: 'grid', placeItems: 'center' }}>🎬</div>}
              <span>{c.title}{c.year ? ` (${c.year})` : ''}</span>
            </button>
          ))}
        </div>
      )}
      {detail && (
        <div className="ctl-vers">
          <strong>{detail.title}</strong>
          {detail.kind === 'serie' && detail.episodes ? (
            <>
              {seasons.length > 1 && <select value={season ?? ''} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Saison">{seasons.map((s) => <option key={s} value={s}>Saison {s}</option>)}</select>}
              {detail.episodes.filter((e) => season == null || e.season === season).slice(0, 60).map((e) => (
                <div key={`${e.torrentId}:${e.fileIndex}`} className="ctl-ver">
                  <span>{e.label}{e.percent ? ` · ${e.percent} % vu` : ''} <span className="muted">· {HEALTH[e.health] ?? ''} · {e.seeders} seeders</span></span>
                  <button type="button" className="secondary" onClick={() => start(e.torrentId, e.fileIndex, `${detail.title} ${e.label}`)}>▶ Lancer</button>
                </div>
              ))}
            </>
          ) : detail.versions.slice(0, 6).map((v) => (
            <div key={v.id} className="ctl-ver">
              <span>{v.label} <span className="muted">· {formatBytes(v.size)} · {HEALTH[v.health] ?? ''} · {v.seeders} seeders{v.percent ? ` · ${v.percent} % vu` : ''}</span></span>
              <button type="button" className="secondary" onClick={() => start(v.id, v.fileIndex, detail.title)}>▶ Lancer</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ statistiques

interface Stats {
  seconds: { all: number; week: number; month: number }; titles: number; days: { day: string; seconds: number }[];
  topTitles: { title: string; cover: string | null; kind: string; seconds: number }[]; genres: { genre: string; seconds: number }[];
  devices: { deviceId: string; name: string; kind: string; seconds: number }[]; kinds: { film: number; serie: number };
  sharing: { titles: number; uploadedBytes: number }; ratings: { count: number; average: number | null };
}

function Stats() {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api.get('/vod/stats').then((r) => setS(r.data)).catch(() => setS(null)); }, []);
  if (!s) return <p className="muted">Chargement…</p>;
  if (s.seconds.all === 0) return <div className="panel"><p className="muted" style={{ margin: 0 }}>Tes statistiques se rempliront dès ta première lecture dans l'application.</p></div>;
  const maxDay = Math.max(1, ...s.days.map((d) => d.seconds));
  const maxG = Math.max(1, ...s.genres.map((g) => g.seconds));
  const maxD = Math.max(1, ...s.devices.map((d) => d.seconds));
  const total = Math.max(1, s.kinds.film + s.kinds.serie);
  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="st-tiles">
        <div className="st-tile"><b>{hoursText(s.seconds.week)}</b><span>cette semaine</span></div>
        <div className="st-tile"><b>{hoursText(s.seconds.month)}</b><span>ces 30 jours</span></div>
        <div className="st-tile"><b>{hoursText(s.seconds.all)}</b><span>au total</span></div>
        <div className="st-tile"><b>{s.titles}</b><span>titres regardés</span></div>
        <div className="st-tile"><b>{s.ratings.count}</b><span>notes données{s.ratings.average ? ` · moy. ${s.ratings.average} ★` : ''}</span></div>
      </div>
      <div className="st-grid">
        <div className="panel">
          <h3>30 derniers jours</h3>
          <div className="st-bars" role="img" aria-label="Temps regardé par jour">
            {s.days.map((d) => <div key={d.day} className={d.seconds ? '' : 'zero'} style={{ height: `${d.seconds ? Math.max(4, (d.seconds / maxDay) * 100) : 2}%` }} title={`${d.day} : ${d.seconds ? hoursText(d.seconds) : 'rien'}`} />)}
          </div>
          <div className="st-axis"><span>{s.days[0].day.slice(5)}</span><span>aujourd'hui</span></div>
        </div>
        <div className="panel">
          <h3>Tes titres préférés</h3>
          {s.topTitles.length === 0 ? <p className="muted">Pas encore assez de lecture.</p> : s.topTitles.slice(0, 6).map((t) => (
            <div key={t.title + t.kind} className="st-row">
              {t.cover ? <img src={t.cover} alt="" loading="lazy" /> : <div style={{ width: 40, height: 58, display: 'grid', placeItems: 'center' }}>🎬</div>}
              <div style={{ minWidth: 0 }}><div className="nm">{t.title}</div><div className="muted" style={{ fontSize: 12 }}>{t.kind === 'serie' ? 'Série' : 'Film'}</div></div>
              <span className="muted" style={{ fontSize: 13 }}>{hoursText(t.seconds)}</span>
            </div>
          ))}
        </div>
        <div className="panel">
          <h3>Genres</h3>
          {s.genres.map((g) => <div key={g.genre} className="st-hbar"><span className="t">{g.genre}</span><i style={{ width: `${(g.seconds / maxG) * 100}%` }} /><span className="v">{hoursText(g.seconds)}</span></div>)}
          <div className="st-axis" style={{ marginTop: 10 }}><span>Films {Math.round((s.kinds.film / total) * 100)} %</span><span>Séries {Math.round((s.kinds.serie / total) * 100)} %</span></div>
        </div>
        <div className="panel">
          <h3>Appareils</h3>
          {s.devices.map((d) => <div key={d.deviceId} className="st-hbar"><span className="t">{KIND_ICON[d.kind] ?? '📱'} {d.name}</span><i style={{ width: `${(d.seconds / maxD) * 100}%` }} /><span className="v">{hoursText(d.seconds)}</span></div>)}
          <p className="muted" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
            🌱 Pendant que l'application est ouverte, elle partage {s.sharing.titles > 0 ? <>{s.sharing.titles} titre{s.sharing.titles > 1 ? 's' : ''} ({formatBytes(s.sharing.uploadedBytes)} envoyés)</> : 'ce qu\'elle a déjà téléchargé'} : c'est ça qui fait vivre le catalogue.
          </p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ notes

export function Stars({ value, onChange, size = 20 }: { value: number | null; onChange?: (n: number) => void; size?: number }) {
  return (
    <span className="stars" role={onChange ? 'radiogroup' : 'img'} aria-label={value ? `${value} étoiles sur 5` : 'Pas de note'}>
      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={(value ?? 0) >= n ? 'on' : ''} style={{ fontSize: size, cursor: onChange ? 'pointer' : 'default' }} disabled={!onChange} onClick={() => onChange?.(value === n ? 0 : n)} aria-label={`${n} étoile${n > 1 ? 's' : ''}`}>★</button>)}
    </span>
  );
}

function Ratings() {
  const [items, setItems] = useState<{ torrentId: string; title: string; cover: string | null; kind: string; score: number }[] | null>(null);
  useEffect(() => { api.get('/vod/ratings').then((r) => setItems(r.data.items)).catch(() => setItems([])); }, []);
  const rate = async (torrentId: string, score: number) => {
    setItems((cur) => (cur ?? []).map((i) => (i.torrentId === torrentId ? { ...i, score } : i)));
    try { await api.post('/vod/rate', { torrentId, score }); if (score === 0) setItems((cur) => (cur ?? []).filter((i) => i.torrentId !== torrentId)); } catch { /* la note se recharge à la prochaine visite */ }
  };
  if (items === null) return <p className="muted">Chargement…</p>;
  if (items.length === 0) return <div className="panel"><p className="muted" style={{ margin: 0 }}>Tu n'as noté aucun titre. Ouvre la fiche d'un film ou d'une série dans l'application et donne-lui de 1 à 5 étoiles : tes notes alimentent « Aimés par les membres » et tes recommandations.</p></div>;
  return (
    <div className="ratings-grid">
      {items.map((i) => (
        <figure key={i.torrentId}>
          {i.cover ? <img src={i.cover} alt="" loading="lazy" /> : <div style={{ aspectRatio: '2/3', display: 'grid', placeItems: 'center', fontSize: 30 }}>🎬</div>}
          <figcaption>{i.title}</figcaption>
          <Stars value={i.score} onChange={(n) => rate(i.torrentId, n)} size={18} />
        </figure>
      ))}
    </div>
  );
}
