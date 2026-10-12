import { useState } from 'react';
import { api } from '../../api/client';

const DURATIONS: { label: string; hours: number | null }[] = [
  { label: 'Sans limite', hours: null }, { label: '1 heure', hours: 1 }, { label: '24 heures', hours: 24 }, { label: '3 jours', hours: 72 }, { label: '7 jours', hours: 168 },
];

/** Créer un sondage dans la conversation ouverte : question, 2 à 8 choix, choix multiples, durée. */
export default function PollModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [hours, setHours] = useState<number | null>(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const filled = options.map((o) => o.trim()).filter(Boolean);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api.post(`/messenger/conversations/${conversationId}/polls`, { question, options: filled, multiple, hours }); onClose(); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Création impossible'); }
    finally { setBusy(false); }
  }

  return (
    <div className="msgr-modal-backdrop" onClick={onClose}>
      <form className="msgr-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-label="Nouveau sondage">
        <div className="msgr-modal-head"><strong>📊 Nouveau sondage</strong><button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Fermer">✕</button></div>
        <label className="grid" style={{ gap: 4 }}><span>Question</span><input value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} placeholder="Quel film pour la soirée ?" autoFocus required /></label>
        <div className="grid" style={{ gap: 6 }}>
          <span>Choix ({filled.length} sur 8 au plus)</span>
          {options.map((o, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <input value={o} maxLength={80} placeholder={`Choix ${i + 1}`} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} style={{ flex: 1 }} />
              {options.length > 2 && <button type="button" className="secondary" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label="Retirer ce choix">✕</button>}
            </div>
          ))}
          {options.length < 8 && <button type="button" className="secondary" onClick={() => setOptions([...options, ''])}>＋ Ajouter un choix</button>}
        </div>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /> Plusieurs choix possibles</label>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>Durée
          <select value={hours === null ? 'none' : String(hours)} onChange={(e) => setHours(e.target.value === 'none' ? null : Number(e.target.value))}>
            {DURATIONS.map((d) => <option key={d.label} value={d.hours === null ? 'none' : String(d.hours)}>{d.label}</option>)}
          </select>
        </label>
        {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" disabled={busy || question.trim().length < 3 || filled.length < 2}>Publier le sondage</button>
          <button type="button" className="secondary" onClick={onClose}>Annuler</button>
        </div>
      </form>
    </div>
  );
}
