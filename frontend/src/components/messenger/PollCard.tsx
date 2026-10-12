import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth';
import { useMessenger } from '../../store/messenger';

interface Poll {
  id: string; question: string; multiple: boolean; closesAt: string | null; closedAt: string | null; closed: boolean; authorId: string;
  options: { id: string; text: string; votes: number }[]; voters: number; total: number; myVotes: string[];
}

const left = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '';
  const h = Math.floor(ms / 3_600_000), d = Math.floor(h / 24);
  return d >= 1 ? `${d} j ${h % 24} h` : h >= 1 ? `${h} h ${Math.floor((ms % 3_600_000) / 60_000)} min` : `${Math.max(1, Math.floor(ms / 60_000))} min`;
};

/** Sondage dans une conversation : résultats en barres (visibles de tous), vote en un clic (modifiable tant qu'il est ouvert), fin par l'auteur ou la modération. */
export default function PollCard({ pollId, canClose }: { pollId: string; canClose: boolean }) {
  const me = useAuthStore((s) => s.user);
  const tick = useMessenger((s) => s.pollTick[pollId] ?? 0);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<string[] | null>(null); // choix en cours (sondage à choix multiples) avant de valider

  const load = useCallback(() => { api.get(`/messenger/polls/${pollId}`).then((r) => { setPoll(r.data); setPicked(null); }).catch(() => setError('Sondage indisponible')); }, [pollId]);
  useEffect(() => { load(); }, [load, tick]);

  if (!poll) return <div className="msgr-poll muted">{error || '📊 Chargement du sondage…'}</div>;
  const max = Math.max(1, ...poll.options.map((o) => o.votes));
  const mine = picked ?? poll.myVotes;
  const mineAuthor = poll.authorId === me?.id;

  async function vote(ids: string[]) {
    setBusy(true); setError('');
    try { const r = await api.post(`/messenger/polls/${poll!.id}/vote`, { optionIds: ids }); setPoll(r.data); setPicked(null); }
    catch (err: any) { setError(err.response?.data?.message ?? 'Vote impossible'); }
    finally { setBusy(false); }
  }
  async function close() {
    if (!window.confirm('Terminer ce sondage maintenant ?')) return;
    try { const r = await api.post(`/messenger/polls/${poll!.id}/close`); setPoll(r.data); } catch (err: any) { setError(err.response?.data?.message ?? 'Action impossible'); }
  }
  function click(id: string) {
    if (poll!.closed || busy) return;
    if (!poll!.multiple) { void vote(mine.includes(id) ? [] : [id]); return; }
    setPicked(mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id]);
  }

  return (
    <div className="msgr-poll">
      <div className="msgr-poll-q">📊 {poll.question}</div>
      <div className="msgr-poll-sub muted">{poll.multiple ? 'Plusieurs choix possibles' : 'Un seul choix'}{poll.closed ? ' · terminé' : poll.closesAt ? ` · se termine dans ${left(poll.closesAt)}` : ''}</div>
      <div className="msgr-poll-options">
        {poll.options.map((o) => {
          const on = mine.includes(o.id);
          const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
          return (
            <button key={o.id} type="button" className={`msgr-poll-opt${on ? ' on' : ''}${poll.closed ? ' closed' : ''}`} disabled={poll.closed || busy} onClick={() => click(o.id)} aria-pressed={on}>
              <span className="msgr-poll-bar" style={{ width: `${(o.votes / max) * 100}%` }} />
              <span className="msgr-poll-check" aria-hidden>{on ? (poll.multiple ? '☑' : '◉') : (poll.multiple ? '☐' : '○')}</span>
              <span className="msgr-poll-text">{o.text}</span>
              <span className="msgr-poll-count">{o.votes}{poll.total ? ` · ${pct} %` : ''}</span>
            </button>
          );
        })}
      </div>
      {poll.multiple && picked && !poll.closed && (
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <button type="button" style={{ padding: '3px 12px', fontSize: 12 }} disabled={busy} onClick={() => vote(picked)}>Voter</button>
          <button type="button" className="secondary" style={{ padding: '3px 12px', fontSize: 12 }} onClick={() => setPicked(null)}>Annuler</button>
        </div>
      )}
      <div className="msgr-poll-foot muted">
        {poll.voters} votant{poll.voters > 1 ? 's' : ''}
        {!poll.closed && mine.length > 0 && !picked && <> · <button type="button" className="msgr-poll-link" onClick={() => vote([])}>Retirer mon vote</button></>}
        {!poll.closed && (mineAuthor || canClose) && <> · <button type="button" className="msgr-poll-link" onClick={close}>Terminer</button></>}
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
    </div>
  );
}
