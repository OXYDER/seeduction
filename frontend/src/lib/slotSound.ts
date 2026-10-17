// Sons des machines à sous, synthétisés dans le navigateur (aucun fichier) : mécanique de levier et de rouleaux, pièces qui tombent, cloches, fanfare.
// Le membre peut tout couper.

const KEY = 'seeduction-slot-sound';
let ctx: AudioContext | null = null;
let bus: { input: GainNode; verb: GainNode } | null = null;

export function soundOn(): boolean { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export function setSoundOn(on: boolean) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignoré */ } }

/** Contexte audio + chaîne commune : compresseur (pas de saturation) et écho de salle de jeu. */
export function audio(): { c: AudioContext; out: GainNode; verb: GainNode } | null {
  try {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor() as AudioContext;
    if (ctx.state === 'suspended') void ctx.resume();
    if (!bus) {
      const c = ctx;
      const input = c.createGain();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
      const master = c.createGain(); master.gain.value = 0.9;
      input.connect(comp).connect(master).connect(c.destination);
      // écho : bruit qui s'éteint
      const len = Math.floor(c.sampleRate * 1.3);
      const ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      const conv = c.createConvolver(); conv.buffer = ir;
      const verb = c.createGain(); verb.gain.value = 0.28;
      conv.connect(verb).connect(comp);
      const send = c.createGain(); send.gain.value = 1;
      send.connect(conv);
      bus = { input, verb: send };
    }
    return { c: ctx, out: bus.input, verb: bus.verb };
  } catch { return null; }
}

export function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Un « tic » mécanique : petit éclat de bruit filtré. */
export function tick(a: NonNullable<ReturnType<typeof audio>>, t: number, freq = 2400, vol = 0.12, dur = 0.025) {
  const { c, out } = a;
  const src = c.createBufferSource(); src.buffer = noiseBuffer(c, dur + 0.01);
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 3;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t); src.stop(t + dur + 0.01);
}

/** Note de cloche / pièce : partiels non harmoniques qui s'éteignent vite. */
export function bell(a: NonNullable<ReturnType<typeof audio>>, t: number, freq: number, vol = 0.12, dur = 0.7) {
  const { c, out, verb } = a;
  for (const [ratio, level, decay] of [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.28, 0.35], [8.9, 0.12, 0.2]] as const) {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq * ratio;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * decay);
    o.connect(g); g.connect(out); g.connect(verb);
    o.start(t); o.stop(t + dur * decay + 0.05);
  }
}

/** Le levier : un « clac » métallique grave, puis le ressort. */
export function playLever() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out } = a, t = c.currentTime;
  const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
  const g = c.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
  tick(a, t, 1800, 0.18, 0.03);
  tick(a, t + 0.22, 3200, 0.1, 0.02); tick(a, t + 0.26, 2600, 0.08, 0.02);
}

/** Les rouleaux démarrent : moteur qui monte, et des tics de plus en plus espacés jusqu'à la fin du dernier rouleau (`totalMs`). */
export function playSpin(totalMs = 1900) {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out } = a, t = c.currentTime, total = totalMs / 1000;
  const motor = c.createOscillator(); motor.type = 'sawtooth';
  motor.frequency.setValueAtTime(48, t); motor.frequency.exponentialRampToValueAtTime(130, t + 0.35); motor.frequency.setValueAtTime(130, t + total * 0.7); motor.frequency.exponentialRampToValueAtTime(60, t + total);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.15); g.gain.setValueAtTime(0.1, t + total * 0.75); g.gain.exponentialRampToValueAtTime(0.0001, t + total);
  motor.connect(lp).connect(g).connect(out); motor.start(t); motor.stop(t + total + 0.05);
  // souffle d'air des rouleaux
  const air = c.createBufferSource(); air.buffer = noiseBuffer(c, total + 0.1);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 0.5); bp.frequency.exponentialRampToValueAtTime(500, t + total); bp.Q.value = 0.8;
  const ag = c.createGain(); ag.gain.setValueAtTime(0.0001, t); ag.gain.exponentialRampToValueAtTime(0.07, t + 0.2); ag.gain.exponentialRampToValueAtTime(0.0001, t + total);
  air.connect(bp).connect(ag).connect(out); air.start(t);
  // tics des symboles qui défilent
  let at = 0.05, gap = 0.035;
  while (at < total) { tick(a, t + at, 2200 + Math.random() * 900, 0.07); at += gap; gap *= 1.045; }
}

