import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { TICKET_PRIORITY, TICKET_STATUS, type TicketSummary } from '../store/support';
import { timeAgo } from '../lib/time';
import Avatar from './Avatar';
import { PriorityChip, StatusChip } from './SupportBits';

type Sub = 'Réponses types' | 'Catégories' | 'Assistant et réglages';
interface Category { id: string; name: string; icon: string | null; description: string | null; order: number; active: boolean }
interface Canned { id: string; title: string; content: string; order: number }

/** Support (Staff) : réponses types, catégories et réglages de l'assistant du canal Support. La file des billets et les statistiques sont dans Modération. */
export function SupportAdmin() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN' || role === 'OWNER';
  const [sub, setSub] = useState<Sub>('Réponses types');
  const subs: Sub[] = isAdmin ? ['Réponses types', 'Catégories', 'Assistant et réglages'] : ['Réponses types'];
  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row tabs sub" style={{ flexWrap: 'wrap' }}>
        {subs.map((s) => <button key={s} className={sub === s ? 'on' : ''} onClick={() => setSub(s)}>{s}</button>)}
      </div>
      <p className="muted" style={{ margin: 0 }}>La file des billets et les statistiques du support se trouvent maintenant dans <Link to="/moderation?tab=billets">🛡️ Modération</Link>.</p>
      {sub === 'Réponses types' && <CannedAdmin editable={isAdmin} />}
      {sub === 'Catégories' && <CategoriesAdmin />}
      {sub === 'Assistant et réglages' && <SettingsAdmin />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- file des billets

export function SupportQueue() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [data, setData] = useState<{ tickets: TicketSummary[]; total: number; page: number; pages: number } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState({ status: 'active', assignee: '', categoryId: '', priority: '', q: '' });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.get('/support/staff/counts').then((r) => setCounts(r.data)).catch(() => {});
    api.get('/support/staff/queue', { params: { ...filters, page } }).then((r) => { setData(r.data); setError(''); }).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible'));
  }, [filters, page]);
  useEffect(() => { const h = setTimeout(load, filters.q ? 300 : 0); return () => clearTimeout(h); }, [load, filters.q]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) load(); }, 30_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { api.get('/support/staff/categories').then((r) => setCategories(r.data)).catch(() => {}); }, []);

  const set = (patch: Partial<typeof filters>) => { setPage(1); setFilters((f) => ({ ...f, ...patch })); };
  const tile = (label: string, value: number | undefined, on: () => void, tone = '') => (
    <button type="button" className={`tk-tile ${tone}`} onClick={on}><strong>{value ?? '–'}</strong><span>{label}</span></button>
  );

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="tk-tiles">
        {tile('En attente de l’équipe', counts?.OPEN, () => set({ status: 'OPEN', assignee: '', priority: '' }), counts?.OPEN ? 'hot' : '')}
        {tile('Sans responsable', counts?.unassigned, () => set({ status: 'active', assignee: 'none', priority: '' }), counts?.unassigned ? 'warn' : '')}
        {tile('Urgents', counts?.urgent, () => set({ status: 'active', assignee: '', priority: 'URGENT' }), counts?.urgent ? 'hot' : '')}
        {tile('Répondus', counts?.ANSWERED, () => set({ status: 'ANSWERED', assignee: '', priority: '' }))}
        {tile('Résolus', counts?.RESOLVED, () => set({ status: 'RESOLVED', assignee: '', priority: '' }))}
      </div>

      <div className="panel">
        <div className="tk-filters">
          <input placeholder="Rechercher : #numéro, titre ou membre…" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
          <select value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="active">En cours (ouverts + répondus)</option>
            <option value="">Tous les statuts</option>
            {Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filters.assignee} onChange={(e) => set({ assignee: e.target.value })}>
            <option value="">Tous les responsables</option>
            <option value="me">Mes billets</option>
            <option value="none">Sans responsable</option>
          </select>
          <select value={filters.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon ?? ''} {c.name}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => set({ priority: e.target.value })}>
            <option value="">Toutes priorités</option>
            {Object.entries(TICKET_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {data && (
          <div style={{ overflowX: 'auto' }}>
            <table className="tk-table">
              <thead><tr><th>#</th><th>Billet</th><th>Membre</th><th>Statut</th><th>Responsable</th><th>Dernière activité</th></tr></thead>
              <tbody>
                {data.tickets.map((t) => (
                  <tr key={t.id} className={t.unread ? 'unread' : ''} onClick={() => navigate(`/support/${t.id}`)} style={{ cursor: 'pointer' }}>
                    <td className="muted">#{t.number}</td>
                    <td>
                      {t.unread && <span className="tk-dot" title="Pas encore lu par l’équipe" />}
                      <strong>{t.subject}</strong> <PriorityChip priority={t.priority} />
                      <div className="muted" style={{ fontSize: 12 }}>{t.category ? `${t.category.icon ?? ''} ${t.category.name}` : 'Sans catégorie'}{t.source === 'CHAT' ? ' · 💬 depuis le chat' : ''}</div>
                    </td>
                    <td><span className="row" style={{ gap: 6 }}><Avatar user={t.requester} size={22} />{t.requester.username}</span></td>
                    <td><StatusChip status={t.status} /></td>
                    <td className="muted">{t.assignee?.username ?? '—'}</td>
                    <td className="muted">{t.lastReplyBy === 'STAFF' ? 'Équipe' : 'Membre'} · {timeAgo(t.lastReplyAt)}</td>
                  </tr>
                ))}
                {data.tickets.length === 0 && <tr><td colSpan={6} className="muted">Aucun billet ne correspond. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pages > 1 && (
          <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 10 }}>
            <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
            <span className="muted">Page {data.page} / {data.pages} · {data.total} billets</span>
            <button type="button" className="secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>→</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- statistiques

const minutes = (m: number | null) => (m === null ? '—' : m < 90 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`);

export function SupportStats() {
  const [days, setDays] = useState(30);
  const [s, setS] = useState<any>(null);
  useEffect(() => { api.get('/support/staff/stats', { params: { days } }).then((r) => setS(r.data)).catch(() => {}); }, [days]);
  if (!s) return <p className="muted">Chargement…</p>;
  const a = s.assistant;
  const answered = a.solved + a.notSolved;
  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row" style={{ gap: 8 }}>
        {[7, 30, 90].map((d) => <button key={d} type="button" className={days === d ? 'on' : 'secondary'} onClick={() => setDays(d)}>{d} jours</button>)}
      </div>
      <div className="tk-tiles">
        <div className="tk-tile"><strong>{s.created}</strong><span>billets ouverts</span></div>
        <div className="tk-tile"><strong>{s.resolved}</strong><span>résolus</span></div>
        <div className="tk-tile"><strong>{s.openNow}</strong><span>en cours maintenant</span></div>
        <div className="tk-tile"><strong>{minutes(s.avgFirstResponseMin)}</strong><span>1ʳᵉ réponse (moyenne)</span></div>
        <div className="tk-tile"><strong>{minutes(s.avgResolutionMin)}</strong><span>résolution (moyenne)</span></div>
        <div className="tk-tile"><strong>{s.satisfaction ? `${s.satisfaction} ★` : '—'}</strong><span>satisfaction ({s.ratings} avis)</span></div>
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>🤖 Assistant du canal Support</h3>
        <div className="tk-tiles">
          <div className="tk-tile"><strong>{a.answers}</strong><span>réponses données</span></div>
          <div className="tk-tile"><strong>{a.solved}</strong><span>« ça règle mon problème »</span></div>
          <div className="tk-tile"><strong>{a.notSolved}</strong><span>« pas résolu »</span></div>
          <div className="tk-tile"><strong>{a.offers}</strong><span>billets proposés</span></div>
          <div className="tk-tile"><strong>{a.ticketsFromChat}</strong><span>billets ouverts depuis le chat</span></div>
          <div className="tk-tile"><strong>{a.handoffs}</strong><span>aides de l’équipe demandées</span></div>
          <div className="tk-tile"><strong>{a.human}</strong><span>réponses de l’équipe</span></div>
        </div>
        {answered > 0 && <p className="muted" style={{ marginBottom: 0 }}>Parmi les membres qui ont donné leur avis, {Math.round((a.solved / answered) * 100)} % ont été aidés directement par l’assistant.</p>}
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Billets par catégorie</h3>
        {s.byCategory.length === 0 && <p className="muted">Aucun billet sur la période.</p>}
        {s.byCategory.map((c: any, i: number) => (
          <div key={i} className="tk-bar"><span>{c.category ? `${c.category.icon ?? ''} ${c.category.name}` : 'Sans catégorie'}</span><div><i style={{ width: `${(c.count / s.byCategory[0].count) * 100}%` }} /></div><b>{c.count}</b></div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- réponses types

function CannedAdmin({ editable }: { editable: boolean }) {
  const [items, setItems] = useState<Canned[]>([]);
  const [form, setForm] = useState({ title: '', content: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = () => api.get('/support/staff/canned').then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { void load(); }, []);

  async function save() {
    setError('');
    try {
      if (editing) await api.patch(`/support/admin/canned/${editing}`, form); else await api.post('/support/admin/canned', form);
      setForm({ title: '', content: '' }); setEditing(null); void load();
    } catch (err: any) { setError(err.response?.data?.message ?? 'Enregistrement impossible'); }
  }
  async function remove(c: Canned) {
    if (!window.confirm(`Supprimer la réponse type « ${c.title} » ?`)) return;
    await api.delete(`/support/admin/canned/${c.id}`).catch(() => {});
    void load();
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <p className="muted" style={{ margin: 0 }}>Textes prêts à insérer dans une réponse (menu « 💬 Réponse type » d’un billet). Le BBCode est accepté : <code>[b]gras[/b]</code>, <code>[url=/wiki/hit-and-run]lien[/url]</code>…</p>
      {editable && (
        <div className="panel grid" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>{editing ? '✏️ Modifier la réponse type' : '➕ Nouvelle réponse type'}</h3>
          <input placeholder="Titre (ex. Demander des précisions)" value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea rows={5} placeholder="Texte de la réponse…" value={form.content} maxLength={4000} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          <div className="row"><button type="button" onClick={save}>{editing ? 'Enregistrer' : 'Ajouter'}</button>{editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setForm({ title: '', content: '' }); }}>Annuler</button>}</div>
        </div>
      )}
      <div className="panel">
        {items.map((c) => (
          <div key={c.id} className="tk-canned">
            <div style={{ flex: 1, minWidth: 0 }}><strong>{c.title}</strong><div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{c.content.slice(0, 220)}{c.content.length > 220 ? '…' : ''}</div></div>
            {editable && <div className="row" style={{ gap: 6 }}>
              <button type="button" className="secondary" onClick={() => { setEditing(c.id); setForm({ title: c.title, content: c.content }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Éditer</button>
              <button type="button" className="danger" onClick={() => remove(c)}>Supprimer</button>
            </div>}
          </div>
        ))}
        {items.length === 0 && <p className="muted">Aucune réponse type.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- catégories

function CategoriesAdmin() {
  const [items, setItems] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: '', icon: '', description: '' });
  const [error, setError] = useState('');
  const load = () => api.get('/support/staff/categories').then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { void load(); }, []);

  const patch = async (c: Category, data: Partial<Category>) => { setError(''); try { await api.patch(`/support/admin/categories/${c.id}`, data); void load(); } catch (e: any) { setError(e.response?.data?.message ?? 'Modification impossible'); } };
  async function add() {
    setError('');
    try { await api.post('/support/admin/categories', form); setForm({ name: '', icon: '', description: '' }); void load(); }
    catch (e: any) { setError(e.response?.data?.message ?? 'Ajout impossible'); }
  }
  async function remove(c: Category) {
    if (!window.confirm(`Supprimer la catégorie « ${c.name} » ? Les billets existants gardent leur texte, sans catégorie.`)) return;
    await api.delete(`/support/admin/categories/${c.id}`).catch(() => {});
    void load();
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="panel grid" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>➕ Nouvelle catégorie</h3>
        <div className="grid" style={{ gridTemplateColumns: '80px 1fr 2fr auto', gap: 8, alignItems: 'center' }}>
          <input placeholder="Icône" value={form.icon} maxLength={8} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
          <input placeholder="Nom" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Description (facultative)" value={form.description} maxLength={200} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <button type="button" onClick={add}>Ajouter</button>
        </div>
        {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Ordre</th><th>Catégorie</th><th>Visible</th><th></th></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} style={c.active ? undefined : { opacity: 0.55 }}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="secondary" onClick={() => patch(c, { order: c.order - 1 })}>▲</button>{' '}
                  <button type="button" className="secondary" onClick={() => patch(c, { order: c.order + 1 })}>▼</button>
                </td>
                <td><strong>{c.icon} {c.name}</strong><div className="muted" style={{ fontSize: 12 }}>{c.description}</div></td>
                <td><input type="checkbox" style={{ width: 'auto' }} checked={c.active} onChange={(e) => patch(c, { active: e.target.checked })} /></td>
                <td style={{ textAlign: 'right' }}><button type="button" className="danger" onClick={() => remove(c)}>Supprimer</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- réglages et assistant

interface Config {
  enabled: boolean; channelId: string | null; aiEnabled: boolean; aiMode: 'ALWAYS' | 'NO_STAFF'; aiProvider: 'auto' | 'anthropic' | 'gemini'; aiModel: string; aiExtra: string;
  botName: string; maxAnswersBeforeOffer: number; aiHourlyLimit: number; takeoverMinutes: number; handoffMinutes: number; maxOpenPerMember: number; autoResolveDays: number; autoCloseDays: number;
  notifyStaff: boolean; emailOnReply: boolean; hoursText: string; welcome: string;
}
interface AiStatus { configured: boolean; provider: string | null; model: string | null; anthropicKey: boolean; geminiKey: boolean }

function SettingsAdmin() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [overview, setOverview] = useState<{ channelId: string | null; staffOnline: number } | null>(null);
  const [channels, setChannels] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('Comment fonctionne le hit and run ?');
  const [test, setTest] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsMsg, setModelsMsg] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);

  const apply = (d: any) => { setCfg(d.config); setAi(d.ai); setOverview(d.overview); };
  useEffect(() => {
    api.get('/support/admin/config').then((r) => apply(r.data)).catch((e) => setError(e.response?.data?.message ?? 'Chargement impossible'));
    api.get('/messenger/admin/channels').then((r) => setChannels(r.data)).catch(() => {});
  }, []);

  if (!cfg) return <p className="muted">{error || 'Chargement…'}</p>;
  const up = <K extends keyof Config>(k: K, v: Config[K]) => setCfg({ ...cfg, [k]: v });
  const num = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement>) => up(k, Number(e.target.value) as never);

  async function save() {
    setError(''); setMsg('');
    try { const { data } = await api.put('/support/admin/config', cfg); apply(data); setMsg('✓ Réglages enregistrés'); setTimeout(() => setMsg(''), 3500); }
    catch (e: any) { setError(e.response?.data?.message ?? 'Enregistrement impossible'); }
  }
  async function createChannel() {
    setError('');
    try { await api.post('/support/admin/channel'); const r = await api.get('/support/admin/config'); apply(r.data); const c = await api.get('/messenger/admin/channels'); setChannels(c.data); setMsg('✓ Canal Support créé'); }
    catch (e: any) { setError(e.response?.data?.message ?? 'Création impossible'); }
  }
  async function loadModels() {
    setLoadingModels(true); setModelsMsg('');
    try {
      const { data } = await api.get('/support/admin/ai-models');
      setModels(data.models ?? []);
      setModelsMsg(data.error ? data.error : `${data.models.length} modèle(s) disponible(s) : clique dans le champ pour choisir`);
    } catch (e: any) { setModelsMsg(e.response?.data?.message ?? 'Liste indisponible'); }
    finally { setLoadingModels(false); }
  }
  async function runTest() {
    setTesting(true); setTest(null);
    try { const { data } = await api.post('/support/admin/test', { question }); setTest(data); }
    catch (e: any) { setTest({ ok: false, error: e.response?.data?.message ?? 'Test impossible' }); }
    finally { setTesting(false); }
  }

  return (
    <div className="grid sup-settings" style={{ gap: 14 }}>
      <div className="panel grid" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>🛟 Centre de support</h3>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.enabled} onChange={(e) => up('enabled', e.target.checked)} /> Support ouvert (billets et assistant) — décocher ferme tout aux membres</label>
        <div className="set-grid">
          <label className="muted">Canal de chat « Support »
            <select value={cfg.channelId ?? ''} onChange={(e) => up('channelId', e.target.value || null)}>
              <option value="">Automatique (le canal dont l’adresse est « support »)</option>
              {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </select>
          </label>
          <label className="muted">Billets ouverts par membre (maximum)<input type="number" min={1} max={50} value={cfg.maxOpenPerMember} onChange={num('maxOpenPerMember')} /></label>
          <label className="muted">Billet « répondu » sans nouvelle → résolu après (jours, 0 = jamais)<input type="number" min={0} max={90} value={cfg.autoResolveDays} onChange={num('autoResolveDays')} /></label>
          <label className="muted">Billet résolu → fermé après (jours, 0 = jamais)<input type="number" min={0} max={365} value={cfg.autoCloseDays} onChange={num('autoCloseDays')} /></label>
        </div>
        {!overview?.channelId && (
          <div className="tk-note panel">Aucun canal « Support » trouvé. <button type="button" onClick={createChannel}>Créer le canal Support</button></div>
        )}
        <label className="muted">Horaires / délai de réponse affichés sur la page Support (facultatif)<input value={cfg.hoursText} maxLength={300} placeholder="Ex. : L’équipe répond généralement sous 24 h, du lundi au samedi." onChange={(e) => up('hoursText', e.target.value)} /></label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.notifyStaff} onChange={(e) => up('notifyStaff', e.target.checked)} /> Notifier toute l’équipe à chaque nouveau billet</label>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.emailOnReply} onChange={(e) => up('emailOnReply', e.target.checked)} /> Envoyer aussi un courriel au membre quand l’équipe répond (si le courriel du serveur est configuré)</label>
      </div>

      <div className="panel grid" style={{ gap: 12 }}>
        <h3 style={{ margin: 0 }}>🤖 Assistant du canal Support</h3>
        <p className="muted" style={{ margin: 0 }}>
          L’assistant répond <strong>automatiquement</strong> dans le canal à partir du <strong>wiki</strong> (il cite ses sources) tant que le membre ne demande pas l’aide de l’équipe. Sous chaque réponse, le bouton « Demander l’aide de l’équipe » (ou le message « je veux parler à un humain ») prévient l’équipe par notification et l’assistant se retire. S’il ne trouve pas la réponse ou après plusieurs réponses, il propose aussi ce bouton et l’ouverture d’un billet (l’échange y est joint). Pour le tester avec ton compte du staff, écris « /ia ta question » dans le canal.
        </p>
        <div className={`tk-note panel ${ai?.configured ? 'ok' : 'bad'}`}>
          {ai?.configured
            ? <>✅ IA configurée : <strong>{ai.provider === 'anthropic' ? 'Claude (Anthropic)' : 'Gemini (Google)'}</strong> · modèle <code>{ai.model}</code></>
            : <>⚠️ Aucune clé IA : ajoute <code>ANTHROPIC_API_KEY</code> (ou <code>GEMINI_API_KEY</code>) dans <code>backend/.env</code> sur le serveur, puis relance. Sans clé, l’assistant ne répond pas, mais les billets et la proposition de billet à la demande fonctionnent.</>}
          <div className="muted" style={{ marginTop: 4 }}>Clés détectées : Anthropic {ai?.anthropicKey ? '✓' : '✗'} · Gemini {ai?.geminiKey ? '✓' : '✗'}</div>
        </div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={cfg.aiEnabled} onChange={(e) => up('aiEnabled', e.target.checked)} /> Assistant actif dans le canal Support</label>
        <div className="set-grid">
          <label className="muted">Quand répond-il ?
            <select value={cfg.aiMode} onChange={(e) => up('aiMode', e.target.value as Config['aiMode'])}>
              <option value="ALWAYS">Toujours (l’équipe peut reprendre la main)</option>
              <option value="NO_STAFF">Seulement quand personne de l’équipe n’est en ligne</option>
            </select>
          </label>
          <label className="muted">Fournisseur d’IA
            <select value={cfg.aiProvider} onChange={(e) => up('aiProvider', e.target.value as Config['aiProvider'])}>
              <option value="auto">Automatique (Claude si la clé existe, sinon Gemini)</option>
              <option value="anthropic">Claude (Anthropic)</option>
              <option value="gemini">Gemini (Google)</option>
            </select>
          </label>
          <label className="muted">Modèle (vide = automatique)
            <input list="ai-models" value={cfg.aiModel} maxLength={80} placeholder="claude-haiku-4-5-20251001 · gemini-2.5-flash" onChange={(e) => up('aiModel', e.target.value)} />
            <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
            <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="secondary" onClick={loadModels} disabled={loadingModels}>{loadingModels ? 'Recherche…' : 'Lister les modèles disponibles'}</button>
              {modelsMsg && <span style={{ color: models.length ? 'var(--success)' : 'var(--danger)' }}>{modelsMsg}</span>}
            </span>
          </label>
          <label className="muted">Nom de l’assistant<input value={cfg.botName} maxLength={40} onChange={(e) => up('botName', e.target.value)} /></label>
          <label className="muted">Réponses sans résultat avant de proposer un billet<input type="number" min={1} max={10} value={cfg.maxAnswersBeforeOffer} onChange={num('maxAnswersBeforeOffer')} /></label>
          <label className="muted">Réponses maximum par heure et par membre<input type="number" min={1} max={200} value={cfg.aiHourlyLimit} onChange={num('aiHourlyLimit')} /></label>
          <label className="muted">Silence après une réponse de l’équipe (minutes, 0 = jamais)<input type="number" min={0} max={240} value={cfg.takeoverMinutes} onChange={num('takeoverMinutes')} /></label>
          <label className="muted">Silence après « Demander l’aide de l’équipe » (minutes, 0 = il continue de répondre)<input type="number" min={0} max={1440} value={cfg.handoffMinutes} onChange={num('handoffMinutes')} /></label>
        </div>
        <label className="muted">Message d’accueil (salutation de l’assistant)<textarea rows={2} value={cfg.welcome} maxLength={600} onChange={(e) => up('welcome', e.target.value)} /></label>
        <label className="muted">Consignes supplémentaires pour l’assistant (ton, règles propres au site…)
          <textarea rows={4} value={cfg.aiExtra} maxLength={2000} placeholder="Ex. : Ne parle jamais de l’ancien tracker. Pour un problème de paiement ou de don, renvoie toujours vers l’équipe." onChange={(e) => up('aiExtra', e.target.value)} />
        </label>
      </div>

      {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
      {msg && <div style={{ color: 'var(--success)' }}>{msg}</div>}
      <div className="row"><button type="button" onClick={save}>Enregistrer les réglages</button></div>

      <div className="panel grid" style={{ gap: 8 }}>
        <h3 style={{ margin: 0 }}>🧪 Tester l’assistant</h3>
        <p className="muted" style={{ margin: 0 }}>Pose une question comme le ferait un membre (avec les réglages <em>enregistrés</em>) : tu vois la réponse, sa certitude et les articles du wiki utilisés.</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input style={{ flex: 1, minWidth: 260 }} value={question} onChange={(e) => setQuestion(e.target.value)} />
          <button type="button" disabled={testing} onClick={runTest}>{testing ? 'Réflexion…' : 'Tester'}</button>
        </div>
        {test && (test.ok
          ? (
            <div className="tk-test">
              <div style={{ whiteSpace: 'pre-wrap' }}>{test.reply}</div>
              <div className="muted" style={{ marginTop: 6 }}>Certitude : <strong>{test.confidence}</strong> · {test.needsHuman ? '👤 passerait la main à l’équipe (billet proposé)' : '✅ répondrait seul'}</div>
              {test.sources?.length > 0 && <div className="muted">Sources : {test.sources.map((s: any) => <Link key={s.slug} to={`/wiki/${s.slug}`} target="_blank" style={{ marginRight: 8 }}>{s.title}</Link>)}</div>}
            </div>
          )
          : <div style={{ color: 'var(--danger)' }}>{test.error}</div>)}
      </div>
    </div>
  );
}
