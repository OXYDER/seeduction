import type { ReactNode } from 'react';

/**
 * Petites illustrations vectorielles qui habillent le fond d'une carte (cadeaux pour le freeleech, couronne pour le niveau,
 * rondelle pour les Canadiens...) : elles reprennent la couleur d'accent du membre et ne gênent jamais la lecture
 * (en retrait, derrière le contenu, fondues vers la gauche). Voir `.s-art` dans skin5.css.
 */
export type ArtKind = 'gift' | 'heart' | 'crown' | 'medal' | 'puck' | 'down' | 'play' | 'chat' | 'news' | 'trophy' | 'faces' | 'film' | 'seed' | 'forum';

/** Étincelle à quatre branches. */
const Sp = ({ x, y, r, o = 0.9 }: { x: number; y: number; r: number; o?: number }) => (
  <path transform={`translate(${x} ${y})`} d={`M0 ${-r} Q0 0 ${r} 0 Q0 0 0 ${r} Q0 0 ${-r} 0 Q0 0 0 ${-r}Z`} fill="currentColor" opacity={o} />
);

const ART: Record<ArtKind, ReactNode> = {
  gift: (
    <>
      <rect x="116" y="74" width="68" height="58" rx="6" fill="currentColor" opacity=".3" />
      <rect x="110" y="58" width="80" height="22" rx="5" fill="currentColor" opacity=".5" />
      <rect x="143" y="58" width="14" height="74" fill="currentColor" opacity=".65" />
      <ellipse cx="134" cy="50" rx="17" ry="9" transform="rotate(-25 134 50)" fill="none" stroke="currentColor" strokeWidth="6" opacity=".8" />
      <ellipse cx="166" cy="50" rx="17" ry="9" transform="rotate(25 166 50)" fill="none" stroke="currentColor" strokeWidth="6" opacity=".8" />
      <rect x="58" y="98" width="46" height="34" rx="5" fill="currentColor" opacity=".25" />
      <rect x="54" y="88" width="54" height="13" rx="4" fill="currentColor" opacity=".42" />
      <rect x="76" y="88" width="10" height="44" fill="currentColor" opacity=".6" />
      <Sp x={34} y={44} r={11} /><Sp x={206} y={26} r={9} /><Sp x={92} y={58} r={6} o={0.6} /><Sp x={28} y={104} r={6} o={0.55} /><Sp x={196} y={96} r={5} o={0.6} />
    </>
  ),
  heart: (
    <>
      <path d="M112 128C60 94 50 56 82 48c16-4 27 6 30 14 3-8 14-18 30-14 32 8 22 46-30 80Z" fill="currentColor" opacity=".5" />
      <path d="M172 78c-20-12-24-30-10-33 7-2 11 3 12 6 1-3 5-8 12-6 14 3 10 21-14 33Z" fill="currentColor" opacity=".38" />
      <circle cx="52" cy="106" r="16" fill="none" stroke="currentColor" strokeWidth="5" opacity=".4" /><circle cx="52" cy="106" r="7" fill="currentColor" opacity=".3" />
      <Sp x={30} y={40} r={10} /><Sp x={200} y={30} r={8} /><Sp x={150} y={120} r={6} o={0.6} />
    </>
  ),
  crown: (
    <>
      <path d="M58 122 50 62l38 28 22-44 22 44 38-28-8 60Z" fill="currentColor" opacity=".5" />
      <rect x="58" y="124" width="104" height="11" rx="4" fill="currentColor" opacity=".7" />
      <circle cx="50" cy="60" r="7" fill="currentColor" opacity=".8" /><circle cx="110" cy="44" r="8" fill="currentColor" opacity=".8" /><circle cx="170" cy="60" r="7" fill="currentColor" opacity=".8" />
      <Sp x={26} y={36} r={10} /><Sp x={200} y={30} r={9} /><Sp x={196} y={104} r={6} o={0.55} />
    </>
  ),
  medal: (
    <>
      <path d="M86 98 70 142l24-10 12 12 6-48Z" fill="currentColor" opacity=".38" /><path d="M134 98l16 44-24-10-12 12-6-48Z" fill="currentColor" opacity=".5" />
      <circle cx="110" cy="72" r="38" fill="currentColor" opacity=".42" /><circle cx="110" cy="72" r="26" fill="none" stroke="currentColor" strokeWidth="4" opacity=".7" />
      <Sp x={110} y={72} r={17} o={0.95} /><Sp x={40} y={40} r={9} /><Sp x={196} y={34} r={8} /><Sp x={190} y={110} r={6} o={0.55} />
    </>
  ),
  puck: (
    <>
      <path d="M70 20 126 112" stroke="currentColor" strokeWidth="9" strokeLinecap="round" opacity=".45" />
      <path d="M126 112c8 8 26 10 40 6" stroke="currentColor" strokeWidth="9" strokeLinecap="round" fill="none" opacity=".45" />
      <ellipse cx="150" cy="122" rx="36" ry="12" fill="currentColor" opacity=".7" /><rect x="114" y="108" width="72" height="14" fill="currentColor" opacity=".45" /><ellipse cx="150" cy="108" rx="36" ry="12" fill="currentColor" opacity=".6" />
      <path d="M20 134c40-10 80-10 190 0" stroke="currentColor" strokeWidth="2.5" fill="none" opacity=".35" />
      <Sp x={196} y={40} r={9} /><Sp x={40} y={82} r={7} o={0.6} />
    </>
  ),
  down: (
    <>
      <circle cx="116" cy="72" r="46" fill="currentColor" opacity=".25" />
      <rect x="107" y="40" width="18" height="44" rx="3" fill="currentColor" opacity=".6" /><path d="M88 80h56l-28 32Z" fill="currentColor" opacity=".7" />
      <path d="M30 124h180M50 138h140" stroke="currentColor" strokeWidth="3" strokeDasharray="10 8" opacity=".35" />
      <Sp x={36} y={40} r={9} /><Sp x={196} y={30} r={8} /><Sp x={186} y={100} r={6} o={0.55} />
    </>
  ),
  play: (
    <>
      <rect x="54" y="34" width="124" height="84" rx="12" fill="currentColor" opacity=".25" /><rect x="54" y="34" width="124" height="16" rx="8" fill="currentColor" opacity=".35" />
      <path d="M104 62v40l34-20Z" fill="currentColor" opacity=".75" />
      <rect x="70" y="124" width="92" height="6" rx="3" fill="currentColor" opacity=".35" />
      <Sp x={30} y={46} r={10} /><Sp x={202} y={36} r={9} /><Sp x={196} y={110} r={6} o={0.55} />
    </>
  ),
  film: (
    <>
      <rect x="62" y="30" width="112" height="92" rx="8" fill="currentColor" opacity=".25" />
      {[0, 1, 2, 3, 4].map((i) => <g key={i}><rect x="66" y={38 + i * 17} width="8" height="10" rx="2" fill="currentColor" opacity=".6" /><rect x="162" y={38 + i * 17} width="8" height="10" rx="2" fill="currentColor" opacity=".6" /></g>)}
      <rect x="82" y="40" width="72" height="34" rx="4" fill="currentColor" opacity=".45" /><rect x="82" y="80" width="72" height="34" rx="4" fill="currentColor" opacity=".32" />
      <Sp x={32} y={40} r={10} /><Sp x={200} y={34} r={9} /><Sp x={196} y={112} r={6} o={0.55} />
    </>
  ),
  chat: (
    <>
      <path d="M56 36h96a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12H96l-24 20V100h-16a12 12 0 0 1-12-12V48a12 12 0 0 1 12-12Z" fill="currentColor" opacity=".32" />
      <path d="M112 84h72a12 12 0 0 1 12 12v28a12 12 0 0 1-12 12h-12v14l-18-14h-42a12 12 0 0 1-12-12V96a12 12 0 0 1 12-12Z" fill="currentColor" opacity=".5" />
      <circle cx="84" cy="68" r="5" fill="currentColor" opacity=".8" /><circle cx="104" cy="68" r="5" fill="currentColor" opacity=".8" /><circle cx="124" cy="68" r="5" fill="currentColor" opacity=".8" />
      <Sp x={26} y={32} r={9} /><Sp x={204} y={44} r={9} /><Sp x={28} y={118} r={6} o={0.55} />
    </>
  ),
  forum: (
    <>
      <rect x="50" y="38" width="100" height="66" rx="12" fill="currentColor" opacity=".3" /><rect x="86" y="70" width="104" height="62" rx="12" fill="currentColor" opacity=".48" />
      <path d="M60 44h60M60 58h44" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".7" /><path d="M100 90h72M100 104h50" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".8" />
      <Sp x={26} y={36} r={10} /><Sp x={204} y={36} r={9} />
    </>
  ),
  news: (
    <>
      <rect x="62" y="30" width="108" height="98" rx="10" fill="currentColor" opacity=".28" />
      <rect x="74" y="42" width="44" height="34" rx="4" fill="currentColor" opacity=".55" />
      <path d="M128 46h30M128 58h30M128 70h20M74 90h84M74 104h84M74 116h56" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".6" />
      <Sp x={34} y={44} r={11} /><Sp x={202} y={32} r={9} /><Sp x={196} y={110} r={6} o={0.55} />
    </>
  ),
  trophy: (
    <>
      <path d="M78 36h64v34c0 24-16 36-32 36S78 94 78 70Z" fill="currentColor" opacity=".55" />
      <path d="M78 46H56c0 24 10 34 26 36M142 46h22c0 24-10 34-26 36" fill="none" stroke="currentColor" strokeWidth="6" opacity=".45" />
      <rect x="102" y="104" width="16" height="18" fill="currentColor" opacity=".55" /><rect x="84" y="122" width="52" height="11" rx="4" fill="currentColor" opacity=".7" />
      <Sp x={30} y={40} r={10} /><Sp x={196} y={32} r={9} /><Sp x={194} y={106} r={6} o={0.55} />
    </>
  ),
  faces: (
    <>
      <circle cx="82" cy="82" r="30" fill="currentColor" opacity=".32" /><circle cx="122" cy="74" r="34" fill="currentColor" opacity=".45" /><circle cx="162" cy="86" r="28" fill="currentColor" opacity=".3" />
      <circle cx="122" cy="66" r="11" fill="currentColor" opacity=".7" /><path d="M100 100c4-14 40-14 44 0" fill="currentColor" opacity=".7" />
      <Sp x={32} y={40} r={9} /><Sp x={204} y={38} r={8} /><Sp x={40} y={126} r={6} o={0.55} />
    </>
  ),
  seed: (
    <>
      <path d="M110 134V70" stroke="currentColor" strokeWidth="7" strokeLinecap="round" opacity=".55" />
      <path d="M110 92C70 92 58 62 60 46c34-2 52 12 50 46Z" fill="currentColor" opacity=".5" /><path d="M110 76c36 0 50-24 48-40-30 0-50 10-48 40Z" fill="currentColor" opacity=".38" />
      <path d="M40 134c50-10 100-10 150 0" stroke="currentColor" strokeWidth="3" fill="none" opacity=".35" />
      <Sp x={34} y={40} r={9} /><Sp x={198} y={70} r={8} />
    </>
  ),
};

/** `top` : en haut à droite (rangées d'affiches) au lieu du bas à droite. */
export default function SectionArt({ kind, top }: { kind: ArtKind; top?: boolean }) {
  return <svg className={`s-art${top ? ' top' : ''}`} viewBox="0 0 220 150" aria-hidden="true" focusable="false">{ART[kind]}</svg>;
}
