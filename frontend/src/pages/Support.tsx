import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useSupport, type TicketSummary } from '../store/support';
import { timeAgo } from '../lib/time';
import { StatusChip, WikiSuggestions, useWikiSuggestions } from '../components/SupportBits';

const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

/** Centre de support : chercher dans le wiki, discuter en direct (assistant + équipe), ouvrir et suivre ses billets. */
export default function Support() {
  const me = useAuthStore((s) => s.user);
  const overview = useSupport((s) => s.overview);
  const loadOverview = useSupport((s) => s.loadOverview);
  const refreshBadge = useSupport((s) => s.refreshBadge);
  const staffBadge = useSupport((s) => s.staff);
  const [tickets, setTickets] = useState<TicketSummary[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const hits = useWikiSuggestions(q, 4);
  const isStaff = STAFF.includes(me?.role ?? '');

  useEffect(() => { void loadOverview(); void refreshBadge(); }, [loadOverview, refreshBadge]);
  useEffect(() => {
    api.get('/support/tickets', { params: { filter } }).then((r) => setTickets(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Impossible de charger tes billets'));
  }, [filter]);

  const chatLink = overview?.channelId ? `/chat?c=${overview.channelId}` : '/chat';
  const closed = overview && !overview.enabled;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel ornate sup-hero">
        <div>
          <h1 style={{ margin: 0 }}>🛟 Support</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Une question, un souci ? Cherche d’abord dans le wiki, discute en direct avec l’assistant et l’équipe SDT, ou ouvre un billet : on te répond en privé.</p>
          {overview?.hoursText && <p className="muted" style={{ margin: '6px 0 0' }}>🕒 {overview.hoursText}</p>}
        </div>
        {isStaff && <Link to="/moderation?tab=billets" className="secondary" style={{ whiteSpace: 'nowrap' }}>🛡️ Gérer les billets{staffBadge ? ` (${staffBadge})` : ''}</Link>}
      </div>

      {closed && <div className="panel" style={{ borderColor: 'var(--danger)' }}>Le support est temporairement fermé. Reviens plus tard, ou consulte le wiki.</div>}

      <div className="sup-search panel">
        <label htmlFor="sup-q"><strong>🔎 Décris ton problème en quelques mots</strong></label>
        <input id="sup-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex. : mon hit & run ne disparaît pas, mot de passe oublié, torrent refusé…" autoComplete="off" />
        {q.trim().length >= 4 && hits.length === 0 && <p className="muted" style={{ margin: 0 }}>Aucun article ne correspond exactement. Essaie le chat en direct ou ouvre un billet.</p>}
        <WikiSuggestions items={hits} title="📖 Dans le wiki" />
      </div>

      <div className="sup-cards">
        <Link to="/wiki" className="panel sup-card">
          <span className="sup-card-icon">📖</span>
          <strong>Wiki et FAQ</strong>
          <span className="muted">Guides, règles et réponses aux questions courantes.</span>
        </Link>
        <Link to={chatLink} className="panel sup-card">
          <span className="sup-card-icon">💬</span>
          <strong>Chat en direct</strong>
          <span className="muted">
            {overview?.aiActive ? `${overview.botName} répond tout de suite` : 'Pose ta question dans le canal Support'}
            {overview && overview.staffOnline > 0 ? ` · 🟢 ${overview.staffOnline} de l’équipe en ligne` : ''}
          </span>
        </Link>
        <Link to="/support/new" className="panel sup-card accent">
          <span className="sup-card-icon">🎫</span>
          <strong>Ouvrir un billet</strong>
          <span className="muted">Pour un problème qui demande l’équipe : suivi privé jusqu’à la résolution.</span>
        </Link>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Mes billets</h3>
          <div className="row tk-filter">
            <button type="button" className={filter === 'open' ? 'on' : 'secondary'} onClick={() => setFilter('open')}>En cours</button>
            <button type="button" className={filter === 'all' ? 'on' : 'secondary'} onClick={() => setFilter('all')}>Tous</button>
          </div>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {tickets === null && !error && <p className="muted">Chargement…</p>}
        {tickets && tickets.length === 0 && (
          <p className="muted" style={{ margin: '12px 0 0' }}>
            {filter === 'open' ? 'Aucun billet en cours.' : 'Tu n’as encore ouvert aucun billet.'} <Link to="/support/new">Ouvrir un billet</Link>
          </p>
        )}
        {tickets && tickets.length > 0 && (
          <div className="tk-list">
            {tickets.map((t) => (
              <Link key={t.id} to={`/support/${t.id}`} className={`tk-row${t.unread ? ' unread' : ''}`}>
                <span className="tk-num">#{t.number}</span>
                <span className="tk-subject">
                  {t.unread && <span className="tk-dot" title="Nouvelle réponse" />}
                  <strong>{t.subject}</strong>
                  <span className="muted">{t.category ? `${t.category.icon ?? ''} ${t.category.name}` : 'Sans catégorie'}</span>
                </span>
                <StatusChip status={t.status} />
                <span className="muted tk-when">{t.lastReplyBy === 'STAFF' ? 'Équipe' : 'Toi'} · {timeAgo(t.lastReplyAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
