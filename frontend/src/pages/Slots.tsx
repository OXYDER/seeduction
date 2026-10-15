import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { MACHINE_ORDER, skinFor, type MachineId } from '../lib/slotSkins';
import { useEventDecor } from '../store/eventTheme';
import SlotMachine, { type SlotConfig, type SlotGame, type SlotMe } from '../components/SlotMachine';
import type { EventId } from '../lib/eventArt';

interface Overview {
  config: SlotConfig & { enabled: boolean; machines: Record<MachineId, boolean> };
  me: SlotMe & { optOut: boolean };
  game: SlotGame;
  recent: { id: string; machine: MachineId; stake: number; valued: number; daily: boolean; win: number; freeSpins: number; createdAt: string }[];
  biggest: { username: string; machine: MachineId; stake: number; win: number; at: string }[];
}

const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Machines à sous : le serveur tire au sort, la page n'affiche que le résultat. */
export default function Slots() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const decor = useEventDecor();
  const event = (decor.id ?? decor.serverActive) as EventId | null;
  const machine = (params.get('m') as MachineId | null);

  const load = useCallback(() => api.get('/games/slots').then((r) => { setData(r.data); setError(''); }).catch(() => setError('Impossible de charger les machines à sous')), []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  const { config, me } = data;
  if (!config.enabled) return <div className="panel"><h1>🎰 Machines à sous</h1><p className="muted">Les machines à sous sont fermées pour le moment.</p></div>;

  const available = MACHINE_ORDER.filter((m) => config.machines[m]);
  const current = machine && available.includes(machine) ? machine : null;
  const locked = (m: MachineId) => m === 'saison' && !event;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>🎰 Machines à sous</h1>
        <Link to="/jeux" className="muted">← Retour aux jeux</Link>
      </div>

      <div className="panel ornate">
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div className="muted">Choisis une machine, mise de {config.minStake} à {config.maxStake} points, et tourne. {config.dailyFree.enabled && <>Un <strong>tour gratuit</strong> par jour est offert à tous.</>}</div>
          <div style={{ textAlign: 'right' }}>
            <div>Points misables : <strong style={{ color: 'var(--gold-bright)' }}>{formatNumber(me.stakeable)}</strong></div>
            {me.donated > 0 && <div className="muted" style={{ fontSize: 12.5 }}>+ {formatNumber(me.donated)} points de don (non misables)</div>}
          </div>
        </div>
        {me.blocked && <div style={{ marginTop: 8, color: 'var(--danger)' }}>{me.blocked}</div>}
      </div>

      <div className="slot-picker">
        {available.map((m) => {
          const skin = skinFor(m, event);
          const off = locked(m);
          return (
            <button key={m} type="button" className={`slot-card${current === m ? ' on' : ''}`} style={skin.vars as React.CSSProperties} disabled={off} onClick={() => setParams({ m })}>
              <span className="slot-card-icon">{skin.icon}</span>
              <strong>{skin.name}</strong>
              <small>{off ? '🔒 Pendant les fêtes (Halloween, Noël...)' : skin.tagline}</small>
            </button>
          );
        })}
      </div>

      {current ? (
        <SlotMachine
          key={`${current}-${event ?? ''}`} skin={skinFor(current, event)} machine={current} game={data.game} config={config} me={me} event={current === 'saison'}
          onUpdate={(patch) => setData((d) => (d ? { ...d, me: { ...d.me, ...patch } } : d))} onDone={() => void load()}
        />
      ) : (
        <div className="panel muted">Choisis une machine ci-dessus pour commencer.</div>
      )}

      <div className="moj-two">
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Mes derniers tours</h3>
          {data.recent.length === 0 ? <p className="muted">Pas encore de tour.</p> : (
            <table className="moj-board"><tbody>
              {data.recent.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{when(r.createdAt)}</td>
                  <td>{skinFor(r.machine, event).icon} {r.daily ? 'Tour gratuit' : `Mise ${r.stake}`}{r.freeSpins > 0 ? ' · bonus' : ''}</td>
                  <td style={{ textAlign: 'right', color: r.win > r.stake ? 'var(--green-bright)' : r.win === 0 ? 'var(--danger)' : undefined }}><strong>{r.win > 0 ? `+${formatNumber(r.win)}` : '0'}</strong></td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Plus gros gains (7 jours)</h3>
          {data.biggest.length === 0 ? <p className="muted">Aucun gain pour l'instant.</p> : (
            <table className="moj-board"><tbody>
              {data.biggest.map((b, i) => (
                <tr key={i}><td>{i + 1}</td><td>{b.username}</td><td className="muted">{skinFor(b.machine, event).icon} mise {b.stake}</td><td style={{ textAlign: 'right', color: 'var(--green-bright)' }}><strong>+{formatNumber(b.win)}</strong></td></tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>

      <div className="panel muted" style={{ fontSize: 13 }}>
        Jeu de hasard avec des points du site, sans valeur en argent : le résultat est tiré par le serveur, jamais par ton navigateur. Le retour théorique est de {data.game.rtp} % : à long terme, le site garde une part de ce qui est misé,
        et gagner n'est jamais garanti. Les points reçus par un don ne peuvent pas être misés. Joue pour le plaisir et fais des pauses : tu peux te retirer des jeux à tout moment depuis la page <Link to="/jeux">Jeux</Link>.
      </div>
    </div>
  );
}
