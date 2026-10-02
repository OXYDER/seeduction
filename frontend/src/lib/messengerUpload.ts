import { api } from '../api/client';
import type { SendInput } from '../store/messenger';

/** Envoie une pièce jointe au serveur : une image (jpeg/png/webp) s'affichera en ligne, tout autre fichier devient un lien. */
export async function uploadAttachment(file: File): Promise<Pick<SendInput, 'type' | 'imageUrl' | 'fileUrl' | 'fileName' | 'fileSize' | 'mime'>> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/messenger/upload', form);
  if (data.kind === 'image') return { type: 'IMAGE', imageUrl: data.url };
  return { type: 'FILE', fileUrl: data.url, fileName: data.name, fileSize: data.size, mime: data.mime };
}
