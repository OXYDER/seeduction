import { useEffect, useState } from 'react';
import UserLink from '../components/UserLink';
import { api } from '../api/client';

export default function Messages() {
  const [inbox, setInbox] = useState<any[]>([]);
  const [form, setForm] = useState({ recipientUsername: '', subject: '', content: '' });
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api.get('/messages/inbox').then((r) => setInbox(r.data));
  }, [sent]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/messages/send', form);
    setForm({ recipientUsername: '', subject: '', content: '' });
    setSent((s) => !s);
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
      <div className="panel">
        <h3>Boîte de réception</h3>
        <table>
          <tbody>
            {inbox.map((m) => (
              <tr key={m.id} style={{ fontWeight: m.read ? 400 : 700 }}>
                <td><UserLink user={m.sender} /></td>
                <td>{m.subject}</td>
                <td className="muted">{new Date(m.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h3>Nouveau message</h3>
        <form onSubmit={send} className="grid">
          <input placeholder="Destinataire" value={form.recipientUsername} onChange={(e) => setForm({ ...form, recipientUsername: e.target.value })} required />
          <input placeholder="Sujet" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
          <textarea placeholder="Message" rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
          <button type="submit">Envoyer</button>
        </form>
      </div>
    </div>
  );
}
