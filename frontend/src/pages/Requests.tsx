import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import UserLink from '../components/UserLink';
import CategoryTag from '../components/CategoryTag';
import DuplicateWarning from '../components/DuplicateWarning';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { timeAgo } from '../lib/time';
import { RESOLUTIONS, LANGUAGES } from '../lib/searchParser';

const BOUNTY_PRESETS = [0, 50, 100, 250, 500, 1000];
const EMPTY_FORM = { title: '', year: '', description: '', bounty: 0, language: '', resolution: '', mainId: '', categoryId: '' };

export default function Requests() {
  const user = useAuthStore((s) => s.user);
  const isStaff = !!user && ['MODERATOR', 'ADMIN', 'OWNER'].includes(user.role);
  // ?title=... : lien "faire une demande" depuis la page d'un film / d'une série (suite ou saison manquante).
  const [searchParams] = useSearchParams();
  const prefill = searchParams.get('title') ?? '';

  const [data, setData] = useState<{ items: any[]; stats: { open: number; points: number; filled: number } }>({ items: [], stats: { open: 0, points: 0, filled: 0 } });
  const [categories, setCategories] = useState<any[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(!!prefill);
  const [form, setForm] = useState({ ...EMPTY_FORM, title: prefill });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState<'open' | 'filled'>('open');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [sort, setSort] = useState('bounty');
  const [mine, setMine] = useState(false);

  // Actions par ligne : contribuer / combler.
  const [bountyFor, setBountyFor] = useState<string | null>(null);
  const [bountyAmount, setBountyAmount] = useState(100);
  const [fillFor, setFillFor] = useState<string | null>(null);
  const [myTorrents, setMyTorrents] = useState<any[] | null>(null);
  const [fillTorrentId, setFillTorrentId] = useState('');

  function refresh() {
    api.get('/requests', { params: { status, search: search || undefined, categoryId: filterCat || undefined, sort, mine: mine ? '1' : undefined } })
      .then((r) => setData(r.data)).catch(() => {});
  }
  function refreshBalance() {
    if (user) api.get('/users/me').then((r) => setBalance(Math.floor(r.data.bonusPoints ?? 0))).catch(() => {});
  }

  useEffect(() => {
    const t = window.setTimeout(refresh, search ? 300 : 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, search, filterCat, sort, mine]);
  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data)).catch(() => {});
    refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const mainCategory = categories.find((c) => c.id === form.mainId);
  const subs: any[] = mainCategory?.children ?? [];
  const tooExpensive = balance != null && form.bounty > balance;
  const totals = useMemo(() => data.stats, [data.stats]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setNotice('');
    if (tooExpensive) { setError('Tu n\'as pas assez de points bonus pour cette récompense.'); return; }
    setBusy(true);
    try {
      await api.post('/requests', {
        title: form.title, description: form.description, bounty: form.bounty,
        year: form.year ? Number(form.year) : undefined, language: form.language || undefined, resolution: form.resolution || undefined,
        categoryId: form.categoryId || (mainCategory && !subs.length ? mainCategory.id : undefined),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setNotice('✓ Demande publiée. Les membres qui ont le contenu seront tentés par la récompense !');
      setStatus('open');
      refresh(); refreshBalance();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Publication impossible');
    } finally { setBusy(false); }
  }

  async function act(fn: () => Promise<any>, ok: string) {
    setError(''); setNotice('');
    try { await fn(); setNotice(ok); refresh(); refreshBalance(); } catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
  }

  async function openFill(id: string) {
    setFillFor(fillFor === id ? null : id); setBountyFor(null); setFillTorrentId('');
    if (myTorrents === null && user) {
      try {
        const r = await api.get('/torrents', { params: { uploaderId: user.id, pageSize: 100, sort: 'date' } });
        setMyTorrents(r.data.items);
      } catch { setMyTorrents([]); }
    }
  }

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <label className="grid" style={{ gap: 4, alignContent: 'start' }}>
      <span className="muted">{label}</span>{node}{hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
    </label>
  );

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Demandes</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Tu cherches un titre qui manque ? Demande-le et offre des points bonus à celui qui l'enverra.</p>
        </div>
        {user && <button type="button" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Fermer le formulaire' : '＋ Nouvelle demande'}</button>}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="panel"><div className="muted">Demandes ouvertes</div><strong style={{ fontSize: 26 }}>{totals.open}</strong></div>
        <div className="panel"><div className="muted">Points à gagner</div><strong style={{ fontSize: 26, color: '#fbbf24' }}>✦ {Math.round(totals.points).toLocaleString('fr-CA')}</strong></div>
        <div className="panel"><div className="muted">Demandes comblées</div><strong style={{ fontSize: 26, color: 'var(--success)' }}>{totals.filled}</strong></div>
        {user && <div className="panel"><div className="muted">Tes points bonus</div><strong style={{ fontSize: 26 }}>{balance == null ? '…' : `✦ ${balance.toLocaleString('fr-CA')}`}</strong></div>}
      </div>

      {notice && <div className="panel" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>{notice}</div>}
      {error && <div className="panel" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{error}</div>}

      {user && showForm && (
        <div className="panel ornate">
          <div className="panel-title"><span className="title-icon">💬</span>Nouvelle demande</div>
          <form onSubmit={submit} className="grid" style={{ gap: 16 }}>
            <div className="grid" style={{ gridTemplateColumns: 'minmax(260px, 3fr) minmax(120px, 1fr)', gap: 14 }}>
              {field('Titre demandé *', <input placeholder="Ex : Dune Partie 2, Loft Story S03, album…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={2} />)}
              {field('Année', <input type="number" placeholder="2024" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />)}
            </div>
            <DuplicateWarning name={form.title} />
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {field('Catégorie principale', (
                <select value={form.mainId} onChange={(e) => setForm({ ...form, mainId: e.target.value, categoryId: '' })}>
                  <option value="">— Peu importe —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ))}
              {field('Sous-catégorie', (
                <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} disabled={!subs.length}>
                  <option value="">{subs.length ? '— Choisir —' : '—'}</option>
                  {subs.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ))}
              {field('Qualité souhaitée', (
                <select value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })}>
                  <option value="">Peu importe</option>
                  {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              ))}
              {field('Langue souhaitée', (
                <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                  <option value="">Peu importe</option>
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              ))}
            </div>
            {field('Détails', <textarea rows={6} placeholder="Saison / épisode précis, version voulue (director's cut, VFQ…), lien IMDb ou TMDB, tout ce qui aide à trouver le bon contenu." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />)}
            <div className="grid" style={{ gap: 6 }}>
              <span className="muted">Récompense (points bonus) — payée par toi, versée à celui qui comble la demande</span>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {BOUNTY_PRESETS.map((n) => (
                  <button key={n} type="button" className={form.bounty === n ? '' : 'secondary'} style={{ padding: '4px 14px' }} onClick={() => setForm({ ...form, bounty: n })}>{n === 0 ? 'Aucune' : `✦ ${n}`}</button>
                ))}
                <input type="number" min={0} style={{ width: 130 }} value={form.bounty} onChange={(e) => setForm({ ...form, bounty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                {tooExpensive && <span style={{ color: 'var(--danger)' }}>Solde insuffisant ({balance})</span>}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>D'autres membres pourront ajouter des points pour rendre la demande plus attirante. Une récompense élevée est comblée plus vite.</span>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button type="submit" disabled={busy || tooExpensive}>Publier la demande</button>
              <button type="button" className="secondary" onClick={() => { setForm(EMPTY_FORM); setShowForm(false); }}>Annuler</button>
            </div>
          </form>
        </div>
      )}

      <div className="panel">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <button type="button" className={status === 'open' ? '' : 'secondary'} onClick={() => setStatus('open')}>Ouvertes</button>
          <button type="button" className={status === 'filled' ? '' : 'secondary'} onClick={() => setStatus('filled')}>Comblées</button>
          <input placeholder="Rechercher une demande…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="bounty">Plus grosse récompense</option>
            <option value="date">Plus récentes</option>
            <option value="ancien">Plus anciennes</option>
          </select>
          {user && (
            <label className="row muted" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mes demandes</label>
          )}
        </div>

        <div className="grid" style={{ gap: 10 }}>
          {data.items.map((r) => (
            <div key={r.id} className="panel" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <CategoryTag category={r.category} />
                    <strong style={{ fontSize: 17 }}>{r.title}{r.year ? ` (${r.year})` : ''}</strong>
                    {r.resolution && <span className="badge new">{r.resolution}</span>}
                    {r.language && <span className="badge double">{r.language}</span>}
                  </div>
                  {r.description && <div className="muted" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{r.description}</div>}
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    Demandé par <UserLink user={r.requestedBy} /> · {timeAgo(r.createdAt)}
                    {r.backers > 1 && ` · ${r.backers} contributions`}
                  </div>
                  {r.filledTorrent && (
                    <div style={{ marginTop: 8, color: 'var(--success)' }}>
                      ✅ Comblée par <UserLink user={r.filledBy} /> : <Link to={`/torrents/${r.filledTorrent.id}`}>{r.filledTorrent.name}</Link>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#fbbf24' }}>✦ {Math.round(r.bounty).toLocaleString('fr-CA')}</div>
                  {!r.filledById && user && (
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="secondary" style={{ padding: '4px 12px' }} onClick={() => { setBountyFor(bountyFor === r.id ? null : r.id); setFillFor(null); }}>＋ Points</button>
                      <button type="button" style={{ padding: '4px 12px' }} onClick={() => openFill(r.id)}>✅ Combler</button>
                      {(r.requestedBy?.id === user.id || isStaff) && (
                        <button type="button" className="danger" style={{ padding: '4px 12px' }} title="Supprimer la demande"
                          onClick={() => window.confirm('Supprimer cette demande ?') && act(async () => { await api.delete(`/requests/${r.id}`); }, 'Demande supprimée.')}>🗑️</button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {bountyFor === r.id && (
                <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="muted">Ajouter à la récompense :</span>
                  {[50, 100, 250, 500].map((n) => <button key={n} type="button" className={bountyAmount === n ? '' : 'secondary'} style={{ padding: '3px 12px' }} onClick={() => setBountyAmount(n)}>✦ {n}</button>)}
                  <input type="number" min={10} style={{ width: 110 }} value={bountyAmount} onChange={(e) => setBountyAmount(Math.floor(Number(e.target.value) || 0))} />
                  <button type="button" onClick={() => act(async () => { await api.post(`/requests/${r.id}/bounty`, { amount: bountyAmount }); setBountyFor(null); }, `✓ ${bountyAmount} points ajoutés à la récompense.`)}>Confirmer</button>
                </div>
              )}

              {fillFor === r.id && (
                <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="muted">Choisis un de tes torrents approuvés :</span>
                  <select value={fillTorrentId} onChange={(e) => setFillTorrentId(e.target.value)} style={{ minWidth: 280 }}>
                    <option value="">— Sélectionner —</option>
                    {(myTorrents ?? []).filter((t) => t.status === 'APPROVED').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button type="button" disabled={!fillTorrentId} onClick={() => act(async () => { await api.post(`/requests/${r.id}/fill`, { torrentId: fillTorrentId }); setFillFor(null); }, '✓ Demande comblée, la récompense a été versée !')}>Combler</button>
                  <Link to="/upload" className="muted">Envoyer un nouveau torrent →</Link>
                </div>
              )}
            </div>
          ))}
          {data.items.length === 0 && <p className="muted">{status === 'open' ? 'Aucune demande ouverte pour ces critères.' : 'Aucune demande comblée pour ces critères.'}</p>}
        </div>
      </div>
    </div>
  );
}
