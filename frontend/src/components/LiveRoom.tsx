import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth';
import Nick from './Nick';

interface RoomConfig { chat: boolean; reactions: boolean; emojis: string[]; slowSeconds: number; maxLen: number; reactionsPerMinute: number }
interface ChatEntry { id: string; userId: string; username: string; role: string; text: string; at: number }
interface Floating { id: number; emoji: string; left: number; duration: number }

const STORE_KEY = 'live-interactions';
const readOn = () => { try { return localStorage.getItem(STORE_KEY) !== '0'; } catch { return true; } };

/**
 * Salle du direct : se connecte au serveur pendant une diffusion, donne le nombre de spectateurs, les messages du chat et les réactions.
 * Le bouton « couper » prévient le serveur, qui cesse alors d'envoyer messages et réactions (on reste compté parmi les spectateurs).
 */
function useLiveRoom() {
  const token = useAuthStore((s) => s.accessToken);
  const [on, setOn] = useState(readOn);
  const onRef = useRef(on);
  onRef.current = on;
  const sock = useRef<Socket | null>(null);
  const [viewers, setViewers] = useState(0);
  const [cfg, setCfg] = useState<RoomConfig | null>(null);
  const [staff, setStaff] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [floats, setFloats] = useState<Floating[]>([]);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const errTimer = useRef<number>();

  const spawn = useCallback((counts: Record<string, number>) => {
    const items: Floating[] = [];
    for (const [emoji, n] of Object.entries(counts)) for (let i = 0; i < Math.min(n, 12); i++) items.push({ id: ++seq.current, emoji, left: 6 + Math.random() * 82, duration: 2.6 + Math.random() * 1.6 });
    if (!items.length) return;
    setFloats((f) => [...f, ...items].slice(-40));
    window.setTimeout(() => setFloats((f) => f.filter((x) => !items.some((y) => y.id === x.id))), 4600);
  }, []);

  useEffect(() => {
    if (!token) return;
    const s = io('/live', { auth: { token }, transports: ['websocket', 'polling'] });
    sock.current = s;
    const flash = (m: string) => { setError(m); window.clearTimeout(errTimer.current); errTimer.current = window.setTimeout(() => setError(''), 4000); };
    // Le serveur vérifie la session avant de répondre « prêt » : c'est seulement alors qu'on rejoint la salle (aussi après une reconnexion).
    s.on('live:ready', () => { s.emit('live:prefs', { interactions: onRef.current }); s.emit('live:join'); });
    s.on('live:init', (d: { viewers: number; messages: ChatEntry[]; config: RoomConfig; staff: boolean }) => { setViewers(d.viewers); setMessages(d.messages ?? []); setCfg(d.config); setStaff(!!d.staff); });
    s.on('live:viewers', (d: { count: number }) => setViewers(d.count));
    s.on('live:chat', (m: ChatEntry) => setMessages((l) => [...l, m].slice(-80)));
    s.on('live:backlog', (l: ChatEntry[]) => setMessages(l ?? []));
    s.on('live:chat-delete', (d: { id: string }) => setMessages((l) => l.filter((m) => m.id !== d.id)));
    s.on('live:reactions', (counts: Record<string, number>) => { if (onRef.current) spawn(counts); });
    s.on('live:reset', () => setMessages([]));
    s.on('live:error', flash);
    s.on('live:notice', flash);
    return () => { s.emit('live:leave'); s.disconnect(); sock.current = null; };
  }, [token, spawn]);

  const toggle = useCallback(() => {
    const next = !onRef.current;
    setOn(next);
    try { localStorage.setItem(STORE_KEY, next ? '1' : '0'); } catch { /* préférence non enregistrée : pas grave */ }
    sock.current?.emit('live:prefs', { interactions: next });
    if (!next) setFloats([]);
  }, []);

  return {
    on, toggle, viewers, cfg, staff, messages, floats, error,
    send: (text: string) => sock.current?.emit('live:chat', { text }),
    react: (emoji: string) => sock.current?.emit('live:react', { emoji }),
    remove: (id: string) => sock.current?.emit('live:delete', { id }),
    mute: (userId: string) => sock.current?.emit('live:mute', { userId, minutes: 10 }),
  };
}

