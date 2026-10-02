// Sonneries des appels, générées avec WebAudio (aucun fichier audio à charger) : deux notes qui se répètent pour un appel
// entrant, une tonalité « ça sonne » plus douce pour l'appelant, et un bip court quand l'appel se termine.

let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function audio(): AudioContext | null {
  try {
    ctx = ctx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, startIn: number, length: number, volume = 0.18) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + startIn;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.linearRampToValueAtTime(0, t0 + length);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.05);
}

export function stopRing() {
  if (timer) { clearInterval(timer); timer = null; }
}

/** `in` : appel entrant (on t'appelle) ; `out` : tu appelles et ça sonne chez l'autre. */
export function startRing(kind: 'in' | 'out') {
  stopRing();
  const once = kind === 'in'
    ? () => { tone(659, 0, 0.18); tone(880, 0.22, 0.18); tone(659, 0.6, 0.18); tone(880, 0.82, 0.18); }
    : () => { tone(425, 0, 1.0, 0.1); };
  once();
  timer = setInterval(once, kind === 'in' ? 2200 : 3200);
}

export function endBeep() {
  tone(480, 0, 0.12, 0.12);
  tone(360, 0.14, 0.2, 0.12);
}
