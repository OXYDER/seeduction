/** Fichiers audio acceptés pour le son de but : type reconnu sur le CONTENU (pas sur ce que déclare le navigateur), taille limitée. */
export const MAX_SOUND_BYTES = 800 * 1024;

export interface AudioKind { ext: 'mp3' | 'ogg' | 'wav'; mime: string }

export function detectAudio(buf: Buffer): AudioKind | null {
  if (buf.length < 16) return null;
  const head = buf.subarray(0, 12).toString('latin1');
  if (head.startsWith('OggS')) return { ext: 'ogg', mime: 'audio/ogg' };
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  // MP3 : balise ID3, ou en-tête de trame (11 bits à 1).
  if (head.startsWith('ID3') || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  return null;
}
