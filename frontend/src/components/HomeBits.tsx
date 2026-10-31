import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { create } from 'zustand';
import { api } from '../api/client';
import { Rail } from './TorrentRail';
import { timeAgo } from '../lib/time';
import { useCountdown } from './FreeleechCalendar';
import { useAuthStore } from '../store/auth';
import { releaseTitle } from './TorrentGroups';
import { episodeCode } from '../lib/frText';

// ------------------------------------------------------------------ préférences de l'accueil (propres à l'appareil)

const KEY = 'home-prefs';
export interface HomePrefs { strip: boolean; prevNews: boolean; rail: boolean; actions: boolean }
const DEFAULTS: HomePrefs = { strip: true, prevNews: true, rail: true, actions: true };
const read = (): HomePrefs => { try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<HomePrefs>) }; } catch { return DEFAULTS; } };
export const useHomePrefs = create<{ prefs: HomePrefs; set: (patch: Partial<HomePrefs>) => void }>((set, get) => ({
  prefs: read(),
  set(patch) { const next = { ...get().prefs, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* préférence facultative */ } set({ prefs: next }); },
}));

const OPTIONS: [keyof HomePrefs, string][] = [['strip', 'Freeleech et pot commun'], ['prevNews', 'Nouvelles précédentes'], ['rail', 'Colonne de droite (Canadiens, amis, chat, défi)'], ['actions', 'Actions rapides (en haut)']];

