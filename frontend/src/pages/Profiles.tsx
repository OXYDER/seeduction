import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import Avatar from '../components/Avatar';

interface Card { id: string; name: string; username: string; accountName: string; avatarUrl: string | null; isMaster: boolean; blocked: boolean; hasPin: boolean }


/** Saisie du PIN à 4 chiffres : clavier à l'écran ou clavier de l'ordinateur ; part tout seul au 4e chiffre. */
function PinPad({ card, onDone, onCancel }: { card: Card; onDone: (pin: string) => Promise<string | null>; onCancel: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const press = useCallback((d: string) => {
    if (busy) return;
    setError('');
    setPin((p) => (p.length < 4 ? p + d : p));
  }, [busy]);

  useEffect(() => {
    if (pin.length !== 4 || busy) return;
    setBusy(true);
    onDone(pin).then((err) => { if (err) { setError(err); setPin(''); } }).finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [press, onCancel]);

  return (
    <div className="pin-overlay" role="dialog" aria-label={`PIN de ${card.name}`}>
      <div className="pin-box">
        <Avatar user={{ username: card.name, avatarUrl: card.avatarUrl }} size={84} />
        <h2>{card.name}</h2>
        <p className="muted">Entre ton PIN à 4 chiffres</p>
        <div className="pin-dots" aria-live="polite">{[0, 1, 2, 3].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}</div>
        <div className="pin-error">{error}</div>
        <div className="pin-keys">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" disabled={busy} onClick={() => press(d)}>{d}</button>)}
          <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
          <button type="button" disabled={busy} onClick={() => press('0')}>0</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Effacer">⌫</button>
        </div>
      </div>
    </div>
  );
}

/** « Qui est-ce ? » : écran de choix du profil après la connexion d'un compte famille. */
export default function Profiles() {
  const { accessToken, user, login, logout } = useAuthStore();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Card | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    api.get('/family/picker').then((r) => setCards(r.data.profiles)).catch((err) => setError(err.response?.data?.message ?? 'Impossible de charger les profils'));
  }, [accessToken]);

  if (!accessToken) return <Navigate to="/login" replace />;

  async function choose(pin: string): Promise<string | null> {
    try {
      const { data } = await api.post('/family/select', { profileId: picked!.id, pin });
      login(data.accessToken, data.user, 'profile');
      // Rechargement complet : messagerie, favoris, préférences... repartent de zéro pour le profil choisi.
      window.location.assign('/');
      return null;
    } catch (err: any) {
      return err.response?.data?.message ?? 'PIN refusé';
    }
  }

  const account = cards?.[0]?.accountName ?? user?.username ?? '';
  return (
    <div className="profiles-page">
      <img src="/logo-icon.png" alt="" width={56} height={56} />
      <h1>Qui est-ce ?</h1>
      <p className="muted">Compte <strong>{account}</strong></p>
      {error && <div className="panel" style={{ color: 'var(--danger)' }}>{error}</div>}
      {cards === null && !error && <p className="muted">Chargement…</p>}
      <div className="profiles-grid">
        {(cards ?? []).map((c) => (
          <button key={c.id} type="button" className={`profile-card${c.blocked ? ' blocked' : ''}`} disabled={c.blocked} onClick={() => setPicked(c)} title={c.blocked ? 'Profil bloqué par le profil principal' : `Ouvrir le profil ${c.name}`}>
            <Avatar user={{ username: c.name, avatarUrl: c.avatarUrl }} size={104} />
            <strong>{c.name}</strong>
            <span className="muted">{c.blocked ? '🔒 Bloqué' : c.isMaster ? 'Principal' : ''}</span>
          </button>
        ))}
      </div>
      <button type="button" className="secondary" onClick={() => { logout(); window.location.assign('/login'); }}>Se déconnecter</button>
      {picked && <PinPad card={picked} onDone={choose} onCancel={() => setPicked(null)} />}
    </div>
  );
}
