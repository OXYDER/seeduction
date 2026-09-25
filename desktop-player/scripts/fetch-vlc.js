// Télécharge et prépare une copie portable de VLC dans vendor/vlc/, incluse dans l'installateur final (voir
// package.json "build.extraResources"). Lancé automatiquement avant `npm run dist` (script npm "predist").
// Idempotent : si vendor/vlc/ existe déjà, ne retéléchargent rien.
const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

const VLC_VERSION = '3.0.24';
const REDIRECT_URL = `https://get.videolan.org/vlc/${VLC_VERSION}/win64/vlc-${VLC_VERSION}-win64.zip`;
const VENDOR_DIR = path.join(__dirname, '..', 'vendor');
const VLC_DIR = path.join(VENDOR_DIR, 'vlc');
const ZIP_PATH = path.join(VENDOR_DIR, 'vlc-portable.zip');
const EXE_NAME = 'Seeduction VLC.exe';

function log(...args) {
  console.log('[fetch-vlc]', ...args);
}

/** get.videolan.org sert une page HTML avec une redirection <meta refresh> vers un miroir régional, pas un vrai 302 HTTP. */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, destPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`Téléchargement échoué (${res.statusCode}) : ${url}`)); return; }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  if (fs.existsSync(path.join(VLC_DIR, EXE_NAME))) {
    log('Déjà présent, rien à faire :', VLC_DIR);
    return;
  }

  log('Recherche du miroir de téléchargement...');
  const page = await fetchText(REDIRECT_URL);
  const match = /<meta http-equiv="refresh" content="\d+;URL='([^']+)'"/i.exec(page);
  const mirrorUrl = match ? match[1] : REDIRECT_URL;
  log('Téléchargement depuis', mirrorUrl, '(environ 80 Mo, ça peut prendre un moment)...');

  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  await download(mirrorUrl, ZIP_PATH);
  log('Téléchargé, extraction...');

  const zip = new AdmZip(ZIP_PATH);
  zip.extractAllTo(VENDOR_DIR, true);
  fs.unlinkSync(ZIP_PATH);

  const extractedDir = path.join(VENDOR_DIR, `vlc-${VLC_VERSION}`);
  if (!fs.existsSync(extractedDir)) throw new Error(`Dossier attendu introuvable après extraction : ${extractedDir}`);
  if (fs.existsSync(VLC_DIR)) fs.rmSync(VLC_DIR, { recursive: true, force: true });
  fs.renameSync(extractedDir, VLC_DIR);

  // Le dossier msi/ ne sert qu'à construire un installateur MSI officiel de VLC — inutile ici.
  const msiDir = path.join(VLC_DIR, 'msi');
  if (fs.existsSync(msiDir)) fs.rmSync(msiDir, { recursive: true, force: true });

  fs.renameSync(path.join(VLC_DIR, 'vlc.exe'), path.join(VLC_DIR, EXE_NAME));

  log('Terminé :', VLC_DIR);
}

main().catch((err) => {
  console.error('[fetch-vlc] Échec :', err.message);
  console.error('[fetch-vlc] Le lecteur pourra quand même se construire, mais sans VLC intégré (il faudra que le membre ait VLC déjà installé).');
  // On ne bloque pas la construction : le repli sur un VLC déjà installé sur le PC du membre reste possible (voir findVlc() dans src/main.js).
});