function Chat({ room }: { room: ReturnType<typeof useLiveRoom> }) {
  const { cfg, messages, staff, error } = room;
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => { const b = box.current; if (b && stick.current) b.scrollTop = b.scrollHeight; }, [messages]);
  if (!cfg) return null;
  function submit() {
    const t = text.trim();
    if (!t) return;
    room.send(t);
    setText('');
  }
  return (
    <div className="live-chat">
      <div className="live-chat-head">💬 Chat du direct</div>
      <div className="live-chat-list" ref={box} onScroll={(e) => { const b = e.currentTarget; stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 40; }}>
        {messages.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>Sois le premier à écrire !</div>}
        {messages.map((m) => (
          <div key={m.id} className="live-chat-msg">
            <strong><Nick id={m.userId} name={m.username} /></strong> <span>{m.text}</span>
            {staff && <span className="live-chat-mod"><button type="button" title="Supprimer ce message" onClick={() => room.remove(m.id)}>🗑</button><button type="button" title="Réduire au silence 10 minutes" onClick={() => room.mute(m.userId)}>🔇</button></span>}
          </div>
        ))}
      </div>
      {error && <div className="live-chat-error">{error}</div>}
      <div className="live-chat-input">
        <input value={text} maxLength={cfg.maxLen} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={cfg.slowSeconds ? `Écrire… (un message toutes les ${cfg.slowSeconds} s)` : 'Écrire…'} aria-label="Message du chat" />
        <button type="button" onClick={submit} disabled={!text.trim()}>Envoyer</button>
      </div>
    </div>
  );
}

/**
 * Scène du direct : le lecteur avec, par-dessus, le nombre de spectateurs, les réactions qui flottent et le bouton qui coupe tout (chat, réactions, compteur) ;
 * à côté le chat, dessous la barre de réactions. « Plein écran » prend toute la scène : le chat et les réactions restent visibles.
 */
export default function LiveStage({ children }: { children: (overlay: ReactNode) => ReactNode }) {
  const room = useLiveRoom();
  const stage = useRef<HTMLDivElement>(null);
  const [cool, setCool] = useState(false);
  const cfg = room.cfg;
  const showChat = room.on && !!cfg?.chat;
  const showReactions = room.on && !!cfg?.reactions;

  function react(e: string) {
    if (cool) return;
    room.react(e);
    setCool(true);
    window.setTimeout(() => setCool(false), 400);
  }
  function fullscreen() {
    const el = stage.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  }

  const overlay = (
    <>
      {room.on && cfg && <div className="live-badge" title="Membres qui regardent en ce moment">👁 {room.viewers}</div>}
      <div className="live-tools">
        <button type="button" onClick={room.toggle} className={room.on ? '' : 'off'} title={room.on ? 'Couper le chat, les réactions et le compteur pour ne pas être dérangé' : 'Réactiver le chat, les réactions et le compteur'}>
          {room.on ? '💬 Chat et réactions : activés' : '🔕 Chat et réactions : coupés'}
        </button>
        <button type="button" onClick={fullscreen} title="Plein écran">⛶</button>
      </div>
      <div className="live-floats" aria-hidden="true">
        {room.floats.map((f) => <span key={f.id} className="live-float" style={{ left: `${f.left}%`, animationDuration: `${f.duration}s` }}>{f.emoji}</span>)}
      </div>
    </>
  );

  return (
    <div ref={stage} className="live-stage">
      <div className="live-main">
        {children(overlay)}
        {showReactions && cfg && (
          <div className="live-reactions" role="group" aria-label="Réactions">
            {cfg.emojis.map((e) => <button key={e} type="button" onClick={() => react(e)} disabled={cool} aria-label={`Réagir ${e}`}>{e}</button>)}
            <span className="muted" style={{ fontSize: 11.5 }}>{cfg.reactionsPerMinute} par minute au plus</span>
          </div>
        )}
      </div>
      {showChat && <Chat room={room} />}
    </div>
  );
}
