import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { formatBytes } from '../lib/format';
import { timeAgo } from '../lib/time';
import { CLASS_LABEL } from '../lib/memberClass';
import Avatar from '../components/Avatar';
import UserLink from '../components/UserLink';
import { useCrumbTitle } from '../store/crumbs';

const ROLE = { LEADER: '👑 Chef', OFFICER: '⭐ Officier', MEMBER: 'Membre' } as Record<string, string>;

/** Une team : présentation, conditions, membres, candidature — et, pour le chef et ses officiers, la gestion. */
export default function TeamDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState<any>(null);
  useCrumbTitle(team?.name);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [proof, setProof] = useState('');
  const [flash, setFlash] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', tag: '', description: '', requirements: '' });

  const load = () => api.get(`/teams/${id}`).then((r) => setTeam(r.data)).catch(() => setError('Team introuvable'));
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<any>, ok: string) {
    setError('');
    try { await fn(); setFlash(ok); setTimeout(() => setFlash(''), 3000); await load(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
  }

  async function uploadLogo(file?: File) {
    if (!file) return;
    const form = new FormData(); form.append('file', file);
    await run(async () => { const { data } = await api.post('/covers/upload', form); await api.patch(`/teams/${id}`, { logoUrl: data.url }); }, '✓ Logo mis à jour');
  }

  if (!team) return <p className="muted">{error || 'Chargement…'}</p>;

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="forum-crumbs"><Link to="/teams">Teams</Link> › <strong>{team.name}</strong></div>
      {error && <div className="panel" style={{ borderColor: 'var(--danger)' }}>{error}</div>}
      {flash && <div className="mod-flash" role="status">{flash}</div>}

      <div className="panel team-hero">
        <div className="team-logo big">{team.logoUrl ? <img src={team.logoUrl} alt="" /> : <span>{(team.tag || team.name).slice(0, 2).toUpperCase()}</span>}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0 }}>{team.name} {team.tag && <span className="team-tag">[{team.tag}]</span>}</h1>
          <div className="muted" style={{ margin: '4px 0 8px' }}>{team.members.length} membre{team.members.length > 1 ? 's' : ''} · créée {timeAgo(team.createdAt)} · {team.hasOwner ? <span className={team.recruiting ? 'team-rec on' : 'team-rec'}>{team.recruiting ? '🟢 Recrute' : '⚪ Ne recrute pas'}</span> : <span className="team-noowner">Sans propriétaire</span>} · 📦 {team.releaseCount} release{team.releaseCount > 1 ? 's' : ''}</div>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{team.description || 'Aucune description.'}</p>
          {team.requirements && <div style={{ marginTop: 10 }}><strong>Ce que la team attend :</strong><p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{team.requirements}</p></div>}
        </div>
        <div className="team-actions">
          {team.canManage && <button type="button" className="secondary" onClick={() => { setDraft({ name: team.name, tag: team.tag ?? '', description: team.description, requirements: team.requirements ?? '' }); setEditing((v) => !v); }}>✏️ Modifier</button>}
          {team.myRole && team.myRole !== 'LEADER' && <button type="button" className="danger" onClick={() => window.confirm('Quitter cette team ?') && run(() => api.post(`/teams/${id}/leave`), 'Tu as quitté la team')}>Quitter</button>}
          {team.canDelete && <button type="button" className="danger" onClick={() => window.confirm(`Supprimer la team ${team.name} ?`) && api.delete(`/teams/${id}`).then(() => navigate('/teams'))}>Supprimer</button>}
        </div>
      </div>

      {!team.hasOwner && (
        <div className="panel team-claim-info">
          <strong>🤖 Cette team n'a pas de propriétaire</strong>
          <p style={{ margin: '6px 0 0' }}>
            Elle a été <strong>ajoutée automatiquement par le système</strong> : son nom a été détecté à la fin du nom de releases partagées sur le site (« …-{team.name} »). Personne n'a encore prouvé qu'il en fait partie.
            Si tu es un <strong>véritable membre</strong> de cette team, tu peux en <strong>prendre possession</strong> : envoie une candidature avec une preuve ci-dessous. L'administration vérifie, et le premier membre validé devient le propriétaire (chef) ; les candidats suivants passent ensuite par lui.
          </p>
        </div>
      )}

      {editing && (
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0 }}>Modifier la team</h3>
          <div className="inv-grid">
            <label><span className="muted">Nom</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={40} /></label>
            <label><span className="muted">Tag</span><input value={draft.tag} onChange={(e) => setDraft({ ...draft, tag: e.target.value })} maxLength={8} /></label>
          </div>
          <textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description" maxLength={3000} />
          <textarea rows={2} value={draft.requirements} onChange={(e) => setDraft({ ...draft, requirements: e.target.value })} placeholder="Ce que la team attend des candidats" maxLength={2000} />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => run(async () => { await api.patch(`/teams/${id}`, draft); setEditing(false); }, '✓ Team modifiée')}>Enregistrer</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>Annuler</button>
            <label className="secondary fam-file">🖼️ Logo<input type="file" accept="image/*" hidden onChange={(e) => { void uploadLogo(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <button type="button" className="secondary" onClick={() => run(() => api.patch(`/teams/${id}`, { recruiting: !team.recruiting }), team.recruiting ? '✓ Recrutement fermé' : '✓ Recrutement ouvert')}>{team.recruiting ? 'Fermer le recrutement' : 'Ouvrir le recrutement'}</button>
          </div>
        </div>
      )}

      {/* Candidature */}
      {!team.myRole && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>{team.hasOwner ? 'Postuler' : 'Prendre possession de cette team'}</h3>
          {team.myApplicationId ? (
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}><span>⏳ Ta candidature est en attente{team.hasOwner ? '' : " de vérification par l'administration"}.</span><button type="button" className="secondary" onClick={() => run(() => api.delete(`/teams/${id}/apply`), 'Candidature retirée')}>Retirer ma candidature</button></div>
          ) : team.inOtherTeam ? <p className="muted" style={{ margin: 0 }}>Tu fais déjà partie d'une autre team : quitte-la pour postuler ici.</p>
            : team.hasOwner && !team.recruiting ? <p className="muted" style={{ margin: 0 }}>Cette team ne recrute pas pour le moment.</p>
            : (
              <div style={{ display: 'grid', gap: 8 }}>
                <textarea rows={3} placeholder={team.hasOwner ? 'Présente-toi : ce que tu sais faire, ton expérience, pourquoi cette team…' : 'Présente-toi : ton rôle dans la team, depuis quand tu en fais partie…'} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
                {!team.hasOwner && <textarea rows={3} placeholder="Preuve que tu fais vraiment partie de cette team : lien vers une annonce ou un post de la team, NFO, capture d'écran hébergée, contact d'un membre connu…" value={proof} onChange={(e) => setProof(e.target.value)} maxLength={1500} />}
                <div><button type="button" disabled={message.trim().length < 10 || (!team.hasOwner && proof.trim().length < 10)} onClick={() => run(async () => { await api.post(`/teams/${id}/apply`, { message, proof: proof || undefined }); setMessage(''); setProof(''); }, '✓ Candidature envoyée')}>{team.hasOwner ? 'Envoyer ma candidature' : 'Envoyer ma demande avec preuve'}</button></div>
              </div>
            )}
        </div>
      )}

      {/* Candidatures reçues */}
      {team.canManage && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Candidatures ({team.applications.length})</h3>
          {team.applications.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucune candidature en attente.</p> : (
            <div className="grid" style={{ gap: 10 }}>
              {team.applications.map((a: any) => (
                <div key={a.id} className="team-app">
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    <div className="row" style={{ gap: 8 }}>{a.user && <Avatar user={a.user} size={32} />}<strong>{a.user && <UserLink user={a.user} />}</strong><span className="muted" style={{ fontSize: 12 }}>{CLASS_LABEL[a.user?.memberClass] ?? ''} · ⬆ {formatBytes(a.uploaded)} · ⬇ {formatBytes(a.downloaded)} · {a.torrents} torrent{a.torrents > 1 ? 's' : ''} · {timeAgo(a.createdAt)}</span></div>
                    <div className="row" style={{ gap: 6 }}>
                      <button type="button" onClick={() => run(() => api.post(`/teams/applications/${a.id}/accept`), team.hasOwner ? '✓ Candidat accepté' : '✓ Propriétaire nommé')}>{team.hasOwner ? '✓ Accepter' : '✓ Valider : devient propriétaire'}</button>
                      <button type="button" className="danger" onClick={() => run(() => api.post(`/teams/applications/${a.id}/decline`), 'Candidature refusée')}>✕ Refuser</button>
                    </div>
                  </div>
                  <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>« {a.message} »</p>
                  {a.proof && <p className="team-proof"><strong>Preuve :</strong> <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{a.proof}</span></p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Releases */}
      {team.releases.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>📦 Dernières releases ({team.releaseCount})</h3>
          <table><tbody>
            {team.releases.map((r: any) => (
              <tr key={r.id}>
                <td><Link to={`/torrents/${r.id}`}>{r.name}</Link></td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatBytes(r.size)}</td>
                <td style={{ whiteSpace: 'nowrap' }}><span style={{ color: 'var(--success)' }}>{r.seeders} S</span> <span style={{ color: 'var(--danger)' }}>{r.leechers} L</span></td>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(r.createdAt)}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {/* Membres */}
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Membres ({team.members.length})</h3>
        {team.members.length === 0 && <p className="muted" style={{ margin: 0 }}>Aucun membre officiel pour le moment.</p>}
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Membre</th><th>Rôle</th><th>Rang</th><th>Upload</th><th>Torrents</th><th>Depuis</th>{team.canManage && <th />}</tr></thead>
            <tbody>
              {team.members.map((m: any) => (
                <tr key={m.userId}>
                  <td><span className="row" style={{ gap: 8 }}>{m.user && <Avatar user={m.user} size={26} />}{m.user && <UserLink user={m.user} />}</span></td>
                  <td>{ROLE[m.role] ?? m.role}</td>
                  <td className="muted">{CLASS_LABEL[m.user?.memberClass] ?? ''}</td>
                  <td className="muted">{formatBytes(m.uploaded)}</td>
                  <td className="muted">{m.torrents}</td>
                  <td className="muted">{timeAgo(m.joinedAt)}</td>
                  {team.canManage && (
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {m.role !== 'LEADER' && team.myRole !== 'OFFICER' && <button type="button" className="secondary" style={{ padding: '2px 8px', fontSize: 12, marginRight: 4 }} onClick={() => run(() => api.patch(`/teams/${id}/members/${m.userId}`, { role: m.role === 'OFFICER' ? 'MEMBER' : 'OFFICER' }), '✓ Rôle modifié')}>{m.role === 'OFFICER' ? 'Rétrograder' : '⭐ Officier'}</button>}
                      {m.role !== 'LEADER' && !(m.role === 'OFFICER' && team.myRole === 'OFFICER') && <button type="button" className="danger" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => window.confirm(`Retirer ${m.user?.username} de la team ?`) && run(() => api.delete(`/teams/${id}/members/${m.userId}`), '✓ Membre retiré')}>Retirer</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
