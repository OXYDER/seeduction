import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

interface Sug { id: string; username: string; category: string; text: string; choices: string[]; answer: number; explain: string | null; createdAt: string }
interface ImportRes { dryRun: boolean; added: number; valid: number; errorCount: number; errors: { line: number; reason: string }[]; preview: { category: string; text: string; good: string }[] }
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';
const EXAMPLE = '# catégorie ; question ; bonne réponse ; mauvaise 1 ; mauvaise 2 ; mauvaise 3 ; explication (facultative)\nCinéma ; Qui a réalisé Alien ? ; Ridley Scott ; James Cameron ; David Fincher ; Tim Burton ; Sorti en 1979.';

/** Admin > Jeux > Quiz : propositions des membres à valider, et import en lot (copier-coller depuis un tableur). */
export default function AdminQuizTools({ onChange }: { onChange: () => void }) {
  const [sugs, setSugs] = useState<Sug[]>([]);
  const [text, setText] = useState('');
  const [res, setRes] = useState<ImportRes | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/games/quiz/admin/suggestions').then((r) => setSugs(r.data)).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { void load(); }, [load]);

  async function approve(s: Sug) {
    setMsg(''); setErr('');
    try { await api.post(`/games/quiz/admin/suggestions/${s.id}/approve`, {}); setMsg(`✓ Question de ${s.username} acceptée`); await load(); onChange(); } catch (e) { setErr(errorOf(e)); }
  }
  async function reject(s: Sug) {
    const note = window.prompt(`Raison du refus (visible par ${s.username}, facultative) :`, '');
    if (note === null) return;
    setMsg(''); setErr('');
    try { await api.post(`/games/quiz/admin/suggestions/${s.id}/reject`, { note }); setMsg('✓ Proposition refusée'); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  async function run(dryRun: boolean) {
    setMsg(''); setErr(''); setRes(null);
    try {
      const { data } = await api.post('/games/quiz/admin/import', { text, dryRun });
      setRes(data);
      if (!dryRun) { setMsg(`✓ ${data.added} question${data.added > 1 ? 's' : ''} ajoutée${data.added > 1 ? 's' : ''}`); onChange(); if (data.errorCount === 0) setText(''); }
    } catch (e) { setErr(errorOf(e)); }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <h3 style={{ margin: '6px 0' }}>Propositions des membres ({sugs.length})</h3>
        {sugs.length === 0 ? <p className="muted" style={{ margin: 0 }}>Aucune proposition en attente.</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {sugs.map((s) => (
              <div key={s.id} className="panel" style={{ display: 'grid', gap: 4, padding: 10 }}>
                <div className="muted" style={{ fontSize: 12.5 }}>{s.username} · {s.category} · {new Date(s.createdAt).toLocaleDateString('fr-CA')}</div>
                <strong>{s.text}</strong>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>{s.choices.map((c, i) => <li key={i} style={{ color: i === s.answer ? 'var(--green-bright)' : undefined, fontWeight: i === s.answer ? 700 : 400 }}>{c}{i === s.answer ? ' ✓' : ''}</li>)}</ul>
                {s.explain && <div className="muted" style={{ fontSize: 12.5 }}>💡 {s.explain}</div>}
                <div className="row" style={{ gap: 8 }}><button type="button" onClick={() => approve(s)}>Accepter</button><button type="button" className="secondary" onClick={() => reject(s)}>Refuser</button></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 style={{ margin: '6px 0' }}>Importer des questions en lot</h3>
        <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>
          Une question par ligne : <code>catégorie ; question ; bonne réponse ; mauvaise 1 ; mauvaise 2 ; mauvaise 3 ; explication</code> (séparateur « ; », « | » ou tabulation : un copier-coller depuis un tableur fonctionne). Un tableau JSON est aussi accepté.
          « Vérifier » montre ce qui serait ajouté sans rien écrire ; les doublons sont écartés.
        </p>
        <textarea rows={6} value={text} placeholder={EXAMPLE} onChange={(e) => setText(e.target.value)} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12.5 }} />
        <div className="row" style={{ gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="secondary" onClick={() => run(true)} disabled={!text.trim()}>Vérifier</button>
          <button type="button" onClick={() => run(false)} disabled={!text.trim() || (res !== null && res.valid === 0)}>Importer</button>
          {res && <span className="muted">{res.dryRun ? 'Vérification' : 'Import'} : {res.valid} valide{res.valid > 1 ? 's' : ''}, {res.errorCount} refusée{res.errorCount > 1 ? 's' : ''}</span>}
        </div>
        {res && res.errors.length > 0 && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--danger)' }}>{res.errors.slice(0, 15).map((e, i) => <li key={i}>Ligne {e.line} : {e.reason}</li>)}{res.errorCount > 15 && <li>… et {res.errorCount - 15} autre(s)</li>}</ul>
        )}
        {res && res.preview.length > 0 && res.dryRun && (
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>{res.preview.map((p, i) => <li key={i}><span className="muted">{p.category}</span> · {p.text} → <strong>{p.good}</strong></li>)}{res.valid > res.preview.length && <li className="muted">… et {res.valid - res.preview.length} autre(s)</li>}</ul>
        )}
      </div>
      {msg && <div style={{ color: 'var(--success)' }}>{msg}</div>}
      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
    </div>
  );
}
