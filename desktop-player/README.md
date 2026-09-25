# Lecteur desktop Seeduction

Petit logiciel installable qui s'ouvre automatiquement quand un membre clique sur **🖥️ Ouvrir dans le lecteur
Seeduction** sur le site (lien `seeduction://...`). Il rejoint le swarm BitTorrent comme un vrai peer (téléchargement
direct depuis les seeders, sans passer par le NAS) et lance VLC pour lire le fichier — **aucune limite de format**,
contrairement au lecteur intégré au navigateur (qui ne peut lire que du .mp4/.webm).

Détails techniques et choix de conception : voir [../STREAMING.md](../STREAMING.md).

## Construire l'installateur

Il faut Node.js 20 installé sur la machine, et de préférence construire **sur le système cible** (Windows pour
l'installateur `.exe`, macOS pour le `.dmg`) — la compilation croisée d'un installateur Windows depuis Linux/macOS
est possible avec `electron-builder` (via Wine) mais plus fragile.

```bash
cd desktop-player
npm install
npm run dist
```

Le résultat (`.exe` sur Windows, `.dmg` sur macOS, `.AppImage` sur Linux) est généré dans `dist/`. C'est ce fichier
qu'il faut héberger quelque part (une release GitHub, ou directement sur le site) et lier depuis une page
« Télécharger le lecteur » sur Seeduction.

## Domaine du site

Par défaut, le lecteur appelle `https://seeduction.org`. Si ce n'est pas le bon domaine, soit modifier la constante
`SITE_BASE_URL` dans `src/main.js` avant de construire l'installateur, soit le laisser tel quel si c'est déjà le bon.

## Essayer sans construire d'installateur (développement)

```bash
cd desktop-player
npm install
npm start -- seeduction://stream/un-jeton-de-test
```

(Un vrai jeton s'obtient en appelant `POST /api/stream/session` depuis le site, authentifié — voir
`backend/src/stream/stream.controller.ts`.)

## Sécurité Windows/macOS

Le logiciel n'est pas signé numériquement (ça demande un certificat payant). Au premier lancement, Windows
SmartScreen ou macOS Gatekeeper afficheront un avertissement « éditeur inconnu ». C'est normal pour un logiciel
non signé — le membre doit cliquer sur « Plus d'infos » puis « Exécuter quand même » (Windows) ou passer par
Préférences Système > Sécurité (macOS). Un certificat de signature de code réglerait ça, mais n'est pas inclus ici.

## Limites actuelles

- Une seule lecture à la fois par installation (démarrer une nouvelle lecture arrête la précédente).
- Pas de mise à jour automatique : une nouvelle version doit être retéléchargée manuellement.
- VLC doit être installé sur le PC du membre pour une lecture fiable de tous les formats ; sans VLC, le logiciel
  tente d'ouvrir le flux avec le lecteur par défaut du système, ce qui peut échouer selon le format.
- Windows uniquement testé en configuration ; macOS et Linux devraient fonctionner (le code ne fait pas de
  différence de logique), mais n'ont pas été construits ni essayés.
