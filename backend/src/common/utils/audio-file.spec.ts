import { detectAudio } from './audio-file';

const pad = (s: string | number[], n = 32) => Buffer.concat([Buffer.from(s as any, typeof s === 'string' ? 'latin1' : undefined), Buffer.alloc(n)]);

describe('Fichier audio du son de but', () => {
  it('reconnaît un MP3 (balise ID3 ou trame)', () => {
    expect(detectAudio(pad('ID3\u0004\u0000'))?.ext).toBe('mp3');
    expect(detectAudio(pad([0xff, 0xfb, 0x90, 0x00]))?.ext).toBe('mp3');
  });

  it('reconnaît un OGG et un WAV', () => {
    expect(detectAudio(pad('OggS'))?.ext).toBe('ogg');
    expect(detectAudio(pad('RIFF\u0000\u0000\u0000\u0000WAVEfmt '))?.ext).toBe('wav');
  });

  it('refuse un autre type de fichier, même avec un nom en .mp3', () => {
    expect(detectAudio(pad('<html><body>hello</body></html>'))).toBeNull();
    expect(detectAudio(pad('MZ\u0090\u0000'))).toBeNull();
    expect(detectAudio(pad('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBeNull();
    expect(detectAudio(Buffer.from('ID3'))).toBeNull();
  });
});
