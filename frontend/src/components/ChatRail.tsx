import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMessenger, type ConvSummary } from '../store/messenger';
import { useAuthStore } from '../store/auth';
import ConvAvatar from './messenger/ConvAvatar';

const isMuted = (c: ConvSummary) => !!c.mutedUntil && new Date(c.mutedUntil).getTime() > Date.now();
const PRIVATE_MAX = 12;
type Pos = 'left' | 'right' | 'top' | 'bottom';
interface RailPrefs { pos: Pos; size: 'sm' | 'md' | 'lg'; labels: boolean }
const PREFS_KEY = 'chat-rail-prefs';
const DEFAULT_PREFS: RailPrefs = { pos: 'left', size: 'md', labels: true };
const readPrefs = (): RailPrefs => { try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<RailPrefs>) }; } catch { return DEFAULT_PREFS; } };
/** Épaisseur de la barre de bulles selon la taille choisie (réserve de place pour le contenu du site). */
const THICK: Record<RailPrefs['size'], number> = { sm: 64, md: 80, lg: 96 };
const HIDDEN_KEY = 'chat-rail-hidden';
/** Bulles retirées : conversation → date du dernier message au moment du retrait (sur cet appareil). */
const readHidden = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '{}') || {}; } catch { return {}; } };
/** Une bulle retirée reste retirée tant qu'aucun nouveau message n'arrive dans la conversation. */
const isHidden = (c: ConvSummary, hidden: Record<string, string>) => {
  const at = hidden[c.id];
  if (at === undefined) return false;
  return !(c.last?.createdAt && c.last.createdAt > at);
};

/**
 * Bulles de discussion sur le côté gauche du site, juste à droite du menu et sous l'en-tête : les canaux publics d'abord, puis les conversations privées et
 * de groupe, avec leurs messages non lus. Un clic ouvre la conversation (fenêtre en bas, ou page Chat si on y est déjà). Désactivables dans le compte
 * (Profil > Compte) ; sur petit écran (menu replié), les anciennes bulles flottantes de ChatDock restent en place.
 */
