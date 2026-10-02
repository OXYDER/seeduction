import { api } from '../api/client';

/** Télécharge le .torrent personnalisé (avec la passkey du membre) via un lien temporaire. */
export async function downloadTorrent(id: string, name: string) {
  const res = await api.get(`/torrents/${id}/download`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.torrent`;
  a.click();
  window.URL.revokeObjectURL(url);
}
