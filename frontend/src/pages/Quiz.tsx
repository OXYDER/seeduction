import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatNumber } from '../lib/format';
import { audio, bell, noiseBuffer, playWin, setSoundOn, soundOn, tick } from '../lib/slotSound';
import { useCountdown } from '../components/FreeleechCalendar';
import CoinShower from '../components/CoinShower';

interface Choice { i: number; text: string }
interface QuestionV { id: string; category: string; text: string; choices: Choice[] }
interface ReviewV { text: string; category: string; correctText: string; myText: string | null; correct: boolean; points: number; explain: string | null }
interface ResultV { correct: number; questions: number; points: number; bonus: number; reward: number; streak: number; perfect: boolean; consolation: boolean; totalMs: number; review: ReviewV[] }
interface PlayV { status: 'ACTIVE' | 'DONE'; total: number; answered: number; correct: number; seconds: number; serverNow: number; index?: number; startsAt?: number; question?: QuestionV | null; result?: ResultV }
interface Overview {
  enabled: boolean; blocked: string | null; ready: boolean; day: string; nextAt: string;
  rules: { questions: number; seconds: number; perCorrect: number; speedBonus: number; perfect: number; consolation: number; podium: number[] };
  streak: { current: number; next: number; multiplier: number };
  playedToday: boolean; play: PlayV | null; myRank: number | null;
  me: { plays: number; won: number; best: number; perfects: number };
  today: { username: string; correct: number; seconds: number; mine: boolean }[];
  weekly: { username: string; points: number; plays: number; mine: boolean }[];
}
interface Reveal { question: QuestionV; chosen: number | null; answer: number | null; correct: boolean; points: number; explain: string | null }

const LETTERS = ['A', 'B', 'C', 'D'];
const REVEAL_SHOW_MS = 2500;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const secs = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

/** Bonne réponse : petit accord de cloches qui monte avec la série de bonnes réponses. */
function soundRight(combo: number) {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t = a.c.currentTime + 0.01;
  const base = 659 + Math.min(combo, 5) * 55;
  [base, base * 1.26, base * 1.5].forEach((f, i) => bell(a, t + i * 0.07, f, 0.08, 0.55));
}
/** Mauvaise réponse : buzzer grave et court. */
function soundWrong() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out } = a, t = c.currentTime + 0.01;
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.32);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
  o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + 0.4);
}
/** Les derniers instants du chrono : un « tic » plus aigu à chaque seconde. */
function soundTick(left: number) {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  tick(a, a.c.currentTime, 1800 + (5 - left) * 220, 0.1, 0.04);
}
/** Roulement avant le début du quiz. */
function soundStart() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out } = a, t = c.currentTime + 0.01;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.6);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + 0.6);
}

