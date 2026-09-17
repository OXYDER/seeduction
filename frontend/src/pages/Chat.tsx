import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

interface ChatMsg {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; username: string; role: string };
}

const STAFF_ROLES = ['MODERATOR', 'ADMIN', 'OWNER'];

export default function Chat() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [online, setOnline] = useState(0);
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/chat/messages').then((r) => setMessages(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const socket = io('/chat', { auth: { token: accessToken }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('chat:message', (msg: ChatMsg) => setMessages((prev) => [...prev, msg].slice(-200)));
    socket.on('chat:delete', ({ id }: { id: string }) => setMessages((prev) => prev.filter((m) => m.id !== id)));
    socket.on('chat:presence', ({ count }: { count: number }) => setOnline(count));
    socket.on('chat:error', (msg: string) => {
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    return () => {
      socket.disconnect();
    };
  }, [accessToken]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !socketRef.current) return;
    socketRef.current.emit('chat:message', { content: input });
    setInput('');
  }

  async function removeMessage(id: string) {
    await api.delete(`/chat/messages/${id}`);
  }

  const isStaff = !!me && STAFF_ROLES.includes(me.role);

  return (
    <div className="grid">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Chat en direct</h1>
        <span className="muted">🟢 {online} en ligne</span>
      </div>
      <div className="panel ornate" style={{ display: 'flex', flexDirection: 'column', height: '60vh' }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
          {messages.length === 0 && <p className="muted">Aucun message pour l'instant — lance la discussion.</p>}
          {messages.map((m) => (
            <div key={m.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong style={{ color: 'var(--gold)' }}>{m.user.username}</strong>
                <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
                  {new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div style={{ wordBreak: 'break-word' }}>{m.content}</div>
              </div>
              {isStaff && (
                <button className="secondary" style={{ fontSize: 11, padding: '2px 6px', flexShrink: 0 }} onClick={() => removeMessage(m.id)}>
                  Suppr.
                </button>
              )}
            </div>
          ))}
          <div ref={listEndRef} />
        </div>
        {error && <div className="muted" style={{ color: 'var(--danger)', fontSize: 12, margin: '6px 0 0' }}>{error}</div>}
        <form onSubmit={send} className="row" style={{ marginTop: 10 }}>
          <input placeholder="Écris un message..." value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} />
          <button type="submit">Envoyer</button>
        </form>
      </div>
    </div>
  );
}