/** Bouton « Personnaliser l'accueil » : le membre choisit ce qu'il garde. La dernière nouvelle reste toujours affichée. */
export function HomeCustomize() {
  const { prefs, set } = useHomePrefs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="home-cust" ref={ref}>
      <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>⚙️ Personnaliser l'accueil</button>
      {open && (
        <div className="home-cust-panel" role="dialog" aria-label="Personnaliser l'accueil">
          <strong>Afficher sur mon accueil</strong>
          {OPTIONS.map(([k, label]) => <label key={k}><input type="checkbox" checked={prefs[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {label}</label>)}
          <small className="muted">La dernière nouvelle reste toujours affichée. Ton choix est mémorisé sur cet appareil.</small>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ bandeau freeleech et pot commun (une ligne)

function FreeleechItem({ state }: { state: any }) {
  const upcoming: any[] = state?.upcoming ?? [];
  const next = upcoming[0] ?? null;
  const left = useCountdown(state?.until ?? null);
  const untilNext = useCountdown(next?.startsAt ?? null);
  // Part du temps déjà écoulée du freeleech en cours (si on connaît son début).
  const start = state?.event?.startsAt ? new Date(state.event.startsAt).getTime() : null;
  const end = state?.until ? new Date(state.until).getTime() : null;
  const pct = start && end && end > start ? Math.max(0, Math.min(100, ((Date.now() - start) / (end - start)) * 100)) : 100;
  return (
    <Link to="/freeleech" className={`bc${state?.until ? ' live' : ''}`}>
      <div className="bt"><span>🎉 {state?.until ? <>Freeleech en cours : <b>{state.event?.title ?? 'freeleech global'}</b></> : <>Freeleech</>}</span><span>{state?.until ? `se termine dans ${left}` : 'aucune période en cours'}</span></div>
      <div className="pb"><i style={{ width: `${state?.until ? pct : 0}%`, background: 'linear-gradient(90deg,#10b981,#34d399)' }} /></div>
      <div className="bn">{next ? <>Prochain : <b>{next.title}</b> · dans {untilNext} · <u>Calendrier</u></> : <>Aucun freeleech prévu · <u>Calendrier</u></>}</div>
    </Link>
  );
}

function PotItem({ pot }: { pot: any }) {
  const left = useCountdown(pot?.active?.endsAt ?? null);
  const { cycle } = pot;
  return (
    <Link to="/pot" className="bc">
      <div className="bt"><span>{pot.icon ?? '🍯'} <b>{pot.name}</b>{pot.active ? ` · 🎉 freeleech global, encore ${left}` : ''}</span><span>{cycle.percent} % · <u>{cycle.status === 'OPEN' ? 'Donner' : 'Voir'}</u></span></div>
      <div className="pb"><i style={{ width: `${Math.min(100, cycle.percent)}%`, background: 'linear-gradient(90deg,#f59e0b,#f5c542)' }} /></div>
    </Link>
  );
}

/** « Niveau suivant » : où j'en suis vers le rang automatique suivant (la condition la plus en retard donne le pourcentage). Rien pour l'équipe ni au rang le plus haut. */
function RankItem() {
  const role = useAuthStore((st) => st.user?.role);
  const [r, setR] = useState<any>(null);
  useEffect(() => { api.get('/bonus/rank').then((x) => setR(x.data)).catch(() => undefined); }, []);
  if (!r || !r.next || ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'].includes(role ?? '')) return null;
  const fmt = (p: any) => `${String(p.have).replace('.', ',')} / ${String(p.need).replace('.', ',')}`;
  return (
    <Link to="/wiki/guide-ratio-seed" className="bc" title={r.parts.map((p: any) => `${p.label} : ${fmt(p)}${p.ok ? ' ✓' : ''}`).join(' · ')}>
      <div className="bt"><span>🏅 Niveau suivant : <b>{r.nextLabel}</b></span><span>{r.pct} %</span></div>
      <div className="pb"><i style={{ width: `${r.pct}%`, background: 'linear-gradient(90deg,#8b5cf6,#c084fc)' }} /></div>
      <div className="bn">{r.parts.filter((p: any) => !p.ok).map((p: any) => `${p.label} ${fmt(p)}`).join(' · ') || 'Conditions remplies : le rang arrive cette nuit'}</div>
    </Link>
  );
}

/** « Mes réalisations » : combien de badges obtenus sur le total, et le prochain à portée de main. */
function BadgesItem() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.get('/badges/progress').then((r) => setD(r.data)).catch(() => undefined); }, []);
  if (!d || !d.total) return null;
  const pct = Math.round((d.earnedCount / Math.max(1, d.total)) * 100);
  const next = (d.items ?? []).filter((i: any) => !i.earned && i.target > 0).sort((a: any, b: any) => b.value / b.target - a.value / a.target)[0];
  return (
    <Link to="/achievements" className="bc">
      <div className="bt"><span>🏅 <b>{d.earnedCount} / {d.total}</b> badges obtenus</span><span>{pct} %</span></div>
      <div className="pb"><i style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#f59e0b,#fde68a)' }} /></div>
      <div className="bn">{next ? <>Prochain : <b>{next.icon} {next.name}</b> · {next.value} / {next.target}{next.unit ? ` ${next.unit}` : ''}</> : <>{d.pointsToWin ? `${d.pointsToWin} points bonus encore à gagner` : 'Tous les badges sont obtenus !'}</>}</div>
    </Link>
  );
}

/** Freeleech et pot commun en une ligne chacun (le détail est une page plus loin). */
export function HomeStrip() {
  const [fl, setFl] = useState<any>(null);
  const [pot, setPot] = useState<any>(null);
  useEffect(() => {
    api.get('/bonus/freeleech').then((r) => setFl(r.data)).catch(() => undefined);
    const load = () => api.get('/pot').then((r) => setPot(r.data)).catch(() => undefined);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!fl && !pot?.enabled) return null;
  return (
    <div className="bars">
      <RankItem />
      <BadgesItem />
      {fl && <FreeleechItem state={fl} />}
      {pot?.enabled && <PotItem pot={pot} />}
    </div>
  );
}

// ------------------------------------------------------------------ actions rapides

/** Quatre actions utiles, en haut de l'accueil, avec leur petit compteur (demandes ouvertes, obligation de seed à terminer). */
export function HomeActions({ canUpload }: { canUpload: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const [seeds, setSeeds] = useState<number | null>(null);
  useEffect(() => {
    api.get('/requests').then((r) => setOpen(r.data?.stats?.open ?? null)).catch(() => undefined);
    api.get('/bonus/seeds').then((r) => setSeeds(r.data?.counts?.total ?? null)).catch(() => undefined);
  }, []);
  const ACTIONS: { to: string; icon: string; label: string; hint: string }[] = [
    ...(canUpload ? [{ to: '/upload', icon: '⬆️', label: 'Envoyer un torrent', hint: 'Partager un nouveau torrent' }] : []),
    { to: '/requests', icon: '🙋', label: 'Faire une demande', hint: open === null ? 'Ce que la communauté cherche' : `${open} demande${open > 1 ? 's' : ''} ouverte${open > 1 ? 's' : ''}` },
    { to: '/referrals', icon: '🎟️', label: 'Inviter un ami', hint: 'Code ou achat en points' },
    { to: '/seeds', icon: '🌱', label: 'Mes seeds', hint: seeds === null ? 'Obligations et téléchargements' : seeds === 0 ? 'Aucune obligation à terminer' : `${seeds} obligation${seeds > 1 ? 's' : ''} à terminer` },
  ];
  return (
    <section className="home-actions" aria-label="Actions rapides">
      <div className="ha-grid">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className="ha-btn"><span className="ha-icon" aria-hidden="true">{a.icon}</span><span><strong>{a.label}</strong><small>{a.hint}</small></span></Link>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ onglet « Pour toi » : quatre cartes côte à côte

interface SeedRow { torrentId: string; name: string; coverImage: string | null; status: 'seeding' | 'idle' | 'hnr' | 'repairing'; seedSeconds: number; requiredSeconds: number; remainingSeconds: number }
interface NextEp { torrentId: string; title: string; name: string; cover: string | null; season: number; episode: number; afterEpisode: number }
const hoursOf = (s: number) => (s >= 3600 ? `${Math.round(s / 360) / 10} h`.replace('.', ',') : `${Math.max(0, Math.round(s / 60))} min`);
const epCode = (s: number, e: number) => `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;

function Thumb({ src }: { src: string | null }) {
  return src ? <img className="fy-th" src={src} alt="" loading="lazy" /> : <span className="fy-th none" aria-hidden="true">🎬</span>;
}

/** Une ligne de carte : miniature, titre, barre (facultative), détail et pastille d'état. */
function Row({ to, cover, title, bar, sub, chip }: { to: string; cover: string | null; title: string; bar?: { pct: number; kind: 'dl' | 'done' | 'seeding' | 'idle' | 'hnr' }; sub: string; chip?: { text: string; tone: 'dl' | 'ok' | 'warn' | 'bad' } }) {
  return (
    <Link to={to} className="fy-row">
      <Thumb src={cover} />
      <span className="fy-t">
        <b title={title}>{title}</b>
        {bar && <span className="fy-bar"><i className={bar.kind} style={{ width: `${Math.max(0, Math.min(100, Math.round(bar.pct)))}%` }} /></span>}
        <small>{sub}</small>
      </span>
      {chip && <span className={`fy-chip ${chip.tone}`}>{chip.text}</span>}
    </Link>
  );
}

/** « Pour toi » : mes téléchargements, mes seeds à terminer, l'épisode suivant de mes séries et les nouveautés de mes abonnements, quatre cartes côte à côte. */
export function ForYouGrid({ active }: { active: any[]; followed?: any[] }) {
  const [next, setNext] = useState<NextEp[] | null>(null);
  const [done, setDone] = useState<any[] | null>(null);
  useEffect(() => {
    api.get('/bonus/activity').then((r) => setDone((r.data.completed ?? []).filter((c: any) => !c.own).slice(0, 4))).catch(() => setDone([]));
    api.get('/stream/continue').then((r) => setNext(r.data.next ?? [])).catch(() => setNext([]));
  }, []);
  const leeching = active.filter((t) => !t.isSeeder);
  const mb = (n: number) => { const g = n / 1024 ** 3; return g >= 1 ? `${g.toFixed(1).replace('.', ',')} Go` : `${Math.round(n / 1024 ** 2)} Mo`; };

  return (
    <div className="fy-grid">
      <section className="fy-card">
        <h3>⬇️ Mes téléchargements<Link to="/activity">Tout voir →</Link></h3>
        {leeching.length === 0 && <p className="fy-empty">Aucun téléchargement en cours.</p>}
        {leeching.slice(0, 2).map((t) => (
          <Row key={t.id} to={`/torrents/${t.id}`} cover={t.coverImage} title={t.name} bar={{ pct: t.progress * 100, kind: 'dl' }} sub={`${Math.round(t.progress * 100)} % · ${mb(Number(t.size) || 0)}`} chip={{ text: '⬇️ En cours', tone: 'dl' }} />
        ))}
      </section>

      <section className="fy-card">
        <h3>✅ Mes téléchargements complétés<Link to="/activity">Tout voir →</Link></h3>
        {done && done.length === 0 && <p className="fy-empty">Tes téléchargements terminés apparaîtront ici.</p>}
        {(done ?? []).slice(0, 2).map((c) => {
          const ok = c.satisfied;
          const left = Math.max(0, c.requiredSeconds - c.seedSeconds);
          const chip = ok ? { text: '✅ Seed terminé', tone: 'ok' as const } : c.hnr ? { text: '🔴 Hit & run', tone: 'bad' as const } : { text: `⏳ Encore ${hoursOf(left)}`, tone: 'warn' as const };
          return <Row key={c.torrentId} to={`/torrents/${c.torrentId}`} cover={c.coverImage} title={c.name} bar={{ pct: ok ? 100 : Math.min(100, (c.seedSeconds / Math.max(1, c.requiredSeconds)) * 100), kind: ok ? 'done' : c.hnr ? 'hnr' : 'seeding' }} sub={`${mb(Number(c.size) || 0)} · terminé ${timeAgo(c.completedAt)}`} chip={chip} />;
        })}
      </section>

      <section className="fy-card">
        <h3>⏯️ Épisode suivant<Link to="/series">Mes séries →</Link></h3>
        {next && next.length === 0 && <p className="fy-empty">Quand tu finis un épisode, le suivant apparaît ici dès qu'il est disponible.</p>}
        {(next ?? []).slice(0, 2).map((t) => <Row key={t.torrentId} to={`/torrents/${t.torrentId}`} cover={t.cover} title={t.title} sub={`${epCode(t.season, t.episode)} est disponible`} chip={{ text: 'Nouveau', tone: 'ok' }} />)}
      </section>

    </div>
  );
}

// ------------------------------------------------------------------ « Tendances cette semaine » : le top 5 numéroté

/** Les cinq torrents les mieux seedés, numérotés, avec leur miniature, l'année et les seeders / leechers. */
export function Top5({ items }: { items: any[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section>
      <h3 className="h2row">🔥 Tendances cette semaine<Link to="/browse?sort=seeders&period=week">Voir tout →</Link></h3>
      <div className="top5">
        {items.slice(0, 5).map((t, i) => (
          <Link key={t.id} to={`/torrents/${t.id}`} className="t5">
            <em>{i + 1}</em>
            {t.coverImage ? <img className="t5-th" src={t.coverImage} alt="" loading="lazy" /> : <span className="t5-th none" aria-hidden="true">🎬</span>}
            <span className="t5-t"><b title={t.name}>{t.displayTitle ?? releaseTitle(t.name)}</b><small>{[t.year, t.language].filter(Boolean).join(' · ')}{' '}<span className="t5-up">↑ {t.seeders ?? 0}</span> <span className="t5-dn">↓ {t.leechers ?? 0}</span></small></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ « Derniers ajouts » : filtrable par sous-catégorie

/** La rangée des derniers ajouts avec, dans son cadre, une pastille par sous-catégorie présente (Film, Série TV, Audio...) : elle ne change que ce que la rangée affiche. */
export function LatestRail({ latest }: { latest: any[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const subs = (() => {
    const m = new Map<string, { id: string; name: string; slug: string; n: number }>();
    for (const t of latest) { const c = t.category; if (c?.id) { const cur = m.get(c.id) ?? { id: c.id, name: c.name, slug: c.slug, n: 0 }; cur.n++; m.set(c.id, cur); } }
    return [...m.values()].sort((a, b) => b.n - a.n);
  })();
  useEffect(() => {
    if (!sel) { setRows(null); return; }
    let off = false;
    api.get('/torrents', { params: { pageSize: 18, sort: 'date', categoryId: sel } }).then((r) => { if (!off) setRows(r.data.items); }).catch(() => { if (!off) setRows([]); });
    return () => { off = true; };
  }, [sel]);
  const toolbar = subs.length > 1 ? (
    <div className="home-catlinks" role="group" aria-label="Filtrer par sous-catégorie">
      <button type="button" className={`hs-cat${sel === null ? ' on' : ''}`} onClick={() => setSel(null)}>Tous</button>
      {subs.map((c) => <button key={c.id} type="button" className={`hs-cat${sel === c.id ? ' on' : ''}`} onClick={() => setSel(c.id)}>{c.name}</button>)}
    </div>
  ) : undefined;
  return <Rail icon="🆕" title="Derniers ajouts" to={sel ? `/browse?categoryId=${sel}&sort=date` : '/browse?sort=date'} items={sel ? rows ?? [] : latest} loading={!!sel && rows === null} toolbar={toolbar} />;
}
