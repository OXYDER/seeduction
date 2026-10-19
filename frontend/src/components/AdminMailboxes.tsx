import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import Loading from './Loading';

interface Alias { address: string; name: string }
interface Box {
  id?: string; label: string; imapHost: string; imapPort: number; imapSecure: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; username: string; password: string;
  aliases: Alias[]; signature: string; allowedUserIds: string[]; passwordSet?: boolean;
}
interface Admin { id: string; username: string; role: string }
const errorOf = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m ?? 'Erreur'; };
const EMPTY: Box = { label: '', imapHost: 'imap.purelymail.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.purelymail.com', smtpPort: 465, smtpSecure: true, username: '', password: '', aliases: [], signature: '', allowedUserIds: [] };

/** Admin > Courriel : les boîtes courriel (Purelymail, etc.), leurs alias, et quels administrateurs y ont accès. Chaque administrateur règle les boîtes qu'il a ajoutées. */
export default function AdminMailboxes() {
  const role = useAuthStore((s) => s.user?.role);
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [edit, setEdit] = useState<Box | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get('/webmail/admin').then((r) => { setBoxes(r.data.mailboxes.map((b: any) => ({ ...b, password: '' }))); setAdmins(r.data.admins); }).catch((e) => setError(errorOf(e))), []);
  const allowed = role === 'OWNER' || role === 'ADMIN';
  useEffect(() => { if (allowed) void load(); }, [load, allowed]);

  if (!allowed) return <div className="panel"><h2 style={{ marginTop: 0 }}>✉️ Courriel</h2><p className="muted">Réservé aux administrateurs. <Link to="/courriel">Ouvrir le courriel →</Link></p></div>;
  if (!boxes) return error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : <Loading />;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(''); setError('');
    try { await fn(); setMsg(ok); } catch (e) { setError(errorOf(e)); } finally { setBusy(false); }
  }
  const save = () => run(async () => { if (edit!.id) await api.put(`/webmail/admin/mailboxes/${edit!.id}`, edit); else await api.post('/webmail/admin/mailboxes', edit); setEdit(null); await load(); }, 'Boîte enregistrée.');
  const test = () => run(async () => { const { data } = await api.post('/webmail/admin/test', { ...edit, id: edit!.id }); if (data.imap === 'ok' && data.smtp === 'ok') setMsg(`✅ Connexion réussie (${data.folders} dossiers).`); else { setError(`Lecture (IMAP) : ${data.imap === 'ok' ? 'ok' : data.imap} · Envoi (SMTP) : ${data.smtp === 'ok' ? 'ok' : data.smtp}`); } }, '');
  const del = (b: Box) => { if (window.confirm(`Retirer la boîte « ${b.label} » du site ? Tes courriels ne sont pas touchés : ils restent chez ton hébergeur.`)) void run(async () => { await api.delete(`/webmail/admin/mailboxes/${b.id}`); await load(); }, 'Boîte retirée.'); };
  const set = (patch: Partial<Box>) => setEdit({ ...edit!, ...patch });

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>✉️ Courriel : boîtes et alias</h2>
        <div className="row" style={{ gap: 8 }}><Link to="/courriel" className="secondary" style={{ padding: '6px 12px', borderRadius: 8 }}>Ouvrir le courriel →</Link>{!edit && <button type="button" onClick={() => setEdit({ ...EMPTY })}>+ Ajouter une boîte</button>}</div>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Le site lit et envoie les courriels directement chez ton hébergeur (IMAP pour lire, SMTP pour envoyer) : rien n'est copié sur le site. Le mot de passe est chiffré et n'est jamais réaffiché. Les alias que tu ajoutes ici
        peuvent être choisis comme expéditeur. Tu règles les boîtes que tu as ajoutées, et tu choisis quels autres administrateurs y ont accès. Chaque envoi est inscrit au journal d'audit.
      </p>
      {msg && <p style={{ margin: 0, color: 'var(--success)' }}>{msg}</p>}
      {error && <p style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>}

      {!edit && boxes.length === 0 && <p className="muted" style={{ margin: 0 }}>Aucune boîte pour l'instant. Clique sur « Ajouter une boîte » (les valeurs de Purelymail sont déjà remplies : tu n'as qu'à saisir l'adresse et le mot de passe). Les boîtes ajoutées par un autre administrateur n'apparaissent pas ici : seul lui peut les régler.</p>}
      {!edit && boxes.map((b) => (
        <div key={b.id} className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
          <div><strong>{b.label}</strong> <span className="muted">· {b.username} · {b.aliases.length} alias · {b.allowedUserIds.length} administrateur{b.allowedUserIds.length > 1 ? 's' : ''} autorisé{b.allowedUserIds.length > 1 ? 's' : ''}</span>{!b.passwordSet && <span style={{ color: 'var(--danger)' }}> · mot de passe à ressaisir</span>}</div>
          <div className="row" style={{ gap: 6 }}><button type="button" className="secondary" onClick={() => setEdit({ ...b })}>Modifier</button><button type="button" className="secondary" disabled={busy} onClick={() => del(b)}>Retirer</button></div>
        </div>
      ))}

      {edit && (
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 3 }}>Nom de la boîte<input value={edit.label} onChange={(e) => set({ label: e.target.value })} placeholder="Seeduction" maxLength={60} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <label style={{ display: 'grid', gap: 3 }}>Identifiant (adresse de connexion)<input value={edit.username} onChange={(e) => set({ username: e.target.value })} placeholder="toi@seeduction.org" autoComplete="off" /></label>
            <label style={{ display: 'grid', gap: 3 }}>Mot de passe{edit.passwordSet ? ' (laisser vide pour le garder)' : ''}<input type="password" value={edit.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" /></label>
          </div>
          <details>
            <summary style={{ cursor: 'pointer' }}>Serveurs (déjà remplis pour Purelymail)</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 8 }}>
              <label style={{ display: 'grid', gap: 3 }}>Serveur IMAP<input value={edit.imapHost} onChange={(e) => set({ imapHost: e.target.value })} /></label>
              <label style={{ display: 'grid', gap: 3 }}>Port IMAP<input type="number" value={edit.imapPort} onChange={(e) => set({ imapPort: Number(e.target.value) })} /></label>
              <label className="row" style={{ gap: 6, alignItems: 'center' }}><input type="checkbox" checked={edit.imapSecure} onChange={(e) => set({ imapSecure: e.target.checked })} /> Connexion chiffrée (SSL)</label>
              <label style={{ display: 'grid', gap: 3 }}>Serveur SMTP<input value={edit.smtpHost} onChange={(e) => set({ smtpHost: e.target.value })} /></label>
              <label style={{ display: 'grid', gap: 3 }}>Port SMTP<input type="number" value={edit.smtpPort} onChange={(e) => set({ smtpPort: Number(e.target.value) })} /></label>
              <label className="row" style={{ gap: 6, alignItems: 'center' }}><input type="checkbox" checked={edit.smtpSecure} onChange={(e) => set({ smtpSecure: e.target.checked })} /> Connexion chiffrée (SSL)</label>
            </div>
          </details>
          <div>
            <strong>Alias (adresses qu'on peut choisir comme expéditeur)</strong>
            <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
              {edit.aliases.map((a, i) => (
                <div key={i} className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <input value={a.address} onChange={(e) => set({ aliases: edit.aliases.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)) })} placeholder="contact@seeduction.org" style={{ minWidth: 220 }} />
                  <input value={a.name} onChange={(e) => set({ aliases: edit.aliases.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Nom affiché (ex. Seeduction)" style={{ minWidth: 180 }} />
                  <button type="button" className="secondary" onClick={() => set({ aliases: edit.aliases.filter((_, j) => j !== i) })}>Retirer</button>
                </div>
              ))}
              <button type="button" className="secondary" style={{ justifySelf: 'start' }} onClick={() => set({ aliases: [...edit.aliases, { address: '', name: '' }] })}>+ Ajouter un alias</button>
            </div>
          </div>
          <label style={{ display: 'grid', gap: 3 }}>Signature (ajoutée à chaque nouveau message)<textarea rows={2} value={edit.signature} onChange={(e) => set({ signature: e.target.value })} maxLength={600} /></label>
          <div>
            <strong>Administrateurs autorisés</strong>
            <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
              {admins.filter((a) => a.role === 'ADMIN').map((a) => (
                <label key={a.id} className="row" style={{ gap: 6, alignItems: 'center' }}><input type="checkbox" checked={edit.allowedUserIds.includes(a.id)} onChange={(e) => set({ allowedUserIds: e.target.checked ? [...edit.allowedUserIds, a.id] : edit.allowedUserIds.filter((x) => x !== a.id) })} /> {a.username}</label>
              ))}
              {admins.filter((a) => a.role === 'ADMIN').length === 0 && <span className="muted">Aucun autre administrateur.</span>}
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="secondary" disabled={busy} onClick={test}>Tester la connexion</button>
            <button type="button" disabled={busy} onClick={save}>Enregistrer</button>
            <button type="button" className="secondary" onClick={() => { setEdit(null); setMsg(''); setError(''); }}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
