// Préférences du lecteur Seeduction, persistées entre les lancements (comme un vrai client BitTorrent) : dossier de
// téléchargement et limites de vitesse. Stockées dans le dossier de données de l'app (pas dans le dossier de
// téléchargement lui-même, pour ne jamais s'y mélanger avec les fichiers des membres).
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function defaults() {
  return {
    downloadPath: path.join(app.getPath('downloads'), 'Seeduction'),
    downloadLimit: 0, // Ko/s ; 0 = illimité
    uploadLimit: 0,
  };
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    return { ...defaults(), ...raw };
  } catch {
    return defaults();
  }
}

function save(settings) {
  try { fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true }); } catch { /* existe déjà */ }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

module.exports = { load, save };
