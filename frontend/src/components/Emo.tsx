import Ic, { type IcName } from './Ic';

/**
 * Remplace les emoji d'interface par des icônes vectorielles nettes (même trait que le reste du site, couleur du texte).
 * Un emoji sans icône correspondante reste affiché tel quel : on peut donc l'utiliser partout sans rien casser.
 */
const MAP: Record<string, IcName> = {
  '🏠': 'home', '🎬': 'film', '📚': 'lib', '👥': 'users', '👫': 'users', '👤': 'user', '🎲': 'dice', '❓': 'help', '❔': 'help', '🛡': 'shield',
  '🔍': 'search', '🔎': 'search', '🔔': 'bell', '✉': 'mail', '📧': 'mail', '⬆': 'up', '📤': 'up', '⬇': 'down', '📥': 'down', '⭐': 'star', '🌟': 'star', '🌱': 'seed',
  '⚙': 'gear', '🎨': 'palette', '⚖': 'scale', '⚠': 'alert', '💬': 'chat', '🗨': 'msg', '🎁': 'gift', '❤': 'heart', '💖': 'heart', '👑': 'crown', '▶': 'play',
  '📅': 'cal', '🗓': 'cal', '🔥': 'flame', '🏆': 'trophy', '📰': 'news', '🆕': 'sparkles', '✨': 'sparkles', '💡': 'bulb', '☠': 'skull', '📈': 'trend', '📺': 'tv',
  '✅': 'checkc', '📁': 'folder', '🗂': 'folder', '🧱': 'wall', '🏴': 'flag', '🚩': 'flag', '🏅': 'medal', '🥇': 'medal', '🔴': 'radio', '📊': 'bars', '🏒': 'hockey',
  '⚔': 'swords', '🪪': 'idcard', '🎟': 'ticket', '📖': 'bookopen', '🛟': 'lifebuoy', '📋': 'clipboard', '🎵': 'music', '🎮': 'gamepad', '💻': 'laptop',
  '🌸': 'flower', '🔞': 'adult', '🧸': 'smile', '🎭': 'mask', '🎓': 'cap', '🕹': 'joystick', '🧭': 'compass', '🧩': 'puzzle', '🧊': 'cube', '👁': 'eye', '🌐': 'globe',
  '🔗': 'link', '🖼': 'image', '✏': 'pencil', '🗑': 'trash', '✕': 'x', '❌': 'x', '➕': 'plus', '🔒': 'lock', '🔐': 'lock', '🔑': 'lock', '👍': 'thumb', '⚡': 'bolt',
  '⏰': 'clock', '⏱': 'clock', '🕒': 'clock', '🔧': 'wrench', '🛠': 'wrench', '📍': 'pin', '🛒': 'cart', '🚀': 'rocket', '🎉': 'party', '🎊': 'party', '✦': 'sparkles', '☀': 'sun', '🌙': 'moon', '🚪': 'logout',
};

const bare = (e: string) => e.replace(/️/g, '').trim();

/** Nom de l'icône qui remplace cet emoji, ou null. */
export const iconFor = (e: unknown): IcName | null => (typeof e === 'string' ? MAP[bare(e)] ?? null : null);

export default function Emo({ e, size = 18, className }: { e: string; size?: number; className?: string }) {
  const n = iconFor(e);
  return n ? <Ic n={n} size={size} className={className} /> : <>{e}</>;
}
