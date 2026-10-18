import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { formatBytes, formatNumber } from '../lib/format';
import { timeAgo } from '../lib/time';
import Avatar from '../components/Avatar';
import UserLink from '../components/UserLink';
import Loading from '../components/Loading';

interface StaffRow {
  id: string; username: string; role: string; status: string; avatarUrl: string | null; createdAt: string | null; lastSeenAt: string | null; online: boolean; presence: string | null;
  actions30d: number; breakdown: { action: string; label: string; count: number }[]; lastActionAt: string | null;
}
interface ClassRow { id: string; label: string; count: number; invites: number; conditions: { weeks: number; uploadGb: number; ratio: number } | null }
interface TeamData { staff: StaffRow[]; roles: Record<string, number>; status: Record<string, number>; classes: ClassRow[] }
interface Member { id: string; username: string; role: string; status: string; memberClass: string; avatarUrl: string | null; uploaded: number; downloaded: number; ratio: number | null; createdAt: string | null; lastSeenAt: string | null; online?: boolean }

const ROLE_ORDER = ['OWNER', 'ADMIN', 'SUPER_MODERATOR', 'MODERATOR', 'UPLOADER', 'USER'];
const ROLE_LABEL: Record<string, string> = { OWNER: 'Propriétaire', ADMIN: 'Administrateurs', SUPER_MODERATOR: 'Super modérateurs', MODERATOR: 'Modérateurs', UPLOADER: 'Uploaders', USER: 'Membres' };
const ROLE_ONE: Record<string, string> = { OWNER: 'Propriétaire', ADMIN: 'Administrateur', SUPER_MODERATOR: 'Super modérateur', MODERATOR: 'Modérateur', UPLOADER: 'Uploader', USER: 'Membre' };
const ROLE_ICON: Record<string, string> = { OWNER: '👑', ADMIN: '🛡️', SUPER_MODERATOR: '⚔️', MODERATOR: '🔰', UPLOADER: '⬆️', USER: '👤' };
const RANK: Record<string, number> = { USER: 0, UPLOADER: 1, MODERATOR: 3, SUPER_MODERATOR: 4, ADMIN: 5, OWNER: 6 };
const CLASS_ICON: Record<string, string> = { NOUVEAU: '🌱', MEMBRE: '👤', POWER_USER: '⚡', ELITE: '💎', VETERAN: '🏆' };
const STAFF = ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];
const EDITORS = ['SUPER_MODERATOR', 'ADMIN', 'OWNER'];
type Tab = 'team' | 'ranks' | 'roles';
const errorOf = (e: any) => e?.response?.data?.message ?? 'Action impossible';

