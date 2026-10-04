import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useSupport, type TicketAttachment } from '../store/support';
import WysiwygEditor from '../components/WysiwygEditor';
import { AttachmentPicker, WikiSuggestions, useWikiSuggestions } from '../components/SupportBits';

interface Category { id: string; name: string; icon: string | null; description: string | null }

/** Ouvrir un billet : le wiki propose des articles pendant qu'on écrit, l'échange avec l'assistant du chat peut être joint. */
export default function SupportNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const me = useAuthStore((s) => s.user);
  const overview = useSupport((s) => s.overview);
  const loadOverview = useSupport((s) => s.loadOverview);
  const fromChat = params.get('from') === 'chat';
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [attachChat, setAttachChat] = useState(fromChat);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hits = useWikiSuggestions(`${subject} ${content.replace(/\[[^\]]*\]/g, ' ')}`, 8);

  useEffect(() => { void loadOverview(); api.get('/support/categories').then((r) => setCategories(r.data)).catch(() => {}); }, [loadOverview]);

  // Depuis le chat : le dernier message du membre devient le titre du billet.
  useEffect(() => {
    if (!fromChat || !overview?.channelId || subject) return;
    api.get(`/messenger/conversations/${overview.channelId}/messages`, { params: { limit: 40 } }).then((r) => {
      const mine = (r.data.messages as any[]).filter((m) => m.sender.id === me?.id && m.type === 'TEXT' && m.content);
      const last = mine[mine.length - 1];
      if (last) setSubject(String(last.content).replace(/\s+/g, ' ').slice(0, 100));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromChat, overview?.channelId, me?.id]);

  async function submit() {
    setError('');
    if (subject.trim().length < 4) { setError('Donne un titre à ton billet'); return; }
    if (content.replace(/\[[^\]]*\]/g, '').trim().length < 10) { setError('Décris ton problème (quelques phrases)'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/support/tickets', { subject, content, categoryId: categoryId || undefined, attachments, fromChat: attachChat });
      void useSupport.getState().refreshBadge();
      navigate(`/support/${data.id}`, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Impossible d’ouvrir le billet');
      setBusy(false);
    }
  }

  return (
    <div className="grid" style={{ gap: 16, maxWidth: 860 }}>
      <div>
        <h1 style={{ margin: 0 }}>🎫 Ouvrir un billet</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>L’équipe SDT te répond en privé ; tu es prévenu dès qu’elle écrit. Plus ta description est précise, plus vite on règle ça.</p>
      </div>

      {fromChat && <div className="panel tk-note">💬 Tu viens du chat : ton échange avec l’assistant peut être joint au billet pour ne pas tout répéter.</div>}

      <div className="panel grid" style={{ gap: 14 }}>
        <div>
          <strong>Catégorie</strong>
          <div className="tk-cats">
            {categories.map((c) => (
              <button key={c.id} type="button" className={`tk-cat${categoryId === c.id ? ' on' : ''}`} title={c.description ?? ''} onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}>
                {c.icon ?? '•'} {c.name}
              </button>
            ))}
          </div>
        </div>

        <label className="tk-field">
          <strong>Titre</strong>
          <input value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} placeholder="Ex. : Mon hit & run ne disparaît pas après 72 h" />
        </label>

        <WikiSuggestions items={hits} />

        <div>
          <strong>Description</strong>
          <WysiwygEditor value={content} onChange={setContent} minHeight={200} placeholder="Qu’est-ce qui se passe ? Depuis quand ? Qu’as-tu déjà essayé ? Si possible : le nom du torrent, ton client BitTorrent et le message d’erreur." />
        </div>

        <AttachmentPicker value={attachments} onChange={setAttachments} disabled={busy} />

        {overview?.channelId && (
          <label className="row" style={{ gap: 8, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={attachChat} onChange={(e) => setAttachChat(e.target.checked)} />
            <span>Joindre mon dernier échange avec l’assistant du chat <span className="muted">(utile pour l’équipe)</span></span>
          </label>
        )}

        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
        <div className="row">
          <button type="button" onClick={submit} disabled={busy}>{busy ? 'Envoi…' : '🎫 Envoyer le billet'}</button>
          <Link to="/support" className="secondary" style={{ padding: '8px 14px' }}>Annuler</Link>
        </div>
      </div>
    </div>
  );
}
