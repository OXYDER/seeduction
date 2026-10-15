let ctx: AudioContext | null = null;

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
  const wake = () => { const c = context(); if (c && c.state === 'suspended') c.resume().catch(() => undefined); };
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });
}

/** Sirène de but, synthétisée (aucun fichier) : deux notes graves qui montent puis redescendent, environ trois secondes. */
export function playGoalHorn(volume = 0.5): boolean {
  const c = context();
  if (!c) return false;
  if (c.state === 'suspended') c.resume().catch(() => undefined);
  if (c.state === 'suspended') return false;
  const t0 = c.currentTime + 0.02;
  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(volume, t0 + 0.08);
  master.gain.setValueAtTime(volume, t0 + 2.3);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  master.connect(filter).connect(c.destination);
  // Quatre voix légèrement désaccordées : le son épais d'une corne de brume.
  for (const [freq, detune] of [[196, -6], [196, 7], [247, -5], [247, 6]] as const) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.linearRampToValueAtTime(freq * 1.06, t0 + 0.5);
    o.frequency.setValueAtTime(freq * 1.06, t0 + 2.2);
    o.frequency.linearRampToValueAtTime(freq * 0.9, t0 + 3.2);
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.value = 0.25;
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + 3.3);
  }
  return true;
}
