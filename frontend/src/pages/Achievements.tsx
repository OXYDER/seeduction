import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Loading from '../components/Loading';

interface Item { code: string; name: string; icon: string; description: string; category: string; earned: boolean; awardedAt: string | null; value: number; target: number; unit: string | null; percentOfMembers: number }
interface Data { categories: { key: string; label: string; icon: string }[]; total: number; earnedCount: number; items: Item[] }

const fmt = (n: number) => n.toLocaleString('fr-CA');
const day = (iso: string) => new Date(iso).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });

/** Mes réalisations : tous les badges, ce qui est obtenu, où j'en suis pour les autres, et leur rareté. */
export default function Achievements() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [only, setOnly] = useState<'all' | 'todo' | 'done'>('all');
  useEffect(() => { api.get('/badges/progress').then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible')); }, []);
  if (!data) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />;

  // Les plus proches de l'obtention d'abord : de quoi se fixer un objectif.
  const next = data.items.filter((i) => !i.earned && i.target > 0).sort((a, b) => b.value / b.target - a.value / a.target).slice(0, 3);
  const pct = Math.round((data.earnedCount / Math.max(1, data.total)) * 100);
  return (
    <div className="grid">
      <h1 style={{ marginBottom: 0 }}>🏅 Mes réalisations</h1>
      <div className="panel" style={{ display: 'grid', gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <strong>{data.earnedCount} / {data.total} badges obtenus</strong>
          <span className="muted">Les badges d'un membre sont visibles sur son profil. Le <Link to="/hall-of-fame">Hall of Fame</Link> classe les plus décorés.</span>
        </div>
        <div className="ach-bar" aria-label={`${pct} % des badges obtenus`}><span style={{ width: `${pct}%` }} /></div>
        {next.length > 0 && (
          <div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Les prochains à portée de main :</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {next.map((i) => <span key={i.code} className="badge" title={i.description}>{i.icon} {i.name} · {fmt(i.value)} / {fmt(i.target)}{i.unit ? ` ${i.unit}` : ''}</span>)}
            </div>
          </div>
        )}
        <div className="row" style={{ gap: 6 }}>
          {([['all', 'Tous'], ['todo', 'À obtenir'], ['done', 'Obtenus']] as const).map(([k, label]) => <button key={k} type="button" className={only === k ? '' : 'secondary'} onClick={() => setOnly(k)}>{label}</button>)}
        </div>
      </div>
      {data.categories.map((c) => {
        const items = data.items.filter((i) => i.category === c.key && (only === 'all' || (only === 'done' ? i.earned : !i.earned)));
        if (items.length === 0) return null;
        return (
          <section key={c.key} className="panel" style={{ display: 'grid', gap: 10 }}>
            <h3 style={{ margin: 0 }}>{c.icon} {c.label}</h3>
            <div className="ach-grid">
              {items.map((i) => (
                <div key={i.code} className={`ach-card${i.earned ? ' earned' : ''}`}>
                  <span className="ach-icon" aria-hidden>{i.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{i.name} {i.earned && <span title="Obtenu" aria-label="Obtenu">✅</span>}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{i.description}</div>
                    {i.earned ? (
                      <div style={{ fontSize: 12, marginTop: 4 }}>{i.awardedAt ? `Obtenu le ${day(i.awardedAt)}` : 'Obtenu'}</div>
                    ) : (
                      <div style={{ marginTop: 6 }}>
                        <div className="ach-bar small"><span style={{ width: `${Math.round((i.value / Math.max(1, i.target)) * 100)}%` }} /></div>
                        <div className="muted" style={{ fontSize: 11 }}>{fmt(i.value)} / {fmt(i.target)}{i.unit ? ` ${i.unit}` : ''}</div>
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{i.percentOfMembers > 0 ? `${i.percentOfMembers} % des membres l'ont` : 'Personne ne l\'a encore !'}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
