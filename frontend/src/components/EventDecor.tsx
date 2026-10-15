import { useEffect, useMemo } from 'react';
import { ART, SPRITE, type EventId, type ParticleSpec } from '../lib/eventArt';
import { useEventDecor, useEventTheme } from '../store/eventTheme';

const rnd = (min: number, max: number) => min + Math.random() * (max - min);

/** Dessins partagés (une seule fois dans la page) : tous les personnages sont des <symbol> utilisés par <use>. */
export function EventSprite() {
  return <svg className="ev-sprite" width="0" height="0" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: `<defs>${SPRITE}</defs>` }} />;
}

interface Particle { key: string; spec: ParticleSpec; size: number; style: React.CSSProperties }

function makeParticles(id: EventId): Particle[] {
  const out: Particle[] = [];
  ART[id].particles.forEach((spec, si) => {
    for (let i = 0; i < spec.count; i++) {
      const size = Math.round(rnd(spec.size[0], spec.size[1]));
      const dur = rnd(spec.dur[0], spec.dur[1]);
      const dx = Math.round(rnd(-60, 60));
      const style: Record<string, string | number> = {
        width: size, height: size, left: spec.kind === 'fly' ? 0 : `${rnd(0, 96).toFixed(1)}%`,
        animationDuration: `${dur.toFixed(1)}s`, animationDelay: `${(-rnd(0, dur)).toFixed(1)}s`, '--dx': `${dx}px`, '--rot': `${Math.round(rnd(-360, 360))}deg`,
      };
      if (spec.kind === 'fly') style.top = `${Math.round(rnd(6, 62))}vh`;
      if (spec.kind === 'drift') { style.top = `${Math.round(rnd(5, 85))}vh`; style.left = `${rnd(2, 96).toFixed(1)}%`; }
      out.push({ key: `${si}-${i}`, spec, size, style: style as React.CSSProperties });
    }
  });
  return out;
}

/** Particules animées (chauves-souris, neige, cœurs...) : légères (transformations CSS seulement), jamais cliquables. */
function Particles({ id }: { id: EventId }) {
  const list = useMemo(() => makeParticles(id), [id]);
  return (
    <div className="ev-layer" aria-hidden="true">
      {list.map((p) => (
        <svg key={p.key} className={`ev-p ev-${p.spec.kind}`} style={p.style}><use href={`#${p.spec.sym}`} /></svg>
      ))}
    </div>
  );
}

/** À monter une seule fois : charge le thème en cours, pose les attributs de couleur sur la page, affiche les dessins et les particules. */
export function EventRoot() {
  const load = useEventTheme((s) => s.load);
  const d = useEventDecor();

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 10 * 60_000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  useEffect(() => {
    const root = document.documentElement;
    if (d.id) { root.dataset.ev = d.id; root.dataset.evc = d.colors ? 'on' : 'off'; } else { delete root.dataset.ev; delete root.dataset.evc; }
    root.classList.toggle('ev-static', d.mode !== 'full');
    return () => { delete root.dataset.ev; delete root.dataset.evc; root.classList.remove('ev-static'); };
  }, [d.id, d.colors, d.mode]);

  if (!d.id) return null;
  return (
    <>
      <EventSprite />
      {d.particles && <Particles key={d.id} id={d.id} />}
    </>
  );
}

/** Bandeau du haut de page : guirlande qui se balance et mascotte de l'événement (+ pastille « aperçu » pour l'administrateur). */
export function EventStrip() {
  const d = useEventDecor();
  const setPreview = useEventTheme((s) => s.setPreview);
  if (!d.id) return null;
  const art = ART[d.id];
  const n = 9;
  return (
    <div className="ev-strip" role="presentation">
      <div className="ev-gar" aria-hidden="true">
        <svg className="ev-gstring" viewBox="0 0 600 22" preserveAspectRatio="none"><path d="M0 4Q75 24 150 4T300 4T450 4T600 4" fill="none" stroke={art.string} strokeWidth="1.8" strokeOpacity=".75" vectorEffect="non-scaling-stroke" /></svg>
        <div className="ev-gitems">
          {Array.from({ length: n }, (_, i) => {
            const g = art.garland[i % art.garland.length];
            return <svg key={i} style={g.color ? { color: g.color } : undefined}><use href={`#${g.sym}`} /></svg>;
          })}
        </div>
      </div>
      {d.previewing && (
        <button type="button" className="ev-preview-chip secondary" onClick={() => setPreview(null)} title="Seul toi vois cet aperçu : clique pour l'arrêter">Aperçu : {art.name} ✕</button>
      )}
      <svg className="ev-mascot" role="img" aria-label={art.greeting}><title>{art.greeting}</title><use href={`#${art.mascot}`} /></svg>
    </div>
  );
}

/** Petite icône de l'événement (menu, forums...) : choisie parmi celles du thème d'après `seed`, pour que chaque ligne ait la sienne. Rien s'il n'y a pas de thème. */
export function EventIcon({ seed = 0, size = 16, className }: { seed?: string | number; size?: number; className?: string }) {
  const d = useEventDecor();
  if (!d.id) return null;
  const icons = ART[d.id].icons;
  let h = 0;
  if (typeof seed === 'number') h = seed; else for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return <svg className={`ev-icon${className ? ` ${className}` : ''}`} width={size} height={size} aria-hidden="true"><use href={`#${icons[h % icons.length]}`} /></svg>;
}

/** Vrai quand un thème d'événement est affiché (pour remplacer une icône par défaut). */
export function useEventActive() { return !!useEventDecor().id; }
