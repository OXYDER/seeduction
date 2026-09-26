// Pont sécurisé entre la fenêtre « Téléchargements » (HTML/JS classique, sans accès à Node) et le processus
// principal (qui, lui, a accès à WebTorrent et au disque). Sans ce fichier, la fenêtre ne pourrait rien demander.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('seeductionPlayer', {
  onData: (callback) => ipcRenderer.on('downloads:data', (_event, data) => callback(data)),
  remove: (id, deleteFiles) => ipcRenderer.invoke('downloads:remove', id, deleteFiles),
  clearAll: (deleteFiles) => ipcRenderer.invoke('downloads:clear-all', deleteFiles),
  refresh: () => ipcRenderer.invoke('downloads:refresh'),
  openItemFolder: (id) => ipcRenderer.invoke('downloads:open-item-folder', id),
  watch: (id) => ipcRenderer.invoke('downloads:watch', id),
  openRootFolder: () => ipcRenderer.invoke('downloads:open-root-folder'),
  getSettings: () => ipcRenderer.invoke('downloads:get-settings'),
  chooseFolder: () => ipcRenderer.invoke('downloads:choose-folder'),
  setLimits: (limits) => ipcRenderer.invoke('downloads:set-limits', limits),
});
