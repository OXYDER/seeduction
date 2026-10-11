import { useState } from 'react';
import { api } from '../../api/client';
import { useMessenger, type Msg } from '../../store/messenger';

export type ModerationMode = 'mute' | 'ban' | 'report';

/** Durées proposées (en minutes ; null = sans limite). */
const MUTE_DURATIONS: { label: string; minutes: number | null }[] = [
  { label: '1 heure', minutes: 60 }, { label: '8 heures', minutes: 480 }, { label: '1 jour', minutes: 1440 }, { label: '1 semaine', minutes: 10080 },
  { label: '30 jours', minutes: 43200 }, { label: 'Sans limite', minutes: null },
];
const BAN_DURATIONS: { label: string; minutes: number | null }[] = [
  { label: '10 minutes', minutes: 10 }, { label: '1 heure', minutes: 60 }, { label: '1 jour', minutes: 1440 }, { label: '1 semaine', minutes: 10080 },
  { label: '30 jours', minutes: 43200 }, { label: 'Définitif', minutes: null },
];

/**
 * Fenêtre des actions sur le message d'un membre dans le chat : le mettre en sourdine (n'importe quel membre, pour une durée), le bannir du chat
 * (modération : raison, durée, ce canal ou tous les canaux publics) ou signaler le message au staff.
 */
export default function ChatModerationModal({ mode, msg, convType, convName, convId, onClose }: {
  mode: ModerationMode; msg: Msg; convType: string; convName: string | null; convId: string; onClose: () => void;
}) {
  const setMute = useMessenger((s) => s.setMute);
  const [minutes, setMinutes] = useState<number | null>(mode === 'ban' ? 60 : 1440);
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState<'channel' | 'all'>('channel');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const who = msg.sender.username;
  const durations = mode === 'ban' ? BAN_DURATIONS : MUTE_DURATIONS;
  const channel = convType === 'CHANNEL';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (mode === 'mute') {
        const err = await setMute(msg.sender.id, minutes);
        if (err) { setError(err); return; }
        setDone(`✓ ${who} est en sourdine : tu ne vois plus ses messages. Tu peux le réactiver dans Profil > Compte.`);
      } else if (mode === 'ban') {
        await api.post('/messenger/bans', { userId: msg.sender.id, conversationId: scope === 'channel' ? convId : null, reason, minutes });
        setDone(`✓ ${who} est banni du chat.`);
      } else {
        await api.post(`/messenger/messages/${msg.id}/report`, { reason });
        setDone('✓ Message signalé au staff, merci.');
      }
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Action impossible');
    } finally { setBusy(false); }
  }

  const title = mode === 'mute' ? `🔇 Mettre ${who} en sourdine` : mode === 'ban' ? `🚫 Bannir ${who} du chat` : '🚩 Signaler ce message';
  const needsReason = mode !== 'mute';
  const reasonOk = !needsReason || reason.trim().length >= (mode === 'ban' ? 3 : 5);

  return (
    <div className="msgr-modal-backdrop" onClick={onClose}>
      <form className="msgr-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-modal="true" aria-label={title}>
        <div className="msgr-modal-head">
          <strong>{title}</strong>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {done ? (
          <>
            <p style={{ margin: 0 }}>{done}</p>
            <button type="button" onClick={onClose}>Fermer</button>
          </>
        ) : (
          <>
            <blockquote className="msgr-mod-quote">
              <strong>{who}</strong> : {msg.content ? msg.content.slice(0, 200) : msg.type === 'IMAGE' || msg.type === 'GIF' ? '[image]' : msg.fileName ? `[fichier] ${msg.fileName}` : '[message]'}
            </blockquote>

            {mode === 'mute' && (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Tu ne verras plus les messages de {who} (ni notifications, ni messages non lus), dans toutes tes conversations. Il ne sera pas prévenu. Les messages reviennent à la fin de la durée choisie.
              </p>
            )}
            {mode === 'ban' && (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {who} ne pourra plus écrire dans les canaux publics pendant la durée choisie. Il verra la raison et la date de fin, et sera notifié.
              </p>
            )}
            {mode === 'report' && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Le staff recevra ce message tel qu'il est maintenant, même si son auteur le supprime ensuite.</p>}

            {mode !== 'report' && (
              <label className="grid" style={{ gap: 4 }}>
                <span>Durée</span>
                <select value={minutes === null ? 'forever' : String(minutes)} onChange={(e) => setMinutes(e.target.value === 'forever' ? null : Number(e.target.value))}>
                  {durations.map((d) => <option key={d.label} value={d.minutes === null ? 'forever' : String(d.minutes)}>{d.label}</option>)}
                </select>
              </label>
            )}

            {mode === 'ban' && channel && (
              <label className="grid" style={{ gap: 4 }}>
                <span>Où</span>
                <select value={scope} onChange={(e) => setScope(e.target.value as 'channel' | 'all')}>
                  <option value="channel">Ce canal seulement{convName ? ` (#${convName})` : ''}</option>
                  <option value="all">Tous les canaux publics</option>
                </select>
              </label>
            )}

            {needsReason && (
              <label className="grid" style={{ gap: 4 }}>
                <span>{mode === 'ban' ? 'Raison (visible par le membre)' : 'Pourquoi signales-tu ce message ?'}</span>
                <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={mode === 'ban' ? 500 : 1000} placeholder={mode === 'ban' ? 'Ex. : insultes, spam, publicité…' : 'Explique brièvement le problème…'} autoFocus />
              </label>
            )}

            {error && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
            <div className="row" style={{ gap: 8 }}>
              <button type="submit" className={mode === 'ban' ? 'danger' : undefined} disabled={busy || !reasonOk}>
                {mode === 'mute' ? 'Mettre en sourdine' : mode === 'ban' ? 'Bannir' : 'Envoyer le signalement'}
              </button>
              <button type="button" className="secondary" onClick={onClose}>Annuler</button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
