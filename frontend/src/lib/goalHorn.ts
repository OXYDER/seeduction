let ctx: AudioContext | null = null;
let customUrl: string | null = null;
let customAudio: HTMLAudioElement | null = null;

function context(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    return ctx;
  } catch { return null; }
}

/** Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur : on « réveille » l'audio au premier clic ou à la première touche. */
export function primeGoalHorn() {
  const wake = () => {
    const c = context();
    if (c && c.state === 'suspended') c.resume().catch(() => undefined);
    // Le fichier choisi par l'administration est aussi « débloqué » (lecture muette immédiate) pour pouvoir jouer plus tard sans geste.
    if (customAudio) { const a = customAudio; a.muted = true; a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; }); }
  };
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
}

/** Son de but choisi par l'administration (fichier MP3 / OGG / WAV) ; null : la sirène synthétisée ci-dessous est utilisée. */
export function setGoalSoundUrl(url: string | null) {
  if (url === customUrl) return;
  customUrl = url;
  customAudio = null;
  if (!url) return;
  try { const a = new Audio(url); a.preload = 'auto'; a.volume = 0.85; customAudio = a; } catch { customAudio = null; }
}

/** Réverbération courte : bruit qui s'éteint (simule une patinoire / un aréna). */
function reverb(c: AudioContext, seconds = 1.6): ConvolverNode {
  const len = Math.floor(c.sampleRate * seconds);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  return conv;
}

/** Courbe de saturation douce : donne le côté cuivré, un peu rugueux, d'une vraie corne de brume. */
function brass(amount = 6): WaveShaperNode {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  const w = (ctx as AudioContext).createWaveShaper();
  w.curve = curve;
  w.oversample = '4x';
  return w;
}

/**
 * Sirène de secours, synthétisée : un accord grave de corne de brume (sol, si, ré), des harmoniques riches, un léger vibrato, de la saturation et un écho d'aréna.
 * Une vraie corne enregistrée peut la remplacer (Admin > Événements).
 */
function synthHorn(volume: number): boolean {
  const c = context();
  if (!c) return false;
  if (c.state === 'suspended') c.resume().catch(() => undefined);
  if (c.state === 'suspended') return false;
  const t0 = c.currentTime + 0.03;
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(volume, t0 + 0.05);
  out.gain.setValueAtTime(volume, t0 + 2.2);
  out.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.0);

  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 6;
  const dry = c.createGain(); dry.gain.value = 0.8;
  const wet = c.createGain(); wet.gain.value = 0.35;
  const verb = reverb(c);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(500, t0);
  lp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.25);
  lp.frequency.setValueAtTime(2600, t0 + 2.2);
  lp.frequency.exponentialRampToValueAtTime(700, t0 + 3.0);
  const shaper = brass(5);

  const mix = c.createGain();
  mix.connect(shaper).connect(lp).connect(out);
  out.connect(comp);
  comp.connect(dry).connect(c.destination);
  comp.connect(verb).connect(wet).connect(c.destination);

  // Vibrato lent commun à toutes les voix.
  const lfo = c.createOscillator(); lfo.frequency.value = 5.2;
  const lfoGain = c.createGain(); lfoGain.gain.value = 4;
  lfo.connect(lfoGain);

  const voices: [number, OscillatorType, number][] = [
    [98, 'sawtooth', 0.22], [196, 'sawtooth', 0.26], [247, 'sawtooth', 0.2], [294, 'square', 0.1], [392, 'sawtooth', 0.1],
  ];
  for (const [freq, type, level] of voices) {
    for (const detune of [-7, 6]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      o.frequency.exponentialRampToValueAtTime(freq * 1.015, t0 + 0.3); // la corne « monte » un peu au démarrage
      o.frequency.setValueAtTime(freq * 1.015, t0 + 2.2);
      o.frequency.exponentialRampToValueAtTime(freq * 0.93, t0 + 3.0); // et retombe à la fin
      o.detune.value = detune;
      lfoGain.connect(o.detune);
      const g = c.createGain(); g.gain.value = level;
      o.connect(g).connect(mix);
      o.start(t0); o.stop(t0 + 3.1);
    }
  }
  lfo.start(t0); lfo.stop(t0 + 3.1);
  return true;
}

/** Joue le son de but : le fichier choisi par l'administration s'il y en a un, sinon la sirène de secours. */
export function playGoalHorn(volume = 0.5): boolean {
  if (customAudio) {
    try {
      customAudio.currentTime = 0;
      void customAudio.play().catch(() => { synthHorn(volume); });
      return true;
    } catch { /* on retombe sur la sirène */ }
  }
  return synthHorn(volume);
}
