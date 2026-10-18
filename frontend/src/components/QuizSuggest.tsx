import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

interface Item { id: string; text: string; category: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; note: string | null; reward: number; createdAt: string }
const STATUS = { PENDING: '⏳ En attente', APPROVED: '✅ Acceptée', REJECTED: '❌ Refusée' } as const;
const EMPTY = { category: '', text: '', choices: ['', '', '', ''], explain: '' };

/** Quiz : les membres proposent des questions. Le staff les valide ; une question acceptée entre dans la banque et rapporte quelques points. */
export default function QuizSuggest() {
  const [items, setItems] = useState<Item[]>([]);
  const [reward, setReward] = useState(0);
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get('/games/quiz/suggestions').then((r) => { setItems(r.data.items); setReward(r.data.reward); }).catch(() => undefined), []);
  useEffect(() => { void load(); }, [load]);

  async function send() {
    if (busy) return;
    setBusy(true); setMsg(''); setErr('');
    try {
      await api.post('/games/quiz/suggest', { category: f.category, text: f.text, choices: f.choices, answer: 0, explain: f.explain });
      setMsg('✓ Merci ! Ta question est envoyée au staff pour validation.'); setF(EMPTY); await load();
    } catch (e: any) { setErr(e.response?.data?.message ?? 'Envoi impossible'); }
    finally { setBusy(false); }
  }
  const set = (i: number, v: string) => setF({ ...f, choices: f.choices.map((c, k) => (k === i ? v : c)) });

  return (
    <details className="panel">
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>💡 Proposer une question{reward > 0 ? ` (+${reward} points si elle est acceptée)` : ''}</summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Écris une question avec <strong>une seule bonne réponse</strong> et trois mauvaises. Le staff la vérifie avant de l'ajouter. 3 propositions en attente au maximum.</p>
        <input placeholder="Catégorie (ex. Cinéma, Hockey, Sciences)" value={f.category} maxLength={30} onChange={(e) => setF({ ...f, category: e.target.value })} />
        <textarea placeholder="La question" value={f.text} maxLength={300} rows={2} onChange={(e) => setF({ ...f, text: e.target.value })} />
        <input placeholder="✅ La bonne réponse" value={f.choices[0]} maxLength={80} onChange={(e) => set(0, e.target.value)} />
        {[1, 2, 3].map((i) => <input key={i} placeholder={`❌ Mauvaise réponse ${i}`} value={f.choices[i]} maxLength={80} onChange={(e) => set(i, e.target.value)} />)}
        <input placeholder="Explication affichée après la réponse (facultatif)" value={f.explain} maxLength={300} onChange={(e) => setF({ ...f, explain: e.target.value })} />
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={send} disabled={busy}>Envoyer ma question</button>
          {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
          {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
        </div>
        {items.length > 0 && (
          <div>
            <strong style={{ fontSize: 13 }}>Mes propositions</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 4, fontSize: 13 }}>
              {items.map((i) => (
                <li key={i.id}><span>{STATUS[i.status]}</span> · {i.text}{i.status === 'APPROVED' && i.reward > 0 ? <strong style={{ color: 'var(--green-bright)' }}> +{i.reward} pts</strong> : null}{i.status === 'REJECTED' && i.note ? <span className="muted"> — {i.note}</span> : null}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
