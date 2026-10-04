import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { TICKET_PRIORITY, TICKET_STATUS, useSupport, type TicketAttachment, type TicketDetail, type TicketMessage } from '../store/support';
import { useCrumbTitle } from '../store/crumbs';
import { timeAgo } from '../lib/time';
import Avatar from '../components/Avatar';
import UserLink from '../components/UserLink';
import WysiwygEditor from '../components/WysiwygEditor';
import { AttachmentPicker, Attachments, PriorityChip, StatusChip, TicketText, WikiSuggestions, useWikiSuggestions } from '../components/SupportBits';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const fullDate = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

interface Canned { id: string; title: string; content: string }
interface Member { id: string; username: string }
interface Category { id: string; name: string; icon: string | null }

function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return (
    <span className="tk-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onPick} className={n <= value ? 'on' : ''} onClick={() => onPick?.(n)} aria-label={`${n} sur 5`}>★</button>
      ))}
    </span>
  );
}

function ChatHistory({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tk-chat-history">
      <button type="button" className="secondary" onClick={() => setOpen((v) => !v)}>{open ? '▾' : '▸'} 💬 Échange précédent dans le chat de support</button>
      {open && <pre>{text}</pre>}
    </div>
  );
}

function Bubble({ m, staffView }: { m: TicketMessage; staffView: boolean }) {
  if (m.kind === 'CHAT') return <ChatHistory text={m.content} />;
  if (m.kind === 'EVENT') return <div className={`tk-event${m.internal ? ' internal' : ''}`}>{m.internal && '🔒 '}{m.content} · {timeAgo(m.createdAt)}</div>;
  const fromTeam = m.kind === 'STAFF';
  return (
    <div className={`tk-msg ${fromTeam ? 'team' : 'member'}${m.internal ? ' note' : ''}`}>
      <Avatar user={m.author} size={34} />
      <div className="tk-msg-body">
        <div className="tk-msg-head">
          {m.author ? <UserLink user={m.author} /> : <strong>Membre</strong>}
          {fromTeam && !m.internal && <span className="tk-team-badge">Équipe SDT</span>}
          {m.internal && staffView && <span className="tk-note-badge">🔒 Note interne — invisible du membre</span>}
          <span className="muted" title={fullDate(m.createdAt)}>{timeAgo(m.createdAt)}</span>
        </div>
        {m.content && <TicketText text={m.content} />}
        <Attachments items={m.attachments} />
      </div>
    </div>
  );
}

