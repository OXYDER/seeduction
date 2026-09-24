export default function Rules() {
  return (
    <div className="grid page-narrow">
      <h1>Règles du tracker</h1>
      <div className="panel ornate grid">
        <section>
          <h3>Ratio</h3>
          <p className="muted">
            Un ratio minimum est requis pour continuer à télécharger. Consulte ton profil pour
            voir ton ratio actuel et le seuil qui s'applique à ton compte.
          </p>
        </section>
        <section>
          <h3>Uploads</h3>
          <p className="muted">
            Un seul upload par contenu (pas de doublons d'info_hash). Renseigne une catégorie et
            une description correctes. Le staff peut rejeter ou retirer tout torrent qui ne
            respecte pas ces règles.
          </p>
        </section>
        <section>
          <h3>Comportement</h3>
          <p className="muted">
            Aucun triche de ratio, spoofing d'IP ou abus du système d'invitations. Les
            infractions donnent lieu à des avertissements puis, en cas de récidive, à un bannissement.
          </p>
        </section>
        <section>
          <h3>Invitations</h3>
          <p className="muted">
            Tu es responsable du comportement des membres que tu invites. Un abus répété de la
            part d'un filleul peut affecter ton propre compte.
          </p>
        </section>
      </div>
    </div>
  );
}