/** Espace de gestion de l'équipe : qui est dans l'équipe et ce qu'il fait, les rôles, les rangs automatiques et les membres de chaque rang. */
export default function TeamManagement() {
  const me = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'ranks' ? 'ranks' : params.get('tab') === 'roles' ? 'roles' : 'team';
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => { api.get('/staff/members/team').then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errorOf(e))); }, []);
  useEffect(() => { load(); }, [load]);

  if (!me || !STAFF.includes(me.role)) return <div className="panel"><p className="muted">Cette page est réservée à l'équipe.</p></div>;
  const myRank = RANK[me.role] ?? 0;
  const canEdit = EDITORS.includes(me.role);
  const setTab = (t: Tab) => { const next = new URLSearchParams(params); if (t === 'team') next.delete('tab'); else next.set('tab', t); setParams(next, { replace: true }); };

  /** Rôles qu'on peut attribuer : strictement inférieurs au sien (le propriétaire peut tout attribuer). */
  const assignable = (ROLE_ORDER.filter((r) => me.role === 'OWNER' || (RANK[r] ?? 0) < myRank));

  async function setRole(userId: string, username: string, role: string) {
    setError(''); setNotice('');
    try { await api.patch(`/admin/users/${userId}`, { role }); setNotice(`✓ ${username} : ${ROLE_ONE[role]}.`); load(); }
    catch (e) { setError(errorOf(e)); }
  }

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0 }}>🛡️ Équipe et rangs</h1>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/members" className="secondary" style={{ padding: '8px 14px' }}>👥 Tous les membres</Link>
          <button type="button" className="secondary" onClick={load}>↻ Actualiser</button>
        </div>
      </div>

      <div className="mod-tabs" role="tablist">
        {([['team', '🛡️ Équipe'], ['ranks', '🏅 Rangs des membres'], ['roles', '🔑 Rôles et permissions']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {notice && <div className="panel" style={{ borderColor: 'var(--success)', color: 'var(--success)' }}>{notice}</div>}
      {error && <div className="panel" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{error}</div>}
      {!data && !error && <Loading />}

      {data && tab === 'team' && <TeamTab data={data} meId={me.id} myRank={myRank} canEdit={canEdit} assignable={assignable} onRole={setRole} onError={setError} />}
      {data && tab === 'ranks' && <RanksTab data={data} canEdit={me.role === 'ADMIN' || me.role === 'OWNER'} />}
      {tab === 'roles' && <RolesTab data={data} />}
    </div>
  );
}

function TeamTab({ data, meId, myRank, canEdit, assignable, onRole, onError }: { data: TeamData; meId: string; myRank: number; canEdit: boolean; assignable: string[]; onRole: (id: string, name: string, role: string) => void; onError: (m: string) => void }) {
  const groups = ROLE_ORDER.filter((r) => STAFF.includes(r)).map((r) => ({ role: r, people: data.staff.filter((s) => s.role === r) }));
  const online = data.staff.filter((s) => s.online).length;
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div className="panel"><div className="muted">Dans l'équipe</div><strong style={{ fontSize: 24 }}>{data.staff.length}</strong></div>
        <div className="panel"><div className="muted">En ligne maintenant</div><strong style={{ fontSize: 24, color: '#4ade80' }}>{online}</strong></div>
        <div className="panel"><div className="muted">Actions (30 jours)</div><strong style={{ fontSize: 24 }}>{formatNumber(data.staff.reduce((n, s) => n + s.actions30d, 0))}</strong></div>
        <div className="panel"><div className="muted">Uploaders</div><strong style={{ fontSize: 24 }}>{data.roles.UPLOADER ?? 0}</strong></div>
      </div>

      {canEdit && <AddToTeam assignable={assignable.filter((r) => STAFF.includes(r) || r === 'UPLOADER')} onRole={onRole} onError={onError} />}

      {groups.map((g) => g.people.length > 0 && (
        <div key={g.role} className="panel">
          <h3 style={{ marginTop: 0 }}>{ROLE_ICON[g.role]} {ROLE_LABEL[g.role]} — {g.people.length}</h3>
          <div className="grid" style={{ gap: 8 }}>
            {g.people.map((s) => {
              const mine = s.id === meId;
              const editable = canEdit && !mine && (RANK[s.role] ?? 0) < myRank;
              return (
                <div key={s.id} className="tm-row">
                  <span className="tm-who">
                    <span style={{ position: 'relative', display: 'inline-flex' }}><Avatar user={s} size={36} />{s.online && <i className="tm-on" title="En ligne" />}</span>
                    <span><UserLink user={s} />{mine && <span className="muted"> (toi)</span>}<br /><span className="muted" style={{ fontSize: 12 }}>
                      Inscrit le {s.createdAt ? new Date(s.createdAt).toLocaleDateString('fr-CA') : '?'} · {s.online ? 'en ligne' : s.lastSeenAt ? `vu ${timeAgo(s.lastSeenAt)}` : 'jamais vu'}</span></span>
                  </span>
                  <span className="tm-act" title={s.breakdown.map((b) => `${b.count} ${b.label}`).join('\n') || 'Aucune action de modération'}>
                    <strong>{s.actions30d}</strong> <span className="muted">actions · 30 j</span>
                    {s.lastActionAt && <span className="muted" style={{ display: 'block', fontSize: 12 }}>dernière : {timeAgo(s.lastActionAt)}</span>}
                    {s.actions30d === 0 && <span className="muted" style={{ display: 'block', fontSize: 12 }}>aucune action ce mois-ci</span>}
                  </span>
                  <span className="tm-tools">
                    {editable ? (
                      <>
                        <select value={s.role} onChange={(e) => { if (window.confirm(`Passer ${s.username} en « ${ROLE_ONE[e.target.value]} » ?`)) onRole(s.id, s.username, e.target.value); }} aria-label={`Rôle de ${s.username}`}>
                          {[s.role, ...assignable.filter((r) => r !== s.role)].map((r) => <option key={r} value={r}>{ROLE_ONE[r]}</option>)}
                        </select>
                        <button type="button" className="secondary" title="Retirer de l'équipe (redevient un membre)" onClick={() => window.confirm(`Retirer ${s.username} de l'équipe ?`) && onRole(s.id, s.username, 'USER')}>Retirer</button>
                      </>
                    ) : <span className="badge">{ROLE_ONE[s.role]}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {!canEdit && <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Seuls les super modérateurs, administrateurs et le propriétaire peuvent changer les rôles (jamais celui d'un membre de rang égal ou supérieur, ni le leur).</p>}
    </>
  );
}

/** Promouvoir un membre : recherche par pseudo, puis le rôle à lui donner. */
function AddToTeam({ assignable, onRole, onError }: { assignable: string[]; onRole: (id: string, name: string, role: string) => void; onError: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Member[]>([]);
  const [role, setRole] = useState(assignable.includes('MODERATOR') ? 'MODERATOR' : assignable[0] ?? '');
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => api.get('/staff/members', { params: { q: q.trim(), sort: 'name' } }).then((r) => setFound((r.data.items as Member[]).filter((m) => !STAFF.includes(m.role)).slice(0, 6))).catch((e) => onError(errorOf(e))), 300);
    return () => clearTimeout(t);
  }, [q, onError]);
  if (assignable.length === 0) return null;
  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>➕ Ajouter un membre à l'équipe</h3>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ flex: 1, minWidth: 200 }} placeholder="Pseudo du membre…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="row" style={{ gap: 6, alignItems: 'center' }}>Rôle
          <select value={role} onChange={(e) => setRole(e.target.value)}>{assignable.map((r) => <option key={r} value={r}>{ROLE_ONE[r]}</option>)}</select>
        </label>
      </div>
      <div className="grid" style={{ gap: 6, marginTop: 8 }}>
        {found.map((m) => (
          <div key={m.id} className="row" style={{ gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="row" style={{ gap: 8, alignItems: 'center' }}><Avatar user={m} size={26} /><UserLink user={m} /> <span className="muted" style={{ fontSize: 12 }}>{ROLE_ONE[m.role]} · {CLASS_ICON[m.memberClass]} {m.memberClass}</span></span>
            <button type="button" onClick={() => window.confirm(`Donner le rôle « ${ROLE_ONE[role]} » à ${m.username} ?`) && (onRole(m.id, m.username, role), setQ(''))}>Nommer {ROLE_ONE[role].toLowerCase()}</button>
          </div>
        ))}
        {q.trim().length >= 2 && found.length === 0 && <span className="muted">Aucun membre trouvé (les membres déjà dans l'équipe ne sont pas listés).</span>}
      </div>
    </div>
  );
}

function RanksTab({ data, canEdit }: { data: TeamData; canEdit: boolean }) {
  const [cls, setCls] = useState<string>('');
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('upload');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<{ items: Member[]; total: number; pageSize: number } | null>(null);
  useEffect(() => { setPage(1); }, [cls, role, q, sort]);
  useEffect(() => {
    const t = setTimeout(() => api.get('/staff/members', { params: { memberClass: cls || undefined, role: role || undefined, q: q || undefined, status: 'ACTIVE', sort, page } }).then((r) => setList(r.data)).catch(() => setList({ items: [], total: 0, pageSize: 50 })), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [cls, role, q, sort, page]);
  const total = useMemo(() => data.classes.reduce((n, c) => n + c.count, 0), [data]);
  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Les rangs sont <strong>automatiques</strong> : chaque nuit, chaque membre reçoit le plus haut rang dont il remplit toutes les conditions (ancienneté, volume envoyé, ratio) ; il peut le perdre si son ratio retombe.
        Le staff peut aussi fixer un rang à la main depuis le profil d'un membre. {canEdit && <>Les conditions se règlent dans <Link to="/admin?tab=Param%C3%A8tres">Admin &gt; Paramètres</Link>.</>}
      </p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {data.classes.slice().reverse().map((c) => (
          <button key={c.id} type="button" className={`panel tm-class${cls === c.id ? ' on' : ''}`} onClick={() => setCls(cls === c.id ? '' : c.id)} aria-pressed={cls === c.id}>
            <span className="tm-class-head"><span style={{ fontSize: 22 }}>{CLASS_ICON[c.id]}</span><strong>{c.label}</strong></span>
            <span style={{ fontSize: 26, fontWeight: 800 }}>{formatNumber(c.count)} <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>membre{c.count > 1 ? 's' : ''}{total ? ` · ${Math.round((c.count / total) * 100)} %` : ''}</span></span>
            <span className="muted" style={{ fontSize: 12, textAlign: 'left' }}>
              {c.conditions ? <>≥ {c.conditions.weeks} sem. · ≥ {formatNumber(c.conditions.uploadGb)} Go envoyés · ratio ≥ {c.conditions.ratio}</> : 'Rang de départ'}<br />
              {c.invites > 0 ? `${c.invites} invitation${c.invites > 1 ? 's' : ''} ouverte${c.invites > 1 ? 's' : ''}` : 'Pas d\'invitation'}
            </span>
          </button>
        ))}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input style={{ flex: 1, minWidth: 180 }} placeholder="Rechercher un pseudo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Tous les rôles</option>
          {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_ONE[r]}{data.roles[r] != null ? ` (${data.roles[r]})` : ''}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
          <option value="upload">Plus gros upload</option><option value="old">Plus anciens</option><option value="new">Inscrits récemment</option><option value="seen">Dernière visite</option><option value="name">Pseudo (A-Z)</option>
        </select>
        {cls && <button type="button" className="secondary" onClick={() => setCls('')}>✕ {data.classes.find((c) => c.id === cls)?.label}</button>}
      </div>

      {!list ? <Loading /> : list.items.length === 0 ? <div className="panel"><span className="muted">Aucun membre actif ne correspond.</span></div> : (
        <div className="panel" style={{ overflowX: 'auto', padding: 0 }}>
          <table>
            <thead><tr><th>Membre</th><th>Rôle</th><th>Rang</th><th>Ratio</th><th>↑ Envoyé</th><th>Inscrit</th><th>Dernière visite</th></tr></thead>
            <tbody>
              {list.items.map((m) => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{m.online && <span style={{ color: '#4ade80', marginRight: 6 }}>●</span>}<UserLink user={m} /></td>
                  <td>{ROLE_ONE[m.role] ?? m.role}</td>
                  <td>{CLASS_ICON[m.memberClass]} {data.classes.find((c) => c.id === m.memberClass)?.label ?? m.memberClass}</td>
                  <td>{m.ratio === null ? '∞' : m.ratio.toFixed(2)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatBytes(m.uploaded)}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{m.createdAt ? new Date(m.createdAt).toLocaleDateString('fr-CA') : '—'}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{m.lastSeenAt ? timeAgo(m.lastSeenAt) : 'jamais'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list && <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>{formatNumber(list.total)} membre{list.total > 1 ? 's' : ''} actif{list.total > 1 ? 's' : ''}.</p>}
      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Précédent</button>
          <span className="muted">Page {page} / {pages}</span>
          <button type="button" className="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Suivant →</button>
        </div>
      )}
    </>
  );
}

/** Ce que chaque rôle peut faire (d'après les droits réellement appliqués par le serveur). */
const MATRIX: { label: string; roles: string[] }[] = [
  { label: 'Valider ou refuser les torrents, traiter les signalements, répondre au support', roles: ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'] },
  { label: 'Bannir du chat, supprimer les messages d\'un canal, vider un canal public', roles: ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'] },
  { label: 'Voir les listes de membres (tous, en ligne, qui seedent) et le journal d\'activité d\'un membre', roles: ['MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'] },
  { label: 'Modifier un membre : rôle, upload / téléchargé, points, rang, pseudo, avertissements, bannissement', roles: ['SUPER_MODERATOR', 'ADMIN', 'OWNER'] },
  { label: 'Réglages du site, import automatique, wiki, forum, canaux, journal d\'audit, Telegram, pot commun', roles: ['ADMIN', 'OWNER'] },
  { label: 'Attribuer le rôle d\'Administrateur ou de Propriétaire', roles: ['OWNER'] },
];
const PEOPLE_ROLES = ['USER', 'UPLOADER', 'MODERATOR', 'SUPER_MODERATOR', 'ADMIN', 'OWNER'];

function RolesTab({ data }: { data: TeamData | null }) {
  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        Le <strong>rôle</strong> donne des droits (équipe) ; le <strong>rang</strong> automatique (Nouveau, Membre, Power User, Élite, Vétéran) récompense l'ancienneté, l'upload et le ratio. Un rôle ne peut être attribué que s'il est
        strictement inférieur au sien (seul le propriétaire peut tout attribuer), et personne ne change son propre rôle.
      </p>
      <div className="panel" style={{ overflowX: 'auto', padding: 0 }}>
        <table>
          <thead>
            <tr><th>Droit</th>{PEOPLE_ROLES.map((r) => <th key={r} style={{ textAlign: 'center' }}>{ROLE_ICON[r]}<br /><span style={{ fontSize: 11 }}>{ROLE_ONE[r]}</span>{data?.roles[r] != null && <><br /><span className="muted" style={{ fontSize: 11 }}>{data.roles[r]}</span></>}</th>)}</tr>
          </thead>
          <tbody>
            {MATRIX.map((m) => (
              <tr key={m.label}>
                <td>{m.label}</td>
                {PEOPLE_ROLES.map((r) => <td key={r} style={{ textAlign: 'center', color: m.roles.includes(r) ? '#4ade80' : undefined }}>{m.roles.includes(r) ? '✓' : <span className="muted">—</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Les membres et les uploaders n'ont aucun droit d'équipe : « Uploader » est un grade intermédiaire entre membre et modérateur.</p>
    </>
  );
}
