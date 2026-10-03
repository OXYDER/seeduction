import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { timeAgo } from '../lib/time';
import { Pagination } from './ForumBits';

interface Item {
  id: string; at: string; category: string; verb: string; detail: string | null; ip: string | null; profile: string | null;
  target: { type: string; id: string; label: string } | null; staffOnMember?: boolean;
}
interface Data { total: number; page: number; pageSize: number; items: Item[]; counts: Record<string, number>; allCount: number; securityCount: number; categories: Record<string, string> }

const ICON: Record<string, string> = {
  download: '⬇️', upload: '⬆️', view: '👁️', search: '🔎', comment: '💬', forum: '🗨️', social: '🤝', message: '✉️', economy: '🪙', settings: '⚙️', team: '🏴', family: '👪', security: '🔐', staff: '🛡️', other: '•',
};

function targetLink(t: NonNullable<Item['target']>) {
  const to = t.type === 'torrent' ? `/torrents/${t.id}` : t.type === 'user' ? `/users/${t.id}` : t.type === 'topic' ? `/forum/topics/${t.id}` : t.type === 'team' ? `/teams/${t.id}` : null;
  return to && !t.label.startsWith('(') ? <Link to={to}>{t.label}</Link> : <span>{t.label}</span>;
}

/** Journal de toutes les actions d'un membre. Affiché sur son profil aux seuls membres de l'équipe Seeduction (le serveur refuse les autres). */
export default function MemberActivityPanel({ userId }: { userId: string }) {
  const [open, setOpen] = useState(true);
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { setPage(1); setCategory('all'); }, [userId]);
  useEffect(() => {
    if (!open) return;
    setError('');
    api.get(`/admin/users/${userId}/activity`, { params: { page, category } }).then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Journal indisponible'));
  }, [userId, page, category, open]);

  const chips: [string, string, number][] = data
    ? [['all', 'Tout', data.allCount], ...Object.entries(data.categories).filter(([k]) => k !== 'security' && (data.counts[k] ?? 0) > 0).map(([k, l]): [string, string, number] => [k, l, data.counts[k]]), ['security', 'Connexions & modération', data.securityCount]]
    : [];

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>🕵️ Journal d'activité <span className="badge" style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>Équipe Seeduction uniquement</span></h3>
        <button type="button" className="secondary" onClick={() => setOpen((v) => !v)}>{open ? 'Masquer' : 'Afficher'}</button>
      </div>
      {open && (
        <>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 10px' }}>
            Tout ce que ce membre fait sur le site (téléchargements, envois, consultations, commentaires, forum, amis, achats, réglages, teams…), avec son adresse IP. Le contenu des messages privés n'est jamais enregistré. Les lignes sont conservées 180 jours. Ce journal n'est visible par aucun membre.
          </p>
          {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
          {data && (
            <>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {chips.map(([k, label, n]) => (
                  <button key={k} type="button" className={`secondary${category === k ? ' on' : ''}`} onClick={() => { setCategory(k); setPage(1); }}>
                    {k !== 'all' && `${ICON[k] ?? ''} `}{label} ({n})
                  </button>
                ))}
              </div>
              {data.items.length === 0 ? <p className="muted">Aucune activité enregistrée.</p> : (
                <div className="fam-feed">
                  {data.items.map((a) => (
                    <div key={a.id} className="fam-event">
                      <span aria-hidden style={{ width: 24, textAlign: 'center' }}>{ICON[a.category] ?? '•'}</span>
                      <div className="fam-event-text">
                        <div>
                          {a.profile && <strong>{a.profile} · </strong>}
                          {a.verb}
                          {a.target && <> « {targetLink(a.target)} »</>}
                          {a.detail && <span className="muted"> — {a.detail}</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>{timeAgo(a.at)} · {new Date(a.at).toLocaleString('fr-CA')}{a.ip ? ` · IP ${a.ip}` : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Pagination page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
            </>
          )}
          {!data && !error && <p className="muted">Chargement…</p>}
        </>
      )}
    </div>
  );
}