/** Un billet : le fil complet, la réponse, et pour l'équipe les outils de traitement (statut, priorité, assignation, réponses types, wiki, brouillon IA). */
export default function SupportTicket() {
  const { id } = useParams();
  const me = useAuthStore((s) => s.user);
  const isStaff = STAFF.includes(me?.role ?? '');
  const refreshBadge = useSupport((s) => s.refreshBadge);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [canned, setCanned] = useState<Canned[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wikiQ, setWikiQ] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const count = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useCrumbTitle(ticket ? `Billet #${ticket.number}` : null);
  const related = useWikiSuggestions(ticket && !isStaff ? ticket.subject : '', 6);
  const staffHits = useWikiSuggestions(wikiQ, 3);

  const load = useCallback((silent = false) => {
    api.get(`/support/tickets/${id}`).then((r) => {
      setTicket(r.data);
      if (!silent || r.data.messages.length !== count.current) {
        if (count.current && r.data.messages.length > count.current) setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
        count.current = r.data.messages.length;
      }
      void refreshBadge();
    }).catch((e) => { if (!silent) setError(e.response?.data?.message ?? 'Billet introuvable'); });
  }, [id, refreshBadge]);

  useEffect(() => { setTicket(null); count.current = 0; load(); }, [load]);
  // Nouvelle réponse sans recharger la page : on relit le billet toutes les 15 secondes tant qu'il est affiché.
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(true); }, 15_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!isStaff) return;
    api.get('/support/staff/canned').then((r) => setCanned(r.data)).catch(() => {});
    api.get('/support/staff/members').then((r) => setMembers(r.data)).catch(() => {});
    api.get('/support/staff/categories').then((r) => setCategories(r.data)).catch(() => {});
  }, [isStaff]);

  const insert = (bbcode: string) => { setText((t) => (t.trim() ? `${t}\n\n${bbcode}` : bbcode)); setEditorKey((k) => k + 1); };

  async function send(status?: string) {
    if (!ticket) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { data } = await api.post(`/support/tickets/${ticket.id}/reply`, { content: text, attachments, internal: isStaff && internal, status });
      setTicket(data); count.current = data.messages.length;
      setText(''); setAttachments([]); setEditorKey((k) => k + 1);
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
      void refreshBadge();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Envoi impossible'); }
    finally { setBusy(false); }
  }

  async function patch(body: Record<string, unknown>) {
    if (!ticket) return;
    setError('');
    try { const { data } = await api.patch(`/support/staff/tickets/${ticket.id}`, body); setTicket(data); count.current = data.messages.length; void refreshBadge(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Modification impossible'); }
  }

  async function myStatus(status: 'RESOLVED' | 'CLOSED' | 'OPEN') {
    if (!ticket) return;
    if (status === 'CLOSED' && !window.confirm('Fermer ce billet ? Tu ne pourras plus y répondre.')) return;
    try { const { data } = await api.post(`/support/tickets/${ticket.id}/status`, { status }); setTicket(data); count.current = data.messages.length; void refreshBadge(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
  }

  async function rate() {
    if (!ticket || !rating) return;
    try { const { data } = await api.post(`/support/tickets/${ticket.id}/rate`, { rating, comment: ratingComment }); setTicket(data); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Notation impossible'); }
  }

  async function draft() {
    if (!ticket) return;
    setDrafting(true); setError(''); setNotice('');
    try {
      const { data } = await api.post(`/support/staff/tickets/${ticket.id}/draft`);
      const links = (data.sources as { slug: string; title: string }[]).map((s) => `[url=/wiki/${s.slug}]${s.title}[/url]`);
      insert(`${data.reply}${links.length ? `\n\nPour en savoir plus : ${links.join(', ')}` : ''}`);
      setNotice('✨ Brouillon inséré : relis-le, complète les [crochets] puis envoie.');
    } catch (err: any) { setError(err.response?.data?.message ?? 'Le brouillon n’a pas pu être généré'); }
    finally { setDrafting(false); }
  }

  if (error && !ticket) return <div className="panel"><p style={{ color: 'var(--danger)' }}>{error}</p><Link to="/support">← Retour au support</Link></div>;
  if (!ticket) return <p className="muted">Chargement…</p>;

  const mine = ticket.requester.id === me?.id;
  const closed = ticket.status === 'CLOSED';
  const canReply = !closed || isStaff;
  const staffView = isStaff && !mine;

  return (
    <div className={`tk-page${staffView ? ' staff' : ''}`}>
      <div className="tk-main grid" style={{ gap: 14 }}>
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="muted">Billet #{ticket.number}{ticket.category ? ` · ${ticket.category.icon ?? ''} ${ticket.category.name}` : ''}</div>
              <h2 style={{ margin: '2px 0 6px' }}>{ticket.subject}</h2>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <StatusChip status={ticket.status} />
                {staffView && <PriorityChip priority={ticket.priority} />}
                <span className="muted">Ouvert {timeAgo(ticket.createdAt)} par <UserLink user={ticket.requester} />{ticket.source === 'CHAT' ? ' depuis le chat' : ticket.source === 'STAFF' ? ' (par l’équipe)' : ''}</span>
                {ticket.assignee && <span className="muted">· pris en charge par <strong>{ticket.assignee.username}</strong></span>}
              </div>
            </div>
            <Link to={isStaff ? '/admin?tab=Support' : '/support'} className="secondary" style={{ padding: '8px 14px', alignSelf: 'flex-start' }}>← {isStaff ? 'File des billets' : 'Mes billets'}</Link>
          </div>
        </div>

        <div className="panel tk-thread">
          {ticket.messages.map((m) => <Bubble key={m.id} m={m} staffView={staffView} />)}
          <div ref={bottom} />
        </div>

        {mine && (ticket.status === 'RESOLVED' || closed) && (
          <div className="panel tk-note">
            {ticket.rating ? (
              <div className="row" style={{ gap: 10 }}><Stars value={ticket.rating} /><span className="muted">Merci pour ta note{ticket.ratingComment ? ` : « ${ticket.ratingComment} »` : ''} !</span></div>
            ) : (
              <div className="grid" style={{ gap: 8 }}>
                <strong>{ticket.status === 'RESOLVED' ? '✅ Ce billet est marqué comme résolu.' : 'Ce billet est fermé.'} Comment s’est passé le support ?</strong>
                <Stars value={rating} onPick={setRating} />
                {rating > 0 && (
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <input style={{ flex: 1, minWidth: 220 }} value={ratingComment} maxLength={500} onChange={(e) => setRatingComment(e.target.value)} placeholder="Un commentaire ? (facultatif)" />
                    <button type="button" onClick={rate}>Envoyer ma note</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {canReply && (
          <div className={`panel tk-reply${internal ? ' note' : ''}`}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <strong>{internal ? '🔒 Note interne (le membre ne la voit pas)' : closed ? 'Réponse de l’équipe' : ticket.status === 'RESOLVED' && mine ? 'Le problème est revenu ? Réponds ici, le billet se rouvre' : 'Ta réponse'}</strong>
              {staffView && (
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Note interne
                </label>
              )}
            </div>
            {staffView && (
              <div className="tk-tools">
                <select value="" onChange={(e) => { const c = canned.find((x) => x.id === e.target.value); if (c) insert(c.content); }}>
                  <option value="">💬 Réponse type…</option>
                  {canned.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
                <button type="button" className="secondary" disabled={drafting} onClick={draft} title="Brouillon écrit par l’IA d’après le billet et le wiki">{drafting ? '✨ Rédaction…' : '✨ Brouillon IA'}</button>
                <div className="tk-wiki-pick">
                  <input value={wikiQ} onChange={(e) => setWikiQ(e.target.value)} placeholder="📖 Insérer un article du wiki…" />
                  {wikiQ.trim().length >= 6 && staffHits.length > 0 && (
                    <div className="tk-wiki-results">
                      {staffHits.map((a) => (
                        <button key={a.slug} type="button" onClick={() => { insert(`Voir : [url=/wiki/${a.slug}]${a.title}[/url]`); setWikiQ(''); }}>
                          <strong>{a.title}</strong><span className="muted"> · {a.category}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <WysiwygEditor key={editorKey} value={text} onChange={setText} minHeight={150} placeholder={internal ? 'Note pour l’équipe…' : 'Écris ta réponse…'} />
            <AttachmentPicker value={attachments} onChange={setAttachments} disabled={busy} />
            {notice && <div className="muted" style={{ color: 'var(--success)' }}>{notice}</div>}
            {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => send()} disabled={busy || (!text.replace(/\[[^\]]*\]/g, '').trim() && attachments.length === 0)}>{busy ? 'Envoi…' : internal ? 'Ajouter la note' : 'Envoyer'}</button>
              {staffView && !internal && <button type="button" className="secondary" disabled={busy || !text.trim()} onClick={() => send('RESOLVED')}>Envoyer et marquer résolu</button>}
              {mine && !closed && ticket.status !== 'RESOLVED' && <button type="button" className="secondary" onClick={() => myStatus('RESOLVED')}>✅ C’est résolu</button>}
              {mine && !closed && <button type="button" className="secondary" onClick={() => myStatus('CLOSED')}>Fermer le billet</button>}
            </div>
          </div>
        )}
        {!canReply && <div className="panel tk-note">Ce billet est fermé. Si le problème revient, <Link to="/support/new">ouvre un nouveau billet</Link>.</div>}
      </div>

      <aside className="tk-side grid" style={{ gap: 14 }}>
        {staffView ? (
          <div className="panel grid" style={{ gap: 10 }}>
            <h3 style={{ margin: 0 }}>Traitement</h3>
            <label className="muted">Statut
              <select value={ticket.status} onChange={(e) => patch({ status: e.target.value })}>
                {Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label className="muted">Priorité
              <select value={ticket.priority} onChange={(e) => patch({ priority: e.target.value })}>
                {Object.entries(TICKET_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="muted">Catégorie
              <select value={ticket.category?.id ?? ''} onChange={(e) => patch({ categoryId: e.target.value || null })}>
                <option value="">— aucune —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.icon ?? ''} {c.name}</option>)}
              </select>
            </label>
            <label className="muted">Assigné à
              <select value={ticket.assignee?.id ?? ''} onChange={(e) => patch({ assigneeId: e.target.value || null })}>
                <option value="">— personne (dans la file) —</option>
                {members.map((u) => <option key={u.id} value={u.id}>{u.username}{u.id === me?.id ? ' (moi)' : ''}</option>)}
              </select>
            </label>
            {ticket.assignee?.id !== me?.id && <button type="button" className="secondary" onClick={() => patch({ assigneeId: me?.id })}>🙋 Prendre en charge</button>}
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
            <div className="muted">Membre : <UserLink user={ticket.requester} /> · <Link to={`/users/${ticket.requester.id}`}>profil</Link></div>
            {ticket.rating && <div className="row" style={{ gap: 8 }}><Stars value={ticket.rating} /><span className="muted">{ticket.ratingComment}</span></div>}
          </div>
        ) : (
          <div className="panel grid" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>Infos</h3>
            <div className="muted">Ouvert le {fullDate(ticket.createdAt)}</div>
            <div className="muted">{ticket.status === 'ANSWERED' ? 'L’équipe a répondu : à toi de jouer.' : ticket.status === 'OPEN' ? 'En attente d’une réponse de l’équipe.' : ticket.status === 'RESOLVED' ? 'Marqué comme résolu.' : 'Billet fermé.'}</div>
            <Link to="/support" className="secondary" style={{ padding: '8px 14px', textAlign: 'center' }}>Tous mes billets</Link>
          </div>
        )}
        {!staffView && related.length > 0 && <div className="panel"><WikiSuggestions items={related} title="📖 À lire en attendant" compact /></div>}
      </aside>
    </div>
  );
}
