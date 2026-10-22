// Mises à jour du lecteur : le site héberge l'installateur (Admin > Lecteurs) et publie la version courante sur /api/downloads/players.
// Le lecteur la consulte au démarrage puis toutes les 6 heures ; s'il y en a une plus récente, il propose de la télécharger et de l'installer.
// L'installateur téléchargé est vérifié (empreinte SHA-256 donnée par le site) avant d'être lancé.
const { app, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { spawn } = require('child_process');
const { compareVersions } = require('./version');

function createUpdater({ baseUrl, getSettings, saveSettings, log, onProgress }) {
  let busy = false;

  async function latest() {
    const res = await fetch(`${baseUrl}/api/downloads/players`, { headers: { 'User-Agent': `Seeduction-Player/${app.getVersion()}` }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Le site a répondu ${res.status}`);
    return (await res.json()).windows || null;
  }

  async function download(release) {
    const res = await fetch(baseUrl + release.url, { headers: { 'User-Agent': `Seeduction-Player/${app.getVersion()}` } });
    if (!res.ok || !res.body) throw new Error(`Téléchargement impossible (${res.status})`);
    const file = path.join(os.tmpdir(), `Seeduction Player Setup ${release.version}.exe`);
    const hash = crypto.createHash('sha256');
    let got = 0;
    const total = Number(res.headers.get('content-length')) || release.size || 0;
    const source = Readable.fromWeb(res.body);
    source.on('data', (chunk) => {
      hash.update(chunk); got += chunk.length;
      if (total) onProgress(Math.min(100, Math.round((got / total) * 100)));
    });
    await pipeline(source, fs.createWriteStream(file));
    onProgress(null);
    if (release.sha256 && hash.digest('hex') !== release.sha256) {
      fs.rmSync(file, { force: true });
      throw new Error("Le fichier téléchargé est corrompu (empreinte différente) : réessaie plus tard.");
    }
    return file;
  }

  /** manual = demandé par l'utilisateur (menu de l'icône) : on répond aussi « déjà à jour » ou l'erreur ; sinon on ne dérange que s'il y a du nouveau. */
  async function check(manual = false) {
    if (busy) return;
    busy = true;
    try {
      let release;
      try { release = await latest(); } catch (err) {
        log('Vérification des mises à jour impossible :', err.message);
        if (manual) dialog.showErrorBox('Mise à jour du lecteur', `Impossible de joindre le site pour vérifier les mises à jour.\n\n${err.message}`);
        return;
      }
      const current = app.getVersion();
      if (!release || compareVersions(release.version, current) <= 0) {
        if (manual) dialog.showMessageBox({ type: 'info', title: 'Mise à jour du lecteur', message: 'Ton lecteur est à jour.', detail: `Version ${current}`, buttons: ['OK'] });
        return;
      }
      if (!manual && getSettings().skippedVersion === release.version) return;
      log('Nouvelle version disponible :', release.version, '(installée :', current + ')');
      const { response } = await dialog.showMessageBox({
        type: 'info', title: 'Mise à jour du lecteur Seeduction', message: `Une nouvelle version du lecteur est disponible : ${release.version}`,
        detail: `Tu as la version ${current}.${release.notes ? `\n\nNouveautés : ${release.notes}` : ''}\n\nLe lecteur se fermera pendant l'installation ; tes partages reprendront à sa réouverture.`,
        buttons: ['Télécharger et installer', 'Plus tard', 'Ignorer cette version'], defaultId: 0, cancelId: 1,
      });
      if (response === 2) { saveSettings({ ...getSettings(), skippedVersion: release.version }); return; }
      if (response !== 0) return;
      try {
        const file = await download(release);
        log('Installateur téléchargé :', file);
        spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
        app.exit(0);
      } catch (err) {
        onProgress(null);
        log('Mise à jour impossible :', err.message);
        dialog.showErrorBox('Mise à jour du lecteur', err.message);
      }
    } finally { busy = false; }
  }

  return { check };
}

module.exports = { createUpdater };