export default function ChatRail() {
  const token = useAuthStore((s) => s.accessToken);
  const enabled = useMessenger((s) => s.bubbles);
  const loaded = useMessenger((s) => s.convLoaded);
  const conversations = useMessenger((s) => s.conversations);
  const windows = useMessenger((s) => s.windows);
  const openWindow = useMessenger((s) => s.openWindow);
  const closeWindow = useMessenger((s) => s.closeWindow);
  const location = useLocation();
  const navigate = useNavigate();
  const [wide, setWide] = useState(() => window.innerWidth >= 981);
  const [top, setTop] = useState(72);
  const [hidden, setHidden] = useState<Record<string, string>>(readHidden);
  const [prefs, setPrefs] = useState<RailPrefs>(readPrefs);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragEdge, setDragEdge] = useState<Pos | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const setPref = (patch: Partial<RailPrefs>) => setPrefs((p) => { const n = { ...p, ...patch }; try { localStorage.setItem(PREFS_KEY, JSON.stringify(n)); } catch { /* préférence facultative */ } return n; });
  /** Le bord le plus proche du pointeur (déplacement façon barre des tâches). */
  const edgeOf = (x: number, y: number): Pos => {
    const d: [Pos, number][] = [['left', x], ['right', window.innerWidth - x], ['top', y], ['bottom', window.innerHeight - y]];
    return d.sort((a, b) => a[1] - b[1])[0][0];
  };
  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    const move = (ev: PointerEvent) => setDragEdge(edgeOf(ev.clientX, ev.clientY));
    const up = (ev: PointerEvent) => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setDragEdge(null); setPref({ pos: edgeOf(ev.clientX, ev.clientY) }); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    setDragEdge(edgeOf(e.clientX, e.clientY));
  }
  const onChatPage = location.pathname.startsWith('/chat');
  const viewing = onChatPage ? new URLSearchParams(location.search).get('c') : null;

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 981);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Le haut des bulles suit le bas de l'en-tête (qui peut défiler hors de l'écran selon le thème).
  useEffect(() => {
    if (!wide) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.querySelector('.side-topbar')?.getBoundingClientRect();
        setTop(Math.max(0, Math.round(h ? h.bottom : 0)));
      });
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    const bar = document.querySelector('.side-topbar');
    if (bar && ro) ro.observe(bar);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); ro?.disconnect(); };
  }, [wide, location.pathname]);

  function hide(c: ConvSummary) {
    const next = { ...hidden, [c.id]: c.last?.createdAt ?? '' };
    setHidden(next);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* préférence facultative */ }
  }
  function restoreAll() {
    setHidden({});
    try { localStorage.removeItem(HIDDEN_KEY); } catch { /* préférence facultative */ }
  }

  const hiddenCount = conversations.filter((c) => !c.archived && isHidden(c, hidden)).length;
  const { publics, privates } = useMemo(() => {
    const live = conversations.filter((c) => !c.archived && !isHidden(c, hidden));
    const byActivity = (a: ConvSummary, b: ConvSummary) => Number(b.pinned) - Number(a.pinned) || new Date(b.last?.createdAt ?? 0).getTime() - new Date(a.last?.createdAt ?? 0).getTime();
    const pub = live.filter((c) => c.type === 'CHANNEL').sort(byActivity);
    const priv = live.filter((c) => c.type !== 'CHANNEL').sort(byActivity);
    // Les conversations privées récentes, plus toutes celles qui ont des messages non lus.
    const shown = priv.filter((c, i) => i < PRIVATE_MAX || (c.unread > 0 && !isMuted(c)));
    return { publics: pub, privates: shown };
  }, [conversations, hidden]);

  const active = !!token && enabled && wide && loaded && (publics.length > 0 || privates.length > 0 || hiddenCount > 0);
  useEffect(() => {
    const b = document.body;
    b.classList.toggle('has-chat-rail', active);
    (['left', 'right', 'top', 'bottom'] as Pos[]).forEach((p) => b.classList.toggle(`chat-rail-${p}`, active && prefs.pos === p));
    b.style.setProperty('--cr-thick', `${THICK[prefs.size] + (prefs.labels ? 0 : -14)}px`);
    return () => { b.classList.remove('has-chat-rail', 'chat-rail-left', 'chat-rail-right', 'chat-rail-top', 'chat-rail-bottom'); b.style.removeProperty('--cr-thick'); };
  }, [active, prefs]);
  if (!active) return null;

  function click(c: ConvSummary) {
    if (onChatPage) { navigate(`/chat?c=${c.id}`); return; }
    const w = windows.find((x) => x.conversationId === c.id);
    if (w && !w.minimized) closeWindow(c.id); else openWindow(c.id);
  }

  const bubble = (c: ConvSummary) => {
    const muted = isMuted(c);
    const open = windows.some((w) => w.conversationId === c.id && !w.minimized) || viewing === c.id;
    const unread = c.unread > 0 && !muted;
    const label = c.name ?? (c.type === 'DIRECT' ? c.other?.username : 'Conversation') ?? '';
    return (
      <div key={c.id} className="cr-item">
        <button type="button" className={`cr-bubble${open ? ' open' : ''}${unread ? ' unread' : ''}${muted ? ' muted' : ''}`} onClick={() => click(c)}
          title={`${c.type === 'CHANNEL' ? 'Canal public' : c.type === 'GROUP' ? 'Groupe' : 'Conversation privée'} : ${label}${unread ? ` — ${c.unread} non lu${c.unread > 1 ? 's' : ''}` : ''}`}>
          <span className={`cr-av${c.type === 'CHANNEL' ? ' channel' : ''}`}>
            {c.type === 'CHANNEL' ? <span className="cr-hash">#</span> : <ConvAvatar conv={c} size={44} />}
            {unread && <span className="dot-badge" style={{ top: -3, right: -3 }}>{c.mentions > 0 ? '@' : c.unread > 99 ? '99+' : c.unread}</span>}
          </span>
          <span className="cr-name">{label}</span>
        </button>
        <button type="button" className="cr-x" title="Retirer cette bulle (la conversation reste ouverte ; elle revient dès qu'un nouveau message arrive)" aria-label={`Retirer la bulle ${label}`} onClick={(e) => { e.stopPropagation(); hide(c); }}>✕</button>
      </div>
    );
  };

  return (
    <>
    <nav ref={navRef} className="chat-rail" data-pos={prefs.pos} data-size={prefs.size} data-labels={prefs.labels ? 'on' : 'off'} style={prefs.pos === 'bottom' ? undefined : { top }} aria-label="Conversations">
      <button type="button" className="cr-grip" onPointerDown={startDrag} title="Glisse vers un bord de l'écran pour déplacer la barre (gauche, droite, haut, bas)" aria-label="Déplacer la barre des bulles">⋮⋮</button>
      {publics.length > 0 && <div className="cr-group-title" title="Canaux publics">Publics</div>}
      {publics.map(bubble)}
      {privates.length > 0 && <div className="cr-group-title cr-sep" title="Conversations privées et groupes">Privés</div>}
      {privates.map(bubble)}
      <Link to="/chat" className="cr-all" title="Ouvrir le Messenger complet">💬</Link>
      {hiddenCount > 0 && <button type="button" className="cr-restore" onClick={restoreAll} title="Réafficher les bulles retirées">↺ {hiddenCount}</button>}
      <button type="button" className="cr-set" onClick={() => setMenuOpen((v) => !v)} title="Réglages des bulles : position, taille, noms" aria-expanded={menuOpen} aria-label="Réglages des bulles">⚙</button>
    </nav>
    {menuOpen && (
      <div className="cr-menu" data-pos={prefs.pos} role="dialog" aria-label="Réglages des bulles">
        <strong>Barre des bulles</strong>
        <div className="cr-menu-row">Position
          <span className="cr-seg">{([['left', '⬅ Gauche'], ['top', '⬆ Haut'], ['bottom', '⬇ Bas'], ['right', 'Droite ➡']] as [Pos, string][]).map(([p, l]) => <button key={p} type="button" className={prefs.pos === p ? 'on' : ''} onClick={() => setPref({ pos: p })}>{l}</button>)}</span>
        </div>
        <div className="cr-menu-row">Taille
          <span className="cr-seg">{([['sm', 'Petites'], ['md', 'Moyennes'], ['lg', 'Grandes']] as [RailPrefs['size'], string][]).map(([k, l]) => <button key={k} type="button" className={prefs.size === k ? 'on' : ''} onClick={() => setPref({ size: k })}>{l}</button>)}</span>
        </div>
        <label className="cr-menu-row cr-check"><input type="checkbox" checked={prefs.labels} onChange={(e) => setPref({ labels: e.target.checked })} /> Afficher les noms sous les bulles</label>
        <small>Tu peux aussi glisser la poignée ⋮⋮ vers un bord de l'écran.</small>
        <button type="button" className="secondary" onClick={() => setMenuOpen(false)}>Fermer</button>
      </div>
    )}
    {dragEdge && <div className="cr-drop" aria-hidden="true">{(['left', 'top', 'bottom', 'right'] as Pos[]).map((p) => <span key={p} className={`cr-zone ${p}${dragEdge === p ? ' on' : ''}`} />)}</div>}
    </>
  );
}
