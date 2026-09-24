import { useState } from 'react';
import { api } from '../api/client';

/** Contenu pour adultes : masqué par défaut, à activer explicitement dans son compte (avec confirmation d'âge). */
export default function AdultPreference({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function change(next: boolean) {
    if (next && !window.confirm("Confirmes-tu avoir 18 ans ou plus, et souhaiter afficher le contenu pour adultes de Seeduction ?")) return;
    setBusy(true);
    setError('');
    try {
      await api.patch('/users/me/adult', { enabled: next, confirmAge: next });
      // Les catégories et les listes changent : on recharge la page pour tout rafraîchir.
      window.location.reload();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Modification impossible');
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3>🔞 Contenu pour adultes</h3>
      <p className="muted">
        Certaines catégories sont réservées aux adultes. Elles sont <strong>masquées par défaut</strong> : tant que tu ne l'actives pas,
        elles n'apparaissent nulle part (menus, listes, recherche, statistiques).
      </p>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {enabled ? <span className="badge freeleech">Activé</span> : <span className="badge" style={{ background: 'rgba(143,168,150,0.2)', color: 'var(--text-dim)' }}>Désactivé</span>}
        <button type="button" className={enabled ? 'secondary' : ''} disabled={busy} onClick={() => change(!enabled)}>
          {enabled ? 'Masquer le contenu pour adultes' : 'Activer le contenu pour adultes (18+)'}
        </button>
      </div>
      {error && <div className="muted" style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
