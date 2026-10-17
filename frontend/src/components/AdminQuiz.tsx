import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';

interface Cfg {
  enabled: boolean; minAccountDays: number; questionsPerDay: number; secondsPerQuestion: number; pointsPerCorrect: number; speedBonusMax: number;
  perfectBonus: number; consolation: number; streak: { bonusPerDay: number; maxBonus: number }; podium: number[];
}
interface Q { id: string; category: string; text: string; choices: string[]; answer: number; explain: string | null; active: boolean; asked: number; right: number }
interface Stats { playsToday: number; playsWeek: number; pointsWeek: number; avgCorrectWeek: number | null; playsAll: number; pointsAll: number }
const errorOf = (e: any) => e?.response?.data?.message ?? 'Erreur';
const EMPTY = { id: '', category: '', text: '', choices: ['', '', '', ''], answer: 0, explain: '', active: true };

/** Admin > Jeux : le quiz quotidien (réglages des points et banque de questions). */
export default function AdminQuiz() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [edit, setEdit] = useState<typeof EMPTY | null>(null);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => api.get('/games/quiz/admin').then((r) => { setCfg(r.data.config); setQuestions(r.data.questions); setStats(r.data.stats); }).catch((e) => setErr(errorOf(e))), []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? questions.filter((q) => q.text.toLowerCase().includes(f) || q.category.toLowerCase().includes(f)) : questions;
  }, [questions, filter]);

  if (!cfg || !stats) return err ? <p style={{ color: 'var(--danger)' }}>{err}</p> : null;

  const num = (v: number, set: (n: number) => void, label: string, hint?: string, step = 1) => (
    <label style={{ display: 'grid', gap: 3, fontSize: 13 }}>{label}
      <input type="number" min={0} step={step} value={v} onChange={(e) => set(Number(e.target.value))} style={{ width: 110 }} />
      {hint && <span className="muted" style={{ fontSize: 11.5 }}>{hint}</span>}
    </label>
  );
  async function saveCfg() {
    setMsg(''); setErr('');
    try { await api.put('/games/quiz/admin', cfg); setMsg('✓ Réglages enregistrés'); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  async function saveQuestion() {
    if (!edit) return;
    setMsg(''); setErr('');
    const body = { category: edit.category, text: edit.text, choices: edit.choices, answer: edit.answer, explain: edit.explain, active: edit.active };
    try {
      if (edit.id) await api.put(`/games/quiz/admin/questions/${edit.id}`, body); else await api.post('/games/quiz/admin/questions', body);
      setEdit(null); setMsg('✓ Question enregistrée'); await load();
    } catch (e) { setErr(errorOf(e)); }
  }
  async function toggle(q: Q) {
    try { await api.put(`/games/quiz/admin/questions/${q.id}`, { active: !q.active }); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  async function remove(q: Q) {
    if (!window.confirm(`Supprimer cette question ?\n\n${q.text}`)) return;
    try { await api.delete(`/games/quiz/admin/questions/${q.id}`); await load(); } catch (e) { setErr(errorOf(e)); }
  }
  const active = questions.filter((q) => q.active).length;

  return (
    <div className="panel" style={{ display: 'grid', gap: 12 }}>
      <h2 style={{ margin: 0 }}>🧠 Quiz quotidien : réglages</h2>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Chaque jour, les mêmes questions sont tirées dans la banque pour tous les membres (en évitant celles des derniers jours). Ce sont des cadeaux du site, sans mise.
        Il y a actuellement <strong>{active}</strong> question{active > 1 ? 's' : ''} active{active > 1 ? 's' : ''} sur {questions.length}.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Quiz ouvert aux membres</label>
        {num(cfg.questionsPerDay, (n) => setCfg({ ...cfg, questionsPerDay: n }), 'Questions par jour', '3 à 15')}
        {num(cfg.secondsPerQuestion, (n) => setCfg({ ...cfg, secondsPerQuestion: n }), 'Secondes par question', '8 à 120')}
        {num(cfg.minAccountDays, (n) => setCfg({ ...cfg, minAccountDays: n }), 'Âge minimal du compte (jours)')}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {num(cfg.pointsPerCorrect, (n) => setCfg({ ...cfg, pointsPerCorrect: n }), 'Points par bonne réponse')}
        {num(cfg.speedBonusMax, (n) => setCfg({ ...cfg, speedBonusMax: n }), 'Bonus de rapidité maximal', 'Répondre tout de suite')}
        {num(cfg.perfectBonus, (n) => setCfg({ ...cfg, perfectBonus: n }), 'Bonus sans-faute')}
        {num(cfg.consolation, (n) => setCfg({ ...cfg, consolation: n }), 'Prix de consolation', 'Aucune bonne réponse')}
        {num(Math.round(cfg.streak.bonusPerDay * 1000) / 10, (n) => setCfg({ ...cfg, streak: { ...cfg.streak, bonusPerDay: n / 100 } }), 'Bonus par jour de série (%)', '0 à 50', 0.5)}
        {num(Math.round(cfg.streak.maxBonus * 100), (n) => setCfg({ ...cfg, streak: { ...cfg.streak, maxBonus: n / 100 } }), 'Bonus maximal de série (%)')}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {[0, 1, 2].map((i) => num(cfg.podium[i], (n) => setCfg({ ...cfg, podium: cfg.podium.map((p, k) => (k === i ? n : p)) }), `Podium : ${['1er', '2e', '3e'][i]} (points)`, i === 0 ? 'Versé le matin suivant' : undefined))}
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="button" onClick={saveCfg}>Enregistrer les réglages</button>
        {msg && <span style={{ color: 'var(--success)' }}>{msg}</span>}
        {err && <span style={{ color: 'var(--danger)' }}>{err}</span>}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Quiz joués : {formatNumber(stats.playsToday)} aujourd'hui · {formatNumber(stats.playsWeek)} sur 7 jours ({formatNumber(stats.pointsWeek)} points offerts{stats.avgCorrectWeek !== null ? `, ${String(stats.avgCorrectWeek).replace('.', ',')} bonnes réponses en moyenne` : ''}) · {formatNumber(stats.playsAll)} au total ({formatNumber(stats.pointsAll)} points).
      </p>

      <h3 style={{ margin: '6px 0 0' }}>Banque de questions</h3>
      <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input placeholder="Chercher une question ou une catégorie…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ minWidth: 260 }} />
        <button type="button" className="secondary" onClick={() => setEdit({ ...EMPTY, choices: ['', '', '', ''] })}>➕ Ajouter une question</button>
      </div>

      {edit && (
        <div className="panel" style={{ display: 'grid', gap: 8, border: '1px solid var(--gold)' }}>
          <strong>{edit.id ? 'Modifier la question' : 'Nouvelle question'}</strong>
          <input placeholder="Catégorie (ex. Cinéma)" value={edit.category} maxLength={30} onChange={(e) => setEdit({ ...edit, category: e.target.value })} list="quiz-cats" />
          <datalist id="quiz-cats">{[...new Set(questions.map((q) => q.category))].map((c) => <option key={c} value={c} />)}</datalist>
          <textarea placeholder="La question" value={edit.text} maxLength={300} rows={2} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
          {edit.choices.map((c, i) => (
            <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="radio" name="quiz-answer" checked={edit.answer === i} onChange={() => setEdit({ ...edit, answer: i })} title="Bonne réponse" />
              <input placeholder={`Réponse ${'ABCD'[i]}${edit.answer === i ? ' (la bonne)' : ''}`} value={c} maxLength={80} style={{ flex: 1 }} onChange={(e) => setEdit({ ...edit, choices: edit.choices.map((x, k) => (k === i ? e.target.value : x)) })} />
            </label>
          ))}
          <input placeholder="Explication affichée après la réponse (facultatif)" value={edit.explain} maxLength={300} onChange={(e) => setEdit({ ...edit, explain: e.target.value })} />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Question active (peut être tirée)</label>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" onClick={saveQuestion}>Enregistrer la question</button>
            <button type="button" className="secondary" onClick={() => setEdit(null)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ maxHeight: 420, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead><tr style={{ textAlign: 'left' }}><th>Catégorie</th><th>Question</th><th>Bonne réponse</th><th title="Réussite">Réussite</th><th>Active</th><th /></tr></thead>
          <tbody>
            {shown.map((q) => (
              <tr key={q.id} style={{ borderTop: '1px solid var(--border)', opacity: q.active ? 1 : 0.55 }}>
                <td>{q.category}</td>
                <td>{q.text}</td>
                <td>{q.choices[q.answer]}</td>
                <td>{q.asked > 0 ? `${Math.round((q.right / q.asked) * 100)} % (${q.asked})` : '–'}</td>
                <td><input type="checkbox" checked={q.active} onChange={() => toggle(q)} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="secondary" onClick={() => setEdit({ id: q.id, category: q.category, text: q.text, choices: [...q.choices], answer: q.answer, explain: q.explain ?? '', active: q.active })}>✏️</button>{' '}
                  <button type="button" className="secondary" onClick={() => remove(q)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