/** Un rouleau qui s'arrête : « clonk » sourd + claquement (plus aigu à chaque rouleau). */
export function playStop(reel: number) {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out } = a, t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(150 + reel * 22, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  const g = c.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
  tick(a, t, 1500 + reel * 300, 0.2, 0.035);
}

/** Pluie de pièces : des « ting » métalliques en cascade. */
function coins(a: NonNullable<ReturnType<typeof audio>>, t: number, n: number, spread: number, vol = 0.06) {
  for (let i = 0; i < n; i++) {
    const at = t + (i / n) * spread + Math.random() * 0.05;
    bell(a, at, 1500 + Math.random() * 1800, vol, 0.45);
    if (Math.random() < 0.4) tick(a, at, 5000, 0.04, 0.012);
  }
}

/** Petit gain : quelques pièces ; gros gain : cloches et cascade de pièces ; méga gain : fanfare, sirène de jackpot et déluge de pièces. */
export function playWin(tier: 'small' | 'big' | 'mega', ratio = 1) {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const { c, out, verb } = a, t = c.currentTime + 0.02;
  if (tier === 'small') {
    coins(a, t, Math.min(10, 3 + Math.round(ratio)), 0.5);
    [784, 988, 1175].forEach((f, i) => bell(a, t + i * 0.09, f, 0.08, 0.6));
    return;
  }
  const notes = tier === 'big' ? [523, 659, 784, 1047, 1319] : [392, 523, 659, 784, 1047, 1319, 1568, 2093];
  notes.forEach((f, i) => bell(a, t + i * 0.11, f, tier === 'mega' ? 0.13 : 0.11, 0.9));
  coins(a, t + 0.1, tier === 'big' ? 18 : 36, tier === 'big' ? 1.5 : 2.6, 0.07);
  if (tier === 'mega') {
    // sirène de jackpot qui monte et descend + accord cuivré
    const sir = c.createOscillator(); sir.type = 'square';
    for (let k = 0; k < 4; k++) { sir.frequency.setValueAtTime(520, t + k * 0.5); sir.frequency.linearRampToValueAtTime(880, t + k * 0.5 + 0.25); sir.frequency.linearRampToValueAtTime(520, t + k * 0.5 + 0.5); }
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const sg = c.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.05, t + 0.1); sg.gain.setValueAtTime(0.05, t + 1.7); sg.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    sir.connect(lp).connect(sg); sg.connect(out); sg.connect(verb); sir.start(t); sir.stop(t + 2.2);
    for (const f of [196, 247, 294, 392]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const l = c.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = 1800;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + 0.05); g.gain.exponentialRampToValueAtTime(0.07, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(l).connect(g); g.connect(out); g.connect(verb); o.start(t + 0.05); o.stop(t + 1.7);
    }
  }
}

/** Le bonus se déclenche : montée scintillante de cloches. */
export function playBonus() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  const t = a.c.currentTime + 0.02;
  [523, 659, 784, 988, 1175, 1319, 1568, 1976].forEach((f, i) => bell(a, t + i * 0.07, f, 0.1, 0.8));
  tick(a, t, 6000, 0.08, 0.2);
}

/** Un tic de pièce quand le compteur de gain monte. */
export function playTick() {
  if (!soundOn()) return;
  const a = audio(); if (!a) return;
  bell(a, a.c.currentTime, 2600 + Math.random() * 600, 0.035, 0.18);
}
