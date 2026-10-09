import Pager from '../components/Pager';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { downloadTorrent } from '../lib/download';
import { formatBytes, formatNumber } from '../lib/format';
import { timeAgo } from '../lib/time';
import UserLink from '../components/UserLink';
import { Tile, gridStyle } from '../components/stats/StatsBits';

const SORTS = [
  { id: 'popular', label: 'Les plus téléchargés' },
  { id: 'longest', label: 'Morts depuis le plus longtemps' },
  { id: 'recent', label: 'Morts le plus récemment' },
  { id: 'big', label: 'Les plus gros' },
  { id: 'reward', label: 'Meilleure récompense' },
];

interface Item {
  id: string; name: string; coverImage: string | null; category: { name: string; slug: string } | null; size: number; year: number | null; resolution: string | null;
  completedCount: number; leechers: number; status: string; deadSince: string; deadDays: number; officiallyDead: boolean; reward: number; rewardEligible: boolean;
  snatchedByMe: boolean; snatchedAt: string | null; snatchers: number; pendingRevival: boolean; canRequest: boolean; reseedRequestedAt: string | null;
}

/** Réanimation : tous les torrents sans seeder, ceux que tu peux relancer toi-même, la récompense à gagner et les membres qui ont déjà fait renaître des torrents. */
export default function Dead() {
  const [params, setParams] = useSearchParams();
  const sort = SORTS.some((s) => s.id === params.get('sort')) ? params.get('sort')! : 'popular';
  const mine = params.get('mine') === '1';
  const category = params.get('category') ?? '';
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
  const [q, setQ] = useState(params.get('q') ?? '');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const query = params.get('q') ?? '';
  const load = useCallback(() => {
    api.get('/stats/dead', { params: { sort, mine: mine ? '1' : '', category, q: query, page } })
      .then((r) => { setData(r.data); setError(''); })
      .catch((e) => setError(e.response?.data?.message ?? 'Page indisponible'));
  }, [sort, mine, category, query, page]);
  useEffect(() => { load(); }, [load]);

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => { const h = setTimeout(() => { if (q !== (params.get('q') ?? '')) set({ q }); }, 350); return () => clearTimeout(h); /* eslint-disable-next-line */ }, [q]);

  async function request(t: Item) {
    try {
      const { data: r } = await api.post(`/social/reseed/${t.id}`);
      setNotes((n) => ({ ...n, [t.id]: `✓ Demande envoyée à ${r.notified} membre${r.notified > 1 ? 's' : ''} qui l'ont téléchargé` }));
      load();
    } catch (err: any) { setNotes((n) => ({ ...n, [t.id]: err.response?.data?.message ?? 'Demande impossible' })); }
  }
  async function getTorrent(t: Item) {
    try { await downloadTorrent(t.id, t.name); setNotes((n) => ({ ...n, [t.id]: '⬇ .torrent téléchargé : ouvre-le dans ton client et pointe-le vers tes fichiers pour reprendre le seed.' })); }
    catch (err: any) { setNotes((n) => ({ ...n, [t.id]: err.response?.data?.message ?? 'Téléchargement impossible' })); }
  }

  if (error && !data) return <p className="muted">{error}</p>;
  if (!data) return <p className="muted">Chargement…</p>;
  const s = data.summary;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="panel ornate dd-hero">
        <div style={{ fontSize: 46 }}>☠️</div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <h1 style={{ margin: 0 }}>Réanimation</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Ces torrents n'ont plus aucun seeder : personne ne peut les télécharger. Si tu les as encore sur ton disque, remets-les en seed et fais-les renaître.
            Pour un torrent <strong>officiellement mort</strong> (sans seeder depuis plus de {s.deadAfterHours} h), tu gagnes jusqu'à <strong>✦ {s.rewardMax} points bonus</strong> :
            {' '}{s.rewardBase} de base, plus selon sa taille et le temps qu'il est resté mort, versés dès qu'un autre membre le télécharge grâce à toi.
          </p>
        </div>
        <Link to="/stats?tab=torrents" className="secondary dd-link">📊 Statistiques des torrents</Link>
      </div>

      <div className="grid" style={gridStyle(180)}>
        <Tile label="Torrents sans seeder" value={formatNumber(s.noSeeders)} tone={s.noSeeders ? 'warn' : 'good'} hint={`${formatNumber(s.officiallyDead)} officiellement mort${s.officiallyDead > 1 ? 's' : ''}`} />
        <Tile label="Volume perdu" value={formatBytes(s.totalSize)} />
        <Tile label="Points à gagner (au total)" value={`✦ ${formatNumber(s.potentialReward)}`} hint="Pour ceux qui les feront renaître" />
        <Tile label="Que tu peux relancer" value={formatNumber(s.mine)} tone={s.mine ? 'good' : undefined} hint="Tu les as déjà téléchargés" />
        <Tile label="Reseeds en cours" value={formatNumber(s.inProgress)} hint="Récompense en attente de confirmation" />
        <Tile label="Appels lancés (7 j)" value={formatNumber(s.requested)} />
      </div>

      {(data.heroes.month.length > 0 || data.recent.length > 0) && (
        <div className="grid" style={gridStyle(340)}>
          {data.heroes.month.length > 0 && (
            <div className="panel dd-heroes">
              <h3 style={{ marginTop: 0 }}>🏅 Réanimateurs du mois</h3>
              <ol>
                {data.heroes.month.map((h: any, i: number) => (
                  <li key={h.user.id}><span>{['🥇', '🥈', '🥉'][i] ?? i + 1}</span> <UserLink user={h.user} /> <span className="muted">{h.count} torrent{h.count > 1 ? 's' : ''} ressuscité{h.count > 1 ? 's' : ''} · ✦ {formatNumber(h.points)}</span></li>
                ))}
              </ol>
              {data.heroes.allTime.length > 0 && <p className="muted" style={{ marginBottom: 0 }}>Depuis toujours : {data.heroes.allTime.slice(0, 3).map((h: any) => `${h.user.username} (${h.count})`).join(' · ')}</p>}
            </div>
          )}
          {data.recent.length > 0 && (
            <div className="panel dd-heroes">
              <h3 style={{ marginTop: 0 }}>✨ Ressuscités récemment</h3>
              <ul>
                {data.recent.map((r: any, i: number) => (
                  <li key={i}><Link to={`/torrents/${r.torrent.id}`}>{r.torrent.name}</Link><span className="muted"> — par {r.user ? <UserLink user={r.user} /> : 'un membre'}, mort depuis {Math.round(r.deadDays)} j · {timeAgo(r.at)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="panel dd-filters">
        <input placeholder="🔎 Chercher un torrent mort…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sort} onChange={(e) => set({ sort: e.target.value === 'popular' ? '' : e.target.value })}>
          {SORTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <label className="row" style={{ gap: 6 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={mine} onChange={(e) => set({ mine: e.target.checked ? '1' : '' })} />
          Seulement ceux que j'ai téléchargés ({s.mine})
        </label>
      </div>
      {data.categories.length > 1 && (
        <div className="row dd-cats">
          <button type="button" className={!category ? 'on' : 'secondary'} onClick={() => set({ category: '' })}>Tout</button>
          {data.categories.map((c: any) => <button key={c.slug} type="button" className={category === c.slug ? 'on' : 'secondary'} onClick={() => set({ category: category === c.slug ? '' : c.slug })}>{c.name} <small>{c.count}</small></button>)}
        </div>
      )}

      {data.items.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: 36 }}>
          <div style={{ fontSize: 44 }}>🎉</div>
          <h3>{mine || query || category ? 'Rien ne correspond' : 'Aucun torrent mort !'}</h3>
          <p className="muted">{mine ? "Tu n'as téléchargé aucun des torrents sans seeder." : query || category ? 'Essaie un autre filtre.' : 'Tous les torrents ont des seeders. Merci à tous !'}</p>
        </div>
      ) : (
        <>
        {data.pages > 1 && <Pager page={data.page} total={data.total} pageSize={data.pageSize ?? Math.ceil(data.total / data.pages)} unit="torrent" onPage={(p) => set({ page: String(p) })} />}
        <div className="dd-list">
          {data.items.map((t: Item) => (
            <div key={t.id} className={`panel dd-item${t.snatchedByMe ? ' mine' : ''}`}>
              <Link to={`/torrents/${t.id}`} className="dd-cover">{t.coverImage ? <img src={t.coverImage} alt="" loading="lazy" /> : <span>☠️</span>}</Link>
              <div className="dd-body">
                <div className="dd-title"><Link to={`/torrents/${t.id}`}>{t.name}</Link></div>
                <div className="dd-meta">
                  {t.category && <span className="dd-chip">{t.category.name}</span>}
                  <span>{formatBytes(t.size)}</span>
                  <span>✓ {formatNumber(t.completedCount)} téléchargement{t.completedCount > 1 ? 's' : ''}</span>
                  {t.leechers > 0 && <span className="dd-waiting">⏳ {t.leechers} en attente</span>}
                  <span className={t.officiallyDead ? 'dd-dead' : 'dd-grace'}>{t.officiallyDead ? `☠️ mort depuis ${t.deadDays} j` : `🕒 sans seeder depuis ${t.deadDays === 0 ? 'moins d\'un jour' : `${t.deadDays} j`}`}</span>
                  {t.pendingRevival && <span className="dd-chip good">🌱 reseed en cours</span>}
                </div>
                <div className="dd-meta">
                  {t.rewardEligible
                    ? <span className="dd-reward" title="Versée quand un autre membre le télécharge grâce à ton seed">✦ +{t.reward} points si tu le relances</span>
                    : <span className="muted" title={`La récompense s'applique aux torrents sans seeder depuis plus de ${s.deadAfterHours} h`}>Pas encore officiellement mort : pas de récompense</span>}
                  {t.snatchedByMe && <span className="dd-chip good">✅ Tu l'as téléchargé{t.snatchedAt ? ` ${timeAgo(t.snatchedAt)}` : ''}</span>}
                  <span className="muted">{t.snatchers} membre{t.snatchers > 1 ? 's' : ''} l'{t.snatchers > 1 ? 'ont' : 'a'} complété</span>
                </div>
                {notes[t.id] && <div className="muted dd-note">{notes[t.id]}</div>}
              </div>
              <div className="dd-actions">
                <button type="button" onClick={() => getTorrent(t)} title="Télécharge le .torrent pour le remettre en seed avec tes fichiers">⬇ Je le relance</button>
                <button type="button" className="secondary" disabled={!t.canRequest} onClick={() => request(t)} title={t.canRequest ? 'Prévient ceux qui l\'ont déjà téléchargé' : 'Une demande a déjà été envoyée cette semaine'}>🔁 Demander un reseed</button>
              </div>
            </div>
          ))}
        </div>
        </>
      )}

      {data.pages > 1 && <Pager page={data.page} total={data.total} pageSize={data.pageSize ?? Math.ceil(data.total / data.pages)} unit="torrent" onPage={(p) => set({ page: String(p) })} scrollTop />}
    </div>
  );
}
