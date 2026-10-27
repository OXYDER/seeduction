import { useEffect, useRef, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { create } from 'zustand';
import { api } from '../api/client';
import { CATEGORY_STYLE, type LayoutContext } from './Layout';
import { useCountdown } from './FreeleechCalendar';

// ------------------------------------------------------------------ préférences de l'accueil (propres à l'appareil)

const KEY = 'home-prefs';
export interface HomePrefs { strip: boolean; prevNews: boolean; rail: boolean; actions: boolean }
const DEFAULTS: HomePrefs = { strip: true, prevNews: true, rail: true, actions: true };
const read = (): HomePrefs => { try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<HomePrefs>) }; } catch { return DEFAULTS; } };
export const useHomePrefs = create<{ prefs: HomePrefs; set: (patch: Partial<HomePrefs>) => void }>((set, get) => ({
  prefs: read(),
  set(patch) { const next = { ...get().prefs, ...patch }; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* préférence facultative */ } set({ prefs: next }); },
}));

const OPTIONS: [keyof HomePrefs, string][] = [['strip', 'Freeleech et pot commun'], ['prevNews', 'Nouvelles précédentes'], ['rail', 'Colonne de droite (Canadiens, amis, chat, défi)'], ['actions', 'Actions rapides et catégories']];

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
  const target = state?.until ?? next?.startsAt ?? null;
  const left = useCountdown(target);
  return (
    <div className="hstrip-card">
      <span aria-hidden="true">🗓️</span>
      <span className="hstrip-text">
        <strong>Freeleech</strong>{' '}
        {state?.until ? <span className="muted">🎉 {state.event?.title ?? 'en cours'} · se termine dans {left}</span>
          : next ? <span className="muted">{next.title} · dans {left}</span>
          : <span className="muted">aucune période prévue</span>}
      </span>
      <Link to="/freeleech">Calendrier →</Link>
    </div>
  );
}

function PotItem({ pot }: { pot: any }) {
  const left = useCountdown(pot?.active?.endsAt ?? null);
  const { cycle } = pot;
  return (
    <div className="hstrip-card">
      <span aria-hidden="true">{pot.icon ?? '🍯'}</span>
      <span className="hstrip-text"><strong>{pot.name}</strong>{pot.active && <span className="muted"> · 🎉 freeleech global, encore {left}</span>}</span>
      <span className="hstrip-gauge" title={`${cycle.percent} % : quand il est plein, tout le monde est récompensé`}><i style={{ width: `${Math.min(100, cycle.percent)}%` }} /></span>
      <span className="muted">{cycle.percent} %</span>
      <Link to="/pot">{cycle.status === 'OPEN' ? 'Donner →' : 'Voir →'}</Link>
    </div>
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
    <div className="hstrip">
      {fl && <FreeleechItem state={fl} />}
      {pot?.enabled && <PotItem pot={pot} />}
    </div>
  );
}

// ------------------------------------------------------------------ actions rapides et catégories

/** Quatre actions utiles (les autres pages sont dans le menu) et les pastilles de catégories. */
export function HomeActions({ canUpload }: { canUpload: boolean }) {
  const { categories } = useOutletContext<LayoutContext>();
  const ACTIONS: { to: string; icon: string; label: string; hint: string }[] = [
    ...(canUpload ? [{ to: '/upload', icon: '⬆️', label: 'Envoyer un torrent', hint: 'Partager un nouveau torrent' }] : []),
    { to: '/requests', icon: '🙋', label: 'Faire une demande', hint: 'Ce que la communauté cherche' },
    { to: '/referrals', icon: '🎟️', label: 'Inviter un ami', hint: 'Code ou achat en points' },
    { to: '/seeds', icon: '🌱', label: 'Mes seeds', hint: 'Obligations et téléchargements' },
  ];
  return (
    <section className="home-actions" aria-label="Actions rapides">
      <div className="ha-grid">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className="ha-btn"><span className="ha-icon" aria-hidden="true">{a.icon}</span><span><strong>{a.label}</strong><small>{a.hint}</small></span></Link>
        ))}
      </div>
      {categories?.length > 0 && (
        <div className="hs-cats">
          {categories.map((c) => {
            const style = CATEGORY_STYLE[c.slug];
            return <Link key={c.id} to={`/browse?categoryId=${c.id}`} className="hs-cat" style={style ? { borderColor: `${style.color}66` } : undefined}>{style?.icon ?? '📁'} {c.name}</Link>;
          })}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ seeds à terminer (onglet « Pour toi »)

interface SeedRow { torrentId: string; name: string; coverImage: string | null; status: 'seeding' | 'idle' | 'hnr' | 'repairing'; seedSeconds: number; requiredSeconds: number; remainingSeconds: number }
const hoursOf = (s: number) => (s >= 3600 ? `${Math.round(s / 360) / 10} h`.replace('.', ',') : `${Math.max(0, Math.round(s / 60))} min`);

/** Les torrents dont l'obligation de seed n'est pas terminée, avec leur barre : le plus pressé d'abord. Rien à afficher = pas de carte. */
export function SeedsToFinish() {
  const [rows, setRows] = useState<SeedRow[] | null>(null);
  useEffect(() => { api.get('/bonus/seeds').then((r) => setRows(r.data.items ?? [])).catch(() => setRows([])); }, []);
  if (!rows || rows.length === 0) return null;
  return (
    <section className="panel ornate rail-section rail-plex">
      <div className="panel-title"><span className="title-icon">🌱</span>Seeds à terminer<Link to="/seeds" className="rail-all" style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontWeight: 400 }}>Tout voir →</Link></div>
      <div className="seedpage-list">
        {rows.slice(0, 4).map((i) => {
          const pct = Math.min(100, Math.round((i.seedSeconds / i.requiredSeconds) * 100));
          return (
            <Link key={i.torrentId} to={`/torrents/${i.torrentId}`} className="seedpage-item">
              {i.coverImage ? <img src={i.coverImage} alt="" className="seedob-cover" loading="lazy" /> : <span className="seedob-cover plain">🎬</span>}
              <span className="seedob-text">
                <span className="seedob-name" style={{ fontSize: 14 }}>{i.name}</span>
                <span className="seedob-bar"><span className={i.status === 'seeding' || i.status === 'repairing' ? 'seeding' : i.status} style={{ width: `${pct}%` }} /></span>
                <span className="seedob-sub">{hoursOf(i.seedSeconds)} / {hoursOf(i.requiredSeconds)} · encore {hoursOf(i.remainingSeconds)}</span>
                <span className="seedpage-chips">
                  {i.status === 'seeding' && <span className="seedpage-chip seeding">🟢 En seed</span>}
                  {i.status === 'idle' && <span className="seedpage-chip idle">🟠 Ne seede plus : relance-le</span>}
                  {i.status === 'hnr' && <span className="seedpage-chip hnr">🔴 Hit & run : reprends le seed</span>}
                  {i.status === 'repairing' && <span className="seedpage-chip seeding">🟡 En réparation</span>}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
