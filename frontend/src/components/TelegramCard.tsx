import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

/** Accueil : petit rappel pour rejoindre le groupe Telegram ; rien n'est affiché tant que l'équipe ne l'a pas ouvert. */
export default function TelegramCard() {
  const [info, setInfo] = useState<{ enabled: boolean; inviteUrl?: string | null; linked?: unknown; bridge?: boolean } | null>(null);
  useEffect(() => { api.get('/telegram/info').then((r) => setInfo(r.data)).catch(() => setInfo(null)); }, []);
  if (!info?.enabled || !info.inviteUrl) return null;
  return (
    <div className="panel row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      <span><strong>✈️ Rejoins le groupe Telegram</strong> <span className="muted">— discussions, annonces et freeleech en direct.</span></span>
      <span className="row" style={{ gap: 8 }}>
        <a className="tg-btn" href={info.inviteUrl} target="_blank" rel="noopener noreferrer">Rejoindre</a>
        {info.bridge && !info.linked && <Link className="secondary dd-link" to="/telegram">Lier mon compte</Link>}
      </span>
    </div>
  );
}
