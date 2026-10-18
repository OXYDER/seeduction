import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import CoinShower from '../components/CoinShower';

interface DuelV {
  id: string; kind: string; icon: string; title: string; unit: string; days: number; status: string; startDay: string | null; endDay: string | null; iAmChallenger: boolean; started: boolean;
  other: string; mine: number; theirs: number; result: 'won' | 'lost' | 'tie' | null; points: number; note: string; settledAt: string | null;
}
interface Kind { id: string; icon: string; title: string; unit: string; desc: string }
interface Overview {
  enabled: boolean; blocked: string | null;
  rules: { winPoints: number; consolationPoints: number; tiePoints: number; maxActive: number; maxPendingOut: number; maxRewardedPerDay: number; pairCooldownDays: number; expireHours: number };
  kinds: Kind[]; durations: number[]; incoming: DuelV[]; outgoing: DuelV[]; active: DuelV[]; recent: DuelV[]; stats: { won: number; lost: number; tied: number; points: number };
}
interface Person { id: string; username: string }
const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };
const SEEN_KEY = 'duels-seen';
const fmtDay = (s: string | null) => (s ? new Date(`${s}T12:00:00`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) : '');

function Score({ d }: { d: DuelV }) {
  const lead = d.mine > d.theirs ? 'me' : d.mine < d.theirs ? 'them' : '';
  return (
    <div className="du-score" aria-label={`Toi ${d.mine}, ${d.other} ${d.theirs}`}>
      <span className={lead === 'me' ? 'lead' : ''}><small>Toi</small><b>{d.mine}</b></span>
      <i>contre</i>
      <span className={lead === 'them' ? 'lead' : ''}><small>{d.other}</small><b>{d.theirs}</b></span>
    </div>
  );
}

