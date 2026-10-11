import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import TelegramLogo from './TelegramLogo';

/** Logo Telegram dans l'en-tête, pour tous les membres : un clic ouvre le groupe ; sans lien d'invitation, la page « Telegram » du compte. Rien tant que Telegram n'est pas activé. */
export default function TelegramHeaderLink() {
  const [info, setInfo] = useState<{ enabled?: boolean; inviteUrl?: string | null } | null>(null);
  useEffect(() => { api.get('/telegram/info').then((r) => setInfo(r.data)).catch(() => setInfo(null)); }, []);
  if (!info?.enabled) return null;
  return info.inviteUrl
    ? <a className="icon-pill" href={info.inviteUrl} target="_blank" rel="noopener noreferrer" title="Rejoindre le groupe Telegram"><TelegramLogo size={20} /></a>
    : <Link className="icon-pill" to="/telegram" title="Telegram"><TelegramLogo size={20} /></Link>;
}
