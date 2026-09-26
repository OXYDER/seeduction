// URL de l'asset de la release GitHub (le lecteur ne peut pas être hébergé dans le dépôt : un installateur avec
// VLC intégré dépasse largement la limite de 100 Mo par fichier de Git). À mettre à jour après chaque nouvelle
// release publiée depuis desktop-player/ (voir desktop-player/README.md).
const DOWNLOAD_URL = 'https://github.com/OXYDER/seeduction/releases/latest/download/Seeduction.Player.Setup.exe';
const RELEASES_URL = 'https://github.com/OXYDER/seeduction/releases';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
      <span style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
        fontWeight: 800, fontSize: 14, background: 'linear-gradient(135deg, var(--acc1, var(--gold)), var(--acc2, var(--gold-bright)))', color: '#fff',
      }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>
        <div className="muted" style={{ lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

export default function PlayerDownload() {
  return (
    <div className="grid page-narrow" style={{ gap: 18 }}>
      <div>
        <h1 style={{ marginBottom: 4 }}>🖥️ Le lecteur Seeduction</h1>
        <p className="muted" style={{ margin: 0 }}>
          Regarde un film ou une série directement sur ton PC, sans télécharger de client BitTorrent et sans limite
          de format — même les .mkv en x265/HEVC. Le téléchargement se fait directement entre ton PC et les
          seeders, sans passer par le serveur.
        </p>
      </div>

      <div className="panel ornate" style={{ textAlign: 'center' }}>
        <img src="/logo-icon.png" alt="" width={72} height={72} style={{ marginBottom: 10 }} />
        <h3 style={{ margin: '0 0 4px' }}>Lecteur Seeduction pour Windows</h3>
        <p className="muted" style={{ margin: '0 0 16px' }}>
          Inclut Seeduction VLC (une copie de VLC) — rien d'autre à installer.
        </p>
        <a href={DOWNLOAD_URL} className="download-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
          ⬇ Télécharger le lecteur (.exe)
        </a>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Toutes les versions : <a href={RELEASES_URL} target="_blank" rel="noreferrer">releases GitHub</a>
        </p>
      </div>

      <div className="panel grid" style={{ gap: 18 }}>
        <h2 style={{ margin: 0 }}>Installation, étape par étape</h2>

        <Step n={1} title="Télécharge et lance l'installateur">
          Clique sur le bouton ci-dessus, puis ouvre le fichier téléchargé (<code>Seeduction Player Setup....exe</code>).
        </Step>

        <Step n={2} title="Windows va avertir « Éditeur inconnu » — c'est normal">
          Le lecteur n'est pas signé numériquement (une signature coûte cher pour un petit projet communautaire).
          Windows SmartScreen affiche un écran bleu « Windows a protégé votre ordinateur ». Clique sur{' '}
          <strong>Informations complémentaires</strong>, puis sur <strong>Exécuter quand même</strong>.
        </Step>

        <Step n={3} title="Suis l'installateur">
          Les options par défaut conviennent. Une fois terminé, le lecteur se lance et reste discrètement dans la
          zone de notification (en bas à droite de l'écran, près de l'horloge) — c'est normal, il n'a pas besoin
          d'une fenêtre ouverte en permanence.
        </Step>

        <Step n={4} title="Retourne sur Seeduction et clique sur « Ouvrir dans le lecteur Seeduction »">
          Sur la fiche de n'importe quel film, série ou torrent XXX, à côté du bouton de téléchargement classique.
        </Step>

        <Step n={5} title="Ton navigateur va demander la permission d'ouvrir le lecteur">
          Une fenêtre comme celle-ci apparaît :
          <div className="panel" style={{ margin: '10px 0', background: 'rgba(255,255,255,0.04)', maxWidth: 420 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              <strong>Autoriser ce site à ouvrir le lien seeduction avec Lecteur desktop Seeduction ?</strong>
            </p>
            <label className="row muted" style={{ gap: 6, fontSize: 13 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked readOnly />
              Toujours autoriser <strong>seeduction.org</strong> à ouvrir les liens seeduction
            </label>
          </div>
          <strong>Coche la case « Toujours autoriser »</strong>, puis clique sur <strong>Ouvrir le lien</strong>.
          Comme ça, cette fenêtre ne réapparaîtra plus les prochaines fois — un clic sur le bouton suffira.
          Si tu ne coches pas la case, il faudra confirmer à chaque lecture.
        </Step>

        <Step n={6} title="La lecture démarre">
          Le lecteur télécharge le fichier depuis les seeders et lance Seeduction VLC automatiquement. Le
          téléchargement continue en arrière-plan pendant que la vidéo joue — pas besoin d'attendre qu'il soit
          complet.
        </Step>
      </div>

      <div className="panel grid" style={{ gap: 14 }}>
        <h2 style={{ margin: 0 }}>Ça ne marche pas ?</h2>
        <div>
          <strong>Rien ne se passe après avoir cliqué sur le bouton du site</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Vérifie que le lecteur est bien installé (étapes 1 à 3). S'il l'est déjà, essaie de taper{' '}
            <code>seeduction://stream/test</code> directement dans la barre d'adresse de ton navigateur : une
            fenêtre de permission comme celle de l'étape 5 devrait apparaître. Si rien n'apparaît même comme ça,
            réinstalle le lecteur.
          </p>
        </div>
        <div>
          <strong>La vidéo reste bloquée à « mise en mémoire tampon »</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            La vitesse dépend des seeders disponibles sur ce torrent précis — un torrent avec peu de seeders sera
            plus lent, comme avec n'importe quel client BitTorrent. Vérifie aussi qu'un logiciel de ta connexion
            (client torrent, pare-feu, antivirus) ne limite pas la vitesse ou ne bloque pas le lecteur.
          </p>
        </div>
        <div>
          <strong>Le téléchargement ne démarre jamais / bloqué par l'antivirus</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Certains antivirus bloquent silencieusement les connexions d'un logiciel récemment installé et non
            signé. Ajoute une exception pour <code>Seeduction Player.exe</code> dans les paramètres de ton
            antivirus si le problème persiste.
          </p>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
        Le lecteur est un logiciel séparé du site, avec son propre code source :{' '}
        <a href="https://github.com/OXYDER/seeduction/tree/main/desktop-player" target="_blank" rel="noreferrer">desktop-player</a>.
      </p>
    </div>
  );
}
