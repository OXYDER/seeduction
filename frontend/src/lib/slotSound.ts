// Sons des machines à sous, synthétisés dans le navigateur (aucun fichier). Le membre peut tout couper.

const KEY = 'seeduction-slot-sound';
let ctx: AudioContext | null = null;

export function soundOn(): boolean { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export function setSoundOn(on: boolean) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignoré */ } }

function context(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'triangle', vol = 0.18, to?: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (to) o.frequency.exponentialRampToValueAtTime(to, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(c.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** Le bruit des rouleaux qui démarrent. */
export function playSpin() {
  if (!soundOn()) return;
  const c = context(); if (!c) return;
  const t = c.currentTime;
  const len = Math.floor(c.sampleRate * 0.7);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.6); f.Q.value = 1.2;
  const g = c.createGain(); g.gain.value = 0.22;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

/** Un rouleau qui s'arrête (le son monte un peu à chaque rouleau). */
export function playStop(reel: number) {
  if (!soundOn()) return;
  const c = context(); if (!c) return;
  tone(c, 180 + reel * 40, c.currentTime, 0.12, 'square', 0.14, 70);
}

/** Petit gain, gros gain ou méga gain : des notes qui montent. */
export function playWin(tier: 'small' | 'big' | 'mega') {
  if (!soundOn()) return;
  const c = context(); if (!c) return;
  const t = c.currentTime;
  const notes = tier === 'small' ? [523, 659, 784] : tier === 'big' ? [523, 659, 784, 1047, 1319] : [392, 523, 659, 784, 1047, 1319, 1568, 2093];
  notes.forEach((f, i) => tone(c, f, t + i * (tier === 'small' ? 0.09 : 0.1), tier === 'mega' ? 0.45 : 0.28, 'triangle', 0.17));
  if (tier === 'mega') { tone(c, 196, t, 1.2, 'sawtooth', 0.1); tone(c, 247, t, 1.2, 'sawtooth', 0.08); }
}

/** Le bonus se déclenche : tours gratuits. */
export function playBonus() {
  if (!soundOn()) return;
  const c = context(); if (!c) return;
  const t = c.currentTime;
  [392, 523, 659, 784, 988, 1175].forEach((f, i) => tone(c, f, t + i * 0.08, 0.3, 'sine', 0.2));
}

/** Un tick quand le compteur de gain monte. */
export function playTick() {
  if (!soundOn()) return;
  const c = context(); if (!c) return;
  tone(c, 1500, c.currentTime, 0.04, 'square', 0.05);
}