/** Quiz quotidien : les mêmes questions pour tout le monde, un chrono par question, des points pour chaque bonne réponse et un bonus sans-faute. */
export default function Quiz() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [play, setPlay] = useState<PlayV | null>(null);
  const [offset, setOffset] = useState(0); // heure du serveur − heure locale
  const [entered, setEntered] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [combo, setCombo] = useState(0);
  const [marks, setMarks] = useState<boolean[]>([]);
  const [shower, setShower] = useState(0);
  const [sound, setSound] = useState(soundOn());
  const [balance, setBalance] = useState<number | null>(null);
  const alive = useRef(true);
  const submitted = useRef<string>('');
  const lastTick = useRef(-1);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.get('/games/quiz');
      if (!alive.current) return;
      setData(r.data); setError('');
      return r.data as Overview;
    } catch { setError('Impossible de charger le quiz'); }
  }, []);
  useEffect(() => { void load().then((d) => { if (d?.play) { setPlay(d.play); setOffset(d.play.serverNow - Date.now()); } }); }, [load]);

  useEffect(() => {
    if (!play || play.status !== 'ACTIVE') return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [play]);

  const left = useCountdown(data?.playedToday ? data.nextAt : null);

  const applyPlay = useCallback((p: PlayV) => { setPlay(p); setOffset(p.serverNow - Date.now()); }, []);

  async function begin() {
    if (busy) return;
    setError(''); setBusy(true);
    try {
      const { data: r } = await api.post('/games/quiz/start');
      applyPlay(r.play); setEntered(true); setMarks([]); soundStart();
      if (r.play.status === 'DONE') void load();
    } catch (e: any) { setError(e.response?.data?.message ?? 'Impossible de commencer'); }
    finally { setBusy(false); }
  }

  const submit = useCallback(async (choice: number | null) => {
    if (!play || play.status !== 'ACTIVE' || !play.question || busy) return;
    const key = `${play.index}:${play.question.id}`;
    if (submitted.current === key) return;
    submitted.current = key;
    setBusy(true);
    const question = play.question;
    try {
      const { data: r } = await api.post('/games/quiz/answer', { index: play.index, choice });
      if (!alive.current) return;
      const ok = !!r.correct;
      setReveal({ question, chosen: choice, answer: r.answer ?? null, correct: ok, points: r.points ?? 0, explain: r.explain ?? null });
      setMarks((m) => [...m, ok]);
      setCombo((c) => (ok ? c + 1 : 0));
      if (ok) { soundRight(combo + 1); setShower((n) => n + 1); } else soundWrong();
      if (r.balance !== undefined) setBalance(r.balance);
      await sleep(r.done ? REVEAL_SHOW_MS - 300 : REVEAL_SHOW_MS);
      if (!alive.current) return;
      setReveal(null);
      applyPlay(r.play);
      if (r.done) {
        const res = r.play.result as ResultV | undefined;
        if (res) playWin(res.perfect ? 'mega' : res.correct >= 3 ? 'big' : 'small', Math.max(1, res.reward / 30));
        setShower((n) => n + 1);
        void load();
      }
    } catch (e: any) {
      submitted.current = '';
      setError(e.response?.data?.message ?? 'Réponse impossible');
      void load().then((d) => { if (d?.play) applyPlay(d.play); });
    } finally { setBusy(false); }
  }, [play, busy, combo, applyPlay, load]);

  // temps écoulé : on envoie « sans réponse » pour voir la bonne réponse
  const active = play?.status === 'ACTIVE' && !!play.question;
  const startLocal = active && play!.startsAt !== undefined ? play!.startsAt - offset : 0;
  const limitMs = (play?.seconds ?? 20) * 1000;
  const elapsed = active ? now - startLocal : 0;
  const remaining = Math.max(0, limitMs - elapsed);
  const started = active && now >= startLocal;
  useEffect(() => {
    if (!active || !started || reveal || busy) return;
    const w = Math.ceil(remaining / 1000);
    if (w <= 5 && w >= 1 && lastTick.current !== w) { lastTick.current = w; soundTick(w); }
    if (remaining <= 0) void submit(null);
  }, [active, started, remaining, reveal, busy, submit]);
  useEffect(() => { lastTick.current = -1; }, [play?.index]);

  const pct = Math.max(0, Math.min(100, (remaining / limitMs) * 100));
  const hue = Math.round(pct * 1.2); // 120 (vert) → 0 (rouge)
  const total = play?.total ?? data?.rules.questions ?? 5;
  const dots = useMemo(() => Array.from({ length: total }, (_, i) => (i < marks.length ? (marks[i] ? 'ok' : 'ko') : i === (play?.index ?? 0) && play?.status === 'ACTIVE' ? 'now' : 'todo')), [total, marks, play?.index, play?.status]);

  if (!data) return <p className="muted">{error || 'Chargement…'}</p>;
  if (!data.enabled) return <div className="panel"><h1>🧠 Quiz quotidien</h1><p className="muted">Le quiz est fermé pour le moment.</p></div>;

  const result = play?.status === 'DONE' ? play.result : undefined;
  const inGame = entered && play?.status === 'ACTIVE';
  const countdown = inGame && !started ? Math.max(1, Math.ceil((startLocal - now) / 1000)) : 0;
  const resumable = !entered && play?.status === 'ACTIVE';

  return (
    <div className="qz-page">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>🧠 Quiz quotidien</h1>
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <Link to="/jeux" className="muted">← Jeux</Link>
          <button type="button" className="secondary" onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} aria-label={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
        </div>
      </div>

      <div className="qz-layout">
        <div className={`qz-stage ${reveal ? (reveal.correct ? 'is-right' : 'is-wrong') : ''}`}>
          {(inGame || result) && (
            <div className="qz-dots" aria-label="Progression">
              {(result ? result.review.map((r) => (r.correct ? 'ok' : 'ko')) : dots).map((d, i) => <span key={i} className={`qz-dot ${d}`}>{d === 'ok' ? '✓' : d === 'ko' ? '✗' : i + 1}</span>)}
            </div>
          )}

          {/* accueil */}
          {!inGame && !result && (
            <div className="qz-intro">
              <div className="qz-bigicon">🧠</div>
              <h2>Le quiz du jour</h2>
              <p className="muted" style={{ margin: 0 }}>{data.rules.questions} questions, {data.rules.seconds} secondes chacune. Les mêmes pour tous les membres : réponds vite, c'est plus de points !</p>
              <div className="qz-rules">
                <span>✅ {data.rules.perCorrect} pts par bonne réponse</span>
                <span>⚡ jusqu'à +{data.rules.speedBonus} pts de rapidité</span>
                <span>🏆 +{data.rules.perfect} pts pour un sans-faute</span>
                <span>🔥 +5 % par jour de suite</span>
              </div>
              {data.blocked ? <div style={{ color: 'var(--danger)' }}>{data.blocked}</div>
                : !data.ready ? <div className="muted">Le quiz n'est pas encore prêt : l'équipe ajoute des questions.</div>
                : <button type="button" className="qz-go" onClick={begin} disabled={busy}>{resumable ? '▶️ Reprendre le quiz' : '🎯 Commencer le quiz'}</button>}
              {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
              <div className="muted" style={{ fontSize: 12.5 }}>Même un quiz difficile rapporte au moins {data.rules.consolation} points : tu ne repars jamais les mains vides.</div>
            </div>
          )}

          {/* compte à rebours avant la question */}
          {inGame && countdown > 0 && !reveal && (
            <div className="qz-count"><div className="qz-count-n" key={countdown}>{countdown}</div><div className="muted">{(play?.index ?? 0) === 0 ? 'Prépare-toi…' : 'Question suivante…'}</div></div>
          )}

          {/* question */}
          {inGame && !reveal && started && play!.question && (
            <div className="qz-q" key={play!.question.id}>
              <div className="qz-meta"><span className="qz-cat">{play!.question.category}</span><span className="muted">Question {(play!.index ?? 0) + 1} / {total}</span>{combo >= 2 && <span className="qz-combo">🔥 {combo} d'affilée</span>}</div>
              <div className="qz-timer" aria-label={`${Math.ceil(remaining / 1000)} secondes restantes`}>
                <div className="qz-timer-bar" style={{ width: `${pct}%`, background: `hsl(${hue} 80% 48%)` }} />
                <span className="qz-timer-n">{Math.ceil(remaining / 1000)}</span>
              </div>
              <h2 className="qz-text">{play!.question.text}</h2>
              <div className="qz-choices">
                {play!.question.choices.map((c, k) => (
                  <button key={c.i} type="button" className="qz-choice" disabled={busy} onClick={() => submit(c.i)}><span className="qz-letter">{LETTERS[k]}</span>{c.text}</button>
                ))}
              </div>
            </div>
          )}

          {/* correction */}
          {inGame && reveal && (
            <div className="qz-q">
              <div className="qz-meta"><span className="qz-cat">{reveal.question.category}</span>{reveal.correct ? <span className="qz-pts">+{reveal.points} pts</span> : <span className="muted">{reveal.chosen === null ? '⏱️ Temps écoulé' : 'Raté'}</span>}</div>
              <h2 className="qz-text">{reveal.question.text}</h2>
              <div className="qz-choices">
                {reveal.question.choices.map((c, k) => {
                  const cls = reveal.answer === c.i ? 'good' : reveal.chosen === c.i ? 'bad' : 'dim';
                  return <div key={c.i} className={`qz-choice ${cls}`}><span className="qz-letter">{cls === 'good' ? '✓' : cls === 'bad' ? '✗' : LETTERS[k]}</span>{c.text}</div>;
                })}
              </div>
              <div className={`qz-verdict ${reveal.correct ? 'ok' : 'ko'}`}>{reveal.correct ? (combo >= 3 ? `🔥 ${combo} bonnes réponses d'affilée !` : '🎉 Bonne réponse !') : 'Dommage, ce sera pour la prochaine !'}</div>
              {reveal.explain && <div className="muted" style={{ textAlign: 'center' }}>💡 {reveal.explain}</div>}
            </div>
          )}

          {/* résultat */}
          {result && !reveal && (
            <div className="qz-result">
              <div className="qz-score">{result.correct}<small> / {result.questions}</small></div>
              <div className="qz-stars" aria-hidden="true">{Array.from({ length: result.questions }, (_, i) => <span key={i} className={i < result.correct ? 'on' : ''}>★</span>)}</div>
              <div className="qz-title">{result.perfect ? '🏆 SANS-FAUTE !' : result.correct >= Math.ceil(result.questions / 2) ? '👏 Bravo !' : result.correct > 0 ? '👍 Bien joué !' : '💪 Tu feras mieux demain !'}</div>
              <div className="qz-reward">+{formatNumber(result.reward)} <small>points</small></div>
              <ul className="qz-breakdown">
                {result.points > 0 && <li>Bonnes réponses et rapidité : {formatNumber(result.points)} points</li>}
                {result.perfect && <li>🏆 Bonus sans-faute inclus</li>}
                {result.streak > 1 && !result.consolation && <li>🔥 Série de {result.streak} jours : bonus appliqué</li>}
                {result.consolation && <li>🎁 Prix de consolation : on ne repart jamais les mains vides</li>}
                {balance !== null && <li className="muted">Ton solde : {formatNumber(balance)} points</li>}
                {data.myRank !== null && <li className="muted">Classement du jour : {data.myRank}{data.myRank === 1 ? 'er' : 'e'} · temps total {secs(result.totalMs)}</li>}
              </ul>
              <div className="qz-wait">Prochain quiz dans <strong>{left ?? '…'}</strong></div>
              <details className="qz-review">
                <summary>📋 Revoir les questions</summary>
                {result.review.map((r, i) => (
                  <div key={i} className={`qz-rev ${r.correct ? 'ok' : 'ko'}`}>
                    <div><strong>{i + 1}.</strong> {r.text}</div>
                    <div>{r.correct ? '✅' : '❌'} {r.correct ? r.correctText : <>Ta réponse : {r.myText ?? <em>aucune (temps écoulé)</em>} · <strong>Bonne réponse : {r.correctText}</strong></>}</div>
                    {r.explain && <div className="muted">💡 {r.explain}</div>}
                  </div>
                ))}
              </details>
            </div>
          )}

          {shower > 0 && (reveal?.correct || result) && <CoinShower key={shower} coins={result?.perfect ? 80 : result ? 30 : 10} items={result?.perfect ? ['🏆', '⭐'] : undefined} />}
        </div>

        <div className="qz-side">
          <div className="panel ornate">
            <h2 style={{ marginTop: 0 }}>🔥 Ta série</h2>
            <p style={{ margin: 0 }}>{data.streak.current > 0 ? <><strong>{data.streak.current} jour{data.streak.current > 1 ? 's' : ''}</strong> de suite.</> : 'Joue chaque jour pour bâtir une série.'}</p>
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 13.5 }}>Chaque jour de suite ajoute 5 % à tes points{data.streak.multiplier > 1 ? <> (<strong>+{Math.round((data.streak.multiplier - 1) * 100)} %</strong> {data.playedToday ? 'demain' : 'aujourd\'hui'})</> : ''}.</p>
            {data.me.plays > 0 && <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>{data.me.plays} quiz joué{data.me.plays > 1 ? 's' : ''} · <span style={{ color: 'var(--green-bright)' }}>+{formatNumber(data.me.won)} points</span> gagnés · meilleur score {data.me.best}/{data.rules.questions}{data.me.perfects > 0 && <> · {data.me.perfects} sans-faute 🏆</>}</p>}
          </div>

          <div className="panel">
            <h2 style={{ marginTop: 0 }}>🏅 Classement du jour</h2>
            {data.today.length === 0 ? <p className="muted" style={{ margin: 0 }}>Personne n'a encore terminé le quiz : sois le premier !</p> : (
              <ol className="qz-board">{data.today.map((t, i) => <li key={i} className={t.mine ? 'mine' : ''}><span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} {t.username}</span><strong>{t.correct}/{data.rules.questions}</strong><span className="muted">{t.seconds.toFixed(1).replace('.', ',')} s</span></li>)}</ol>
            )}
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Chaque matin, les trois meilleurs de la veille reçoivent {data.rules.podium.join(', ')} points.</p>
          </div>

          {data.weekly.length > 0 && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>📅 Les meilleurs de la semaine</h2>
              <ol className="qz-board">{data.weekly.map((w, i) => <li key={i} className={w.mine ? 'mine' : ''}><span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} {w.username}</span><strong>+{formatNumber(w.points)}</strong><span className="muted">{w.plays} quiz</span></li>)}</ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
