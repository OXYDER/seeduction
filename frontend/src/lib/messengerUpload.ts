import { api } from '../api/client';
import type { SendInput } from '../store/messenger';

/** Envoie une pièce jointe au serveur : une image (jpeg/png/webp/gif) s'affichera en ligne, tout autre fichier devient un lien. */
export async function uploadAttachment(file: File): Promise<Pick<SendInput, 'type' | 'imageUrl' | 'fileUrl' | 'fileName' | 'fileSize' | 'mime'>> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/messenger/upload', form);
  if (data.kind === 'image') return { type: /\.gif$/i.test(data.url) ? 'GIF' : 'IMAGE', imageUrl: data.url };
  return { type: 'FILE', fileUrl: data.url, fileName: data.name, fileSize: data.size, mime: data.mime };
}

/** Envoie un enregistrement du micro ; le résultat se passe tel quel à `send` (type VOICE). */
export async function uploadVoice(blob: Blob, durationMs: number): Promise<Pick<SendInput, 'type' | 'fileUrl' | 'fileName' | 'fileSize' | 'mime' | 'durationMs'>> {
  const ext = /mp4|aac/i.test(blob.type) ? 'm4a' : /ogg/i.test(blob.type) ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', new File([blob], `vocal.${ext}`, { type: blob.type || 'audio/webm' }));
  const { data } = await api.post('/messenger/upload?voice=1', form);
  return { type: 'VOICE', fileUrl: data.url, fileName: data.name, fileSize: data.size, mime: data.mime, durationMs: Math.round(durationMs) };
}

/** Le premier format d'enregistrement que ce navigateur sait produire (Chrome/Firefox : webm/ogg, Safari : mp4). */
export function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
}

export const canRecordVoice = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
