import Wall from '../components/Wall';

/** Le fil des membres : ce que publient mes amis, ma team et les teams que je suis — plus mes propres publications. Réservé aux membres du site. */
export default function Fil() {
  return (
    <div className="grid" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <h1 style={{ margin: 0 }}>🧱 Fil des membres</h1>
      <p className="muted" style={{ margin: 0 }}>Les publications de tes amis, de ta team et des teams que tu suis. Rien ici n'est visible hors du site.</p>
      <Wall source={{ kind: 'feed' }} empty="Ton fil est vide : ajoute des amis, suis une team ou publie ton premier statut." />
    </div>
  );
}