/** Duels entre membres : un défi amical sur une activité gratuite (quiz, pronostics, défis) pendant 3 ou 7 jours. Rien n'est misé ; le site offre une petite récompense. */
export default function Duels() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [shower, setShower] = useState(0);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('quiz');
  const [days, setDays] = useState(3);
  const [people, setPeople] = useState<Person[]>([]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/games/duels');
      if (!alive.current) return;
      setData(r.data); setError('');
      // une pluie de pièces quand un duel gagné apparaît pour la première fois
      let seen: string[] = [];
      try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'); } catch { /* ignoré */ }
      const fresh = (r.data.recent as DuelV[]).filter((d) => d.result === 'won' && !seen.includes(d.id));
      try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...seen, ...(r.data.recent as DuelV[]).map((d) => d.id)])].slice(-60))); } catch { /* ignoré */ }
      if (fresh.length > 0 && seen.length > 0) setShower((n) => n + 1);
    } catch (e) { if (alive.current) setError(errorOf(e)); }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const q = name.trim().replace(/^@/, '');
    if (q.length < 2) { setPeople([]); return; }
    let cancelled = false;
    const t = window.setTimeout(() => { api.get('/users/mention-search', { params: { q } }).then((r) => { if (!cancelled) setPeople(r.data); }).catch(() => undefined); }, 200);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [name]);

  async function act(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key); setMsg(''); setError('');
    try { await fn(); setMsg(ok); await load(); } catch (e) { setError(errorOf(e)); } finally { setBusy(''); }
  }
  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  const kd = data.kinds.find((k) => k.id === kind);
  const r = data.rules;

  return (
    <div className="grid" style={{ gap: 14 }}>
      {shower > 0 && <CoinShower key={shower} coins={40} items={['⚔️', '🏆']} />}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>⚔️ Duels entre membres</h1>
        <Link to="/jeux" className="muted">← Tous les jeux</Link>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Défie un autre membre sur une activité gratuite pendant 3 ou 7 jours. Le duel commence le lendemain de l'acceptation. Gagnant : +{r.winPoints} points ; si tu perds après avoir joué : +{r.consolationPoints} points de consolation ;
        égalité : +{r.tiePoints} chacun. Rien n'est misé.
      </p>
      {data.blocked && <div className="panel" style={{ borderColor: 'var(--warning, #c90)' }}>{data.blocked}</div>}
      {msg && <p style={{ color: 'var(--success)', margin: 0 }}>{msg}</p>}
      {error && <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}

      <div className="du-stats">
        <div><b>{data.stats.won}</b><small>victoires</small></div>
        <div><b>{data.stats.tied}</b><small>égalités</small></div>
        <div><b>{data.stats.lost}</b><small>défaites</small></div>
        <div><b>{formatNumber(data.stats.points)}</b><small>points reçus</small></div>
      </div>

      {data.incoming.length > 0 && (
        <div className="panel ornate">
          <h2 style={{ margin: '0 0 8px' }}>📨 Invitations reçues</h2>
          <div className="du-list">
            {data.incoming.map((d) => (
              <div key={d.id} className="du-card">
                <div><strong>{d.other}</strong> te défie au <strong>{d.icon} {d.title}</strong><div className="muted" style={{ fontSize: 13 }}>{d.days} jours · commence le lendemain de ton acceptation</div></div>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" disabled={!!busy} onClick={() => act(d.id, () => api.post(`/games/duels/${d.id}/accept`), 'Duel accepté : il commence demain !')}>Accepter</button>
                  <button type="button" className="ghost" disabled={!!busy} onClick={() => act(d.id, () => api.post(`/games/duels/${d.id}/decline`), 'Invitation refusée')}>Refuser</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel ornate">
        <h2 style={{ margin: '0 0 8px' }}>⚔️ Duels en cours</h2>
        {data.active.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucun duel en cours. Lance une invitation ci-dessous !</p> : (
          <div className="du-list">
            {data.active.map((d) => (
              <div key={d.id} className="du-card col">
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <strong>{d.icon} {d.title} · {d.other}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>{d.started ? `jusqu'au ${fmtDay(d.endDay)}` : `commence le ${fmtDay(d.startDay)}`}</span>
                </div>
                <Score d={d} />
                <div className="muted" style={{ fontSize: 12.5 }}>{d.unit} sur {d.days} jours ({fmtDay(d.startDay)} au {fmtDay(d.endDay)})</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel ornate">
        <h2 style={{ margin: '0 0 8px' }}>🎯 Défier un membre</h2>
        <div className="du-form">
          <label>Adversaire
            <input list="du-people" value={name} onChange={(e) => setName(e.target.value)} placeholder="Pseudo du membre" maxLength={40} autoComplete="off" />
            <datalist id="du-people">{people.map((p) => <option key={p.id} value={p.username} />)}</datalist>
          </label>
          <label>Activité
            <select value={kind} onChange={(e) => setKind(e.target.value)}>{data.kinds.map((k) => <option key={k.id} value={k.id}>{k.icon} {k.title}</option>)}</select>
          </label>
          <label>Durée
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{data.durations.map((n) => <option key={n} value={n}>{n} jours</option>)}</select>
          </label>
          <button type="button" disabled={!!busy || !!data.blocked || name.trim().length < 2} onClick={() => act('new', () => api.post('/games/duels', { opponent: name, kind, days }).then(() => setName('')), 'Invitation envoyée !')}>Envoyer l'invitation</button>
        </div>
        {kd && <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>{kd.desc}</p>}
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
          Au plus {r.maxPendingOut} invitations en attente et {r.maxActive} duels en cours à la fois. Une invitation sans réponse expire après {Math.round(r.expireHours / 24 * 10) / 10 >= 1 ? `${Math.round(r.expireHours / 24)} jour${Math.round(r.expireHours / 24) > 1 ? 's' : ''}` : `${r.expireHours} h`}.
          Pour éviter les échanges de points entre amis, un membre reçoit des points pour {r.maxRewardedPerDay} duels par jour au maximum, et une même paire n'est récompensée qu'une fois tous les {r.pairCooldownDays} jours.
        </p>
      </div>

      {data.outgoing.length > 0 && (
        <div className="panel ornate">
          <h2 style={{ margin: '0 0 8px' }}>⏳ Invitations envoyées</h2>
          <div className="du-list">
            {data.outgoing.map((d) => (
              <div key={d.id} className="du-card">
                <div><strong>{d.other}</strong> · {d.icon} {d.title} · {d.days} jours<div className="muted" style={{ fontSize: 13 }}>En attente d'une réponse</div></div>
                <button type="button" className="ghost" disabled={!!busy} onClick={() => act(d.id, () => api.post(`/games/duels/${d.id}/cancel`), 'Invitation annulée')}>Annuler</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.recent.length > 0 && (
        <div className="panel ornate">
          <h2 style={{ margin: '0 0 8px' }}>📜 Derniers duels</h2>
          <div className="du-list">
            {data.recent.map((d) => (
              <div key={d.id} className={`du-card col res-${d.result ?? ''}`}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <strong>{d.icon} {d.title} · {d.other}</strong>
                  <span className="du-res">{d.mine === 0 && d.theirs === 0 ? 'Personne n\'a joué' : d.result === 'won' ? '🏆 Victoire' : d.result === 'tie' ? '🤝 Égalité' : 'Beau duel'}{d.points > 0 && <> · +{d.points} pts</>}</span>
                </div>
                <Score d={d} />
                {d.note && <div className="muted" style={{ fontSize: 12.5 }}>{d.note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
