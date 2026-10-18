import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import Loading from '../components/Loading';

interface Row { rank: number; username: string; value: number; detail: string; mine: boolean }
interface Board { id: string; title: string; icon: string; unit: string; hint: string; rows: Row[]; me: { rank: number; value: number } | null }
interface Data { week: { start: string; end: string }; boards: Board[] }
const MEDAL = ['🥇', '🥈', '🥉'];

/** Classements des jeux gratuits : les meilleurs du quiz, des pronostics, de la roue, des défis et des cartes. */
export default function Classements() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => api.get('/games/boards').then((r) => { setD(r.data); setError(''); }).catch(() => setError('Impossible de charger les classements'));
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!d) return <Loading error={error} />;
  const fmt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' });

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🏆 Classements des jeux</h1>
        <Link to="/jeux" className="muted">← Tous les jeux</Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>Les meilleurs des jeux gratuits : quiz, pronostics, roue, défis et cartes. Semaine du {fmt(d.week.start)} au {fmt(d.week.end)}. Aucun classement ne dépend de mises.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        {d.boards.map((b) => (
          <div key={b.id} className="panel ornate">
            <h2 style={{ margin: '0 0 2px' }}>{b.icon} {b.title}</h2>
            <p className="muted" style={{ margin: '0 0 8px', fontSize: 12.5 }}>{b.hint}</p>
            {b.rows.length === 0 ? <p className="muted" style={{ margin: 0 }}>Personne pour l'instant : sois le premier !</p> : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 3 }}>
                {b.rows.map((r) => (
                  <li key={r.rank} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, alignItems: 'baseline', padding: '3px 6px', borderRadius: 6, background: r.mine ? 'rgba(255, 210, 74, 0.14)' : undefined }}>
                    <span>{MEDAL[r.rank - 1] ?? `${r.rank}.`}</span>
                    <span>{r.username}{r.detail && <span className="muted" style={{ fontSize: 12 }}> · {r.detail}</span>}</span>
                    <strong style={{ color: 'var(--green-bright)' }}>{formatNumber(r.value)} <small className="muted">{b.unit}</small></strong>
                  </li>
                ))}
              </ol>
            )}
            {b.me && b.me.rank > b.rows.length && <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Ton rang : <strong>{b.me.rank}</strong> ({formatNumber(b.me.value)} {b.unit})</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
