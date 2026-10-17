// Sons de « Plus haut ou plus bas » : distribution et retournement des cartes, bonne réponse (de plus en plus haute avec la série), mauvaise réponse.
// Même interrupteur de son que les machines à sous.
import { audio, bell, noiseBuffer, soundOn, tick } from './slotSound';

/** La carte glisse sur le tapis : un « frrt » de papier. */
export function playDeal() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out } = a, t = c.currentTime;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.2);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
  f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3600, t + 0.14);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  src.connect(f).connect(g).connect(out); src.start(t);
  tick(a, t + 0.16, 1400, 0.1, 0.03);
}

/** La carte se retourne : un petit « clac » sec. */
export function playFlip() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t = a.c.currentTime;
  tick(a, t, 3200, 0.14, 0.02);
  tick(a, t + 0.05, 1800, 0.1, 0.03);
}

/** Bonne réponse : cloches qui montent d'un cran à chaque carte de la série. */
export function playRight(step: number) {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t = a.c.currentTime + 0.02;
  const base = 523 * Math.pow(2, Math.min(step, 12) / 12); // un demi-ton de plus à chaque bonne réponse
  bell(a, t, base, 0.14, 0.9);
  bell(a, t + 0.09, base * 1.25, 0.11, 0.9);
  bell(a, t + 0.18, base * 1.5, 0.1, 1.0);
  if (step >= 3) for (let i = 0; i < 6; i++) bell(a, t + 0.25 + i * 0.06, 1800 + Math.random() * 1600, 0.05, 0.4); // pluie d'étincelles quand la série est lancée
}

/** Mauvaise réponse : descente grave et claquement sourd. */
export function playWrong() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out } = a, t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.55);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.55);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + 0.65);
  tick(a, t, 700, 0.25, 0.06);
}
